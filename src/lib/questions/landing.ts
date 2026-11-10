// Where a question lands on the board and how the view follows it.
//
// A run's region is fixed when the run starts: one column per active agent,
// to the right of everything already on the board. Each landing creates the
// note at its column's next spot, reads its real bounds, and lets the MCP
// geometry helpers push it clear of every other shape (locked ones and
// arrows included). Existing nodes are never touched, and holes left by a
// discarded note are never filled, so a drag or an undo can always put a
// note back where it was (spec 006, FR-005, research R6 and R7).
//
// The tldraw editor is resolved at every landing with `ensureBoard` and never
// held: `BoardPane` unmounts when the board is hidden, so a held editor would
// be dead. That is also what opens a closed board at run start, and reopens
// one the writer hid during a run.

import {
  createShapeId,
  EASINGS,
  toRichText,
  type Box,
  type Editor,
  type TLEventInfo,
  type TLNoteShape,
  type TLShapeId,
} from "tldraw";
import { ALL_SAGES } from "@/lib/sages";
import { markLanding } from "@/lib/canvas/note-motion";
import { NOTE_WIDTH } from "@/components/ui/StickyNote";
import { boundsOf, clearObstacles, common, ensureBoard, type Rect } from "@/lib/mcp/board";
import type { Sage } from "@/lib/storage/types";

/** Space between the board content and the first column. */
const EDGE_GAP = 56;
/** Room above the first note for the run pill (46 px) and the status chip of each column (32 px). */
const CHIP_ROOM = 96;
/** A second chip row above the first, for the writer's own question (its chip sits over the answering agent's column). */
const OWN_CHIP_ROOM = 38;
const COLUMN_GAP = 28;
/** Space kept between a note and what is around it. Below COLUMN_GAP, so the neighbouring column never counts as an obstacle. */
const NOTE_GAP = 24;
const CAMERA_MS = 420;
const FRAME_INSET = 48;
/**
 * Screen room the bottom-left board toolbar takes (16 px margin, 42 px high,
 * about 161 px wide), plus a breath. No landed note may end behind it.
 */
const TOOLBAR_RIGHT = 200;
const TOOLBAR_TOP = 66;
/** Below this zoom the note text stops being legible. */
const MIN_FRAME_ZOOM = 0.5;

export type LandingSession = {
  readonly essayId: string;
  readonly columns: ReadonlyMap<Sage, number>;
  closed: boolean;
};

type SessionState = LandingSession & {
  nextY: Map<Sage, number>;
  anchorY: number;
  runBounds: Rect[];
  /** Where the writer's view was when the run started (page space). */
  startViewport: Rect;
  startZoom: number;
  writerMovedCamera: boolean;
  /** Editor the camera listeners are attached to. */
  attached: { editor: Editor; detach: () => void } | null;
  /** True while the app itself is moving the camera. */
  appMoving: boolean;
  appMovingTimer: ReturnType<typeof setTimeout> | null;
  framePending: boolean;
  frameTimer: ReturnType<typeof setTimeout> | null;
};

let current: SessionState | null = null;

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const rectOf = (box: Box): Rect => ({ x: box.x, y: box.y, w: box.w, h: box.h });

function captureView(session: SessionState, editor: Editor): void {
  session.startViewport = rectOf(editor.getViewportPageBounds());
  session.startZoom = editor.getZoomLevel();
}

/**
 * Fix the run's region and open the board if it is closed. Resolves once the
 * board is mounted; rejects with the board's error when it cannot be.
 */
