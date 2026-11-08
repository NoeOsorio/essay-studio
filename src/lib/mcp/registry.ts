import { useStore } from "@/lib/store";
import { appendSnapshot, listEssays } from "@/lib/storage";
import { ToolError, TOOL_DEFINITIONS, validateArgs, type BridgeRequest, type BridgeResponse, type JsonObject, type ToolName } from "../../../shared/mcp";
import { editDocument, ensureDocument, readDocument, readTextSelection, validateDocumentEdit } from "./document";
import { ensureBoard, getBoardSelection, getBoardSummary, handleBoardTool } from "./board";

let sessionId: string | null = null;
let revisionEpoch = "";
let revisionNumber = 0;
let stopRevisionTracking: (() => void) | null = null;
let batchKey: string | null = null;
let tail: Promise<unknown> = Promise.resolve();

export function startRegistry(): () => void {
  if (stopRevisionTracking) return () => undefined;
  revisionEpoch = crypto.randomUUID();
  stopRevisionTracking = useStore.subscribe((state, previous) => {
    if (state.current !== previous.current || state.restoreNonce !== previous.restoreNonce) revisionNumber += 1;
    if (state.current?.id !== previous.current?.id) batchKey = null;
  });
  return () => {
    stopRevisionTracking?.(); stopRevisionTracking = null;
    setBridgeSession(null);
  };
}

export function setBridgeSession(next: string | null): void {
  if (sessionId !== next) { batchKey = null; revisionNumber += 1; }
  sessionId = next;
}

export function getRevision(): string {
  return `${revisionEpoch}:${useStore.getState().current?.id ?? "none"}:${revisionNumber}`;
}

function assertContext(essayId: string): void {
  if (useStore.getState().current?.id !== essayId || useStore.getState().view !== "editor") {
    throw new ToolError("ESSAY_CHANGED", "The requested essay is not open. Read app context before continuing.");
  }
}

function checkRevision(expected: unknown): void {
  if (expected !== getRevision()) throw new ToolError("STALE_REVISION", "The essay changed. Read it again before editing.");
}

export async function flushDurable(essayId: string): Promise<void> {
  assertContext(essayId);
  await useStore.getState().flush();
  assertContext(essayId);
  if (useStore.getState().saveStatus.kind !== "saved") {
    throw new ToolError("SAVE_FAILED", "The edit is visible but has not been saved. Do not repeat the edit; retry finish_work.");
  }
}

function envelope(result: unknown, essayId?: string): JsonObject {
  return {
    ...(typeof result === "object" && result !== null && !Array.isArray(result) ? result : { value: result }),
    ...(essayId ? { essayId } : {}), revision: getRevision(),
  };
}

