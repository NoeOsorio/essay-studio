"use client";

import { create } from "zustand";
import type { JSONContent } from "@tiptap/core";
import {
  appendSnapshot,
  deleteEssay,
  loadLibrary,
  listHistory,
  readEssay,
  readSnapshot,
  writeEssay,
} from "@/lib/storage";
import { reviewFingerprint } from "@/lib/review/fingerprint";
import { REVIEWER_PROFILES } from "../../sidecar/src/model-profiles";
import type {
  BoardSnapshot,
  Essay,
  FindingRecord,
  EssayLanguage,
  LibraryEntry,
  EssayMode,
  EvaluacionMeta,
  Fuente,
  Interrogatorio,
  Pase,
  Rubrica,
  Sage,
  Snapshot,
  SnapshotKind,
  SnapshotMeta,
  ReviewProvenance,
} from "@/lib/storage/types";

const AUTOSAVE_MS = 800;

export type SaveStatus =
  | { kind: "idle" }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error"; message: string };

export type View = "list" | "editor";

export type ListStatus = "loading" | "ready" | "error";

/** What the library screen remembers while the app runs. Not persisted. */
export type LibraryView = {
  query: string;
  tipo: EssayMode | null;
  revision: "revisados" | "sin-revisar" | "desactualizados" | null;
  orden: "recientes" | "antiguos" | "nota" | "titulo" | "relevantes";
  scrollTop: number;
};

const INITIAL_LIBRARY_VIEW: LibraryView = {
  query: "",
  tipo: null,
  revision: null,
  orden: "recientes",
  scrollTop: 0,
};

export type OverlayOpenOpts = { instant?: boolean };
/** Openers may be passed straight to onClick, so they accept any object
 *  (a click event) and only treat `{ instant: true }` as instant. */
export type OverlayOpenArg = OverlayOpenOpts | object;
const isInstant = (opts?: OverlayOpenArg): boolean =>
  (opts as OverlayOpenOpts | undefined)?.instant === true;

export type Overlay =
  | "lectura"
  | "review"
  | "rubrica"
  | "fuentes"
  | "history"
  | null;

/** Why one agent of a question run did not deliver. Shown as a short line. */
export type FailureKind = "unusable" | "timeout" | "generic";

/** Where one agent of a question run stands. Session only. */
export type AgentRunState = {
  sage: Sage;
  phase: "thinking" | "landing" | "done" | "failed" | "stopped";
  landedCount: number;
  failure: FailureKind | null;
};

/**
 * The question run in flight or just ended. Session only, written only by
 * `src/lib/questions/run.ts`. `justLanded` is the discard window: the notes
 * of this run that the writer has neither kept nor discarded.
 */
export type QuestionRun = {
  runId: string;
  essayId: string;
  source: { fuenteId?: string; label: string };
  status: "running" | "stopping" | "ended";
  agents: AgentRunState[];
  /** The writer's own question, when he asked one. Answered by `sage`. */
  own?: OwnQuestionState;
  justLanded: string[];
};

/** Where the writer's own question stands. Session only. */
export type OwnQuestionState = {
  sage: Sage;
  question: string;
  phase: "thinking" | "done" | "failed" | "stopped";
  failure: FailureKind | null;
};

/** Where one pass of a running review stands. Session only. */
export type ReviewPassStatus =
  | "idle" // not part of this run
  | "running"
  | "done" // returned, every line valid
  | "partial" // returned, some lines invalid
  | "failed"
  | "canceled";

export type ReviewPassState = {
  status: ReviewPassStatus;
  /** 0 to 100, moved only by real events. */
  progress: number;
  requestId: string | null;
};

/** A review in flight or just settled. Never persisted. */
export type ReviewRun = {
  essayId: string;
  restoreNonce: number;
  /** What the run read, captured when it started. */
  fingerprint: string;
  passes: Record<Pase, ReviewPassState>;
};

/** What the panel and the notice show after a run ends. Never persisted. */
export type ReviewOutcome =
  | { kind: "all_failed"; essayId: string }
  /** The essay alone does not fit one request; retrying cannot help. */
  | { kind: "too_long"; essayId: string }
  | { kind: "some_failed"; essayId: string; failed: Pase[]; fuentesOmitidas?: string[] }
  | { kind: "discarded"; essayId: string }
  | { kind: "done"; essayId: string; fuentesOmitidas?: string[] };

/** A source taken out of the library, with where it was, so it can be put back. */
export type RemovedFuente = { essayId: string; fuente: Fuente; index: number };

/** Reading state of material. Never persisted, so a crash cannot leave a source stuck in "leyendo". */
export type LecturaState = "leyendo" | "fallo";

type LeaveHook = () => void;
const leaveHooks = new Set<LeaveHook>();

/**
 * Register work to run before the open essay is left (close, open another,
 * new essay, restore a version). Returns the unregister function. Hooks run
 * synchronously and first, before any flush, so a running review is canceled
 * while the document it belongs to is still the open one.
 */
