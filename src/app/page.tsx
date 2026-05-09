"use client";

import { useEffect } from "react";
import { Topbar } from "@/components/Topbar";
import { EditorPane } from "@/components/editor/EditorPane";
import { BoardPane } from "@/components/canvas/BoardPane";
import { Scorebar } from "@/components/Scorebar";
import { EssayList } from "@/components/EssayList";
import { useStore } from "@/lib/store";

export default function Page() {
  const view = useStore((s) => s.view);
  const flush = useStore((s) => s.flush);
  const loadList = useStore((s) => s.loadList);

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

  return (
    <div className="relative z-[1] grid grid-rows-[auto_1fr_auto] h-screen">
      <Topbar />
      {view === "list" ? (
        <EssayList />
      ) : (
        <main className="grid grid-cols-[1fr_1px_1fr] min-h-0">
          <EditorPane />
          <div className="bg-rule-1" />
          <BoardPane />
        </main>
      )}
      {view === "editor" ? <Scorebar /> : null}
    </div>
  );
}