async function run(request: BridgeRequest, requestSession: string, deadline: number): Promise<unknown> {
  const guard = (phase: "before" | "saved" = "before") => {
    if (!sessionId || sessionId !== requestSession) throw phase === "saved"
      ? new ToolError("OUTCOME_UNKNOWN", "The save completed, but the MCP session changed. Read current state; do not repeat an edit.")
      : new ToolError("DISCONNECTED", "The MCP connection was disconnected. Read context after reconnecting.");
    // Rust expires the full renderer request after 30s; leave time to persist
    // and acknowledge rather than applying an edit that was queued too long.
    if (phase === "before" && performance.now() > deadline) throw new ToolError("REQUEST_EXPIRED", "The request expired before an edit could be applied. Read context before retrying.");
  };
  guard();
  validateArgs(request.name, request.args);
  const name = request.name as ToolName;
  const definition = TOOL_DEFINITIONS.find((tool) => tool.name === name)!;
  const args = request.args;
  const essayId = args.essayId as string | undefined;
  if (name === "get_basic_info") {
    const state = useStore.getState();
    return envelope({ app: "Essay Studio", view: state.view, saveStatus: state.saveStatus.kind,
      essay: state.current ? { id: state.current.id, title: state.current.title, mode: state.current.mode, language: state.current.language ?? "es", wordCount: state.current.wordCount } : null,
      board: { open: state.boardOpen, ...getBoardSummary() } });
  }
  if (name === "list_essays") {
    const essays = await listEssays(); guard();
    return envelope({ essays });
  }
  if (name === "open_essay") {
    const before = useStore.getState().current;
    if (before) { await flushDurable(before.id); guard(); }
    // The action also flushes for UI callers; verify its swallowed IO errors.
    await useStore.getState().openEssay(essayId!, before?.id ?? null); guard();
    assertContext(essayId!);
    if (useStore.getState().saveStatus.kind === "error") throw new ToolError("OPEN_FAILED", "The essay could not be opened.");
    await ensureDocument(essayId!); guard();
    return envelope({ title: useStore.getState().current!.title, saved: true }, essayId);
  }
  assertContext(essayId!);
  if (name === "finish_work") {
    await flushDurable(essayId!); guard("saved");
    batchKey = null;
    return envelope({ saved: true }, essayId);
  }
  if (definition.mutating) checkRevision(args.revision);
  if (definition.surface === "board") { await ensureBoard(essayId!); guard(); assertContext(essayId!); }
  else { await ensureDocument(essayId!); guard(); assertContext(essayId!); }
  if (name === "get_document") return envelope(readDocument(args), essayId);
  if (name === "get_selection") return envelope({ textSelection: readTextSelection(essayId!), boardNodeIds: getBoardSelection() }, essayId);
  if (!definition.mutating) {
    const readRevision = getRevision();
    const value = await handleBoardTool(name, args);
    guard(); assertContext(essayId!); checkRevision(readRevision);
    return envelope(value, essayId);
  }
  if (name === "edit_document") validateDocumentEdit(args);
  checkRevision(args.revision);
  const thisBatch = `${requestSession}:${essayId}`;
  if (batchKey !== thisBatch) {
    await flushDurable(essayId!); guard(); assertContext(essayId!); checkRevision(args.revision);
    const essay = structuredClone(useStore.getState().current!);
    try { await appendSnapshot({ takenAt: new Date().toISOString(), kind: "manual", essay }); }
    catch { throw new ToolError("SNAPSHOT_FAILED", "The safety version could not be saved. No agent edit was applied."); }
    guard(); assertContext(essayId!); checkRevision(args.revision);
    batchKey = thisBatch;
  }
  // No await is allowed between this check and the native mutation.
  guard(); assertContext(essayId!); checkRevision(args.revision);
  const result = name === "edit_document" ? editDocument(args) : handleBoardTool(name, args);
  if (result instanceof Promise) throw new ToolError("INTERNAL_ERROR", "A board mutation did not execute synchronously.");
  try { await flushDurable(essayId!); }
  catch (error) {
    if (error instanceof ToolError && error.code === "ESSAY_CHANGED") {
      throw new ToolError("OUTCOME_UNKNOWN", "The edit was applied before the open essay changed. Read its saved state; do not repeat the edit.");
    }
    throw error;
  }
  // The deadline only prevents a late application. Once applied and saved,
  // elapsed time cannot truthfully turn this into a preapplication refusal.
  guard("saved");
  return envelope({ ...(result as JsonObject), saved: true }, essayId);
}

/** One command queue for both editor surfaces; failures do not poison it. */
export function executeRequest(request: BridgeRequest, requestSession: string): Promise<BridgeResponse> {
  const deadline = performance.now() + 20_000;
  const operation = tail.then(async (): Promise<BridgeResponse> => {
    try { return { requestId: request.requestId, ok: true, result: await run(request, requestSession, deadline) }; }
    catch (error) {
      return { requestId: request.requestId, ok: false, error: error instanceof ToolError
        ? { code: error.code, message: error.message }
        : { code: "OPERATION_FAILED", message: "Essay Studio could not complete this operation. Read context before retrying." } };
    }
  });
  tail = operation.then(() => undefined, () => undefined);
  return operation;
}
