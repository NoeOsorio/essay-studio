// Cancels every file drop outside an element marked `data-drop-zone`, so a
// stray drop neither navigates the webview nor reaches tldraw or TipTap.
// The window has `dragDropEnabled: false` (tauri.conf.json), which hands file
// drops to the page as ordinary DOM events; this guard is what contains them.
// Specs that accept files only mark their zones. Returns the function that
// removes the guard.

const ZONE = "[data-drop-zone]";

function carriesFiles(e: DragEvent): boolean {
  const types = e.dataTransfer?.types;
  if (!types) return false;
  for (let i = 0; i < types.length; i++) if (types[i] === "Files") return true;
  return false;
}

function inZone(e: DragEvent): boolean {
  const t = e.target;
  return t instanceof Element && t.closest(ZONE) !== null;
}

export function installFileDropGuard(): () => void {
  if (typeof window === "undefined") return () => {};
  const guard = (e: DragEvent) => {
    if (!carriesFiles(e) || inZone(e)) return;
    // Over a place that does not take files: say so, and keep the page still.
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "none";
  };
  const types = ["dragenter", "dragover", "drop"] as const;
  for (const t of types) window.addEventListener(t, guard, true);
  return () => {
    for (const t of types) window.removeEventListener(t, guard, true);
  };
}
