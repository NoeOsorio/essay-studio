import { useStore } from "@/lib/store";
import { getDocumentEditor } from "@/lib/mcp/document";
import { applyBoardHistory } from "@/lib/mcp/board";

/** Native menu accelerators otherwise invoke WebKit's separate DOM history. */
export function applyNativeHistory(direction: "undo" | "redo"): void {
  const active = document.activeElement;
  if (active instanceof Element && active.closest(".tl-container")) {
    applyBoardHistory(direction);
    return;
  }
  const essay = useStore.getState().current;
  if (essay) {
    try {
      const editor = getDocumentEditor(essay.id);
      if (active && editor.view.dom.contains(active)) {
        editor.commands[direction]();
        return;
      }
    } catch { /* The document may be unmounted while navigating. */ }
  }
  // Title and overlay inputs keep the browser's native text undo stack.
  document.execCommand(direction);
}