export function registerEssayLeaveHook(hook: LeaveHook): () => void {
  leaveHooks.add(hook);
  return () => {
    leaveHooks.delete(hook);
  };
}

function runEssayLeaveHooks(): void {
  for (const hook of [...leaveHooks]) {
    try {
      hook();
    } catch (err) {
      console.warn("essay leave hook failed", err);
    }
  }
}

export type CommitReviewArgs = {
  /** The fingerprint the run read. */
  fingerprint: string;
  /** Passes that returned every line valid. */
  cleanPases: Pase[];
  /** Passes that returned lines, some invalid. */
  partialPases: Pase[];
  reviewerRuns: { pase: Pase; provenance?: ReviewProvenance }[];
  /** Replaces the records after the marks have been applied. */
  findings: (previous: FindingRecord[]) => FindingRecord[];
};

type State = {
  view: View;
  list: LibraryEntry[];
  listStatus: ListStatus;
  library: LibraryView;
  current: Essay | null;
  saveStatus: SaveStatus;
  /** Modal overlay shown above the editor (Lectura nueva, etc.). */
  overlay: Overlay;
  /** Whether the right-hand board pane is visible. Hidden = editor
   *  takes the full main column, centered. */
  boardOpen: boolean;
  /** The one agent the panel opens with (selection bubble), or null when
   *  the agents default to the essay type. */
  lecturaSage: Sage | null;
  /** Session-only state of the question run. Owned by `src/lib/questions/run.ts`. */
  questionRun: QuestionRun | null;
  setQuestionRun: (run: QuestionRun | null) => void;
  /** Replace the entries of one question run and schedule the debounced
   *  save. The only writer for run entries; touches nothing else. */
  replaceInterrogatoriosForRun: (runId: string, entries: Interrogatorio[]) => void;
  /** Optional text to pre-fill the Lectura textarea with (e.g. the
   *  current editor selection when launched via the bubble menu). */
  lecturaPrefill: string;
  /** Internal: timer handle for the debounced save. */
  _autosaveTimer: ReturnType<typeof setTimeout> | null;

  /** Remember the library screen's search, filters and place. */
  setLibrary: (patch: Partial<LibraryView>) => void;
  /** Load the essay list and switch to list view. */
  loadList: () => Promise<void>;
  /** Create a new essay (initial empty doc), open it in the editor. */
  newEssay: (mode?: EssayMode) => Promise<string | null>;
  /** Open an existing essay by id. */
  openEssay: (id: string, expectedCurrentId?: string | null) => Promise<void>;
  /** Close the current essay and go back to the list, flushing pending writes. */
  closeEssay: () => Promise<void>;
  /** Delete an essay. Caller must confirm with the user first. */
  removeEssay: (id: string) => Promise<void>;

  /** Update the content of the open essay; marks dirty and schedules autosave. */
  updateContent: (content: JSONContent, wordCount: number) => void;
  updateTitle: (title: string) => void;
  updateMode: (mode: EssayMode) => void;
  updateLanguage: (language: EssayLanguage) => void;
  /** Update the tldraw board snapshot for the open essay. */
  updateBoard: (snapshot: BoardSnapshot | null) => void;
  /** Persist board navigation without changing content/evaluation timestamps. */
  updateBoardSession: (snapshot: BoardSnapshot | null) => void;
  /** Append an interrogatorio entry from a sage and flush. */
  addInterrogatorio: (entry: Interrogatorio) => void;
  /** Session-only state of the review run. Owned by `src/lib/review/run.ts`. */
  review: ReviewRun | null;
  reviewOutcome: ReviewOutcome | null;
  setReview: (review: ReviewRun | null) => void;
  /** How many review surfaces (report card, corrections, a finding card) are open. The toolbar button yields while any is. */
  reviewSurfaces: number;
  bumpReviewSurfaces: (delta: 1 | -1) => void;
  patchReviewPass: (pase: Pase, patch: Partial<ReviewPassState>) => void;
  setReviewOutcome: (outcome: ReviewOutcome | null) => void;
  /** Record a landed review: coverage is the previous union this run's clean
   *  passes minus any pass that returned invalid lines; fingerprints are
   *  overwritten only for passes in this run. */
  commitReview: (args: CommitReviewArgs) => void;
  /** Replace the durable finding records and flush. Never touches
   *  `updatedAt`: closing a finding is not a text edit. Returns nothing;
   *  an empty result removes the field from the saved essay. */
  commitFindings: (
    update: (previous: FindingRecord[]) => FindingRecord[],
    patchMeta?: (meta: EvaluacionMeta | undefined) => EvaluacionMeta | undefined,
  ) => void;
  /** Limpia la evaluación entera: quita todas las anotaciones del
   *  documento (vía evento que captura EditorPane) y resetea
   *  evaluacionMeta. El sello vuelve al estado "nunca revisado"
   *  (sin sello). Sesión 17. */
  clearEvaluacion: () => void;
  /** The score stamp can be hidden by a client (session state, not saved).
   *  It comes back on opening another essay or after a new review. */
  scorebarDismissed: boolean;
  dismissScorebar: () => void;
  showScorebar: () => void;
  /** Choose the reviewer profile the open essay uses. */
  updateReviewerProfile: (profileId: string) => void;
  /** Open / close the lectura overlay. */
  setOverlay: (overlay: Overlay) => void;
  /** True while the open overlay was opened with `{ instant: true }`
   *  (native menu, keyboard activation): panels skip their opening
   *  animation. Cleared when the overlay closes. */
  overlayInstant: boolean;
  /** Open the Hazme preguntas panel AND make sure the board pane is
   *  visible: the questions land there. `sage` means "only this agent on";
   *  `prefill` is the text selected in the essay, offered as the source.
   *  A no-op while a question run is in flight. */
  openLectura: (sage?: Sage, prefill?: string, opts?: OverlayOpenArg) => void;
  /** Change the sage selected in the Lectura overlay (single mode). */
  setLecturaSage: (sage: Sage) => void;
  /** Open the Revisar ensayo panel for the current essay. */
  openReview: (opts?: OverlayOpenArg) => void;
  /** Open the rubric editor overlay for the current essay. */
  openRubrica: (opts?: OverlayOpenArg) => void;
  /** Replace the current essay's rubric and flush. */
  updateRubrica: (rubrica: Rubrica | undefined) => void;
  /** Open the fuentes (sources library) overlay. */
  openFuentes: (opts?: OverlayOpenArg) => void;
  /** Append a fuente to the current essay; flush. */
  addFuente: (fuente: Fuente) => void;
  /** Patch an existing fuente by id; flush. */
  updateFuente: (id: string, patch: Partial<Omit<Fuente, "id">>) => void;
  /** Remove a fuente from the current essay; flush. Returns what was removed so the caller can offer undo. */
  removeFuente: (id: string) => RemovedFuente | null;
  /** Undo of `removeFuente`: puts the source back where it was. No-op for another essay or an id already present. */
  restoreFuente: (removed: RemovedFuente) => void;
  /** Reading state of each source (by id) and of the rubric's assignment. Never persisted. */
  lecturas: Record<string, LecturaState>;
  lecturaRubrica: LecturaState | null;
  setLectura: (sourceId: string, state: LecturaState | null) => void;
  setLecturaRubrica: (state: LecturaState | null) => void;
  /** Apply an AI result to a source. `derive` sees the source as it is now, so only empty fields get filled.
   *  Returns false (and changes nothing) when the essay is no longer open, the source is gone, or `derive` returns null. */
  patchFuenteIf: (essayId: string, sourceId: string, derive: (current: Fuente) => Partial<Omit<Fuente, "id">> | null) => boolean;
  /** Same for the rubric: `derive` sees the rubric as it is now; null leaves it alone. */
  patchRubricaIf: (essayId: string, derive: (current: Rubrica | undefined) => Rubrica | undefined | null) => boolean;
  /** Replace the rubric after the writer confirmed it. Saves a before-restore version first. */
  replaceRubrica: (essayId: string, rubrica: Rubrica) => Promise<boolean>;
  /** Show/hide the right-hand board pane. Force-flushes any pending
   *  save before hiding so unmounting tldraw doesn't lose work. */
  toggleBoard: () => void;

  /** Sesión 12 — version history. */

  /** Metas of every snapshot for `current`, DESC by takenAt. Reloaded
   *  whenever the user opens the history overlay (lazy). */
  history: SnapshotMeta[];
  /** Bumped every time `restoreVersion` succeeds. EditorPane includes
   *  it in its wrapper key so a restore force-remounts the title +
   *  TipTap subtree (their state is mount-time only — the content
   *  prop isn't reactive after mount). */
  restoreNonce: number;
  /** Open the history overlay; auto-loads the list. */
  openHistory: (opts?: OverlayOpenArg) => void;
  /** Force-fetch the history for `current`. Called by openHistory and
   *  after any snapshot mutation. */
  loadHistory: () => Promise<void>;
  /** Append a snapshot of `current` with the given kind. Flushes any
   *  pending autosave first so the snapshot captures the persisted
   *  state, not a transient one. */
  snapshotNow: (kind: SnapshotKind) => Promise<string | null>;
  /** Fetch the full snapshot for preview (without applying it). */
  previewSnapshot: (takenAt: string) => Promise<Snapshot | null>;
  /** Restore an older version. Snapshots the current state first
   *  (kind="before-restore") so the user can always undo. */
  restoreVersion: (takenAt: string, beforeApply?: () => void) => Promise<boolean>;

  /** Force-flush any pending save. */
  flush: () => Promise<void>;
};

