import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createConnection, type Socket } from "node:net";
import { randomUUID } from "node:crypto";
import { MAX_REQUEST_BYTES, PROTOCOL_VERSION, ToolError, validateArgs, type BridgeResponse, type JsonObject } from "../../shared/mcp.js";

// PNG responses have a separate bounded budget; requests remain capped at 2 MiB.
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const RESPONSE_TIMEOUT_MS = 35_000; // native dispatch timeout is 30 seconds

type Descriptor = { socketPath: string; token: string; sessionId: string; protocolVersion: number };
type Pending = { resolve: (value: BridgeResponse) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout> };

export class LiveClient {
  private socket: Socket | null = null;
  private descriptor: Descriptor | null = null;
  private connecting: Promise<void> | null = null;
  private buffer = Buffer.alloc(0);
  private pending = new Map<string, Pending>();
  private queue: Promise<void> = Promise.resolve();

  private async connect(): Promise<void> {
    if (this.socket && !this.socket.destroyed) return;
    if (this.connecting) return this.connecting;
    this.connecting = this.openConnection();
    try { await this.connecting; } finally { this.connecting = null; }
  }

  private async openConnection(): Promise<void> {
    if (process.platform !== "darwin") throw new ToolError("UNSUPPORTED_PLATFORM", "The live Essay Studio bridge currently requires macOS.");
    const descriptorFile = process.env.ESSAY_STUDIO_MCP_CONNECTION_FILE ?? join(homedir(), "Library/Application Support/com.noeosorio.essaystudio/mcp/connection.json");
    const directory = dirname(descriptorFile);
    const directoryStat = await lstat(directory).catch(() => null);
    if (!directoryStat) throw new ToolError("DISCONNECTED", "Open Essay Studio and enable its MCP connection first.");
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink() || directoryStat.uid !== process.getuid?.() || (directoryStat.mode & 0o077) !== 0) throw new ToolError("UNSAFE_DESCRIPTOR", "The MCP connection directory must be owned by you and private.");
    const file = await open(descriptorFile, constants.O_RDONLY | constants.O_NOFOLLOW).catch(() => null);
    if (!file) throw new ToolError("DISCONNECTED", "The Essay Studio MCP descriptor is unavailable. Enable MCP in the app.");
    let parsed: unknown;
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0 || stat.size > 16_384) throw new ToolError("UNSAFE_DESCRIPTOR", "The MCP descriptor must be a private, bounded regular file.");
      parsed = JSON.parse(await file.readFile("utf8"));
    } finally { await file.close(); }
    if (!parsed || typeof parsed !== "object") throw new ToolError("INVALID_DESCRIPTOR", "Invalid MCP descriptor.");
    const descriptor = parsed as Partial<Descriptor>;
    if (descriptor.protocolVersion !== PROTOCOL_VERSION || typeof descriptor.socketPath !== "string" || typeof descriptor.token !== "string" || descriptor.token.length !== 64 || typeof descriptor.sessionId !== "string") throw new ToolError("INVALID_DESCRIPTOR", "Unsupported MCP descriptor. Restart Essay Studio.");
    if (dirname(descriptor.socketPath) !== await realpath(directory)) throw new ToolError("UNSAFE_DESCRIPTOR", "The MCP socket must be inside its private connection directory.");
    const socketStat = await lstat(descriptor.socketPath).catch(() => null);
    if (!socketStat?.isSocket() || socketStat.uid !== process.getuid?.() || (socketStat.mode & 0o077) !== 0) throw new ToolError("UNSAFE_DESCRIPTOR", "The MCP socket is missing or is not private.");
    this.descriptor = descriptor as Descriptor;
    this.buffer = Buffer.alloc(0);
    const socketPath = descriptor.socketPath;
    await new Promise<void>((resolve, reject) => {
      const socket = createConnection({ path: socketPath });
      this.socket = socket;
      const timer = setTimeout(() => { socket.destroy(); reject(new ToolError("DISCONNECTED", "Essay Studio did not accept the local connection.")); }, 5_000);
      socket.once("connect", () => { clearTimeout(timer); resolve(); });
      socket.on("data", (chunk: Buffer) => { if (this.socket === socket) this.receive(chunk); });
      socket.on("error", () => { clearTimeout(timer); reject(new ToolError("DISCONNECTED", "Cannot connect to the live Essay Studio app.")); if (this.socket === socket) this.failAll("DISCONNECTED", "The app connection failed. Read current state before retrying a mutation."); });
      socket.on("close", () => { clearTimeout(timer); if (this.socket === socket) { this.socket = null; this.descriptor = null; this.failAll("DISCONNECTED", "The app disconnected. Read current state before retrying a mutation."); } });
    });
  }

  private receive(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    if (this.buffer.length > MAX_RESPONSE_BYTES) { this.failAll("RESPONSE_TOO_LARGE", "The app response exceeded the local IPC budget. Read smaller sections."); this.socket?.destroy(); return; }
    let end: number;
    while ((end = this.buffer.indexOf(10)) >= 0) {
      const line = this.buffer.subarray(0, end).toString("utf8");
      this.buffer = this.buffer.subarray(end + 1);
      let response: BridgeResponse;
      try { response = JSON.parse(line) as BridgeResponse; } catch { this.failAll("INVALID_RESPONSE", "Invalid response from the app."); this.socket?.destroy(); return; }
      if (!response || typeof response.requestId !== "string" || typeof response.ok !== "boolean") { this.failAll("INVALID_RESPONSE", "Invalid response from the app."); this.socket?.destroy(); return; }
      const pending = this.pending.get(response.requestId);
      if (!pending) {
        if (response.error?.code === "UNAUTHORIZED") { this.failAll("SESSION_ENDED", "The MCP session changed. Reconnect and read current state."); this.socket?.destroy(); }
        continue;
      }
      clearTimeout(pending.timer); this.pending.delete(response.requestId); pending.resolve(response);
    }
  }

  private failAll(code: string, message: string): void {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new ToolError(code, message)); }
    this.pending.clear();
  }

  async call(name: string, args: JsonObject): Promise<BridgeResponse> {
    validateArgs(name, args);
    const result = this.queue.then(() => this.dispatch(name, args));
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async dispatch(name: string, args: JsonObject): Promise<BridgeResponse> {
    await this.connect();
    if (!this.socket || !this.descriptor) throw new ToolError("DISCONNECTED", "The live app is unavailable.");
    const requestId = randomUUID();
    const encoded = JSON.stringify({ ...this.descriptor, protocolVersion: undefined, requestId, name, args, socketPath: undefined }) + "\n";
    if (Buffer.byteLength(encoded) > MAX_REQUEST_BYTES) throw new ToolError("REQUEST_TOO_LARGE", "The request exceeds 2 MiB; send smaller edits.");
    return new Promise<BridgeResponse>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new ToolError("OUTCOME_UNKNOWN", `No acknowledgment for request ${requestId}. Read current state before retrying.`)); }, RESPONSE_TIMEOUT_MS);
      this.pending.set(requestId, { resolve, reject, timer });
      this.socket!.write(encoded, (error) => { if (error) { clearTimeout(timer); this.pending.delete(requestId); reject(new ToolError("OUTCOME_UNKNOWN", "Sending failed. Read current state before retrying a mutation.")); } });
    });
  }

  close(): void { this.socket?.destroy(); this.failAll("DISCONNECTED", "The MCP client closed."); }
}
