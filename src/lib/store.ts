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
  EssayMeta,
  EssayMode,
  Interrogatorio,
} from "@/lib/storage/types";

const AUTOSAVE_MS = 800;

export type SaveStatus =
  | { kind: "idle" }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error"; message: string };

export type View = "list" | "editor";

export type Overlay = "lectura" | null;

type State = {
  view: View;
  list: EssayMeta[];
  current: Essay | null;
  saveStatus: SaveStatus;
  /** Modal overlay shown above the editor (Lectura nueva, etc.). */
  overlay: Overlay;
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
  /** Update the tldraw board snapshot for the open essay. */
  updateBoard: (snapshot: BoardSnapshot | null) => void;
  /** Append an interrogatorio entry from a sage and flush. */
  addInterrogatorio: (entry: Interrogatorio) => void;
  /** Open / close the lectura overlay. */
  setOverlay: (overlay: Overlay) => void;

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

  setOverlay(overlay) {
    set({ overlay });
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
