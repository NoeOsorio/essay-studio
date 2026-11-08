// Renderer-side bridge to the sage sidecar.
//
// `interrogate(...)` writes a request to the Tauri Rust backend,
// which forwards it via stdin to the Node sidecar running the
// Claude Agent SDK. Streaming tokens come back as `sage://event`
// Tauri events; this module subscribes, accumulates, and resolves
// the returned promise on the `complete` event.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ReviewProvenance } from "../../../sidecar/src/review-contract";
import type {
  Anotacion,
  Criterio,
  EssayLanguage,
  Fuente,
  Pase,
  Sage,
} from "@/lib/storage/types";

export type InterrogateUpdate =
  | { kind: "started" }
  | { kind: "token"; delta: string }
  | { kind: "complete"; result: string; costUsd?: number; provenance?: ReviewProvenance }
  | { kind: "error"; message: string };

export type SidecarEvent =
  | { id: string; type: "started" }
  | { id: string; type: "token"; delta: string }
  | { id: string; type: "complete"; result: string; costUsd?: number; provenance?: ReviewProvenance }
  | { id: string; type: "error"; message: string };

function newId(): string {
  return crypto.randomUUID();
}

/**
 * Subscribe to `sage://event` for a single id, invoke the named Tauri
 * command with the given args, and resolve when the sidecar emits
 * `complete`. Internal helper shared by `interrogate` and `critique`.
 */
function runSidecarCommand(args: {
  command: string;
  args: Record<string, unknown>;
  id: string;
  onUpdate?: (update: InterrogateUpdate) => void;
}): Promise<{ result: string; costUsd?: number; provenance?: ReviewProvenance }> {
  const { command, args: invokeArgs, id, onUpdate } = args;
  return new Promise<{ result: string; costUsd?: number; provenance?: ReviewProvenance }>(
    (resolveOuter, reject) => {
      let unlisten: UnlistenFn | null = null;
      let settled = false;

      const cleanup = () => {
        if (unlisten) unlisten();
      };
      const finish = (
        ok: { result: string; costUsd?: number; provenance?: ReviewProvenance } | null,
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
            onUpdate?.({ kind: "started" });
            break;
          case "token":
            onUpdate?.({ kind: "token", delta: ev.delta });
            break;
          case "complete":
            onUpdate?.({
              kind: "complete",
              result: ev.result,
              costUsd: ev.costUsd,
              provenance: ev.provenance,
            });
            finish({ result: ev.result, costUsd: ev.costUsd, provenance: ev.provenance });
            break;
          case "error":
            onUpdate?.({ kind: "error", message: ev.message });
            finish(null, new Error(ev.message));
            break;
        }
      }).then((un) => {
        unlisten = un;
        // Now send the request. We invoke AFTER listen() has resolved
        // so we don't miss the first event.
        invoke<string>(command, invokeArgs).catch((err) => {
          finish(null, err instanceof Error ? err : new Error(String(err)));
        });
      });
    },
  );
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
  /** Output language. Defaults to "es". */
  language?: EssayLanguage;
  onUpdate?: (update: InterrogateUpdate) => void;
}): Promise<{ result: string; costUsd?: number; provenance?: ReviewProvenance }> {
  const id = newId();
  return runSidecarCommand({
    command: "sage_interrogate",
    args: {
      id,
      sage: args.sage,
      text: args.text,
      ...(args.language ? { language: args.language } : {}),
    },
    id,
    onUpdate: args.onUpdate,
  });
}

/**
 * Start a Pluma Roja pass. One sage critiques the full essay text
 * along a single `pase` (coherencia / estilo / argumento). Streams
 * tokens the same way `interrogate` does; the result is JSON-lines.
 * Use `parseAnotaciones` to turn the raw output into structured
 * annotations anchored against the essay's plain text.
 */
export async function critique(args: {
  sage: Sage;
  pase: Pase;
  text: string;
  /** Optional rubric criterios — forwarded to the sage. */
  rubrica?: Criterio[];
  /** Optional saved sources — forwarded to the sage as REFERENCIAS. */
  fuentes?: Fuente[];
  /** Output language. Defaults to "es". */
  language?: EssayLanguage;
  reviewerProfile?: string;
  onUpdate?: (update: InterrogateUpdate) => void;
}): Promise<{ result: string; costUsd?: number; provenance?: ReviewProvenance }> {
  const id = newId();
  const rubricaPayload = args.rubrica && args.rubrica.length > 0
    ? { criterios: args.rubrica }
    : undefined;
  const fuentesPayload =
    args.fuentes && args.fuentes.length > 0 ? args.fuentes : undefined;
  return runSidecarCommand({
    command: "sage_critique",
    args: {
      id,
      sage: args.sage,
      pase: args.pase,
      text: args.text,
      ...(rubricaPayload ? { rubrica: rubricaPayload } : {}),
      ...(fuentesPayload ? { fuentes: fuentesPayload } : {}),
      ...(args.language ? { language: args.language } : {}),
      ...(args.reviewerProfile ? { reviewerProfile: args.reviewerProfile } : {}),
    },
    id,
    onUpdate: args.onUpdate,
  });
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

export { parseAnotaciones, parseAnnotationsDetailed } from "../../../sidecar/src/annotation-parser";
import type { RawAnotacion } from "../../../sidecar/src/annotation-parser";
export type { RawAnotacion } from "../../../sidecar/src/annotation-parser";

function newAnotacionId(): string {
  return crypto.randomUUID();
}

/**
 * Build an `Anotacion` ready to dispatch to the editor — fills in id,
 * sage, pase, and timestamp around a parsed raw entry.
 */
export function buildAnotacion(
  raw: RawAnotacion,
  sage: Sage,
  pase: Pase,
  generadoEn: string,
  rubrica?: Criterio[],
  provenance?: ReviewProvenance,
): Anotacion {
  // Verify that the criterioId, if present, actually maps to a real
  // criterio in the rubric. Drops phantom ids from the model.
  const validIds = new Set((rubrica ?? []).map((c) => c.id));
  const criterioId =
    raw.criterioId && validIds.has(raw.criterioId) ? raw.criterioId : undefined;
  return {
    id: newAnotacionId(),
    sage,
    pase,
    severidad: raw.severidad,
    cita: raw.cita,
    mensaje: raw.mensaje,
    reemplazo: raw.reemplazo,
    criterioId,
    generadoEn,
    ...(raw.evidence ? { evidence: raw.evidence } : {}),
    ...(provenance ? { provenance } : {}),
  };
}
