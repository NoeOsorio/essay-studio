import {
  Box,
  createBindingId,
  createShapeId,
  getSnapshot,
  renderPlaintextFromRichText,
  toRichText,
  tipTapDefaultExtensions,
  type Editor,
  type TLArrowShape,
  type TLNoteShape,
  type TLShape,
  type TLShapeId,
  type TLShapePartial,
  type TLCreateShapePartial,
  type TLRichText,
} from "tldraw";
import { getSchema } from "@tiptap/core";
import { useStore } from "@/lib/store";
import { ToolError, MAX_REQUEST_BYTES, type JsonObject } from "../../../shared/mcp";
import { page, textRange } from "./collections";
import { handleAssetTool, prepareBoardAsset as prepareAsset, resetBoardUploads, validateAssetTool } from "./board-assets";
import { handleBoardPageTool, validateBoardPageTool } from "./board-pages";
export { resetBoardUploads };

type LiveBoard = { editor: Editor; essayId: string; records: Record<string, unknown> };
let live: LiveBoard | null = null;
const mounted = new Set<() => void>();

/** Compare frozen record identities, not camera/session state, to dedupe
 * the native synchronous callback and tldraw's next-frame listener. */
export function persistBoardSnapshot(editor: Editor): void {
  if (!live || live.editor !== editor) return;
  const current = useStore.getState().current;
  if (!current || current.id !== live.essayId) return;
  const snapshot = getSnapshot(editor.store);
  const saved = current.board as { document?: { store?: Record<string, unknown> }; session?: { currentPageId?: string } } | undefined;
  const records = snapshot.document.store;
  // Hydration can migrate or clone records. Compare against the registered
  // editor's baseline so a first page switch does not count as a text edit.
  const previous = live.records;
  const keys = Object.keys(records);
  if (keys.length === Object.keys(previous).length && keys.every((id) => records[id as keyof typeof records] === previous[id])) {
    if (snapshot.session.currentPageId !== saved?.session?.currentPageId) useStore.getState().updateBoardSession(snapshot);
    return;
  }
  live.records = records;
  useStore.getState().updateBoard(snapshot);
}

/** Called only after the existing snapshot has been hydrated. Document
 * callbacks run synchronously, so optimistic revision checks also cover
 * board edits made during the frame before store.listen is delivered. */
export function registerBoard(editor: Editor, essayId: string): () => void {
  const registration = { editor, essayId, records: getSnapshot(editor.store).document.store };
  live = registration;
  let dirty = false;
  const unlisten: (() => void)[] = [];
  for (const type of ["shape", "binding", "page", "asset", "document"] as const) {
    unlisten.push(editor.store.sideEffects.registerAfterCreateHandler(type, () => { dirty = true; }));
    unlisten.push(editor.store.sideEffects.registerAfterChangeHandler(type, () => { dirty = true; }));
    unlisten.push(editor.store.sideEffects.registerAfterDeleteHandler(type, () => { dirty = true; }));
  }
  unlisten.push(editor.store.sideEffects.registerAfterChangeHandler("instance", (previous, next) => {
    if (previous.currentPageId !== next.currentPageId) dirty = true;
  }));
  unlisten.push(editor.store.sideEffects.registerOperationCompleteHandler(() => {
    if (!dirty) return;
    dirty = false;
    persistBoardSnapshot(editor);
  }));
  for (const notify of mounted) notify();
  return () => {
    for (const stop of unlisten) stop();
    if (live === registration) { resetBoardUploads(); live = null; }
  };
}

export function getBoardSelection(): string[] {
  const state = useStore.getState();
  if (!live || !state.boardOpen || live.essayId !== state.current?.id) return [];
  return [...live.editor.getSelectedShapeIds()];
}

/** Share the live tldraw history with native menu actions. */
export function applyBoardHistory(direction: "undo" | "redo"): { changed: boolean } {
  if (!live || live.essayId !== useStore.getState().current?.id) return { changed: false };
  if (live.editor.getIsReadonly()) throw new ToolError("READ_ONLY", "The board is read-only.");
  if (!(direction === "undo" ? live.editor.getCanUndo() : live.editor.getCanRedo())) return { changed: false };
  live.editor[direction]();
  persistBoardSnapshot(live.editor);
  return { changed: true };
}

