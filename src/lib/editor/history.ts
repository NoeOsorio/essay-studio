import { useStore } from "@/lib/store";
import { getDocumentEditor } from "@/lib/mcp/document";
import { applyBoardHistory } from "@/lib/mcp/board";

type Surface = "board" | "document";

// The last place the pointer worked: the board or the sheet. The native
// Undo and Redo items fire with focus on `body` once a click lands on the
// desk or a toolbar button, and then this is what tells them whose history
// to move. Spec 005 marks `Finding` actions as `document` through
// `setUndoSurface`; spec 006 marks its overlays `data-board-surface`.
let lastSurface: Surface | null = null;

export function setUndoSurface(surface: Surface): void {
  lastSurface = surface;
}

if (typeof window !== "undefined") {
  window.addEventListener(
    "pointerdown",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".tl-container, [data-board-surface]")) lastSurface = "board";
      else if (target.closest(".ProseMirror, [data-document-surface]")) lastSurface = "document";
    },
    true,
  );
}

function undoDocument(direction: "undo" | "redo"): boolean {
  const essay = useStore.getState().current;
  if (!essay) return false;
  try {
    getDocumentEditor(essay.id).commands[direction]();
    return true;
  } catch {
    /* The document may be unmounted while navigating. */
    return false;
  }
}

function isTextField(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return true;
  return el instanceof HTMLElement && el.isContentEditable;
}

/** Native menu accelerators otherwise invoke WebKit's separate DOM history. */
export function applyNativeHistory(direction: "undo" | "redo"): void {
  const active = document.activeElement;
  // Focus inside the board or the sheet routes as it always did.
  if (active instanceof Element && active.closest(".tl-container")) {
    applyBoardHistory(direction);
    return;
  }
  const essay = useStore.getState().current;
  if (essay && active) {
    try {
      const editor = getDocumentEditor(essay.id);
      if (editor.view.dom.contains(active)) {
        editor.commands[direction]();
        return;
      }
    } catch { /* The document may be unmounted while navigating. */ }
  }
  // Title and overlay inputs keep the browser's native text undo stack.
  if (isTextField(active)) {
    document.execCommand(direction);
    return;
  }
  // Nothing focused (the desk, a toolbar button): follow the last pointer surface.
  if (lastSurface === "board") {
    applyBoardHistory(direction);
    return;
  }
  if (lastSurface === "document" && undoDocument(direction)) return;
  document.execCommand(direction);
}
