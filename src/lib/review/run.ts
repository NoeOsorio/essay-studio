// The review run. This module owns the promises; the store holds only the
// view state (`review`, `reviewOutcome`). A run outlives any panel: closing
// the panel changes nothing here. Leaving the essay cancels the run and
// raises the discard notice. Application follows data-model.md, "Applying
// a review", steps 1 to 6.

import type { Editor } from "@tiptap/core";
import { getDocumentEditor } from "@/lib/mcp/document";
import { findCitaRange, sentenceRange } from "@/lib/editor/findCita";
import { defaultPasesForMode, ALL_PASES } from "@/lib/sages";
import { sourceLabel } from "@/lib/materials/review-budget";
import { extractPlainText, reviewFingerprint } from "@/lib/review/fingerprint";
import { deriveFindings, isSuppressed, type SlimRecord } from "@/lib/review/findings";
import {
  buildAnotacion,
  cancelSidecarRequest,
  critique,
  parseAnnotationsDetailed,
  SidecarRequestError,
  type RawAnotacion,
} from "@/lib/agents";
import {
  registerEssayLeaveHook,
  useStore,
  type ReviewPassState,
  type ReviewRun,
} from "@/lib/store";
import { DEFAULT_REVIEWER_PROFILE, REVIEWER_PROFILES } from "../../../sidecar/src/model-profiles";
import type { AnnotationAttrs } from "@/components/editor/extensions/Annotation";
import type {
  EssayMode,
  FindingRecord,
  Pase,
  ReviewProvenance,
  Sage,
} from "@/lib/storage/types";

/** The agent that owns each pass. Estilo rotates with the essay type. */
export function sageForPase(pase: Pase, mode: EssayMode): Sage {
  switch (pase) {
    case "coherencia":
      return "sis";
    case "estilo":
      return mode === "blog" ? "pra" : "em";
    case "argumento":
      return "cri";
    case "apa":
      return "em";
  }
}

type PassResult =
  | {
      kind: "ok";
      raw: RawAnotacion[];
      invalid: number;
      provenance?: ReviewProvenance;
      /** Names of the sources that did not fit this pass. */
      fuentesOmitidas: string[];
    }
  | { kind: "failed"; tooLong?: boolean }
  | { kind: "canceled" };

type ActiveRun = {
  essayId: string;
  restoreNonce: number;
  canceled: boolean;
  requestIds: Partial<Record<Pase, string>>;
  unregister: () => void;
};

let active: ActiveRun | null = null;

const SMALL_STEP = 6;
const CEILING = 90;
/** How far each returned line closes the remaining gap to the ceiling. */
const LINE_STEP = 0.3;

function idlePass(): ReviewPassState {
  return { status: "idle", progress: 0, requestId: null };
}

function isRunning(): boolean {
  const run = useStore.getState().review;
  return !!run && ALL_PASES.some((p) => run.passes[p].status === "running");
}

/**
 * Start a review over the open essay for the given passes. Safe to call
 * again for the failed passes only (Reintentar): coverage and fingerprints
 * are merged by `commitReview`.
 */