export async function beginLanding(essayId: string, sages: Sage[], ownQuestion = false): Promise<LandingSession> {
  const editor = await ensureBoard(essayId);
  const shapes = editor.getCurrentPageShapes();
  const viewport = editor.getViewportPageBounds();
  const rects = shapes.map((s) => boundsOf(editor, s));
  const anchorX = (rects.length > 0 ? common(rects).x + common(rects).w : viewport.x) + EDGE_GAP;
  const anchorY = viewport.y + CHIP_ROOM + (ownQuestion ? OWN_CHIP_ROOM : 0);

  const ordered = ALL_SAGES.filter((s) => sages.includes(s));
  const columns = new Map<Sage, number>();
  const nextY = new Map<Sage, number>();
  ordered.forEach((sage, i) => {
    columns.set(sage, anchorX + i * (NOTE_WIDTH + COLUMN_GAP));
    nextY.set(sage, anchorY);
  });

  if (current) detach(current);
  const session: SessionState = {
    essayId,
    columns,
    closed: false,
    nextY,
    anchorY,
    runBounds: [],
    startViewport: rectOf(viewport),
    startZoom: editor.getZoomLevel(),
    writerMovedCamera: false,
    attached: null,
    appMoving: false,
    appMovingTimer: null,
    framePending: false,
    frameTimer: null,
  };
  current = session;
  attach(session, editor);
  return session;
}

/** Stop landing for this session. Pending landings reject; the view stays where it is. */
export function endLanding(session: LandingSession): void {
  const s = session as SessionState;
  s.closed = true;
  if (s.frameTimer) clearTimeout(s.frameTimer);
  s.frameTimer = null;
  s.framePending = false;
  detach(s);
  if (current === s) current = null;
}

/**
 * Where the open session put its columns (page space), read-only, so the
 * status chips can sit over them. Null when no session is open.
 */
export function landingLayout(): { columns: ReadonlyMap<Sage, number>; anchorY: number } | null {
  if (!current || current.closed) return null;
  return { columns: current.columns, anchorY: current.anchorY };
}

/** The writer moved the view on purpose: the run stops following. */
export function markWriterMovedCamera(): void {
  if (current) current.writerMovedCamera = true;
}

function detach(session: SessionState): void {
  session.attached?.detach();
  session.attached = null;
}

/** Camera listeners follow the editor instance: a hidden and reopened board is a new one. */
function attach(session: SessionState, editor: Editor): void {
  if (session.attached?.editor === editor) return;
  const fresh = session.attached !== null;
  detach(session);
  if (fresh) {
    // A new editor starts with its own view; the writer has not moved it.
    session.writerMovedCamera = false;
    captureView(session, editor);
  }
  const onEvent = (info: TLEventInfo) => {
    if (session.closed) return;
    if (info.type === "wheel" || info.type === "pinch") {
      // Reaches the bus even while the app animates: the writer interrupts it.
      session.writerMovedCamera = true;
    } else if (info.type === "pointer" && info.name === "pointer_move" && editor.inputs.getIsPanning()) {
      session.writerMovedCamera = true;
    }
  };
  editor.on("event", onEvent);
  // Synchronous, so an `immediate` move is told apart from the writer's too.
  const offCamera = editor.sideEffects.registerAfterChangeHandler("camera", () => {
    if (session.closed || session.appMoving) return;
    session.writerMovedCamera = true;
  });
  session.attached = {
    editor,
    detach: () => {
      editor.off("event", onEvent);
      offCamera();
    },
  };
}

export type LandingNote = {
  sage: Sage;
  text: string;
  title?: string;
  fuenteId?: string;
};

/**
 * Put one note on the board. Does not select it, focus it, or change the
 * tool; creation is not an undo step (discarding it later is).
 */
