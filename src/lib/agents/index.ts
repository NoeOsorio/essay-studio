// Renderer-side bridge to the sage sidecar.
//
// `interrogate(...)` writes a request to the Tauri Rust backend,
// which forwards it via stdin to the Node sidecar running the
// Claude Agent SDK. Streaming tokens come back as `sage://event`
// Tauri events; this module subscribes, accumulates, and resolves
// the returned promise on the `complete` event.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  Anotacion,
  Criterio,
  EssayLanguage,
  Fuente,
  Pase,
  Sage,
  Severidad,
} from "@/lib/storage/types";

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
 * Subscribe to `sage://event` for a single id, invoke the named Tauri
 * command with the given args, and resolve when the sidecar emits
 * `complete`. Internal helper shared by `interrogate` and `critique`.
 */
function runSidecarCommand(args: {
  command: string;
  args: Record<string, unknown>;
  id: string;
  onUpdate?: (update: InterrogateUpdate) => void;
}): Promise<{ result: string; costUsd?: number }> {
  const { command, args: invokeArgs, id, onUpdate } = args;
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
            });
            finish({ result: ev.result, costUsd: ev.costUsd });
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
}): Promise<{ result: string; costUsd?: number }> {
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
  onUpdate?: (update: InterrogateUpdate) => void;
}): Promise<{ result: string; costUsd?: number }> {
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

/** Shape of one parsed Pluma Roja line before it becomes an Anotación. */
export type RawAnotacion = {
  cita: string;
  severidad: Severidad;
  mensaje: string;
  sugerencia?: string;
  criterioId?: string;
};

function isSeveridad(v: unknown): v is Severidad {
  return v === "alta" || v === "media" || v === "baja";
}

/**
 * Parse the JSON-lines output of a critique pass into structured
 * anotaciones. Tolerates: leading/trailing prose around the JSON
 * block, ```json fences, and lines that aren't JSON. Rejects {vacio}
 * sentinels (returns []).
 */
export function parseAnotaciones(raw: string): RawAnotacion[] {
  // Strip markdown fences if the model wrapped its output in them.
  const cleaned = raw
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "");

  const out: RawAnotacion[] = [];
  for (const lineRaw of cleaned.split("\n")) {
    const line = lineRaw.trim();
    if (!line || !line.startsWith("{")) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    const obj = parsed as Record<string, unknown>;
    if (obj.vacio === true) continue;
    const cita = obj.cita;
    const severidad = obj.severidad;
    const mensaje = obj.mensaje;
    const sugerencia = obj.sugerencia;
    const criterioId = obj.criterioId;
    if (typeof cita !== "string" || cita.trim().length === 0) continue;
    if (!isSeveridad(severidad)) continue;
    if (typeof mensaje !== "string" || mensaje.trim().length === 0) continue;
    out.push({
      cita: cita.trim(),
      severidad,
      mensaje: mensaje.trim(),
      sugerencia:
        typeof sugerencia === "string" && sugerencia.trim().length > 0
          ? sugerencia.trim()
          : undefined,
      criterioId:
        typeof criterioId === "string" && criterioId.trim().length > 0
          ? criterioId.trim()
          : undefined,
    });
  }
  return out;
}

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
    sugerencia: raw.sugerencia,
    criterioId,
    generadoEn,
  };
}
