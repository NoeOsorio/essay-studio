"use client";

import { useEffect, useRef } from "react";
import { Topbar } from "@/components/Topbar";
import { SidecarBanner } from "@/components/SidecarBanner";
import { useMcpHost } from "@/components/McpConnection";
import { EditorPane } from "@/components/editor/EditorPane";
import { BoardPane } from "@/components/canvas/BoardPane";
import { Library } from "@/components/library/Library";
import { ReviewPanel } from "@/components/review/ReviewPanel";
import { ReviewNotice } from "@/components/review/ReviewNotice";
import { RubricPanel } from "@/components/panels/RubricPanel";
import { SourcesPanel } from "@/components/panels/SourcesPanel";
import { HistoryPanel } from "@/components/panels/HistoryPanel";
import { useStore } from "@/lib/store";
import { useNativeMenuBridge } from "@/lib/menu/bridge";
import { QuestionsPanel } from "@/components/questions/QuestionsPanel";
import { QuestionRunPill } from "@/components/questions/QuestionRunPill";
import { installFileDropGuard } from "@/lib/fileDrop";

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

  // MCP connection stays mounted for the whole session; Más and the list
  // button only show its state.
  useMcpHost();

  // A file dropped outside a drop zone does nothing.
  useEffect(() => installFileDropGuard(), []);

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
  // auto-placement, los hijos null (SidecarBanner cuando está up) no crean tracks y los visibles se
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
          <Library />
        ) : (
          // Desk: the sheet (720 wide) and, when open, the board beside it.
          // Closed, the sheet sits centered. Flex with flex-1 keeps the body
          // filling the window whatever siblings render nothing.
          <main className="flex flex-1 min-h-0 gap-[10px] px-[10px] pb-[10px]">
            <div
              className={`flex flex-col flex-none w-[720px] min-w-0 overflow-hidden rounded-[16px] bg-sheet shadow-[0_0_0_1px_#1D1B180F,0_2px_6px_#1D1B180D] ${
                boardOpen ? "" : "mx-auto"
              }`}
            >
              <EditorPane />
            </div>
            {boardOpen ? (
              <div className="relative flex-1 min-w-0 overflow-hidden rounded-[16px]">
                <BoardPane />
                <div className="pointer-events-none absolute inset-0 z-[3] rounded-[16px] shadow-[inset_0_0_0_1px_#1D1B180D]" />
              </div>
            ) : null}
          </main>
        )}
      </div>
      <QuestionsPanel />
      <QuestionRunPill />
      <ReviewPanel />
      <ReviewNotice />
      <RubricPanel />
      <SourcesPanel />
      <HistoryPanel />
    </>
  );
}
