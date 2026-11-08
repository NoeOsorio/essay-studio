import {
  Box,
  createBindingId,
  createShapeId,
  getSnapshot,
  renderPlaintextFromRichText,
  toRichText,
  type Editor,
  type TLArrowShape,
  type TLNoteShape,
  type TLShape,
  type TLShapeId,
  type TLShapePartial,
} from "tldraw";
import { useStore } from "@/lib/store";
import { ToolError, type JsonObject, type ToolName } from "../../../shared/mcp";

type LiveBoard = { editor: Editor; essayId: string };
let live: LiveBoard | null = null;
const mounted = new Set<() => void>();

/** Compare frozen record identities, not camera/session state, to dedupe
 * the native synchronous callback and tldraw's next-frame listener. */
export function persistBoardSnapshot(editor: Editor): void {
  if (!live || live.editor !== editor) return;
  const current = useStore.getState().current;
  if (!current || current.id !== live.essayId) return;
  const snapshot = getSnapshot(editor.store);
  const saved = current.board as { document?: { store?: Record<string, unknown> } } | undefined;
  const records = snapshot.document.store;
  const previous = saved?.document?.store;
  if (previous) {
    const keys = Object.keys(records);
    if (keys.length === Object.keys(previous).length && keys.every((id) => records[id as keyof typeof records] === previous[id])) return;
  }
  useStore.getState().updateBoard(snapshot);
}

/** Called only after the existing snapshot has been hydrated. Document
 * callbacks run synchronously, so optimistic revision checks also cover
 * board edits made during the frame before store.listen is delivered. */
export function registerBoard(editor: Editor, essayId: string): () => void {
  const registration = { editor, essayId };
  live = registration;
  let dirty = false;
  const unlisten: (() => void)[] = [];
  for (const type of ["shape", "binding", "page", "asset", "document"] as const) {
    unlisten.push(editor.store.sideEffects.registerAfterCreateHandler(type, () => { dirty = true; }));
    unlisten.push(editor.store.sideEffects.registerAfterChangeHandler(type, () => { dirty = true; }));
    unlisten.push(editor.store.sideEffects.registerAfterDeleteHandler(type, () => { dirty = true; }));
  }
  unlisten.push(editor.store.sideEffects.registerOperationCompleteHandler(() => {
    if (!dirty) return;
    dirty = false;
    persistBoardSnapshot(editor);
  }));
  for (const notify of mounted) notify();
  return () => {
    for (const stop of unlisten) stop();
    if (live === registration) live = null;
  };
}

export function getBoardSelection(): string[] {
  const state = useStore.getState();
  if (!live || !state.boardOpen || live.essayId !== state.current?.id) return [];
  return [...live.editor.getSelectedShapeIds()];
}

/** Share the live tldraw history with native menu actions. */
export function applyBoardHistory(direction: "undo" | "redo"): void {
  if (!live || live.essayId !== useStore.getState().current?.id) return;
  live.editor[direction]();
  persistBoardSnapshot(live.editor);
}

export function getBoardSummary() {
  const state = useStore.getState();
  if (!live || !state.boardOpen || live.essayId !== state.current?.id) return { ready: false };
  const shapes = live.editor.getCurrentPageShapes();
  return {
    ready: true,
    notes: shapes.filter((s) => s.type === "note").length,
    connections: shapes.filter((s) => s.type === "arrow").length,
    selectedIds: getBoardSelection(),
  };
}

export async function ensureBoard(essayId: string): Promise<Editor> {
  const state = useStore.getState();
  if (state.current?.id !== essayId || state.view !== "editor") throw new ToolError("ESSAY_CHANGED", "The requested essay is no longer open.");
  if (!state.boardOpen) state.toggleBoard();
  if (live?.essayId === essayId) return live.editor;
  // UI mount timeout, not a retry loop. A subsequent request can retry once
  // the pane is ready; no mutation has been dispatched at this point.
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    const clear = () => { clearTimeout(timer); mounted.delete(check); unsubscribe(); };
    const check = () => {
      const current = useStore.getState();
      if (current.current?.id !== essayId || !current.boardOpen || current.view !== "editor") {
        clear(); reject(new ToolError("ESSAY_CHANGED", "The board was closed or the essay changed."));
      } else if (live?.essayId === essayId) {
        const editor = live.editor;
        clear(); resolve(editor);
      }
    };
    mounted.add(check);
    unsubscribe = useStore.subscribe(check);
    const timer = setTimeout(() => { clear(); reject(new ToolError("BOARD_NOT_READY", "The board has not finished mounting.")); }, 5000);
    check();
  });
}

