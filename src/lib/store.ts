"use client";

import { create } from "zustand";
import type { JSONContent } from "@tiptap/core";
import {
  deleteEssay,
  listEssays,
  readEssay,
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
} from "@/lib/storage/types";

const AUTOSAVE_MS = 800;

export type SaveStatus =
  | { kind: "idle" }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error"; message: string };

export type View = "list" | "editor";

export type Overlay = "lectura" | "pluma" | "rubrica" | "fuentes" | null;

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
  newEssay: (mode?: EssayMode) => Promise<void>;
  /** Open an existing essay by id. */
  openEssay: (id: string) => Promise<void>;
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
  recordEvaluacion: (pasadasCubiertas: Pase[]) => void;
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
  _autosaveTimer: null,

  async loadList() {
    try {
      const list = await listEssays();
      set({ list, view: "list" });
    } catch (err) {
      console.error("loadList failed", err);
      set({ list: [], view: "list" });
    }
  },

  async newEssay(mode = "academico") {
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
      set((s) => ({
        current: essay,
        view: "editor",
        list: upsertMeta(s.list, essayToMeta(essay)),
        saveStatus: { kind: "saved", at: Date.now() },
      }));
    } catch (err) {
      set({
        saveStatus: {
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        },
      });
    }
  },

  async openEssay(id) {
    try {
      const essay = await readEssay(id);
      set({
        current: essay,
        view: "editor",
        saveStatus: { kind: "saved", at: Date.parse(essay.updatedAt) },
      });
    } catch (err) {
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
    await get().flush();
    const timer = get()._autosaveTimer;
    if (timer) clearTimeout(timer);
    set({
      current: null,
      view: "list",
      saveStatus: { kind: "idle" },
      _autosaveTimer: null,
    });
    await get().loadList();
  },

  async removeEssay(id) {
    try {
      await deleteEssay(id);
      set((s) => ({ list: s.list.filter((m) => m.id !== id) }));
    } catch (err) {
      console.error("removeEssay failed", err);
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

  recordEvaluacion(pasadasCubiertas) {
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
      },
    };
    set({ current: updated, saveStatus: { kind: "dirty" } });
    void get().flush();
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

  async flush() {
    const cur = get().current;
    if (!cur) return;
    const status = get().saveStatus;
    if (status.kind === "saving") return; // already in flight
    if (status.kind === "saved") return; // nothing to do
    set({ saveStatus: { kind: "saving" } });
    try {
      await writeEssay(cur);
      set((s) => ({
        saveStatus: { kind: "saved", at: Date.now() },
        list: upsertMeta(s.list, essayToMeta(cur)),
      }));
    } catch (err) {
      set({
        saveStatus: {
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        },
      });
    }
  },
}));
