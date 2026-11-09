"use client";

import { create } from "zustand";
import { getReviewerProfile } from "../../sidecar/src/model-profiles";
import type { JSONContent } from "@tiptap/core";
import {
  appendSnapshot,
  deleteEssay,
  listEssays,
  listHistory,
  readEssay,
  readSnapshot,
  writeEssay,
} from "@/lib/storage";
import type {
  BoardSnapshot,
  Essay,
  EssayLanguage,
  EssayMeta,
  EssayMode,
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

export type Overlay =
  | "lectura"
  | "pluma"
  | "rubrica"
  | "fuentes"
  | "history"
  | null;

/** How the Lectura overlay runs the interrogation. */
export type LecturaMode = "single" | "council";

type State = {
  view: View;
  list: EssayMeta[];
  current: Essay | null;
  saveStatus: SaveStatus;
  /** Modal overlay shown above the editor (Lectura nueva, etc.). */
  overlay: Overlay;
  /** Whether the right-hand board pane is visible. Hidden = editor
   *  takes the full main column, centered. */
  boardOpen: boolean;
  /** Which sage is selected in the Lectura overlay (single mode). */
  lecturaSage: Sage;
  /** Whether the Lectura overlay runs one sage or the whole council. */
  lecturaMode: LecturaMode;
  /** Optional text to pre-fill the Lectura textarea with (e.g. the
   *  current editor selection when launched via the bubble menu). */
  lecturaPrefill: string;
  /** Internal: timer handle for the debounced save. */
  _autosaveTimer: ReturnType<typeof setTimeout> | null;

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
  /** Append an interrogatorio entry from a sage and flush. */
  addInterrogatorio: (entry: Interrogatorio) => void;
  /** Snapshot the moment of the last Evaluar run. Called by EditorPane
   *  right after applying anotaciones; `evaluadoEn` is synced to the
   *  current `essay.updatedAt` so subsequent edits make the score
   *  stale without false positives from the apply itself. */
  recordEvaluacion: (pasadasCubiertas: Pase[], reviewerRuns?: { pase: Pase; provenance?: ReviewProvenance }[]) => void;
  updateReviewerProfile: (profileId: string) => void;
  /** Limpia la evaluación entera: quita todas las anotaciones del
   *  documento (vía evento que captura EditorPane) y resetea
   *  evaluacionMeta. El Scorebar vuelve al estado "nunca evaluado"
   *  (sesión 13b: oculto). Sesión 17. */
  clearEvaluacion: () => void;
  /** Scorebar dismissible (sesión 17). Estado de sesión — no se
   *  persiste, vuelve al re-abrir el ensayo o al correr Evaluar. */
  scorebarDismissed: boolean;
  /** Esconde el Scorebar. Sólo afecta el render — los datos quedan. */
  dismissScorebar: () => void;
  /** Vuelve a mostrar el Scorebar (menú Vista > Mostrar Benchmark). */
  showScorebar: () => void;
  /** Open / close the lectura overlay. */
  setOverlay: (overlay: Overlay) => void;
  /** Open the Lectura overlay AND make sure the board pane is
   *  visible — interrogating implies you want to see the resulting
   *  post-its land. Optionally pre-selects a sage, pre-fills the
   *  textarea, and chooses the mode. The default mode when no sage
   *  is given is "council" (the whole council in parallel);
   *  passing a `sage` switches to "single". */
  openLectura: (
    sage?: Sage,
    prefill?: string,
    mode?: LecturaMode,
  ) => void;
  /** Change the sage selected in the Lectura overlay (single mode). */
  setLecturaSage: (sage: Sage) => void;
  /** Open the Pluma Roja overlay for the current essay. */
  openPlumaRoja: () => void;
  /** Open the rubric editor overlay for the current essay. */
  openRubrica: () => void;
  /** Replace the current essay's rubric and flush. */
  updateRubrica: (rubrica: Rubrica | undefined) => void;
  /** Open the fuentes (sources library) overlay. */
  openFuentes: () => void;
  /** Append a fuente to the current essay; flush. */
  addFuente: (fuente: Fuente) => void;
  /** Patch an existing fuente by id; flush. */
  updateFuente: (id: string, patch: Partial<Omit<Fuente, "id">>) => void;
  /** Remove a fuente from the current essay; flush. */
  removeFuente: (id: string) => void;
  /** Switch between single-sage and council modes inside the modal. */
  setLecturaMode: (mode: LecturaMode) => void;
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
  openHistory: () => void;
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

function essayToMeta(essay: Essay): EssayMeta {
  return {
    id: essay.id,
    title: essay.title,
    mode: essay.mode,
    wordCount: essay.wordCount,
    createdAt: essay.createdAt,
    updatedAt: essay.updatedAt,
  };
}

function upsertMeta(list: EssayMeta[], meta: EssayMeta): EssayMeta[] {
  const filtered = list.filter((m) => m.id !== meta.id);
  return [meta, ...filtered].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

// One persistence queue serves UI autosave and agent writes. Navigation tokens
// prevent an older async open from replacing a newer human choice.
let activeFlush: Promise<void> | null = null;
let navigationGeneration = 0;
const deletingEssayIds = new Set<string>();

export const useStore = create<State>((set, get) => ({
  view: "list",
  list: [],
  current: null,
  saveStatus: { kind: "idle" },
  overlay: null,
  boardOpen: true,
  lecturaSage: "em",
  lecturaMode: "council",
  lecturaPrefill: "",
  history: [],
  restoreNonce: 0,
  scorebarDismissed: false,
  _autosaveTimer: null,

  async loadList() {
    const navigation = navigationGeneration;
    const previous = get().current;
    try {
      const list = await listEssays();
      if (navigation !== navigationGeneration || get().current !== previous) return;
      set({ list, view: "list" });
    } catch (err) {
      if (navigation !== navigationGeneration || get().current !== previous) return;
      console.error("loadList failed", err);
      set({ list: [], view: "list" });
    }
  },

  async newEssay(mode = "academico") {
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
      set((s) => ({
        current: essay,
        view: "editor",
        list: upsertMeta(s.list, essayToMeta(essay)),
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
    const navigation = ++navigationGeneration;
    let previous = get().current;
    try {
      if (previousId) {
        await get().flush();
        if (navigation !== navigationGeneration || (get().current?.id ?? null) !== previousId || get().saveStatus.kind !== "saved") return;
      }
      if (previousId === id) return;
      previous = get().current;
      const essay = await readEssay(id);
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
        // Sesión 17: el dismiss del Scorebar es por-essay, no global.
        // Abrir otro ensayo lo trae de vuelta.
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
    set({
      current: null,
      view: "list",
      saveStatus: { kind: "idle" },
      history: [],
      _autosaveTimer: null,
    });
    await get().loadList();
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

  updateReviewerProfile(profileId) {
    const cur = get().current;
    if (!cur) return;
    getReviewerProfile(profileId);
    set({ current: { ...cur, reviewerProfile: profileId }, saveStatus: { kind: "dirty" } });
    void get().flush();
  },

  recordEvaluacion(pasadasCubiertas, reviewerRuns) {
    const cur = get().current;
    if (!cur) return;
    // Sync `evaluadoEn` to the current updatedAt so the apply itself
    // doesn't immediately register as "stale". Any *subsequent* edit
    // bumps updatedAt past evaluadoEn and surfaces the stale flag.
    const updated: Essay = {
      ...cur,
      evaluacionMeta: {
        evaluadoEn: cur.updatedAt,
        pasadasCubiertas: [...pasadasCubiertas],
        ...(reviewerRuns ? { reviewerRuns: structuredClone(reviewerRuns) } : {}),
      },
    };
    // Re-mostrar el Scorebar — si el usuario lo había cerrado y
    // ahora corrió Evaluar de nuevo, claramente quiere ver el
    // resultado. Mantener oculto sería confuso.
    set({
      current: updated,
      saveStatus: { kind: "dirty" },
      scorebarDismissed: false,
    });
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
    };
    set({ current: updated, saveStatus: { kind: "dirty" } });
    void get().flush();
  },

  dismissScorebar() {
    set({ scorebarDismissed: true });
  },

  showScorebar() {
    set({ scorebarDismissed: false });
  },

  setOverlay(overlay) {
    // Clear any pending prefill when the overlay closes, so the next
    // manual "Interrogar" starts on an empty textarea.
    if (overlay === null) {
      set({ overlay, lecturaPrefill: "" });
    } else {
      set({ overlay });
    }
  },

  openLectura(sage, prefill, mode) {
    set({
      overlay: "lectura",
      boardOpen: true,
      ...(sage ? { lecturaSage: sage } : {}),
      ...(prefill !== undefined ? { lecturaPrefill: prefill } : {}),
      // If a sage was named explicitly the caller wants single mode
      // (they're targeting one voice); otherwise default to council.
      lecturaMode: mode ?? (sage ? "single" : "council"),
    });
  },

  setLecturaSage(sage) {
    set({ lecturaSage: sage });
  },

  openPlumaRoja() {
    set({ overlay: "pluma" });
  },

  openRubrica() {
    set({ overlay: "rubrica" });
  },

  openFuentes() {
    set({ overlay: "fuentes" });
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
    if (!cur?.fuentes) return;
    const next = cur.fuentes.filter((f) => f.id !== id);
    const updated: Essay = {
      ...cur,
      // Drop the field entirely if no fuentes remain — keep the JSON clean.
      fuentes: next.length > 0 ? next : undefined,
      updatedAt: nowIso(),
    };
    set({ current: updated, saveStatus: { kind: "dirty" } });
    void get().flush();
  },

  updateRubrica(rubrica) {
    const cur = get().current;
    if (!cur) return;
    const updated: Essay = {
      ...cur,
      // Drop the field entirely if there are no criterios left, so the
      // JSON file stays clean.
      rubrica:
        rubrica && rubrica.criterios.length > 0 ? rubrica : undefined,
      updatedAt: nowIso(),
    };
    // Debounce like updateContent — the editor is keystroke-driven.
    // Force-flush happens on modal close (see RubricaOverlay onClose).
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

  setLecturaMode(mode) {
    set({ lecturaMode: mode });
  },

  toggleBoard() {
    const next = !get().boardOpen;
    // When hiding, force-flush any pending autosave so nothing
    // in-flight gets dropped when BoardPane unmounts.
    if (!next) void get().flush();
    set({ boardOpen: next });
  },

  openHistory() {
    set({ overlay: "history" });
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
    // not a transient typing state. recordEvaluacion uses the same
    // pattern (queueMicrotask) for the same reason.
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
          await writeEssay(cur);
          const unchanged = get().current === cur;
          const sameEssay = get().current?.id === cur.id;
          set((s) => ({
            list: upsertMeta(s.list, essayToMeta(cur)),
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
