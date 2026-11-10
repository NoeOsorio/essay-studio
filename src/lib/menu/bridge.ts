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
//   "file:new"             → newEssay()
//   "file:close"           → closeEssay()
//   "view:history"         → openHistory()
//   "view:board-toggle"    → toggleBoard()
//   "sabios:interrogar"    → openLectura()   (menu: Agentes, Hazme preguntas)
//   "sabios:evaluar"       → openReview()    (menu: Agentes, Revisar ensayo)
//   "sabios:rubrica"       → openRubrica()
//   "sabios:fuentes"       → openFuentes()
//   "sabios:limpiar"       → clearEvaluacion() (menu: Limpiar revisión)
//
// Ids stay as they were; only the menu labels changed. Every overlay opener
// is called with `{ instant: true }` because a native menu activation has no
// trigger to grow from, so the panel skips its opening animation.

import { useEffect } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useStore } from "@/lib/store";
import { applyNativeHistory } from "@/lib/editor/history";

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
      // Acciones del consejo + tablero requieren un essay abierto. Si
      // no hay current, son no-op silenciosos (el menú no se desactiva
      // visualmente; el disable contextual queda para sesión futura).
      switch (id) {
        case "edit:undo":
          applyNativeHistory("undo");
          break;
        case "edit:redo":
          applyNativeHistory("redo");
          break;
        case "file:new":
          void s.newEssay(s.current?.mode ?? "academico");
          break;
        case "file:close":
          if (s.current) void s.closeEssay();
          break;
        case "view:history":
          if (s.current) s.openHistory({ instant: true });
          break;
        case "view:search": {
          // Only while the list shows; with an essay open, ⌘K does nothing.
          if (s.view !== "list") break;
          const box = document.querySelector<HTMLInputElement>('[data-testid="library-search"]');
          box?.focus();
          box?.select();
          break;
        }
        case "view:board-toggle":
          if (s.current) s.toggleBoard();
          break;
        case "sabios:interrogar":
          // Same panel as the Hazme preguntas button, opened with no animation.
          if (s.current) s.openLectura(undefined, undefined, { instant: true });
          break;
        case "sabios:evaluar":
          if (s.current) s.openReview({ instant: true });
          break;
        case "sabios:rubrica":
          if (s.current) s.openRubrica({ instant: true });
          break;
        case "sabios:fuentes":
          if (s.current) s.openFuentes({ instant: true });
          break;
        case "sabios:limpiar":
          // Acto destructivo: se pide confirmación porque quita todas las
          // correcciones, también las resueltas y las descartadas, y el
          // puntaje, de una vez. No vuelve con ⌘Z, así que el texto no
          // promete deshacer.
          if (s.current) {
            const ok = window.confirm(
              "Se quitarán todas las correcciones, también las resueltas, y el puntaje. No se puede deshacer.",
            );
            if (ok) s.clearEvaluacion();
          }
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