export function startReview(pases: Pase[]): void {
  const state = useStore.getState();
  const essay = state.current;
  if (!essay || pases.length === 0 || isRunning()) return;
  const text = extractPlainText(essay.content);
  // An unknown saved profile falls back to the default: nothing in the
  // interface could fix it, so it must not block the review.
  const saved = essay.reviewerProfile;
  const profile =
    saved && REVIEWER_PROFILES.some((p) => p.id === saved) ? saved : DEFAULT_REVIEWER_PROFILE;
  if (text.trim().length === 0) return;

  // A previous run's leftovers (settled panel state) are replaced.
  active?.unregister();

  const wanted = ALL_PASES.filter((p) => pases.includes(p));
  const requestIds: Partial<Record<Pase, string>> = {};
  const passes = {} as Record<Pase, ReviewPassState>;
  for (const p of ALL_PASES) {
    if (wanted.includes(p)) {
      requestIds[p] = crypto.randomUUID();
      passes[p] = { status: "running", progress: 0, requestId: requestIds[p] ?? null };
    } else {
      passes[p] = idlePass();
    }
  }

  const fingerprint = reviewFingerprint(essay);
  const run: ActiveRun = {
    essayId: essay.id,
    restoreNonce: state.restoreNonce,
    canceled: false,
    requestIds,
    unregister: () => {},
  };
  // Leaving the essay cancels the run first; if it was still running the
  // notice says it was discarded. Either way the run state goes with it.
  run.unregister = registerEssayLeaveHook(() => {
    run.unregister();
    if (active === run) active = null;
    const wasRunning = !run.canceled && isRunning();
    run.canceled = true;
    abortRequests(run);
    const s = useStore.getState();
    s.setReview(null);
    s.setReviewOutcome(wasRunning ? { kind: "discarded", essayId: run.essayId } : null);
  });
  active = run;

  const view: ReviewRun = {
    essayId: essay.id,
    restoreNonce: state.restoreNonce,
    fingerprint,
    passes,
  };
  state.setReviewOutcome(null);
  state.setReview(view);

  const { mode, language, rubrica, fuentes } = essay;

  void Promise.all(
    wanted.map(async (pase): Promise<[Pase, PassResult]> => {
      const requestId = requestIds[pase];
      if (!requestId) return [pase, { kind: "failed" }];
      let progress = 0;
      let lines = "";
      const move = (next: number) => {
        progress = Math.max(progress, Math.min(100, next));
        if (active === run) useStore.getState().patchReviewPass(pase, { progress });
      };
      try {
        const { result, provenance, fuentesOmitidas } = await critique({
          sage: sageForPase(pase, mode),
          pase,
          text,
          rubrica: rubrica?.criterios,
          fuentes,
          language: language ?? "es",
          reviewerProfile: profile,
          requestId,
          onUpdate: (u) => {
            if (u.kind === "started") move(SMALL_STEP);
            else if (u.kind === "token") {
              lines += u.delta;
              const done = lines.split("\n");
              lines = done.pop() ?? "";
              for (const line of done) {
                if (line.trim()) move(progress + (CEILING - progress) * LINE_STEP);
              }
            }
          },
        });
        const parsed = parseAnnotationsDetailed(result, fuentes ?? []);
        move(100);
        return [
          pase,
          {
            kind: "ok",
            raw: parsed.annotations,
            invalid: parsed.invalidLines.length,
            provenance,
            fuentesOmitidas: fuentesOmitidas.map(sourceLabel),
          },
        ];
      } catch (err) {
        if (err instanceof SidecarRequestError && err.code === "CANCELLED") {
          return [pase, { kind: "canceled" }];
        }
        if (err instanceof SidecarRequestError && err.code === "ESSAY_TOO_LONG") {
          return [pase, { kind: "failed", tooLong: true }];
        }
        return [pase, { kind: "failed" }];
      }
    }),
  ).then((entries) => {
    void settle(run, new Map(entries));
  });
}

/** Cancel the running review. Nothing is applied and nothing changes. */
export function cancelReview(): void {
  const run = active;
  if (!run || run.canceled) return;
  run.canceled = true;
  abortRequests(run);
  run.unregister();
  active = null;
  const s = useStore.getState();
  s.setReview(null);
  s.setReviewOutcome(null);
}

/** Clear a settled run's panel state (its line, its progress). */
export function dismissReview(): void {
  if (isRunning()) return;
  active?.unregister();
  active = null;
  const s = useStore.getState();
  s.setReview(null);
  // The one thing a finished review leaves behind is which sources did not
  // fit; Correcciones shows it. A new run or leaving the essay clears it.
  const kept = s.reviewOutcome;
  if (!(kept?.kind === "done" && kept.fuentesOmitidas?.length)) s.setReviewOutcome(null);
}

/** Pases a Volver a revisar runs: the defaults for the open essay's type. */
export function defaultReviewPases(): Pase[] {
  const mode = useStore.getState().current?.mode ?? "academico";
  return defaultPasesForMode(mode);
}

function abortRequests(run: ActiveRun): void {
  for (const id of Object.values(run.requestIds)) {
    if (id) void cancelSidecarRequest(id);
  }
}

function waitForCompositionEnd(editor: Editor): Promise<void> {
  if (!editor.view.composing) return Promise.resolve();
  return new Promise<void>((resolve) => {
    editor.view.dom.addEventListener("compositionend", () => resolve(), { once: true });
  });
}

