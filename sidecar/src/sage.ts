/**
 * Essay Studio · sage sidecar
 *
 * Spawned by the Tauri Rust backend. Reads JSON-lines requests from
 * stdin and writes JSON-lines events to stdout. Tauri parses each
 * line and emits the corresponding event to the renderer.
 *
 * Authentication: the Claude Agent SDK ships with its own Claude
 * Code binary, which authenticates against the user's existing OAuth
 * session (macOS Keychain on this platform). So as long as the user
 * is logged into Claude Code, usage is billed against their Agent
 * SDK monthly credit — NOT an API key.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Options } from "@anthropic-ai/claude-agent-sdk";

// --------- Protocol ---------

type Sage = "em" | "sis" | "pra" | "cri";

type IncomingRequest =
  | { id: string; type: "interrogate"; sage: Sage; text: string }
  | { id: string; type: "ping" };

type OutgoingEvent =
  | { id: string; type: "started" }
  | { id: string; type: "token"; delta: string }
  | {
      id: string;
      type: "complete";
      result: string;
      usage?: unknown;
      costUsd?: number;
    }
  | { id: string; type: "error"; message: string };

function emit(event: OutgoingEvent): void {
  process.stdout.write(JSON.stringify(event) + "\n");
}

// --------- Prompt loading ---------

const SAGE_PROMPT_FILES: Record<Sage, string> = {
  em: "el-empirista.md",
  sis: "el-sistemico.md",
  pra: "el-practico.md",
  cri: "el-critico.md",
};

/**
 * Resolve the prompts directory. The sidecar is invoked from the
 * Tauri shell, which sets the cwd to the project root in dev and to
 * the bundled resources dir in production. We pass an explicit path
 * via the SAGE_PROMPTS_DIR env var; otherwise fall back to a sibling
 * `prompts/` next to this file.
 */
function promptsDir(): string {
  const env = process.env.SAGE_PROMPTS_DIR;
  if (env) return env;
  const here = fileURLToPath(import.meta.url);
  return resolve(here, "..", "..", "..", "prompts");
}

async function loadSagePrompt(sage: Sage): Promise<string> {
  const file = SAGE_PROMPT_FILES[sage];
  const path = resolve(promptsDir(), file);
  return readFile(path, "utf-8");
}

// --------- Interrogation ---------

async function runInterrogation(req: Extract<IncomingRequest, { type: "interrogate" }>) {
  emit({ id: req.id, type: "started" });

  const systemPrompt = await loadSagePrompt(req.sage);
  // Build the user message: explicit "interrogate" task framing.
  const userPrompt = [
    "Texto a interrogar:",
    "",
    "---",
    req.text.trim(),
    "---",
    "",
    "Generá exactamente cinco preguntas según las reglas de tu persona.",
  ].join("\n");

  const options: Options = {
    systemPrompt, // custom string fully replaces Claude Code's default
    allowedTools: [], // pure text generation, no Read/Edit/Bash etc.
    disallowedTools: [
      "Read",
      "Write",
      "Edit",
      "Bash",
      "Glob",
      "Grep",
      "WebSearch",
      "WebFetch",
      "Agent",
    ],
    settingSources: [], // don't inherit any user CLAUDE.md / skills
    includePartialMessages: true, // emits SDKPartialAssistantMessage stream events
    maxTurns: 1,
    stderr: (line: string) => process.stderr.write(line),
  };

  try {
    let finalText = "";
    let costUsd: number | undefined;
    let usage: unknown;

    for await (const msg of query({ prompt: userPrompt, options })) {
      switch (msg.type) {
        case "stream_event": {
          // BetaRawMessageStreamEvent — emit text deltas as tokens.
          const event = msg.event;
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            const delta = event.delta.text;
            if (delta) emit({ id: req.id, type: "token", delta });
          }
          break;
        }
        case "assistant": {
          // Full assistant message — concatenate text blocks for the
          // final result string.
          for (const block of msg.message.content ?? []) {
            if (block.type === "text") finalText += block.text;
          }
          break;
        }
        case "result": {
          if (msg.subtype === "success") {
            finalText = msg.result || finalText;
            usage = msg.usage;
            costUsd = msg.total_cost_usd;
          } else {
            emit({
              id: req.id,
              type: "error",
              message: `agent result error (${msg.subtype})`,
            });
            return;
          }
          break;
        }
        default:
          // Ignore system/status/etc. messages; the renderer doesn't need them.
          break;
      }
    }

    emit({
      id: req.id,
      type: "complete",
      result: finalText.trim(),
      usage,
      costUsd,
    });
  } catch (err) {
    emit({
      id: req.id,
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

// --------- stdin loop ---------

let stdinBuffer = "";

process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk: string) => {
  stdinBuffer += chunk;
  let nl: number;
  while ((nl = stdinBuffer.indexOf("\n")) !== -1) {
    const line = stdinBuffer.slice(0, nl).trim();
    stdinBuffer = stdinBuffer.slice(nl + 1);
    if (!line) continue;
    handleLine(line);
  }
});

function handleLine(line: string): void {
  let req: IncomingRequest;
  try {
    req = JSON.parse(line) as IncomingRequest;
  } catch (err) {
    emit({
      id: "<parse>",
      type: "error",
      message: `invalid JSON: ${(err as Error).message}`,
    });
    return;
  }
  if (req.type === "ping") {
    emit({ id: req.id, type: "complete", result: "pong" });
    return;
  }
  if (req.type === "interrogate") {
    void runInterrogation(req);
    return;
  }
  emit({
    id: (req as { id?: string }).id ?? "<unknown>",
    type: "error",
    message: "unknown request type",
  });
}

process.stdin.on("end", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