function active(args: JsonObject): Editor {
  const state = useStore.getState();
  if (!live || live.essayId !== args.essayId || state.current?.id !== args.essayId || !state.boardOpen) throw new ToolError("BOARD_NOT_READY", "Read the current board before editing it.");
  return live.editor;
}

function shapeById(editor: Editor, id: string): TLShape {
  const shape = editor.getShape(id as TLShapeId);
  if (!shape || !editor.getCurrentPageShapeIds().has(shape.id)) throw new ToolError("NODE_NOT_FOUND", "The requested node is not on the current board.");
  return shape;
}

function noteById(editor: Editor, id: string): TLNoteShape {
  const shape = shapeById(editor, id);
  if (shape.type !== "note") throw new ToolError("INVALID_NODE_TYPE", "This operation requires sticky notes.");
  return shape as TLNoteShape;
}

function lockedConnection(editor: Editor, note: TLShape): boolean {
  return editor.getBindingsToShape(note, "arrow").some((binding) => editor.isShapeOrAncestorLocked(binding.fromId));
}

function assertEditable(editor: Editor, shape: TLShape): void {
  if (editor.getIsReadonly()) throw new ToolError("READ_ONLY", "The board is read-only.");
  if (editor.isShapeOrAncestorLocked(shape)) throw new ToolError("NODE_LOCKED", "A requested node is locked.");
  if (shape.type === "note" && lockedConnection(editor, shape)) throw new ToolError("CONNECTION_LOCKED", "A requested note is connected to a locked arrow.");
}

function describe(editor: Editor, shape: TLShape) {
  const bounds = editor.getShapePageBounds(shape);
  return {
    id: shape.id, type: shape.type, x: shape.x, y: shape.y,
    rotation: shape.rotation, parentId: shape.parentId,
    locked: editor.isShapeOrAncestorLocked(shape),
    bounds: bounds ? { x: bounds.x, y: bounds.y, width: bounds.w, height: bounds.h } : null,
    ...(shape.type === "note" ? { text: renderPlaintextFromRichText(editor, (shape as TLNoteShape).props.richText) } : {}),
    ...(shape.type === "arrow" ? { bindings: editor.getBindingsFromShape(shape, "arrow").map((b) => ({ id: b.id, toId: b.toId, ...b.props })) } : {}),
    meta: shape.meta,
  };
}

function transaction(editor: Editor, name: string, fn: () => void): void {
  if (editor.getIsReadonly()) throw new ToolError("READ_ONLY", "The board is read-only.");
  const mark = editor.markHistoryStoppingPoint(`mcp:${name}`);
  try {
    editor.run(fn);
    persistBoardSnapshot(editor);
    editor.markHistoryStoppingPoint(`mcp:${name}:end`);
  } catch (error) {
    editor.bailToMark(mark);
    persistBoardSnapshot(editor);
    throw error;
  }
}

type Rect = { x: number; y: number; w: number; h: number };
type Placement = Rect & { shape: TLNoteShape };
function boundsOf(editor: Editor, shape: TLShape): Rect {
  const box = editor.getShapePageBounds(shape);
  if (!box || ![box.x, box.y, box.w, box.h].every(Number.isFinite)) throw new ToolError("INVALID_GEOMETRY", "A board node has invalid bounds.");
  return { x: box.x, y: box.y, w: box.w, h: box.h };
}
function common(rects: Rect[]): Rect {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return { x, y, w: Math.max(...rects.map((r) => r.x + r.w)) - x, h: Math.max(...rects.map((r) => r.y + r.h)) - y };
}
function overlaps(a: Rect, b: Rect, gap: number): boolean {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
}

/** Find the first vertical offset outside the union of all collision
 * intervals. Finite sweep over measured obstacle/placement pairs, rather
 * than retries or an arbitrary search horizon. */
