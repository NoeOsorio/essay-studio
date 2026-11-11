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
import { selectSourcesForReview } from "@/lib/materials/review-budget";
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
  | { kind: "question"; index: number; text: string }
  | { kind: "complete"; result: string; costUsd?: number; provenance?: ReviewProvenance }
  | { kind: "error"; message: string };

export type SidecarEvent =
  | { id: string; type: "started" }
  | { id: string; type: "token"; delta: string }
  | { id: string; type: "question"; index: number; text: string }
  | { id: string; type: "complete"; result: string; costUsd?: number; provenance?: ReviewProvenance }
  | { id: string; type: "error"; message: string; code?: string };

/** Rejection type of every sidecar request. `code` is the sidecar's
 *  error code (`CANCELLED`, `TIMEOUT`, `INCOMPLETE_REVIEW`, ...) or
 *  `SIDECAR_DOWN` when the sidecar stopped while the request was open. */
export class SidecarRequestError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "SidecarRequestError";
    this.code = code;
  }
}

/** Ask the sidecar to abort an in-flight request. The request then ends
 *  with a `CANCELLED` error event. */
export async function cancelSidecarRequest(id: string): Promise<void> {
  try {
    await invoke<string>("sage_cancel", { id });
  } catch (err) {
    // Nothing to cancel when the sidecar is gone; the run already ended.
    console.warn("sage_cancel failed", err);
  }
}

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
  signal?: AbortSignal;
}): Promise<{ result: string; costUsd?: number; provenance?: ReviewProvenance }> {
  const { command, args: invokeArgs, id, onUpdate, signal } = args;
  return new Promise<{ result: string; costUsd?: number; provenance?: ReviewProvenance }>(
    (resolveOuter, reject) => {
      let unlisten: UnlistenFn | null = null;
      let unlistenStatus: UnlistenFn | null = null;
      let settled = false;
      let sent = false;
      const abort = () => {
        if (sent) void invoke("sage_cancel", { id }).catch(() => undefined);
        finish(null, new SidecarRequestError("Review was cancelled.", "CANCELLED"));
      };

      const cleanup = () => {
        if (unlisten) unlisten();
        if (unlistenStatus) unlistenStatus();
        signal?.removeEventListener("abort", abort);
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

      if (signal?.aborted) { finish(null, new SidecarRequestError("Review was cancelled.", "CANCELLED")); return; }
      signal?.addEventListener("abort", abort, { once: true });
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
          case "question":
            onUpdate?.({ kind: "question", index: ev.index, text: ev.text });
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
            finish(null, new SidecarRequestError(ev.message, ev.code));
            break;
        }
      }).then((un) => {
        if (settled || signal?.aborted) {
          un();
          return;
        }
        unlisten = un;
        void listen<{ state: string }>("sage://status", (e) => {
          if (e.payload?.state !== "down") return;
          const message = "The sidecar stopped while the request was running.";
          onUpdate?.({ kind: "error", message });
          finish(null, new SidecarRequestError(message, "SIDECAR_DOWN"));
        }).then((unStatus) => {
          if (settled || signal?.aborted) {
            unStatus();
            return;
          }
          unlistenStatus = unStatus;
          // Send the request only after both listeners exist, so neither
          // the first event nor an early "down" is missed.
          invoke<string>(command, invokeArgs).then(() => {
            sent = true;
            if (signal?.aborted) void invoke("sage_cancel", { id }).catch(() => undefined);
          }).catch((err) => {
            finish(
              null,
              new SidecarRequestError(err instanceof Error ? err.message : String(err)),
            );
          });
        });
      }).catch(() => finish(null, new Error("The review event channel is unavailable.")));
    },
  );
}

/**
 * Start a sage interrogation. Calls `onUpdate` synchronously with
 * each streaming event; resolves with the final result text once the
 * sidecar emits `complete`, or rejects on `error`. Finished questions
 * arrive as `question` updates; the renderer never parses model text.
 */
export async function interrogate(args: {
  sage: Sage;
  text: string;
  /** Output language. Defaults to "es". */
  language?: EssayLanguage;
  /** Lets the caller cancel this request with `cancelSidecarRequest`. */
  requestId?: string;
  onUpdate?: (update: InterrogateUpdate) => void;
  signal?: AbortSignal;
}): Promise<{ result: string; costUsd?: number; provenance?: ReviewProvenance }> {
  const id = args.requestId ?? newId();
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
    signal: args.signal,
  });
}

/**
 * Ask one agent the writer's own question about one source. The answer
 * arrives whole on `complete`; `result` is plain prose.
 */
export async function ask(args: {
  requestId?: string;
  sage: Sage;
  text: string;
  question: string;
  language?: EssayLanguage;
  onUpdate?: (update: InterrogateUpdate) => void;
}): Promise<{ result: string; costUsd?: number; provenance?: ReviewProvenance }> {
  const id = args.requestId ?? newId();
  return runSidecarCommand({
    command: "sage_ask",
    args: {
      id,
      sage: args.sage,
      text: args.text,
      question: args.question,
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
  /** Lets the caller cancel this request with `cancelSidecarRequest`. */
  requestId?: string;
  onUpdate?: (update: InterrogateUpdate) => void;
  signal?: AbortSignal;
}): Promise<{
  result: string;
  costUsd?: number;
  provenance?: ReviewProvenance;
  /** Sources that did not fit the review budget and were left out. */
  fuentesOmitidas: Fuente[];
}> {
  const id = args.requestId ?? newId();
  const rubricaPayload =
    args.rubrica && args.rubrica.length > 0 ? args.rubrica : undefined;
  // Essay plus sources must fit one request. Cuts are prefixes, so the
  // evidence offsets the model returns stay valid against the saved sources.
  const budget = selectSourcesForReview(args.text, args.fuentes ?? []);
  if (budget.essayTooLong) {
    throw new SidecarRequestError(
      "El ensayo es demasiado largo para revisarlo de una vez. Revisa una parte.",
      "ESSAY_TOO_LONG",
    );
  }
  const fuentesPayload = budget.sources.length > 0 ? budget.sources : undefined;
  const sent = await runSidecarCommand({
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
    signal: args.signal,
  });
  return { ...sent, fuentesOmitidas: budget.omitted };
}

/**
 * Read one document. `citation` takes the first characters of a source and
 * `rubric` takes an assignment; the result is one JSON object as text, to be
 * checked by `parseCitation` / `parseRubric` before anything is shown.
 */
export async function extract(args: {
  task: "citation" | "rubric";
  text: string;
  /** Lets the caller cancel this request with `cancelSidecarRequest`. */
  requestId?: string;
  onUpdate?: (update: InterrogateUpdate) => void;
}): Promise<{ result: string; costUsd?: number; provenance?: ReviewProvenance }> {
  const id = args.requestId ?? newId();
  return runSidecarCommand({
    command: "sage_extract",
    args: { id, task: args.task, text: args.text },
    id,
    onUpdate: args.onUpdate,
  });
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