async function settle(run: ActiveRun, results: Map<Pase, PassResult>): Promise<void> {
  if (active !== run || run.canceled) return;
  const store = useStore.getState();
  const finalStatus = (pase: Pase): ReviewPassState["status"] => {
    const r = results.get(pase);
    if (!r) return "idle";
    if (r.kind === "ok") return r.invalid > 0 ? "partial" : "done";
    return r.kind === "canceled" ? "canceled" : "failed";
  };
  const ran = [...results.keys()];
  for (const p of ran) store.patchReviewPass(p, { status: finalStatus(p) });

  const returned = ran.filter((p) => results.get(p)?.kind === "ok");
  const failed = ran.filter((p) => results.get(p)?.kind !== "ok");

  // All failed or canceled: nothing changes.
  if (returned.length === 0) {
    const tooLong = ran.every((p) => {
      const r = results.get(p);
      return r?.kind === "failed" && r.tooLong;
    });
    if (tooLong) {
      store.setReviewOutcome({ kind: "too_long", essayId: run.essayId });
      return;
    }
    store.setReviewOutcome({ kind: "all_failed", essayId: run.essayId });
    return;
  }

  // Never apply into a composition in progress.
  const early = tryEditor(run.essayId);
  if (early) await waitForCompositionEnd(early);
  if (active !== run || run.canceled) return;

  // From here to the end of the transaction there is no await, so the
  // document cannot change between the check and the write.
  const s = useStore.getState();
  if (
    s.current?.id !== run.essayId ||
    s.restoreNonce !== run.restoreNonce ||
    !tryEditor(run.essayId)
  ) {
    s.setReview(null);
    s.setReviewOutcome({ kind: "discarded", essayId: run.essayId });
    run.unregister();
    active = null;
    return;
  }
  const editor = getDocumentEditor(run.essayId);
  applyReview(editor, results, returned);
  const after = useStore.getState();
  // Every pass reads the same text and sources, so the first one that
  // returned says which sources were left out.
  const firstOk = returned.map((p) => results.get(p)).find((r) => r?.kind === "ok");
  const omitted = firstOk?.kind === "ok" ? firstOk.fuentesOmitidas : [];
  const fuentesOmitidas = omitted.length > 0 ? { fuentesOmitidas: omitted } : {};
  after.setReviewOutcome(
    failed.length > 0
      ? { kind: "some_failed", essayId: run.essayId, failed, ...fuentesOmitidas }
      : { kind: "done", essayId: run.essayId, ...fuentesOmitidas },
  );
}

/** Passes that only diagnose; a replacement there would invent the author's idea. */
const NO_REEMPLAZO_PASES: ReadonlySet<Pase> = new Set<Pase>(["coherencia", "argumento", "estilo"]);

const fold = (t: string): string =>
  t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * A replacement goes straight into the essay, so it may not carry a number
 * (page, year, statistic) or a proper name found neither in the essay nor in
 * its sources. A capitalized word counts as a name unless it is the first
 * word of the replacement. The finding stays; only the ready-to-paste text
 * is dropped.
 */
