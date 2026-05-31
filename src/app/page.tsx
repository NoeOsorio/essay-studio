"use client";

import { useEffect, useRef } from "react";
import { Topbar } from "@/components/Topbar";
import { SidecarBanner } from "@/components/SidecarBanner";
import { EditorPane } from "@/components/editor/EditorPane";
import { BoardPane } from "@/components/canvas/BoardPane";
import { Scorebar } from "@/components/Scorebar";
import { EssayList } from "@/components/EssayList";
import { LecturaOverlay } from "@/components/lectura/LecturaOverlay";
import { PlumaRojaOverlay } from "@/components/lectura/PlumaRojaOverlay";
import { RubricaOverlay } from "@/components/lectura/RubricaOverlay";
import { FuentesOverlay } from "@/components/lectura/FuentesOverlay";
import { HistoryOverlay } from "@/components/lectura/HistoryOverlay";
import { useStore } from "@/lib/store";
import { FEATURES } from "@/lib/features";
import { useNativeMenuBridge } from "@/lib/menu/bridge";

/** Heartbeat interval for auto snapshots. 10min strikes the balance
 *  between granularity and panel noise (sesión 12 decision). */
const AUTO_SNAPSHOT_MS = 10 * 60 * 1000;

export default function Page() {
  const view = useStore((s) => s.view);
  const boardOpen = useStore((s) => s.boardOpen);
  const flush = useStore((s) => s.flush);
  const loadList = useStore((s) => s.loadList);
  const snapshotNow = useStore((s) => s.snapshotNow);
  const currentId = useStore((s) => s.current?.id ?? null);

  // Native menu bridge — `app:menu` events from Rust dispatch to store
  // actions. See `src/lib/menu/bridge.ts`.
  useNativeMenuBridge();

  // Initial: load the essay list once the app boots.
  useEffect(() => {
    void loadList();
  }, [loadList]);

  // Best-effort flush on window close / unload.
  useEffect(() => {
    const handler = () => {
      void flush();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [flush]);

  // Auto-snapshot heartbeat: every AUTO_SNAPSHOT_MS while an essay is
  // open, take a snapshot iff updatedAt advanced since the last one we
  // took. `snapshotNow` flushes first so the snapshot reflects what's
  // on disk. We track the last seen updatedAt in a ref to avoid
  // restarting the timer on every keystroke.
  const lastSnapshottedUpdatedAt = useRef<string | null>(null);
  useEffect(() => {
    if (!currentId) {
      lastSnapshottedUpdatedAt.current = null;
      return;
    }
    const id = setInterval(() => {
      const cur = useStore.getState().current;
      if (!cur) return;
      if (cur.updatedAt === lastSnapshottedUpdatedAt.current) return;
      lastSnapshottedUpdatedAt.current = cur.updatedAt;
      void snapshotNow("auto");
    }, AUTO_SNAPSHOT_MS);
    return () => clearInterval(id);
  }, [currentId, snapshotNow]);

  // Layout — flexbox columna en vez de grid-rows. Razón: con CSS Grid
  // auto-placement, los hijos null (SidecarBanner cuando está up,
  // Scorebar cuando no hay eval) no crean tracks y los visibles se
  // ubican en los PRIMEROS tracks del template, no en los que les
  // tocarían. Con `grid-rows-[auto_auto_1fr_auto]` y sólo Topbar + main
  // renderizados, main caía en row 2 (auto) en vez de row 3 (1fr),
  // así que no se expandía. Flexbox no tiene ese problema: flex-1
  // siempre aplica a main sin depender de cuántos hermanos rendericen.
  // Overlays (todos `fixed inset-0`) salen del flex flow — los mueven
  // afuera del wrapper para que su contar como hijos no importe.
  return (
    <>
      <div className="relative z-[1] flex flex-col h-screen">
        <Topbar />
        <SidecarBanner />
        {view === "list" ? (
          <EssayList />
        ) : boardOpen ? (
          <main className="flex-1 min-h-0 grid grid-cols-[1fr_1px_1fr]">
            <EditorPane />
            <div className="bg-rule-1" />
            <BoardPane />
          </main>
        ) : (
          // Board hidden: editor takes the full main column. Mantenemos
          // grid en main para que su único hijo (EditorPane) tenga su
          // celda con altura definida — sin eso el overflow-y-auto
          // interno del editor no scrollearía.
          <main className="flex-1 min-h-0 grid overflow-hidden">
            <EditorPane />
          </main>
        )}
        {view === "editor" && FEATURES.benchmark ? <Scorebar /> : null}
      </div>
      <LecturaOverlay />
      <PlumaRojaOverlay />
      <RubricaOverlay />
      <FuentesOverlay />
      <HistoryOverlay />
    </>
  );
}