function emptyDoc(): JSONContent {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

function nowIso(): string {
  return new Date().toISOString();
}

function genId(): string {
  // crypto.randomUUID is available in Tauri's webview (modern Chromium/WebKit).
  return crypto.randomUUID();
}

/**
 * Older evaluations carry no fingerprints. When the timestamps say the
 * review is fresh, fill them in memory so the first resolve does not show
 * "out of date". Written only on the next real save; if the timestamps
 * already say stale it stays so until the next review.
 */
function backfillFingerprints(essay: Essay): Essay {
  const meta = essay.evaluacionMeta;
  if (!meta || meta.fingerprintsByPase) return essay;
  if (essay.updatedAt > meta.evaluadoEn) return essay;
  const fp = reviewFingerprint(essay);
  const fingerprintsByPase: Partial<Record<Pase, string>> = {};
  for (const p of meta.pasadasCubiertas) fingerprintsByPase[p] = fp;
  return { ...essay, evaluacionMeta: { ...meta, fingerprintsByPase } };
}

/** The copy handed to `writeEssay`: carries the saved-state fingerprint, never put back on `current`. */
function withCurrentFingerprint(essay: Essay): Essay {
  if (!essay.evaluacionMeta) return essay;
  return {
    ...essay,
    evaluacionMeta: {
      ...essay.evaluacionMeta,
      currentFingerprint: reviewFingerprint(essay),
    },
  };
}

// One persistence queue serves UI autosave and agent writes. Navigation tokens
// prevent an older async open from replacing a newer human choice.
let activeFlush: Promise<void> | null = null;
let navigationGeneration = 0;
const deletingEssayIds = new Set<string>();

export const useStore = create<State>((set, get) => ({
  view: "list",
  list: [],
  listStatus: "loading",
  library: INITIAL_LIBRARY_VIEW,
  current: null,
  saveStatus: { kind: "idle" },
  overlay: null,
  overlayInstant: false,
  boardOpen: true,
  lecturaSage: null,
  questionRun: null,
  lecturaPrefill: "",
  history: [],
  restoreNonce: 0,
  scorebarDismissed: false,
  lecturas: {},
  lecturaRubrica: null,
  review: null,
  reviewSurfaces: 0,
  bumpReviewSurfaces(delta) {
    set((st) => ({ reviewSurfaces: Math.max(0, st.reviewSurfaces + delta) }));
  },
  reviewOutcome: null,
  _autosaveTimer: null,

  setLibrary(patch) {
    set((s) => ({ library: { ...s.library, ...patch } }));
  },

  async loadList() {
    const navigation = navigationGeneration;
    const previous = get().current;
    try {
      const list = await loadLibrary();
      if (navigation !== navigationGeneration || get().current !== previous) return;
      set({ list, listStatus: "ready", view: "list" });
    } catch (err) {
      if (navigation !== navigationGeneration || get().current !== previous) return;
      console.error("loadList failed", err);
      // Never report empty because of a failure: keep what we had.
      set({ listStatus: "error", view: "list" });
    }
  },

  async newEssay(mode = "academico") {
    if (get().current) runEssayLeaveHooks();
    const navigation = ++navigationGeneration;
    if (get().current) {
      await get().flush();
      if (navigation !== navigationGeneration || get().saveStatus.kind !== "saved") return null;
    }
    const previous = get().current;
    const now = nowIso();
    const essay: Essay = {
      id: genId(),
      title: "Sin título",
      content: emptyDoc(),
      mode,
      wordCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await writeEssay(essay);
      if (navigation !== navigationGeneration || get().current !== previous) return null;
      set(() => ({
        current: essay,
        view: "editor",
        saveStatus: { kind: "saved", at: Date.now() },
      }));
      return essay.id;
    } catch (err) {
      if (navigation !== navigationGeneration || get().current !== previous) return null;
      set({
        saveStatus: {
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        },
      });
      return null;
    }
  },

  async openEssay(id, expectedCurrentId) {
    if (deletingEssayIds.has(id)) return;
    const previousId = get().current?.id ?? null;
    if (expectedCurrentId !== undefined && previousId !== expectedCurrentId) return;
    if (previousId && previousId !== id) runEssayLeaveHooks();
    const navigation = ++navigationGeneration;
    let previous = get().current;
    try {
      if (previousId) {
        await get().flush();
        if (navigation !== navigationGeneration || (get().current?.id ?? null) !== previousId || get().saveStatus.kind !== "saved") return;
      }
      if (previousId === id) return;
      previous = get().current;
      const essay = backfillFingerprints(await readEssay(id));
      if (deletingEssayIds.has(id)) return;
      // Typing does not navigate, but it still invalidates this pending open.
      // Preserve that live version even if autosave already completed it.
      if (navigation !== navigationGeneration || get().current !== previous) return;
      set({
        current: essay,
        view: "editor",
        saveStatus: { kind: "saved", at: Date.parse(essay.updatedAt) },
        // Reset; loadHistory below repopulates con metas del essay
        // recién abierto para que el count del topbar sea honesto.
        history: [],
        lecturas: {},
        lecturaRubrica: null,
        scorebarDismissed: false,
      });
      void get().loadHistory();
    } catch (err) {
      if (navigation !== navigationGeneration || get().current !== previous) return;
      console.error("openEssay failed", err);
      set({
        saveStatus: {
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        },
      });
    }
  },

  async closeEssay() {
    // First: cancel anything that belongs to this essay, before the flush.
    runEssayLeaveHooks();
    const navigation = ++navigationGeneration;
    const closingEssay = get().current;
    const essayId = closingEssay?.id;
    // Take a "close" snapshot before tearing down. Best-effort — if it
    // fails (sidecar down, disk full), we still close the essay so the
    // user isn't trapped. The snapshot also runs `flush()` internally
    // so the saved state is consistent on disk.
    try {
      await get().snapshotNow("close");
    } catch (err) {
      console.warn("close snapshot failed", err);
    }
    await get().flush();
    if (navigation !== navigationGeneration || get().current !== closingEssay || (essayId && get().saveStatus.kind !== "saved")) return;
    const timer = get()._autosaveTimer;
    if (timer) clearTimeout(timer);
    // Load the list before switching view, so no frame shows old data.
    let list: LibraryEntry[] | null = null;
    try {
      list = await loadLibrary();
    } catch (err) {
      console.error("loadList failed", err);
    }
    if (navigation !== navigationGeneration || get().current !== closingEssay) return;
    set({
      current: null,
      view: "list",
      ...(list ? { list, listStatus: "ready" as const } : { listStatus: "error" as const }),
      saveStatus: { kind: "idle" },
      history: [],
      lecturas: {},
      lecturaRubrica: null,
      _autosaveTimer: null,
    });
  },

  async removeEssay(id) {
    if (get().current?.id === id) throw new Error("Close the essay before deleting it.");
    deletingEssayIds.add(id);
    try {
      await deleteEssay(id);
      set((s) => ({ list: s.list.filter((m) => m.id !== id) }));
    } catch (err) {
      console.error("removeEssay failed", err);
    } finally {
      deletingEssayIds.delete(id);
    }
  },

  updateContent(content, wordCount) {
    const cur = get().current;
    if (!cur) return;
    const updated: Essay = {
      ...cur,
      content,
      wordCount,
      updatedAt: nowIso(),
    };
    const prev = get()._autosaveTimer;
    if (prev) clearTimeout(prev);
    const timer = setTimeout(() => {
      void get().flush();
    }, AUTOSAVE_MS);
    set({
      current: updated,
      saveStatus: { kind: "dirty" },
      _autosaveTimer: timer,
    });
  },

  updateTitle(title) {
    const cur = get().current;
    if (!cur) return;
    const updated = { ...cur, title, updatedAt: nowIso() };
    const prev = get()._autosaveTimer;
    if (prev) clearTimeout(prev);
    const timer = setTimeout(() => {
      void get().flush();
    }, AUTOSAVE_MS);
    set({
      current: updated,
      saveStatus: { kind: "dirty" },
      _autosaveTimer: timer,
    });
  },

  updateMode(mode) {
    const cur = get().current;
    if (!cur) return;
    const updated = { ...cur, mode, updatedAt: nowIso() };
    set({ current: updated, saveStatus: { kind: "dirty" } });
    void get().flush();
  },

  updateLanguage(language) {
    const cur = get().current;
    if (!cur) return;
    const updated = { ...cur, language, updatedAt: nowIso() };
    set({ current: updated, saveStatus: { kind: "dirty" } });
    void get().flush();
  },

  updateBoardSession(snapshot) {
    const cur = get().current;
    if (!cur) return;
    const prev = get()._autosaveTimer;
    if (prev) clearTimeout(prev);
    const timer = setTimeout(() => { void get().flush(); }, AUTOSAVE_MS);
    set({ current: { ...cur, board: snapshot }, saveStatus: { kind: "dirty" }, _autosaveTimer: timer });
  },

  updateBoard(snapshot) {
    const cur = get().current;
    if (!cur) return;
    const updated: Essay = { ...cur, board: snapshot, updatedAt: nowIso() };
    const prev = get()._autosaveTimer;
    if (prev) clearTimeout(prev);
    const timer = setTimeout(() => {
      void get().flush();
    }, AUTOSAVE_MS);
    set({
      current: updated,
      saveStatus: { kind: "dirty" },
      _autosaveTimer: timer,
    });
  },

  addInterrogatorio(entry) {
    const cur = get().current;
    if (!cur) return;
    const updated: Essay = {
      ...cur,
      interrogatorios: [...(cur.interrogatorios ?? []), entry],
      updatedAt: nowIso(),
    };
    set({ current: updated, saveStatus: { kind: "dirty" } });
    void get().flush();
  },

  setQuestionRun(run) {
    set({ questionRun: run });
  },

  replaceInterrogatoriosForRun(runId, entries) {
    const cur = get().current;
    if (!cur) return;
    const next = [
      ...(cur.interrogatorios ?? []).filter((e) => e.runId !== runId),
      ...entries,
    ];
    const updated: Essay = {
      ...cur,
      interrogatorios: next.length > 0 ? next : undefined,
      updatedAt: nowIso(),
    };
    const prev = get()._autosaveTimer;
    if (prev) clearTimeout(prev);
    const timer = setTimeout(() => {
      void get().flush();
    }, AUTOSAVE_MS);
    set({
      current: updated,
      saveStatus: { kind: "dirty" },
      _autosaveTimer: timer,
    });
  },

  commitFindings(update, patchMeta) {
    const cur = get().current;
    if (!cur) return;
    const next = update(cur.findings ?? []);
    const updated: Essay = {
      ...cur,
      findings: next.length > 0 ? next : undefined,
      ...(patchMeta ? { evaluacionMeta: patchMeta(cur.evaluacionMeta) } : {}),
    };
    set({ current: updated, saveStatus: { kind: "dirty" } });
    void get().flush();
  },

  setReview(review) {
    set({ review });
  },

  patchReviewPass(pase, patch) {
    const run = get().review;
    if (!run) return;
    set({
      review: {
        ...run,
        passes: { ...run.passes, [pase]: { ...run.passes[pase], ...patch } },
      },
    });
  },

  setReviewOutcome(outcome) {
    set({ reviewOutcome: outcome });
  },

  commitReview({ fingerprint, cleanPases, partialPases, reviewerRuns, findings }) {
    const cur = get().current;
    if (!cur) return;
    const prev = cur.evaluacionMeta;
    const inRun = new Set<Pase>([...cleanPases, ...partialPases]);
    // Previous coverage, plus this run's clean passes, minus any pass that
    // returned invalid lines.
    const covered = new Set<Pase>(prev?.pasadasCubiertas ?? []);
    for (const p of cleanPases) covered.add(p);
    for (const p of partialPases) covered.delete(p);
    const fingerprintsByPase: Partial<Record<Pase, string>> = {
      ...(prev?.fingerprintsByPase ?? {}),
    };
    for (const p of inRun) fingerprintsByPase[p] = fingerprint;
    for (const p of Object.keys(fingerprintsByPase) as Pase[]) {
      if (!covered.has(p)) delete fingerprintsByPase[p];
    }
    const prints = [...covered].map((p) => fingerprintsByPase[p]);
    const sameOne = prints.length > 0 && prints.every((f) => f === prints[0]);
    const runs = [
      ...(prev?.reviewerRuns ?? []).filter((r) => !inRun.has(r.pase)),
      ...structuredClone(reviewerRuns),
    ];
    const next = findings(cur.findings ?? []);
    const evaluacionMeta: EvaluacionMeta = {
      evaluadoEn: cur.updatedAt,
      pasadasCubiertas: [...covered],
      fingerprintsByPase,
      ...(!sameOne && prev?.appliedFingerprints?.length
        ? { appliedFingerprints: prev.appliedFingerprints }
        : {}),
      ...(runs.length > 0 ? { reviewerRuns: runs } : {}),
    };
    set({
      current: {
        ...cur,
        findings: next.length > 0 ? next : undefined,
        evaluacionMeta,
      },
      saveStatus: { kind: "dirty" },
      scorebarDismissed: false,
    });
    void get().flush();
  },

  dismissScorebar() {
    set({ scorebarDismissed: true });
  },

  showScorebar() {
    set({ scorebarDismissed: false });
  },

  updateReviewerProfile(profileId) {
    const cur = get().current;
    if (!cur) return;
    if (!REVIEWER_PROFILES.some((p) => p.id === profileId)) throw new Error("Unknown reviewer profile.");
    set({ current: { ...cur, reviewerProfile: profileId }, saveStatus: { kind: "dirty" } });
    void get().flush();
  },

  clearEvaluacion() {
    const cur = get().current;
    if (!cur) return;
    // Quitar todas las marks del doc. EditorPane escucha este event
    // SÍNCRONAMENTE y llama editor.commands.clearAllAnnotations().
    // Eso dispara TipTap's onUpdate → updateContent en este mismo
    // tick, dejando current.content sin marks y bumping updatedAt.
    window.dispatchEvent(new CustomEvent("editor:clear-annotations"));
    // DESPUÉS del clear de marks, leemos el current fresh (porque
    // updateContent acaba de reemplazarlo) y le sacamos evaluacionMeta.
    // Si capturáramos cur arriba y spread-eáramos sobre eso, el
    // marcado iba a reaparecer porque cur.content todavía tenía las
    // marks viejas. Sesión 17 — ordering bug pillado por menu.spec.
    const fresh = get().current;
    if (!fresh) return;
    const updated: Essay = {
      ...fresh,
      evaluacionMeta: undefined,
      findings: undefined,
    };
    set({ current: updated, saveStatus: { kind: "dirty" } });
    void get().flush();
  },

  setOverlay(overlay) {
    // Clear any pending prefill when the overlay closes, so the next
    // manual "Interrogar" starts on an empty textarea.
    if (overlay === null) {
      set({ overlay, lecturaPrefill: "", overlayInstant: false });
    } else {
      set({ overlay });
    }
  },

  openLectura(sage, prefill, opts) {
    // A run in flight owns the board; a second panel would start a second one.
    const run = get().questionRun;
    if (run && run.status !== "ended") return;
    set({
      overlay: "lectura",
      overlayInstant: isInstant(opts),
      boardOpen: true,
      lecturaSage: sage ?? null,
      ...(prefill !== undefined ? { lecturaPrefill: prefill } : {}),
    });
  },

  setLecturaSage(sage) {
    set({ lecturaSage: sage });
  },

  openReview(opts) {
    set({ overlay: "review", overlayInstant: isInstant(opts) });
  },

  openRubrica(opts) {
    set({ overlay: "rubrica", overlayInstant: isInstant(opts) });
  },

  openFuentes(opts) {
    set({ overlay: "fuentes", overlayInstant: isInstant(opts) });
  },

  addFuente(fuente) {
    const cur = get().current;
    if (!cur) return;
    const updated: Essay = {
      ...cur,
      fuentes: [...(cur.fuentes ?? []), fuente],
      updatedAt: nowIso(),
    };
    // Debounce — typing-driven fields use the autosave timer like
    // updateContent / updateRubrica.
    const prev = get()._autosaveTimer;
    if (prev) clearTimeout(prev);
    const timer = setTimeout(() => {
      void get().flush();
    }, AUTOSAVE_MS);
    set({
      current: updated,
      saveStatus: { kind: "dirty" },
      _autosaveTimer: timer,
    });
  },

  updateFuente(id, patch) {
    const cur = get().current;
    if (!cur?.fuentes) return;
    const updated: Essay = {
      ...cur,
      fuentes: cur.fuentes.map((f) => (f.id === id ? { ...f, ...patch } : f)),
      updatedAt: nowIso(),
    };
    const prev = get()._autosaveTimer;
    if (prev) clearTimeout(prev);
    const timer = setTimeout(() => {
      void get().flush();
    }, AUTOSAVE_MS);
    set({
      current: updated,
      saveStatus: { kind: "dirty" },
      _autosaveTimer: timer,
    });
  },

  removeFuente(id) {
    const cur = get().current;
    if (!cur?.fuentes) return null;
    const index = cur.fuentes.findIndex((f) => f.id === id);
    if (index < 0) return null;
    const removed: RemovedFuente = { essayId: cur.id, fuente: cur.fuentes[index], index };
    const next = cur.fuentes.filter((f) => f.id !== id);
    const updated: Essay = {
      ...cur,
      // Drop the field entirely if no fuentes remain — keep the JSON clean.
      fuentes: next.length > 0 ? next : undefined,
      updatedAt: nowIso(),
    };
    const lecturas = Object.fromEntries(Object.entries(get().lecturas).filter(([key]) => key !== id));
    set({ current: updated, saveStatus: { kind: "dirty" }, lecturas });
    void get().flush();
    return removed;
  },

  restoreFuente({ essayId, fuente, index }) {
    const cur = get().current;
    if (!cur || cur.id !== essayId) return;
    const list = cur.fuentes ?? [];
    if (list.some((f) => f.id === fuente.id)) return;
    const next = [...list];
    next.splice(Math.min(index, next.length), 0, fuente);
    set({ current: { ...cur, fuentes: next, updatedAt: nowIso() }, saveStatus: { kind: "dirty" } });
    void get().flush();
  },

  setLectura(sourceId, state) {
    set((s) => {
      const rest = Object.fromEntries(Object.entries(s.lecturas).filter(([key]) => key !== sourceId));
      return { lecturas: state ? { ...rest, [sourceId]: state } : rest };
    });
  },

  setLecturaRubrica(state) {
    set({ lecturaRubrica: state });
  },

  patchFuenteIf(essayId, sourceId, derive) {
    const cur = get().current;
    if (!cur || cur.id !== essayId) return false;
    const source = cur.fuentes?.find((f) => f.id === sourceId);
    if (!source) return false;
    const patch = derive(source);
    if (!patch) return false;
    const updated: Essay = {
      ...cur,
      fuentes: (cur.fuentes ?? []).map((f) => (f.id === sourceId ? { ...f, ...patch } : f)),
      updatedAt: nowIso(),
    };
    const prev = get()._autosaveTimer;
    if (prev) clearTimeout(prev);
    const timer = setTimeout(() => {
      void get().flush();
    }, AUTOSAVE_MS);
    set({ current: updated, saveStatus: { kind: "dirty" }, _autosaveTimer: timer });
    return true;
  },

  patchRubricaIf(essayId, derive) {
    const cur = get().current;
    if (!cur || cur.id !== essayId) return false;
    const next = derive(cur.rubrica);
    if (next === null) return false;
    get().updateRubrica(next);
    return true;
  },

  async replaceRubrica(essayId, rubrica) {
    if (get().current?.id !== essayId) return false;
    // The current rubric is the only thing a replacement can lose: keep a way back.
    await get().snapshotNow("before-restore");
    if (get().current?.id !== essayId) return false;
    get().updateRubrica(rubrica);
    await get().flush();
    return true;
  },

  updateRubrica(rubrica) {
    const cur = get().current;
    if (!cur) return;
    const updated: Essay = {
      ...cur,
      // Drop the field entirely if there are no criterios left, so the
      // JSON file stays clean. A saved assignment (`consigna`) keeps the
      // field alive: if the AI fails, the material and a retry survive.
      rubrica:
        rubrica && (rubrica.criterios.length > 0 || rubrica.consigna) ? rubrica : undefined,
      updatedAt: nowIso(),
    };
    // Debounce like updateContent — the editor is keystroke-driven.
    // Force-flush happens on modal close (see RubricPanel onClose).
    const prev = get()._autosaveTimer;
    if (prev) clearTimeout(prev);
    const timer = setTimeout(() => {
      void get().flush();
    }, AUTOSAVE_MS);
    set({
      current: updated,
      saveStatus: { kind: "dirty" },
      _autosaveTimer: timer,
    });
  },

  toggleBoard() {
    const next = !get().boardOpen;
    // When hiding, force-flush any pending autosave so nothing
    // in-flight gets dropped when BoardPane unmounts.
    if (!next) void get().flush();
    set({ boardOpen: next });
  },

  openHistory(opts) {
    set({ overlay: "history", overlayInstant: isInstant(opts) });
    void get().loadHistory();
  },

  async loadHistory() {
    const cur = get().current;
    if (!cur) {
      set({ history: [] });
      return;
    }
    try {
      const list = await listHistory(cur.id);
      if (get().current?.id === cur.id) set({ history: list });
    } catch (err) {
      console.error("loadHistory failed", err);
      set({ history: [] });
    }
  },

  async snapshotNow(kind) {
    // Flush first so the snapshot reflects what's persisted on disk,
    // not a transient typing state.
    const cur = get().current;
    const navigation = navigationGeneration;
    if (!cur) return null;
    await get().flush();
    if (navigation !== navigationGeneration || get().current !== cur || get().saveStatus.kind !== "saved") return null;
    const snapshot: Snapshot = {
      takenAt: nowIso(),
      kind,
      essay: cur,
    };
    try {
      await appendSnapshot(snapshot);
      if (navigation !== navigationGeneration || get().current !== cur) return null;
      await get().loadHistory();
      return navigation === navigationGeneration && get().current === cur ? snapshot.takenAt : null;
    } catch (err) {
      console.error("snapshotNow failed", err);
      return null;
    }
  },

  async previewSnapshot(takenAt) {
    const cur = get().current;
    if (!cur) return null;
    try {
      return await readSnapshot(cur.id, takenAt);
    } catch (err) {
      console.error("previewSnapshot failed", err);
      return null;
    }
  },

  async restoreVersion(takenAt, beforeApply) {
    const cur = get().current;
    const navigation = navigationGeneration;
    if (!cur) return false;
    runEssayLeaveHooks();
    // 1) Snapshot the current state as a safety net.
    if (!await get().snapshotNow("before-restore")) return false;
    if (navigation !== navigationGeneration || get().current !== cur) return false;
    // 2) Read the target snapshot.
    let target: Snapshot;
    try {
      target = await readSnapshot(cur.id, takenAt);
    } catch (err) {
      console.error("restoreVersion: read failed", err);
      return false;
    }
    // Reading a version can race with typing, navigation or another restore.
    // Never overwrite the live document that was not captured by our backup.
    if (navigation !== navigationGeneration || get().current !== cur || target.essay.id !== cur.id) return false;
    beforeApply?.();
    // 3) Apply: replace the current essay's mutable fields with the
    //    snapshot's. We keep id/createdAt from the live essay (those
    //    are identity), but everything else comes from the target.
    //    updatedAt becomes now so the autosave layer treats it as a
    //    fresh edit (downstream Benchmark stale flag, etc.).
    const restored: Essay = {
      ...target.essay,
      id: cur.id,
      createdAt: cur.createdAt,
      updatedAt: nowIso(),
    };
    set((s) => ({
      current: restored,
      saveStatus: { kind: "dirty" },
      restoreNonce: s.restoreNonce + 1,
    }));
    await get().flush();
    if (get().current !== restored || get().saveStatus.kind !== "saved") return false;
    await get().loadHistory();
    return get().current === restored;
  },

  async flush() {
    if (activeFlush) return activeFlush;
    // Start on the next microtask so the shared promise is installed before
    // any subscriber can request another flush.
    activeFlush = Promise.resolve().then(async () => {
      while (true) {
        const cur = get().current;
        if (!cur || get().saveStatus.kind === "saved") return;
        const timer = get()._autosaveTimer;
        if (timer) clearTimeout(timer);
        set({ _autosaveTimer: null, saveStatus: { kind: "saving" } });
        try {
          await writeEssay(withCurrentFingerprint(cur));
          const unchanged = get().current === cur;
          const sameEssay = get().current?.id === cur.id;
          set(() => ({
            ...(sameEssay ? { saveStatus: unchanged ? { kind: "saved" as const, at: Date.now() } : { kind: "dirty" as const } } : {}),
          }));
          if (!sameEssay || unchanged) return;
          // Human input during IO changed current: persist that new version
          // before allowing any caller to report a durable save.
        } catch (err) {
          if (get().current?.id === cur.id) set({ saveStatus: {
            kind: "error", message: err instanceof Error ? err.message : String(err),
          } });
          return;
        }
      }
    }).finally(() => { activeFlush = null; });
    return activeFlush;
  },
}));
