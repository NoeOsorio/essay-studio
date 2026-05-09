import { Topbar } from "@/components/Topbar";
import { EditorPane } from "@/components/editor/EditorPane";
import { BoardPane } from "@/components/canvas/BoardPane";
import { Scorebar } from "@/components/Scorebar";

export default function Page() {
  return (
    <div className="relative z-[1] grid grid-rows-[auto_1fr_auto] h-screen">
      <Topbar />
      <main className="grid grid-cols-[1fr_1px_1fr] min-h-0">
        <EditorPane />
        <div className="bg-rule-1" />
        <BoardPane />
      </main>
      <Scorebar />
    </div>
  );
}