function clearObstacles(plan: Placement[], obstacles: Rect[], gap: number): void {
  const forbidden: { from: number; to: number }[] = [];
  for (const rect of plan) for (const obstacle of obstacles) {
    if (rect.x >= obstacle.x + obstacle.w + gap || rect.x + rect.w + gap <= obstacle.x) continue;
    forbidden.push({ from: obstacle.y - gap - rect.y - rect.h, to: obstacle.y + obstacle.h + gap - rect.y });
  }
  forbidden.sort((a, b) => a.from - b.from || a.to - b.to);
  let offset = 0;
  for (const interval of forbidden) if (offset > interval.from && offset < interval.to) offset = interval.to;
  for (const rect of plan) rect.y += offset;
}

function placementChanges(editor: Editor, plan: Placement[]): TLShapePartial<TLNoteShape>[] {
  return plan.map((p) => {
    const before = boundsOf(editor, p.shape);
    const start = editor.getPointInParentSpace(p.shape, { x: 0, y: 0 });
    const end = editor.getPointInParentSpace(p.shape, { x: p.x - before.x, y: p.y - before.y });
    const x = p.shape.x + end.x - start.x;
    const y = p.shape.y + end.y - start.y;
    if (![x, y].every(Number.isFinite)) throw new ToolError("INVALID_GEOMETRY", "The proposed layout exceeds finite board coordinates.");
    return { id: p.shape.id, type: "note", x, y };
  });
}

