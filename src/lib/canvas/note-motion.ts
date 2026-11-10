// Motion that belongs to a note arriving on the board and leaving it (Paper
// R1.5, R2.6). Nothing here runs from mount alone: a note only lands when its
// id is in a one-shot set, and the set is filled by pointer creation or by
// `markLanding`. Reopening an essay, toggling the board, restoring a version
// and panning (which remounts culled notes) replay nothing.

import type { Editor, TLShapeId } from "tldraw";

const landing = new Set<string>();

/** The next mount of this note plays the landing, once. */
export function markLanding(id: TLShapeId): void {
  landing.add(id);
}

/** True when this note should land now. Reading it does not consume it. */
export function isLanding(id: string): boolean {
  return landing.has(id);
}

/** Called after the landing has started, so a remount does not replay it. */
export function consumeLanding(id: string): void {
  landing.delete(id);
}

/**
 * Fills the set only for notes created by a click with the Note tool.
 * MCP creation, keyboard creation and restores never enter `note.pointing`.
 */
export function registerPointerLanding(editor: Editor): () => void {
  return editor.sideEffects.registerAfterCreateHandler("shape", (shape) => {
    if (shape.type === "note" && editor.isIn("note.pointing")) landing.add(shape.id);
  });
}

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Deletes the note, then lets a copy of it peel away outside the canvas.
 * Deletion goes first so undo, autosave and MCP revisions never see a note
 * that is mid-animation. The copy sits at the same screen position and zoom,
 * with body, corner, shadow and tape as separate layers.
 */
export function peelNote(editor: Editor, id: TLShapeId): void {
  const shape = editor.getShape(id);
  if (!shape) return;
  // Everything about the drawn note is read before deleting: once React
  // unmounts it, computed styles and layout are gone.
  const source = document.querySelector<HTMLElement>(`.tl-shape[data-shape-id="${id}"] [data-note-wrapper]`);
  const note = source?.querySelector<HTMLElement>("[data-sticky-note]") ?? null;
  const bounds = editor.getShapePageBounds(id);
  const origin = bounds ? editor.pageToScreen({ x: bounds.x, y: bounds.y }) : null;
  const zoom = editor.getZoomLevel();

  let copy: { width: number; height: number; tilt: string; shadow: string; color: string; body: HTMLElement; tape: HTMLElement | null } | null = null;
  if (source && note && origin) {
    const noteStyle = getComputedStyle(note);
    const tilt = getComputedStyle(source).rotate;
    const body = note.cloneNode(true) as HTMLElement;
    body.querySelector(".note-tape")?.remove();
    Object.assign(body.style, { boxShadow: "none", rotate: "", position: "absolute", inset: "0" });
    const tapeSource = note.querySelector<HTMLElement>(".note-tape");
    copy = {
      width: note.offsetWidth,
      height: note.offsetHeight,
      tilt: tilt === "none" ? "" : tilt,
      shadow: noteStyle.boxShadow,
      color: noteStyle.backgroundColor,
      body,
      tape: tapeSource ? (tapeSource.cloneNode(true) as HTMLElement) : null,
    };
  }

  editor.markHistoryStoppingPoint("delete note");
  editor.deleteShapes([id]);

  if (!copy || !origin) return;
  const reduced = reducedMotion();

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, {
    position: "fixed",
    left: `${origin.x}px`,
    top: `${origin.y}px`,
    width: `${copy.width}px`,
    height: `${copy.height}px`,
    transform: `scale(${zoom})`,
    transformOrigin: "0 0",
    pointerEvents: "none",
    zIndex: "40",
  });
  // The tilt lives on the wrapper; reproduce it so the copy sits exactly where the note was.
  const stage = document.createElement("div");
  Object.assign(stage.style, { position: "absolute", inset: "0", rotate: copy.tilt, transformOrigin: "50% 50%" });
  host.appendChild(stage);

  const layer = (cls: string, css: Partial<CSSStyleDeclaration>) => {
    const el = document.createElement("div");
    el.className = cls;
    Object.assign(el.style, { position: "absolute", inset: "0" }, css);
    stage.appendChild(el);
    return el;
  };

  // Shadow layer: only its opacity animates.
  layer("note-peel-shadow", { borderRadius: "3px", boxShadow: copy.shadow });
  layer("note-peel-body", {}).appendChild(copy.body);

  if (!reduced) {
    // The corner that lifts away: a triangle of the note's own color.
    layer("note-peel-corner", {
      inset: "auto",
      right: "0",
      bottom: "0",
      width: "44px",
      height: "44px",
      background: copy.color,
      clipPath: "polygon(100% 0, 100% 100%, 0 100%)",
      transformOrigin: "100% 100%",
    });
  }

  // Tape is its own layer and only fades.
  if (copy.tape) {
    copy.tape.className = "note-peel-shadow";
    stage.appendChild(copy.tape);
  }

  document.body.appendChild(host);
  window.setTimeout(() => host.remove(), 360);
}
