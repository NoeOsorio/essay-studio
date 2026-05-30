"use client";

// Renderer-side bridge for native menu activations.
//
// Rust's on_menu_event handler emits `app:menu` with the custom
// item's id as payload. This hook subscribes and dispatches to the
// store. Ids the hook doesn't know about are ignored — adding new
// items in Rust doesn't need a renderer change until you actually
// want behavior wired up.
//
// IDs follow the convention `surface:action`:
//   "file:new"      → newEssay()
//   "file:close"    → closeEssay()
//   "view:history"  → openHistory()

import { useEffect } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useStore } from "@/lib/store";

function hasTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function useNativeMenuBridge() {
  useEffect(() => {
    if (!hasTauri()) return;

    let unlisten: UnlistenFn | null = null;
    let cancelled = false;

    void listen<string>("app:menu", (e) => {
      const id = e.payload;
      const s = useStore.getState();
      switch (id) {
        case "file:new":
          void s.newEssay(s.current?.mode ?? "academico");
          break;
        case "file:close":
          // Only meaningful when an essay is open. closeEssay flushes
          // + takes a `close` snapshot before tearing down.
          if (s.current) void s.closeEssay();
          break;
        case "view:history":
          if (s.current) s.openHistory();
          break;
        default:
          // Predefined items (cut/copy/paste/quit/undo/redo/etc.)
          // never come through here — Tauri handles them on the
          // platform side. Any unknown id is a no-op.
          break;
      }
    }).then((un) => {
      if (cancelled) un();
      else unlisten = un;
    });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);
}