export function replacementIsGrounded(reemplazo: string, corpus: string): boolean {
  if (!(reemplazo.match(/\d+/g) ?? []).every((n) => corpus.includes(n))) return false;
  const folded = fold(corpus);
  // A capital after the start or after a sentence end is grammar, not a name.
  for (const m of reemplazo.matchAll(/[\p{L}\p{N}]+/gu)) {
    const w = m[0];
    if (!/^\p{Lu}/u.test(w)) continue;
    const before = reemplazo.slice(0, m.index).trimEnd();
    if (before === "" || /[.!?¿¡«"“(]$/u.test(before)) continue;
    if (!folded.includes(fold(w))) return false;
  }
  return true;
}

/** The replacement takes the first-letter case of the text it replaces. */
export function matchFirstLetterCase(reemplazo: string, cita: string): string {
  const q = cita.match(/\p{L}/u)?.[0];
  const idx = reemplazo.search(/\p{L}/u);
  if (!q || idx < 0) return reemplazo;
  const r = reemplazo[idx];
  const wantUpper = q !== q.toLowerCase();
  const wantLower = q !== q.toUpperCase();
  if (wantUpper && r !== r.toUpperCase()) {
    return reemplazo.slice(0, idx) + r.toUpperCase() + reemplazo.slice(idx + 1);
  }
  if (wantLower && r !== r.toLowerCase()) {
    return reemplazo.slice(0, idx) + r.toLowerCase() + reemplazo.slice(idx + 1);
  }
  return reemplazo;
}

function tryEditor(essayId: string): Editor | null {
  try {
    return getDocumentEditor(essayId);
  } catch {
    return null;
  }
}

/** data-model.md, Applying a review, steps 1 to 6. Synchronous. */
function applyReview(
  editor: Editor,
  results: Map<Pase, PassResult>,
  returned: Pase[],
): void {
  const store = useStore.getState();
  const cur = store.current;
  const view = store.review;
  if (!cur || !view) return;
  const generadoEn = new Date().toISOString();
  const criterios = cur.rubrica?.criterios;
  const cleanPases: Pase[] = [];
  const partialPases: Pase[] = [];
  for (const p of returned) {
    const r = results.get(p);
    if (r?.kind !== "ok") continue;
    (r.invalid > 0 ? partialPases : cleanPases).push(p);
  }
  const replaced = new Set<Pase>([...cleanPases, ...partialPases]);

  // Step 2: open findings of clean and partial passes are replaced. Marks
  // and records go; failed passes, resolved and not applicable stay.
  const views = deriveFindings(cur.content, cur.findings);
  const removeIds = new Set(
    views.filter((v) => v.status === "open" && replaced.has(v.pase)).map((v) => v.id),
  );
  const closed: FindingRecord[] = (cur.findings ?? []).filter(
    (r) => r.status !== "open",
  );

  const resolveSentence = (r: SlimRecord) => {
    const range = findCitaRange(editor, r.cita ?? "", r.occurrence ?? 0);
    return range ? sentenceRange(editor, range.from) : null;
  };

  // Steps 3 to 5: locate each new finding, suppress what a closed one still
  // covers, keep the rest, located or not.
  const corpus = [
    extractPlainText(cur.content),
    ...(cur.fuentes ?? []).map((f) => f.contenido),
  ].join("\n");
  const seen = new Map<string, number>();
  const records: FindingRecord[] = [];
  const addMarks: { from: number; to: number; attrs: AnnotationAttrs }[] = [];
  for (const pase of returned) {
    const r = results.get(pase);
    if (r?.kind !== "ok") continue;
    const sage = sageForPase(pase, cur.mode);
    for (const raw of r.raw) {
      const a = buildAnotacion(raw, sage, pase, generadoEn, criterios, r.provenance);
      if (NO_REEMPLAZO_PASES.has(pase)) a.reemplazo = undefined;
      else if (a.reemplazo) {
        a.reemplazo = replacementIsGrounded(a.reemplazo, corpus)
          ? matchFirstLetterCase(a.reemplazo, a.cita)
          : undefined;
      }
      const key = a.cita;
      let skip = seen.get(key) ?? 0;
      let range = findCitaRange(editor, a.cita, skip);
      if (!range && skip > 0) {
        skip = 0;
        range = findCitaRange(editor, a.cita, 0);
      }
      if (range) seen.set(key, skip + 1);
      if (isSuppressed({ pase, cita: a.cita, range }, closed, resolveSentence)) continue;
      records.push({
        id: a.id,
        sage,
        pase,
        severidad: a.severidad,
        cita: a.cita,
        mensaje: a.mensaje,
        ...(a.reemplazo ? { reemplazo: a.reemplazo } : {}),
        ...(a.criterioId ? { criterioId: a.criterioId } : {}),
        ...(a.evidence ? { evidence: a.evidence } : {}),
        ...(a.provenance ? { provenance: a.provenance } : {}),
        generadoEn,
        status: "open",
        ...(range ? { occurrence: skip } : {}),
      });
      if (range) {
        addMarks.push({
          from: range.from,
          to: range.to,
          attrs: {
            id: a.id,
            sage: a.sage,
            pase: a.pase,
            severidad: a.severidad,
            mensaje: a.mensaje,
            reemplazo: a.reemplazo ?? null,
            criterioId: a.criterioId ?? null,
            evidence: a.evidence ?? null,
            provenance: a.provenance ?? null,
          },
        });
      }
    }
  }

  if (removeIds.size > 0 || addMarks.length > 0) {
    editor.commands.applyReview({ remove: [...removeIds], add: addMarks });
  }

  // Step 6: commit meta, then flush. The editor's own update already
  // replaced `current`; `commitReview` reads it fresh.
  useStore.getState().commitReview({
    fingerprint: view.fingerprint,
    cleanPases,
    partialPases,
    reviewerRuns: returned.flatMap((p) => {
      const r = results.get(p);
      return r?.kind === "ok" ? [{ pase: p, provenance: r.provenance }] : [];
    }),
    findings: (prev) => [...prev.filter((r) => !removeIds.has(r.id)), ...records],
  });
}