export function getBoardSummary() {
  const state = useStore.getState();
  if (!live || !state.boardOpen || live.essayId !== state.current?.id) return { ready: false };
  const shapes = live.editor.getCurrentPageShapes();
  return {
    ready: true,
    currentPageId: live.editor.getCurrentPageId(),
    pageCount: live.editor.getPages().length,
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

export async function prepareBoardAsset(args: JsonObject): Promise<void> { await prepareAsset(active(args), args); }

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
  if (lockedConnection(editor, shape)) throw new ToolError("CONNECTION_LOCKED", "A requested node is connected to a locked arrow.");
}

function nodeText(editor: Editor, shape: TLShape): string {
  const props = shape.props as Record<string, unknown>;
  if (props.richText) return renderPlaintextFromRichText(editor, props.richText as TLRichText);
  return typeof props.text === "string" ? props.text : typeof props.name === "string" ? props.name : "";
}

function boundedResult<T>(value: T): T {
  // Leave half the frame for the wire envelope and JSON escaping/base64.
  if (new TextEncoder().encode(JSON.stringify(value)).length > MAX_REQUEST_BYTES / 2) {
    throw new ToolError("RESULT_TOO_LARGE", "Read fewer nodes, selected fields or a smaller text range.");
  }
  return value;
}

function describe(editor: Editor, shape: TLShape, options: JsonObject = {}, compact = false): JsonObject {
  const bounds = editor.getShapePageBounds(shape);
  const text = nodeText(editor, shape);
  const rangedText = compact ? { text: text.slice(0, 512), textLength: text.length } : textRange(text, options);
  const value: JsonObject = {
    id: shape.id, type: shape.type, x: shape.x, y: shape.y,
    rotation: shape.rotation, parentId: shape.parentId,
    index: shape.index, isLocked: shape.isLocked,
    locked: editor.isShapeOrAncestorLocked(shape),
    bounds: bounds ? { x: bounds.x, y: bounds.y, width: bounds.w, height: bounds.h } : null,
    ...rangedText,
    ...(!compact ? { props: shape.props } : {}),
    ...(shape.type === "note" ? { title: typeof shape.meta.title === "string" && shape.meta.title !== "" ? shape.meta.title : null } : {}),
    ...(shape.type === "arrow" ? { bindings: editor.getBindingsFromShape(shape, "arrow").map((b) => ({ id: b.id, toId: b.toId, ...b.props })) } : {}),
    meta: shape.meta,
  };
  if (compact) value.textTruncated = text.length > 512;
  if (options.fields) {
    const fields = options.fields as string[];
    const allowed = new Set(Object.keys(value));
    if (fields.some((field) => !allowed.has(field))) throw new ToolError("INVALID_ARGUMENTS", "Unknown node field.");
    return Object.fromEntries(Object.entries(value).filter(([key]) => key === "id" || key === "type" || fields.includes(key)));
  }
  return value;
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

export type Rect = { x: number; y: number; w: number; h: number };
export type Placement = Rect & { shape: TLShape };
export function boundsOf(editor: Editor, shape: TLShape): Rect {
  const box = editor.getShapePageBounds(shape);
  if (!box || ![box.x, box.y, box.w, box.h].every(Number.isFinite)) throw new ToolError("INVALID_GEOMETRY", "A board node has invalid bounds.");
  return { x: box.x, y: box.y, w: box.w, h: box.h };
}
export function common(rects: Rect[]): Rect {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return { x, y, w: Math.max(...rects.map((r) => r.x + r.w)) - x, h: Math.max(...rects.map((r) => r.y + r.h)) - y };
}
export function overlaps(a: Rect, b: Rect, gap: number): boolean {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
}

/** Find the first vertical offset outside the union of all collision
 * intervals. Finite sweep over measured obstacle/placement pairs, rather
 * than retries or an arbitrary search horizon. */
export function clearObstacles(plan: Placement[], obstacles: Rect[], gap: number): void {
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

function placementChanges(editor: Editor, plan: Placement[]): TLShapePartial[] {
  return plan.map((p) => {
    const before = boundsOf(editor, p.shape);
    const start = editor.getPointInParentSpace(p.shape, { x: 0, y: 0 });
    const end = editor.getPointInParentSpace(p.shape, { x: p.x - before.x, y: p.y - before.y });
    const x = p.shape.x + end.x - start.x;
    const y = p.shape.y + end.y - start.y;
    if (![x, y].every(Number.isFinite)) throw new ToolError("INVALID_GEOMETRY", "The proposed layout exceeds finite board coordinates.");
    return { id: p.shape.id, type: p.shape.type, x, y };
  });
}

function organize(editor: Editor, args: JsonObject) {
  const scope = args.scope as "all" | "selection" | "ids";
  const layout = args.layout as "grid" | "columns" | "align" | "distribute";
  if (args.ids !== undefined && scope !== "ids") throw new ToolError("INVALID_ARGUMENTS", "ids is only valid with scope ids.");
  if (args.groups !== undefined && layout !== "columns") throw new ToolError("INVALID_ARGUMENTS", "Topic groups require the columns layout.");
  if (args.columns !== undefined && layout !== "grid" && layout !== "columns") throw new ToolError("INVALID_ARGUMENTS", "columns applies to grid or columns layouts.");
  const all = editor.getCurrentPageShapesSorted();
  const includeAllTypes = args.nodeTypes === "all";
  const compatible = (s: TLShape) => s.type !== "arrow" && (includeAllTypes || s.type === "note");
  const requested = scope === "all" ? all.filter(compatible)
    : scope === "selection" ? editor.getSelectedShapes().filter(compatible)
    : (args.ids as string[] | undefined)?.map((id) => shapeById(editor, id));
  if (!requested) throw new ToolError("INVALID_ARGUMENTS", "Supply ids for scope ids.");
  // Locked notes and notes attached to locked arrows are fixed obstacles,
  // even when included in an all/selection request.
  if (requested.some((s) => s.type === "arrow")) throw new ToolError("INVALID_NODE_TYPE", "Arrange arrow endpoints rather than bound arrows.");
  const requestedIds = new Set(requested.map((s) => s.id));
  const notes = requested.filter((s) => !editor.isShapeOrAncestorLocked(s) && !lockedConnection(editor, s)
    && !editor.getShapeAncestors(s).some((parent) => requestedIds.has(parent.id))
    && ![...editor.getShapeAndDescendantIds([s.id])].some((id) => editor.isShapeOrAncestorLocked(id)));
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
  const descendants = editor.getShapeAndDescendantIds([...targets]);
  const obstacles = all.filter((s) => !descendants.has(s.id) && !ancestors.has(s.id) && !(s.type === "arrow" && editor.getBindingsFromShape(s, "arrow").some((b) => descendants.has(b.toId)))).map((s) => boundsOf(editor, s));
  if (layout === "grid" || layout === "columns") clearObstacles(plan, obstacles, gap);
  for (let i = 0; i < plan.length; i++) {
    if (obstacles.some((r) => overlaps(plan[i], r, gap)) || plan.slice(i + 1).some((r) => overlaps(plan[i], r, gap))) throw new ToolError("LAYOUT_CONFLICT", "This arrangement would overlap another node. Use grid or columns, or change the selection.");
  }
  const changes = placementChanges(editor, plan).filter((p) => {
    const before = shapeById(editor, p.id);
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
  if (result.blob.size > MAX_REQUEST_BYTES / 2) throw new ToolError("IMAGE_TOO_LARGE", "The board preview exceeds the local IPC image budget.");
  const bytes = new Uint8Array(await result.blob.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return { image: { data: btoa(binary), mimeType: "image/png" }, width: result.width, height: result.height };
}

const AUTHORS = new Set(["tu", "em", "sis", "pra", "cri"]);
const KINDS = new Set(["concepto", "pregunta", "conexion", "cita", "critica"]);

/** Native schemas validate property shape; URL checks also protect rich-text
 * attributes, whose native JSON validator intentionally permits extensions. */
function safeProperties(value: unknown): void {
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (["__proto__", "prototype", "constructor"].includes(key)) throw new ToolError("INVALID_PROPERTIES", "Unsafe property key.");
    if ((key === "url" || key === "href" || key === "src") && typeof item === "string" && item) {
      let url: URL;
      try { url = new URL(item); } catch { throw new ToolError("INVALID_PROPERTIES", "Links require an absolute HTTP or HTTPS URL."); }
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new ToolError("INVALID_PROPERTIES", "Links require HTTP or HTTPS.");
    }
    if (typeof item === "number" && !Number.isFinite(item)) throw new ToolError("INVALID_PROPERTIES", "Properties require finite numbers.");
    safeProperties(item);
  }
}

function nativeValidate(editor: Editor, shape: TLShape): void {
  safeProperties(shape.props);
  const richText = (shape.props as Record<string, unknown>).richText;
  if (richText !== undefined) {
    try {
      const schema = getSchema(editor.getTextOptions().tipTapConfig?.extensions ?? tipTapDefaultExtensions);
      const check = (value: unknown, mark = false): void => {
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid rich text node");
        const node = value as Record<string, unknown>;
        const type = typeof node.type === "string" ? (mark ? schema.marks[node.type] : schema.nodes[node.type]) : undefined;
        if (!type) throw new Error("Unknown rich text type");
        const keys = mark ? ["type", "attrs"] : ["type", "attrs", "text", "content", "marks"];
        if (Object.keys(node).some((key) => !keys.includes(key))) throw new Error("Unknown rich text property");
        if (node.attrs && (typeof node.attrs !== "object" || Array.isArray(node.attrs) || Object.keys(node.attrs).some((key) => !Object.hasOwn(type.spec.attrs ?? {}, key)))) throw new Error("Unknown rich text attribute");
        if (node.content !== undefined) {
          if (!Array.isArray(node.content)) throw new Error("Invalid content");
          node.content.forEach((child) => check(child));
        }
        if (node.marks !== undefined) {
          if (!Array.isArray(node.marks)) throw new Error("Invalid marks");
          node.marks.forEach((child) => check(child, true));
        }
      };
      check(richText);
      const node = schema.nodeFromJSON(richText);
      if (node.type !== schema.topNodeType) throw new Error("Rich text must be a document");
      node.check();
    } catch { throw new ToolError("INVALID_PROPERTIES", "The native text schema rejected this rich text."); }
  }
  const assetId = (shape.props as Record<string, unknown>).assetId;
  if (typeof assetId === "string" && !editor.getAsset(assetId as Parameters<Editor["getAsset"]>[0])) {
    throw new ToolError("ASSET_NOT_FOUND", "The asset must already exist on this board.");
  }
  try { editor.store.schema.types.shape.validate(shape); }
  catch { throw new ToolError("INVALID_PROPERTIES", "The native shape schema rejected these properties."); }
}

function propsWithText(editor: Editor, shapeType: TLShape["type"], props: object, text: unknown): object {
  if (text === undefined) return props;
  if (typeof text !== "string") throw new ToolError("INVALID_ARGUMENTS", "Node text must be a string.");
  const defaults = editor.getShapeUtil(shapeType).getDefaultProps() as Record<string, unknown>;
  if ("richText" in defaults) return { ...props, richText: toRichText(text) };
  if ("text" in defaults) return { ...props, text };
  if ("name" in defaults) return { ...props, name: text };
  throw new ToolError("INVALID_NODE_TYPE", "This node does not support text.");
}

function newShape(editor: Editor, args: JsonObject): TLCreateShapePartial {
  if (editor.getIsReadonly()) throw new ToolError("READ_ONLY", "The board is read-only.");
  const type = args.type as TLShape["type"];
  if (!editor.hasShapeUtil(type)) throw new ToolError("INVALID_NODE_TYPE", "This shape type is not available.");
  const props = propsWithText(editor, type, { ...editor.getShapeUtil(type).getDefaultProps(), ...(args.props as object ?? {}) }, args.text);
  const meta = args.meta as { author?: string; kind?: string } | undefined;
  if (meta && (Object.keys(meta).some((key) => key !== "author" && key !== "kind") || (meta.author !== undefined && !AUTHORS.has(meta.author)) || (meta.kind !== undefined && !KINDS.has(meta.kind)))) {
    throw new ToolError("INVALID_ARGUMENTS", "Unsupported note metadata.");
  }
  if (meta && type !== "note") throw new ToolError("INVALID_NODE_TYPE", "Author and kind metadata apply to notes.");
  const shape = {
    id: createShapeId(), typeName: "shape", type, parentId: editor.getCurrentPageId(),
    index: editor.getHighestIndexForParent(editor.getCurrentPageId()),
    x: args.x, y: args.y, rotation: args.rotation ?? 0, isLocked: args.isLocked ?? false, opacity: 1,
    props, meta: type === "note" ? { author: "tu", kind: "concepto", createdAt: Date.now(), ...meta } : {},
  } as TLShape;
  nativeValidate(editor, shape);
  const { typeName: _typeName, index: _index, ...partial } = shape;
  void _typeName; void _index;
  return partial;
}

/** An empty title removes it; no title keeps what the note has. */
function titled(meta: JsonObject, title: unknown): JsonObject {
  if (title === undefined) return meta;
  const { title: _old, ...rest } = meta;
  void _old;
  return typeof title === "string" && title !== "" ? { ...rest, title } : rest;
}

function updates(editor: Editor, args: JsonObject): TLShapePartial[] {
  const nodes = args.nodes as JsonObject[];
  if (!nodes.length || new Set(nodes.map((node) => node.id)).size !== nodes.length) throw new ToolError("INVALID_ARGUMENTS", "Each update must reference a different node.");
  return nodes.map((patch) => {
    const shape = shapeById(editor, patch.id as string);
    if (patch.isLocked === false && shape.isLocked) {
      if (editor.getIsReadonly() || editor.getShapeAncestors(shape).some((ancestor) => ancestor.isLocked)) throw new ToolError("NODE_LOCKED", "A requested node has a locked ancestor.");
      if (lockedConnection(editor, shape)) throw new ToolError("CONNECTION_LOCKED", "A requested node is connected to a locked arrow.");
    } else assertEditable(editor, shape);
    if (patch.x !== undefined || patch.y !== undefined || patch.rotation !== undefined || patch.props !== undefined) {
      for (const id of editor.getShapeAndDescendantIds([shape.id])) {
        if (id !== shape.id) assertEditable(editor, shapeById(editor, id));
      }
    }
    if (Object.keys(patch).every((key) => key === "id")) throw new ToolError("INVALID_ARGUMENTS", "Supply at least one property to update.");
    if ((patch.author !== undefined || patch.kind !== undefined) && shape.type !== "note") throw new ToolError("INVALID_NODE_TYPE", "Author and kind apply to notes.");
    if (patch.title !== undefined && (shape.type !== "note" || typeof patch.title !== "string")) throw new ToolError("INVALID_NODE_TYPE", "A title applies to notes.");
    if ((patch.author !== undefined && !AUTHORS.has(patch.author as string)) || (patch.kind !== undefined && !KINDS.has(patch.kind as string))) throw new ToolError("INVALID_ARGUMENTS", "Unsupported note metadata.");
    const props = propsWithText(editor, shape.type, { ...shape.props, ...(patch.props as object ?? {}) }, patch.text);
    const next = { ...shape, props,
      ...(patch.x !== undefined ? { x: patch.x } : {}), ...(patch.y !== undefined ? { y: patch.y } : {}),
      ...(patch.rotation !== undefined ? { rotation: patch.rotation } : {}), ...(patch.isLocked !== undefined ? { isLocked: patch.isLocked } : {}),
      meta: titled({ ...shape.meta, ...(patch.author !== undefined ? { author: patch.author } : {}), ...(patch.kind !== undefined ? { kind: patch.kind } : {}) }, patch.title),
    } as TLShape;
    nativeValidate(editor, next);
    return { id: next.id, type: next.type, x: next.x, y: next.y, rotation: next.rotation, isLocked: next.isLocked, props: next.props, meta: next.meta } as TLShapePartial;
  });
}

function editableSet(editor: Editor, ids: string[], descendants = false): TLShape[] {
  if (!ids.length || new Set(ids).size !== ids.length) throw new ToolError("INVALID_ARGUMENTS", "Supply unique node IDs.");
  const shapes = ids.map((id) => shapeById(editor, id));
  const checked = descendants ? [...editor.getShapeAndDescendantIds(shapes.map((shape) => shape.id))].map((id) => shapeById(editor, id)) : shapes;
  checked.forEach((shape) => assertEditable(editor, shape));
  return shapes;
}

function validateConnection(editor: Editor, args: JsonObject): TLArrowShape {
  const shape = shapeById(editor, args.id as string);
  if (shape.type !== "arrow") throw new ToolError("INVALID_NODE_TYPE", "This operation requires an arrow.");
  assertEditable(editor, shape);
  const bindings = editor.getBindingsFromShape(shape, "arrow");
  const endpoint = (terminal: "start" | "end", key: "fromId" | "toId") => {
    const id = args[key] as string | undefined ?? bindings.find((binding) => binding.props.terminal === terminal)?.toId;
    if (id) {
      const target = shapeById(editor, id);
      if (target.id === shape.id || !editor.canBindShapes({ fromShape: shape, toShape: target, binding: "arrow" })) throw new ToolError("INVALID_CONNECTION", "The arrow cannot bind to this target.");
      assertEditable(editor, target);
    }
    return id;
  };
  const from = endpoint("start", "fromId"), to = endpoint("end", "toId");
  if (from && from === to) throw new ToolError("INVALID_CONNECTION", "Connect two different nodes.");
  const props = propsWithText(editor, "arrow", { ...shape.props, ...(args.props as object ?? {}) }, args.text);
  nativeValidate(editor, { ...shape, props } as TLShape);
  return shape;
}

/** Called before the coordinator creates a safety snapshot. The handler
 * repeats validation synchronously at the actual mutation boundary. */
export function validateBoardTool(name: string, args: JsonObject): void {
  const editor = active(args);
  if (["group_nodes", "edit_board_page", "set_board_page"].includes(name)) validateBoardPageTool(editor, name, args);
  if (["create_asset", "delete_asset", "import_board_asset"].includes(name)) validateAssetTool(editor, name, args);
  if (name === "create_node") newShape(editor, args);
  if (name === "update_nodes") updates(editor, args);
  if (name === "delete_nodes" || name === "duplicate_nodes") editableSet(editor, args.ids as string[], true);
  if (name === "reorder_nodes") editableSet(editor, args.ids as string[]);
  if (name === "update_connection") validateConnection(editor, args);
}

/** The coordinator has mounted the board, checked revision and captured a
 * safety version. Mutation branches deliberately perform no async work. */
export function handleBoardTool(name: string, args: JsonObject): unknown | Promise<unknown> {
  const editor = active(args);
  switch (name) {
    case "group_nodes":
    case "list_board_pages":
    case "edit_board_page":
    case "set_board_page": return boundedResult(handleBoardPageTool(editor, name, args, (operation, fn) => transaction(editor, operation, fn)));
    case "list_assets":
    case "get_asset":
    case "create_asset":
    case "delete_asset":
    case "import_board_asset": return boundedResult(handleAssetTool(editor, name, args, (operation, fn) => transaction(editor, operation, fn)));
    case "get_board": {
      const query = (args.query as string ?? "").toLocaleLowerCase();
      const types = args.types as string[] | undefined;
      const shapes = editor.getCurrentPageShapesSorted().filter((shape) => (!types || types.includes(shape.type)) && (!query || nodeText(editor, shape).toLocaleLowerCase().includes(query)));
      const result = page(shapes, args);
      return boundedResult({ pageId: editor.getCurrentPageId(), nodes: result.items.map((shape) => describe(editor, shape, {}, true)), selectedIds: getBoardSelection(), offset: result.offset, total: result.total, nextOffset: result.nextOffset });
    }
    case "get_node": return boundedResult(describe(editor, shapeById(editor, args.id as string), args));
    case "get_board_image": return image(editor);
    case "create_node": {
      const partial = newShape(editor, args);
      if (!editor.canCreateShapes([partial])) throw new ToolError("SHAPE_LIMIT", "The board cannot create another node.");
      transaction(editor, "create-node", () => editor.createShape(partial));
      return { changedIds: [partial.id], node: describe(editor, shapeById(editor, partial.id!)) };
    }
    case "create_note": {
      if (editor.getIsReadonly()) throw new ToolError("READ_ONLY", "The board is read-only.");
      const id = createShapeId();
      if (!editor.canCreateShapes([{ id, type: "note" }])) throw new ToolError("SHAPE_LIMIT", "The board cannot create another note.");
      transaction(editor, "create-note", () => editor.createShape<TLNoteShape>({
        id, type: "note", x: args.x as number, y: args.y as number,
        props: { richText: toRichText(args.text as string), size: "s", align: "start", verticalAlign: "start" },
        meta: {
          author: args.author as string ?? "tu", kind: args.kind as string ?? "concepto", createdAt: Date.now(),
          ...(typeof args.title === "string" && args.title !== "" ? { title: args.title } : {}),
        },
      }));
      return { changedIds: [id], node: describe(editor, noteById(editor, id)) };
    }
    case "update_nodes": {
      const changes = updates(editor, args);
      transaction(editor, "update-nodes", () => editor.updateShapes(changes));
      return { changedIds: changes.map((node) => node.id) };
    }
    case "duplicate_nodes": {
      const shapes = editableSet(editor, args.ids as string[], true);
      const count = editor.getShapeAndDescendantIds(shapes.map((shape) => shape.id)).size;
      if (editor.getCurrentPageShapeIds().size + count > editor.options.maxShapesPerPage) throw new ToolError("SHAPE_LIMIT", "The board cannot duplicate these nodes.");
      const before = new Set(editor.getCurrentPageShapeIds());
      transaction(editor, "duplicate-nodes", () => editor.duplicateShapes(shapes, { x: args.offsetX as number ?? 32, y: args.offsetY as number ?? 32 }));
      return { changedIds: [...editor.getCurrentPageShapeIds()].filter((id) => !before.has(id)) };
    }
    case "reorder_nodes": {
      const shapes = editableSet(editor, args.ids as string[]);
      const method = { front: "bringToFront", back: "sendToBack", forward: "bringForward", backward: "sendBackward" }[args.position as string] as "bringToFront" | "sendToBack" | "bringForward" | "sendBackward" | undefined;
      if (!method) throw new ToolError("INVALID_ARGUMENTS", "Choose front, back, forward or backward.");
      transaction(editor, "reorder-nodes", () => editor[method](shapes));
      return { changedIds: shapes.map((shape) => shape.id) };
    }
    case "update_connection": {
      const shape = validateConnection(editor, args);
      const bindings = editor.getBindingsFromShape(shape, "arrow");
      transaction(editor, "update-connection", () => {
        editor.updateShape({ id: shape.id, type: "arrow", props: propsWithText(editor, "arrow", args.props as object ?? {}, args.text) } as TLShapePartial<TLArrowShape>);
        for (const [key, terminal] of [["fromId", "start"], ["toId", "end"]] as const) {
          if (args[key] === undefined) continue;
          const old = bindings.find((binding) => binding.props.terminal === terminal);
          if (old) editor.deleteBindings([old.id]);
          editor.createBinding({ id: createBindingId(), type: "arrow", fromId: shape.id, toId: args[key] as TLShapeId, props: { terminal, normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false, snap: "none" } });
        }
      });
      return { changedIds: [shape.id], node: describe(editor, shapeById(editor, shape.id)) };
    }
    case "set_board_view": {
      const selected = args.selectedIds as string[] | undefined;
      const focus = args.focusIds as string[] | undefined;
      selected?.forEach((id) => shapeById(editor, id));
      const focused = focus?.map((id) => shapeById(editor, id));
      if (args.zoom !== undefined && (typeof args.zoom !== "number" || !Number.isFinite(args.zoom) || args.zoom <= 0)) throw new ToolError("INVALID_ARGUMENTS", "Zoom must be positive.");
      if (focus && (args.x !== undefined || args.y !== undefined)) throw new ToolError("INVALID_ARGUMENTS", "Choose node focus or camera coordinates.");
      if (selected) editor.setSelectedShapes(selected as TLShapeId[]);
      if (focused?.length) {
        const bounds = common(focused.map((shape) => boundsOf(editor, shape)));
        editor.zoomToBounds(new Box(bounds.x, bounds.y, bounds.w, bounds.h), { immediate: true, ...(args.zoom !== undefined ? { targetZoom: args.zoom as number } : {}) });
      } else if (focus) editor.zoomToFit({ immediate: true });
      else if (args.zoom !== undefined || args.x !== undefined || args.y !== undefined) {
        const camera = editor.getCamera();
        editor.setCamera({ x: args.x as number ?? camera.x, y: args.y as number ?? camera.y, z: args.zoom as number ?? camera.z }, { immediate: true });
      }
      return { selectedIds: getBoardSelection(), camera: editor.getCamera() };
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
      const shapes = editableSet(editor, ids, true);
      if (shapes.length) transaction(editor, "delete-nodes", () => editor.deleteShapes(shapes.map((s) => s.id)));
      return { changedIds: ids };
    }
    case "organize_notes": return organize(editor, args);
    default: throw new ToolError("UNKNOWN_TOOL", "This is not a board tool.");
  }
}

/**
 * The mounted board of the open essay, resolved without waiting. Callers that
 * must stay synchronous (a client saving questions) call `ensureBoard` first.
 */
export function liveBoardEditor(essayId: string): Editor {
  const state = useStore.getState();
  if (!live || live.essayId !== essayId || state.current?.id !== essayId || !state.boardOpen) throw new ToolError("EDITOR_NOT_READY", "Open the board before saving questions.");
  return live.editor;
}