function organize(editor: Editor, args: JsonObject) {
  const scope = args.scope as "all" | "selection" | "ids";
  const layout = args.layout as "grid" | "columns" | "align" | "distribute";
  if (args.ids !== undefined && scope !== "ids") throw new ToolError("INVALID_ARGUMENTS", "ids is only valid with scope ids.");
  if (args.groups !== undefined && layout !== "columns") throw new ToolError("INVALID_ARGUMENTS", "Topic groups require the columns layout.");
  if (args.columns !== undefined && layout !== "grid" && layout !== "columns") throw new ToolError("INVALID_ARGUMENTS", "columns applies to grid or columns layouts.");
  const all = editor.getCurrentPageShapesSorted();
  const requested = scope === "all" ? all.filter((s) => s.type === "note")
    : scope === "selection" ? editor.getSelectedShapes().filter((s) => s.type === "note")
    : (args.ids as string[] | undefined)?.map((id) => noteById(editor, id));
  if (!requested) throw new ToolError("INVALID_ARGUMENTS", "Supply ids for scope ids.");
  // Locked notes and notes attached to locked arrows are fixed obstacles,
  // even when included in an all/selection request.
  const notes = requested.filter((s) => s.type === "note" && !editor.isShapeOrAncestorLocked(s) && !lockedConnection(editor, s)) as TLNoteShape[];
  const targets = new Set(notes.map((s) => s.id));
  const groups = args.groups as { label: string; ids: string[] }[] | undefined;
  if (groups) {
    const seen = new Set<string>();
    for (const group of groups) for (const id of group.ids) {
      if (!targets.has(id as TLShapeId) || seen.has(id)) throw new ToolError("INVALID_GROUPS", "Each topic group must contain unique movable note IDs from this scope.");
      seen.add(id);
    }
    if (seen.size !== targets.size) throw new ToolError("INVALID_GROUPS", "Topic groups must cover every movable note in this scope.");
  }
  if (notes.length < 2) return { changedIds: [], groups: [], noOp: true };
  const original = notes.map((shape) => ({ shape, ...boundsOf(editor, shape) }));
  const extent = common(original);
  // 32 page units is the app's readable board spacing; callers may select
  // another nonnegative gap. Geometry is measured, never assumed 200px.
  const gap = args.gap === undefined ? 32 : args.gap as number;
  let plan: Placement[] = [];
  let grouped: { label: string; ids: TLShapeId[] }[] = [];
  if (layout === "grid") {
    const columns = Math.min(notes.length, args.columns as number ?? Math.ceil(Math.sqrt(notes.length)));
    const widths = Array.from({ length: columns }, (_, col) => Math.max(...original.filter((_, i) => i % columns === col).map((r) => r.w)));
    let y = extent.y;
    for (let row = 0; row < Math.ceil(notes.length / columns); row++) {
      const items = original.slice(row * columns, (row + 1) * columns);
      let x = extent.x;
      items.forEach((rect, col) => { plan.push({ ...rect, x, y }); x += widths[col] + gap; });
      y += Math.max(...items.map((r) => r.h)) + gap;
    }
  } else if (layout === "columns") {
    if (groups && args.columns !== undefined) throw new ToolError("INVALID_ARGUMENTS", "Topic groups already define the number of columns.");
    if (groups) grouped = groups.filter((g) => g.ids.length).map((g) => ({ label: g.label, ids: g.ids as TLShapeId[] }));
    else {
      const count = Math.min(notes.length, args.columns as number ?? Math.ceil(Math.sqrt(notes.length)));
      grouped = Array.from({ length: count }, (_, i) => ({ label: `Column ${i + 1}`, ids: [] as TLShapeId[] }));
      original.forEach((r, i) => grouped[i % count].ids.push(r.shape.id));
    }
    const byId = new Map(original.map((r) => [r.shape.id, r]));
    let x = extent.x;
    for (const group of grouped) {
      const rects = group.ids.map((id) => byId.get(id)!);
      let y = extent.y;
      for (const rect of rects) { plan.push({ ...rect, x, y }); y += rect.h + gap; }
      x += Math.max(...rects.map((r) => r.w)) + gap;
    }
  } else if (layout === "align") {
    const axis = args.axis ?? "x";
    plan = original.map((r) => ({ ...r, ...(axis === "x" ? { x: extent.x } : { y: extent.y }) }));
  } else {
    const axis = args.axis ?? "x";
    const ordered = [...original].sort((a, b) => (axis === "x" ? a.x - b.x : a.y - b.y) || a.shape.id.localeCompare(b.shape.id));
    const space = (axis === "x" ? extent.w : extent.h) - ordered.reduce((sum, r) => sum + (axis === "x" ? r.w : r.h), 0);
    const spacing = space / (ordered.length - 1);
    if (spacing < gap) throw new ToolError("LAYOUT_CONFLICT", "There is not enough space to distribute these notes with the requested gap. Use grid or columns.");
    let position = axis === "x" ? extent.x : extent.y;
    plan = ordered.map((r) => {
      const next = { ...r, ...(axis === "x" ? { x: position } : { y: position }) };
      position += (axis === "x" ? r.w : r.h) + spacing;
      return next;
    });
  }
  // Ancestors are containers, not obstacles to their own children. Bound
  // arrows follow moved notes natively and necessarily touch their targets.
  const ancestors = new Set(notes.flatMap((s) => editor.getShapeAncestors(s).map((p) => p.id)));
  const obstacles = all.filter((s) => !targets.has(s.id) && !ancestors.has(s.id) && !(s.type === "arrow" && editor.getBindingsFromShape(s, "arrow").some((b) => targets.has(b.toId)))).map((s) => boundsOf(editor, s));
  if (layout === "grid" || layout === "columns") clearObstacles(plan, obstacles, gap);
  for (let i = 0; i < plan.length; i++) {
    if (obstacles.some((r) => overlaps(plan[i], r, gap)) || plan.slice(i + 1).some((r) => overlaps(plan[i], r, gap))) throw new ToolError("LAYOUT_CONFLICT", "This arrangement would overlap another node. Use grid or columns, or change the selection.");
  }
  const changes = placementChanges(editor, plan).filter((p) => {
    const before = noteById(editor, p.id);
    return p.x !== before.x || p.y !== before.y;
  });
  if (changes.length) transaction(editor, "organize-notes", () => editor.updateShapes(changes));
  return {
    changedIds: changes.map((p) => p.id),
    bounds: common(plan),
    groups: grouped.map((g) => ({ label: g.label, ids: g.ids, bounds: common(plan.filter((p) => g.ids.includes(p.shape.id))) })),
  };
}

