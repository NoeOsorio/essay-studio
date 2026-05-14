// Renderer-side bridge to the sage sidecar.
//
// `interrogate(...)` writes a request to the Tauri Rust backend,
// which forwards it via stdin to the Node sidecar running the
// Claude Agent SDK. Streaming tokens come back as `sage://event`
// Tauri events; this module subscribes, accumulates, and resolves
// the returned promise on the `complete` event.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Sage } from "@/lib/storage/types";

export type InterrogateUpdate =
  | { kind: "started" }
  | { kind: "token"; delta: string }
  | { kind: "complete"; result: string; costUsd?: number }
  | { kind: "error"; message: string };

export type SidecarEvent =
  | { id: string; type: "started" }
  | { id: string; type: "token"; delta: string }
  | { id: string; type: "complete"; result: string; costUsd?: number }
  | { id: string; type: "error"; message: string };

function newId(): string {
  return crypto.randomUUID();
}

/**
 * Start a sage interrogation. Calls `onUpdate` synchronously with
 * each streaming event; resolves with the final result text once the
 * sidecar emits `complete`, or rejects on `error`. The caller is
 * responsible for parsing the result into `preguntas[]`.
 */
export async function interrogate(args: {
  sage: Sage;
  text: string;
  onUpdate?: (update: InterrogateUpdate) => void;
}): Promise<{ result: string; costUsd?: number }> {
  const id = newId();
  return new Promise<{ result: string; costUsd?: number }>(
    (resolveOuter, reject) => {
      let unlisten: UnlistenFn | null = null;
      let settled = false;

      const cleanup = () => {
        if (unlisten) unlisten();
      };
      const finish = (
        ok: { result: string; costUsd?: number } | null,
        err?: Error,
      ) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (ok) resolveOuter(ok);
        else reject(err);
      };

      void listen<SidecarEvent>("sage://event", (e) => {
        const ev = e.payload;
        if (ev.id !== id) return;
        switch (ev.type) {
          case "started":
            args.onUpdate?.({ kind: "started" });
            break;
          case "token":
            args.onUpdate?.({ kind: "token", delta: ev.delta });
            break;
          case "complete":
            args.onUpdate?.({
              kind: "complete",
              result: ev.result,
              costUsd: ev.costUsd,
            });
            finish({ result: ev.result, costUsd: ev.costUsd });
            break;
          case "error":
            args.onUpdate?.({ kind: "error", message: ev.message });
            finish(null, new Error(ev.message));
            break;
        }
      }).then((un) => {
        unlisten = un;
        // Now send the request. We invoke AFTER listen() has resolved
        // so we don't miss the first event.
        invoke<string>("sage_interrogate", {
          id,
          sage: args.sage,
          text: args.text,
        }).catch((err) => {
          finish(null, err instanceof Error ? err : new Error(String(err)));
        });
      });
    },
  );
}

/**
 * Parse the model's free-form output into a list of questions.
 * Expects lines starting with `1.`, `2.`, etc. (See the persona prompt
 * format spec in `prompts/el-empirista.md`.)
 */
export function parsePreguntas(raw: string): string[] {
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const out: string[] = [];
  for (const line of lines) {
    const m = /^(\d+)[\.\)]\s+(.+)$/.exec(line);
    if (m) out.push(m[2].trim());
  }
  // Fallback: if nothing matched, return the whole text as a single entry.
  return out.length > 0 ? out : [raw.trim()];
}