export async function land(session: LandingSession, note: LandingNote): Promise<TLShapeId> {
  const s = session as SessionState;
  if (s.closed) throw new Error("landing closed");
  const editor = await ensureBoard(s.essayId);
  if (s.closed) throw new Error("landing closed");
  attach(s, editor);

  const x = s.columns.get(note.sage);
  if (x === undefined) throw new Error("no column for this agent");
  const id = createShapeId();
  markLanding(id);

  editor.run(
    () => {
      editor.createShape<TLNoteShape>({
        id,
        type: "note",
        x,
        y: s.nextY.get(note.sage) ?? s.anchorY,
        rotation: 0,
        props: {
          richText: toRichText(note.text),
          size: "s",
          align: "start",
          verticalAlign: "start",
        },
        meta: {
          author: note.sage,
          kind: "pregunta",
          createdAt: Date.now(),
          ...(note.title ? { title: note.title } : {}),
          ...(note.fuenteId ? { fuenteId: note.fuenteId } : {}),
        },
      });
      const shape = editor.getShape<TLNoteShape>(id);
      if (!shape) return;
      // Real bounds, read after creation: the height depends on measured text.
      const own = boundsOf(editor, shape);
      const obstacles = editor
        .getCurrentPageShapes()
        .filter((o) => o.id !== id)
        .map((o) => boundsOf(editor, o));
      const plan = [{ ...own, shape }];
      clearObstacles(plan, obstacles, NOTE_GAP);
      const offset = plan[0].y - own.y;
      if (offset !== 0) editor.updateShape({ id, type: "note", y: shape.y + offset });
    },
    { history: "ignore" },
  );

  const placed = editor.getShape(id);
  if (placed) {
    const bounds = boundsOf(editor, placed);
    s.nextY.set(note.sage, bounds.y + bounds.h + NOTE_GAP);
    s.runBounds.push(bounds);
    scheduleFrame(s);
  }
  return id;
}

/** One camera move per burst of landings. */
function scheduleFrame(session: SessionState): void {
  if (session.framePending) return;
  session.framePending = true;
  session.frameTimer = setTimeout(() => {
    session.framePending = false;
    session.frameTimer = null;
    if (session.closed || session.writerMovedCamera || !session.attached) return;
    frame(session, session.attached.editor);
  }, 80);
}

function frame(session: SessionState, editor: Editor): void {
  if (session.runBounds.length === 0) return;
  const notes = common(session.runBounds);
  const view = rectOf(editor.getViewportPageBounds());
  const zoom = editor.getZoomLevel();
  // The toolbar covers the bottom-left corner of the view: a note there is not seen.
  const toolbar: Rect = {
    x: view.x,
    y: view.y + view.h - TOOLBAR_TOP / zoom,
    w: TOOLBAR_RIGHT / zoom,
    h: TOOLBAR_TOP / zoom,
  };
  const behindToolbar = session.runBounds.some(
    (r) => r.x < toolbar.x + toolbar.w && r.x + r.w > toolbar.x && r.y < toolbar.y + toolbar.h && r.y + r.h > toolbar.y,
  );
  const inside =
    !behindToolbar &&
    notes.x >= view.x && notes.y >= view.y && notes.x + notes.w <= view.x + view.w && notes.y + notes.h <= view.y + view.h;
  if (inside) return;

  const screen = editor.getViewportScreenBounds();
  const withContext = common([notes, session.startViewport]);
  const fitFor = (box: Rect) =>
    Math.min(
      (screen.w - FRAME_INSET * 2) / box.w,
      (screen.h - FRAME_INSET * 2 - TOOLBAR_TOP) / box.h,
    );
  // Never zoom in: the target is the zoom the run started at, and
  // `zoomToBounds` takes the smaller of that and the fit.
  const base = fitFor(withContext) < MIN_FRAME_ZOOM ? notes : withContext;
  const z = Math.max(Math.min(fitFor(base), session.startZoom), 0.05);
  // Empty space under the target equal to the toolbar's room, so the view
  // centres the notes above it.
  const target = { x: base.x, y: base.y, w: base.w, h: base.h + TOOLBAR_TOP / z };

  session.appMoving = true;
  if (session.appMovingTimer) clearTimeout(session.appMovingTimer);
  const reduced = reducedMotion();
  editor.zoomToBounds(target, {
    targetZoom: session.startZoom,
    inset: FRAME_INSET,
    ...(reduced
      ? { immediate: true }
      : { animation: { duration: CAMERA_MS, easing: EASINGS.easeInOutCubic } }),
  });
  session.appMovingTimer = setTimeout(() => {
    session.appMoving = false;
    session.appMovingTimer = null;
  }, reduced ? 0 : CAMERA_MS + 60);
  if (reduced) session.appMoving = false;
}