async function image(editor: Editor) {
  const shapes = editor.getCurrentPageShapesSorted();
  if (!shapes.length) return { empty: true, image: null };
  const bounds = common(shapes.map((s) => boundsOf(editor, s)));
  // Tool previews are for inspection, not print export. Bound raster memory
  // and IPC size independently of document dimensions or device DPR.
  const maxPixels = 1600;
  const padding = 24;
  const scale = Math.min(1, maxPixels / Math.max(bounds.w + padding * 2, bounds.h + padding * 2));
  const result = await editor.toImage(shapes, { format: "png", bounds: new Box(bounds.x, bounds.y, bounds.w, bounds.h), padding, scale, pixelRatio: 1, background: true });
  if (result.blob.size > 4 * 1024 * 1024) throw new ToolError("IMAGE_TOO_LARGE", "The board preview exceeds the local IPC image budget.");
  const bytes = new Uint8Array(await result.blob.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return { image: { data: btoa(binary), mimeType: "image/png" }, width: result.width, height: result.height };
}

/** The coordinator has mounted the board, checked revision and captured a
 * safety version. Mutation branches deliberately perform no async work. */
export function handleBoardTool(name: ToolName, args: JsonObject): unknown | Promise<unknown> {
  const editor = active(args);
  switch (name) {
    case "get_board": return { pageId: editor.getCurrentPageId(), nodes: editor.getCurrentPageShapesSorted().map((s) => describe(editor, s)), selectedIds: getBoardSelection() };
    case "get_node": return describe(editor, shapeById(editor, args.id as string));
    case "get_board_image": return image(editor);
    case "create_note": {
      if (editor.getIsReadonly()) throw new ToolError("READ_ONLY", "The board is read-only.");
      const id = createShapeId();
      if (!editor.canCreateShapes([{ id, type: "note" }])) throw new ToolError("SHAPE_LIMIT", "The board cannot create another note.");
      transaction(editor, "create-note", () => editor.createShape<TLNoteShape>({
        id, type: "note", x: args.x as number, y: args.y as number,
        props: { richText: toRichText(args.text as string), size: "s", align: "start", verticalAlign: "start" },
        meta: { author: args.author as string ?? "tu", kind: args.kind as string ?? "concepto", createdAt: Date.now() },
      }));
      return { changedIds: [id], node: describe(editor, noteById(editor, id)) };
    }
    case "update_nodes": {
      const nodes = args.nodes as { id: string; text?: string; x?: number; y?: number }[];
      if (new Set(nodes.map((s) => s.id)).size !== nodes.length) throw new ToolError("INVALID_ARGUMENTS", "Each update must reference a different note.");
      const changes = nodes.map((patch): TLShapePartial<TLNoteShape> => {
        const shape = noteById(editor, patch.id); assertEditable(editor, shape);
        if (patch.text === undefined && patch.x === undefined && patch.y === undefined) throw new ToolError("INVALID_ARGUMENTS", "Supply text or coordinates for each update.");
        return { id: shape.id, type: "note", ...(patch.x !== undefined ? { x: patch.x } : {}), ...(patch.y !== undefined ? { y: patch.y } : {}), ...(patch.text !== undefined ? { props: { richText: toRichText(patch.text) } } : {}) };
      });
      transaction(editor, "update-notes", () => editor.updateShapes(changes));
      return { changedIds: nodes.map((n) => n.id) };
    }
    case "connect_notes": {
      const from = noteById(editor, args.fromId as string), to = noteById(editor, args.toId as string);
      assertEditable(editor, from); assertEditable(editor, to);
      if (from.id === to.id) throw new ToolError("INVALID_ARGUMENTS", "Connect two different notes.");
      const id = createShapeId();
      const a = editor.getShapePageBounds(from)!.center, b = editor.getShapePageBounds(to)!.center;
      if (!editor.canCreateShapes([{ id, type: "arrow" }])) throw new ToolError("SHAPE_LIMIT", "The board cannot create another connection.");
      transaction(editor, "connect-notes", () => {
        editor.createShape<TLArrowShape>({ id, type: "arrow", parentId: editor.getCurrentPageId(), x: a.x, y: a.y, props: { start: { x: 0, y: 0 }, end: { x: b.x - a.x, y: b.y - a.y } } });
        editor.createBindings([
          { id: createBindingId(), type: "arrow", fromId: id, toId: from.id, props: { terminal: "start", normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false, snap: "none" } },
          { id: createBindingId(), type: "arrow", fromId: id, toId: to.id, props: { terminal: "end", normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false, snap: "none" } },
        ]);
      });
      return { changedIds: [id], node: describe(editor, shapeById(editor, id)) };
    }
    case "delete_nodes": {
      const ids = args.ids as string[];
      const shapes = ids.map((id) => { const shape = shapeById(editor, id); assertEditable(editor, shape); if (shape.type !== "note" && shape.type !== "arrow") throw new ToolError("INVALID_NODE_TYPE", "Only explicitly named notes and connections can be removed."); return shape; });
      if (shapes.length) transaction(editor, "delete-nodes", () => editor.deleteShapes(shapes.map((s) => s.id)));
      return { changedIds: ids };
    }
    case "organize_notes": return organize(editor, args);
    default: throw new ToolError("UNKNOWN_TOOL", "This is not a board tool.");
  }
}
