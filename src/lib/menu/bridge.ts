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
//   "view:show-benchmark"  → showScorebar()    (sesión 17)
//   "sabios:interrogar"    → openLectura()
//   "sabios:evaluar"       → openPlumaRoja()
//   "sabios:rubrica"       → openRubrica()
//   "sabios:fuentes"       → openFuentes()
//   "sabios:limpiar"       → clearEvaluacion() (sesión 17)

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
      // Acciones del consejo + tablero requieren un essay abierto. Si
      // no hay current, son no-op silenciosos (el menú no se desactiva
      // visualmente; el disable contextual queda para sesión futura).
      switch (id) {
        case "file:new":
          void s.newEssay(s.current?.mode ?? "academico");
          break;
        case "file:close":
          if (s.current) void s.closeEssay();
          break;
        case "view:history":
          if (s.current) s.openHistory();
          break;
        case "view:board-toggle":
          if (s.current) s.toggleBoard();
          break;
        case "sabios:interrogar":
          // Sin args → openLectura abre en modo "council" por default
          // (mismo path que el botón Interrogar del topbar).
          if (s.current) s.openLectura();
          break;
        case "sabios:evaluar":
          if (s.current) s.openPlumaRoja();
          break;
        case "sabios:rubrica":
          if (s.current) s.openRubrica();
          break;
        case "sabios:fuentes":
          if (s.current) s.openFuentes();
          break;
        case "sabios:limpiar":
          // Acto destructivo — pedimos confirmación rápida porque
          // borra TODAS las anotaciones del documento de una vez.
          // window.confirm bloqueante alcanza para v1; un modal más
          // suave queda para si lo pedís.
          if (s.current) {
            const ok = window.confirm(
              "¿Limpiar la evaluación entera? Esto borra todas las anotaciones del documento. No se puede deshacer (salvo con ⌘Z).",
            );
            if (ok) s.clearEvaluacion();
          }
          break;
        case "view:show-benchmark":
          // No-op si no hay essay o ya está visible — el render del
          // Scorebar de todas formas chequea hasAnotaciones/wasEvaluated.
          if (s.current) s.showScorebar();
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
