import { PageRecordType, createShapeId, type Editor, type TLPage, type TLPageId, type TLShape, type TLShapeId } from "tldraw";
import { ToolError, type JsonObject } from "../../../shared/mcp";
import { matches, page } from "./collections";

type NativeTransaction = (name: string, apply: () => void) => void;

function editable(editor: Editor, shapes: TLShape[]): void {
  if (editor.getIsReadonly()) throw new ToolError("READ_ONLY", "The board is read-only.");
  for (const shape of shapes) {
    if (editor.isShapeOrAncestorLocked(shape)) throw new ToolError("NODE_LOCKED", "A requested shape or descendant is locked.");
    if (editor.getBindingsToShape(shape, "arrow").some(binding => editor.isShapeOrAncestorLocked(binding.fromId))) {
      throw new ToolError("CONNECTION_LOCKED", "A requested shape is connected to a locked arrow.");
    }
  }
}

function pageById(editor: Editor, value: unknown): TLPage {
  const found = typeof value === "string" ? editor.getPage(value as TLPageId) : undefined;
  if (!found) throw new ToolError("PAGE_NOT_FOUND", "The requested board page does not exist.");
  return found;
}

function named(args: JsonObject): string {
  if (typeof args.name !== "string" || !args.name.trim() || /[\r\n\u0000]/u.test(args.name)) throw new ToolError("INVALID_ARGUMENTS", "Use a nonempty, single-line page name.");
  return args.name;
}

function selectedShapes(editor: Editor, args: JsonObject): { shapes: TLShape[]; descendants: TLShape[] } {
  const ids = args.ids as string[];
  if (!ids?.length || new Set(ids).size !== ids.length) throw new ToolError("INVALID_ARGUMENTS", "Provide distinct shape IDs from the current page.");
  const shapes = ids.map(id => {
    const shape = editor.getShape(id as TLShapeId);
    if (!shape || !editor.getCurrentPageShapeIds().has(shape.id)) throw new ToolError("NODE_NOT_FOUND", "A requested shape is not on the current page.");
    return shape;
  });
  const selected = new Set(shapes.map(shape => shape.id));
  for (const shape of shapes) {
    let parent = editor.getShape(shape.parentId as TLShapeId);
    while (parent) {
      if (selected.has(parent.id)) throw new ToolError("INVALID_ARGUMENTS", "Select outer shapes or their descendants, not both.");
      parent = editor.getShape(parent.parentId as TLShapeId);
    }
  }
  const descendants = [...editor.getShapeAndDescendantIds(shapes.map(shape => shape.id))].map(id => editor.getShape(id)!);
  editable(editor, descendants);
  return { shapes, descendants };
}

function idleForGrouping(editor: Editor): void {
  if (editor.getCurrentToolId() !== "select" || !editor.isIn("select.idle")) throw new ToolError("BOARD_BUSY", "Finish the current board interaction before grouping.");
}

/** Native groups dissolve when only one child remains. Include those implicit
 * reparents in the lock preflight, even when the survivor was not selected. */
function protectGroupCleanup(editor: Editor, shapes: TLShape[], replacementParent?: string): void {
  const ancestors = new Map<TLShapeId, { shape: TLShape; depth: number }>();
  for (const shape of shapes) {
    const chain: TLShape[] = [];
    let parent = editor.getShape(shape.parentId as TLShapeId);
    while (parent) { chain.push(parent); parent = editor.getShape(parent.parentId as TLShapeId); }
    chain.forEach((ancestor, index) => ancestors.set(ancestor.id, { shape: ancestor, depth: chain.length - index }));
  }
  const removed = new Set(shapes.map(shape => shape.id));
  const additions = new Map<string, number>(replacementParent ? [[replacementParent, 1]] : []);
  for (const { shape } of [...ancestors.values()].sort((a, b) => b.depth - a.depth)) {
    if (shape.type !== "group" || removed.has(shape.id)) continue;
    const remaining = editor.getSortedChildIdsForParent(shape.id).filter(id => !removed.has(id));
    const count = remaining.length + (additions.get(shape.id) ?? 0);
    if (count > 1) continue;
    if (count === 1) {
      if (remaining.length) editable(editor, [...editor.getShapeAndDescendantIds(remaining)].map(id => editor.getShape(id)!));
      additions.set(shape.parentId, (additions.get(shape.parentId) ?? 0) + 1);
    }
    removed.add(shape.id);
  }
}

/** Shared preflight and commit checks prevent native silent no-ops. */
export function validateBoardPageTool(editor: Editor, name: string, args: JsonObject): void {
  if (name === "set_board_page") { pageById(editor, args.pageId); return; }
  if (name === "group_nodes") {
    idleForGrouping(editor);
    const { shapes } = selectedShapes(editor, args);
    if (args.operation === "group") {
      if (shapes.length < 2) throw new ToolError("INVALID_ARGUMENTS", "Grouping needs at least two shapes.");
      if (editor.getCurrentPageShapeIds().size >= editor.options.maxShapesPerPage) throw new ToolError("SHAPE_LIMIT", "The page has no space for another native group.");
      protectGroupCleanup(editor, shapes, editor.findCommonAncestor(shapes) ?? editor.getCurrentPageId());
    } else if (args.operation === "ungroup") {
      if (shapes.some(shape => shape.type !== "group")) throw new ToolError("INVALID_NODE_TYPE", "Ungroup only existing native groups.");
    } else throw new ToolError("INVALID_ARGUMENTS", "Choose group or ungroup.");
    return;
  }
  if (name !== "edit_board_page") return;
  if (editor.getIsReadonly()) throw new ToolError("READ_ONLY", "The board is read-only.");
  if (args.operation === "create") {
    if (args.pageId !== undefined || args.ids !== undefined || args.confirm !== undefined) throw new ToolError("INVALID_ARGUMENTS", "Creating a page accepts only its optional name.");
    if (args.name !== undefined) named(args);
    if (editor.getPages().length >= editor.options.maxPages) throw new ToolError("PAGE_LIMIT", "The board has reached its native page limit.");
    return;
  }
  const target = pageById(editor, args.pageId);
  if (args.operation === "rename") {
    named(args);
    if (args.ids !== undefined || args.confirm !== undefined) throw new ToolError("INVALID_ARGUMENTS", "Renaming a page accepts its ID and name.");
  } else if (args.operation === "delete") {
    if (args.confirm !== true) throw new ToolError("CONFIRMATION_REQUIRED", "Deleting a page requires an explicit request and confirm=true.");
    if (args.name !== undefined || args.ids !== undefined) throw new ToolError("INVALID_ARGUMENTS", "Delete explicitly names only the page.");
    if (editor.getPages().length <= 1) throw new ToolError("LAST_PAGE", "The last page cannot be deleted.");
    editable(editor, [...editor.getPageShapeIds(target.id)].map(id => editor.getShape(id)!));
  } else if (args.operation === "move_nodes") {
    if (args.name !== undefined || args.confirm !== undefined) throw new ToolError("INVALID_ARGUMENTS", "Moving shapes requires shape IDs and a destination page.");
    const { shapes, descendants } = selectedShapes(editor, args);
    if (target.id === editor.getCurrentPageId()) return;
    protectGroupCleanup(editor, shapes);
    if (editor.getPageShapeIds(target.id).size + descendants.length > editor.options.maxShapesPerPage) throw new ToolError("SHAPE_LIMIT", "The destination page has no space for these shapes.");
    const moving = new Set(descendants.map(shape => shape.id));
    // The native move API isolates its content and otherwise severs bindings
    // to objects left behind. Require an explicit complete connected selection.
    if (editor.store.allRecords().some(record => record.typeName === "binding" && moving.has(record.fromId) !== moving.has(record.toId))) {
      throw new ToolError("CROSS_PAGE_BINDING", "Move connected shapes and their connections together to preserve bindings.");
    }
  } else throw new ToolError("INVALID_ARGUMENTS", "Choose create, rename, delete or move_nodes.");
}

export function handleBoardPageTool(editor: Editor, name: string, args: JsonObject, transaction: NativeTransaction): JsonObject {
  if (name === "list_board_pages") {
    return { ...page(editor.getPages().filter(item => matches(args.query, item.name)).map(item => ({ id: item.id, name: item.name, index: item.index, current: item.id === editor.getCurrentPageId(), shapeCount: editor.getPageShapeIds(item.id).size })), args), currentPageId: editor.getCurrentPageId(), maxPages: editor.options.maxPages };
  }
  validateBoardPageTool(editor, name, args);
  if (name === "set_board_page") {
    const next = pageById(editor, args.pageId);
    const changed = next.id !== editor.getCurrentPageId();
    if (changed) editor.setCurrentPage(next.id);
    if (editor.getCurrentPageId() !== next.id) throw new ToolError("PAGE_SWITCH_FAILED", "The native editor could not switch pages.");
    return { changed, currentPageId: editor.getCurrentPageId() };
  }
  if (name === "group_nodes") {
    const { shapes, descendants } = selectedShapes(editor, args);
    const ids = shapes.map(shape => shape.id);
    if (args.operation === "group") {
      const groupId = createShapeId();
      transaction("group-nodes", () => {
        editor.groupShapes(ids, { groupId });
        if (editor.getShape(groupId)?.type !== "group" || ids.some(id => editor.getShape(id)?.parentId !== groupId) || descendants.some(shape => !editor.getShape(shape.id))) throw new ToolError("GROUP_FAILED", "The native editor could not group all requested shapes.");
      });
      return { groupId, changedIds: [groupId, ...ids], currentPageId: editor.getCurrentPageId() };
    }
    const children = shapes.flatMap(shape => [...editor.getSortedChildIdsForParent(shape.id)]);
    transaction("ungroup-nodes", () => {
      editor.ungroupShapes(ids);
      if (ids.some(id => editor.getShape(id)) || children.some(id => !editor.getShape(id))) throw new ToolError("GROUP_FAILED", "The native editor could not ungroup all requested groups.");
    });
    return { changedIds: children, removedGroupIds: ids, currentPageId: editor.getCurrentPageId() };
  }
  if (name !== "edit_board_page") throw new ToolError("UNKNOWN_TOOL", "Unknown page operation.");
  if (args.operation === "create") {
    const id = PageRecordType.createId();
    transaction("create-page", () => {
      editor.createPage({ id, name: typeof args.name === "string" ? args.name : "Página" });
      if (!editor.getPage(id)) throw new ToolError("PAGE_CREATE_FAILED", "The native editor could not create the page.");
    });
    return { pageId: id, page: editor.getPage(id), currentPageId: editor.getCurrentPageId() };
  }
  const target = pageById(editor, args.pageId);
  if (args.operation === "rename") transaction("rename-page", () => {
    editor.updatePage({ id: target.id, name: named(args) });
    if (editor.getPage(target.id)?.name !== args.name) throw new ToolError("PAGE_UPDATE_FAILED", "The native editor could not rename the page.");
  });
  else if (args.operation === "delete") transaction("delete-page", () => {
    editor.deletePage(target.id);
    if (editor.getPage(target.id)) throw new ToolError("PAGE_DELETE_FAILED", "The native editor could not delete the page.");
  });
  else {
    const { shapes, descendants } = selectedShapes(editor, args);
    if (target.id === editor.getCurrentPageId()) return { changed: false, pageId: target.id, currentPageId: target.id };
    transaction("move-page-nodes", () => {
      editor.moveShapesToPage(shapes.map(shape => shape.id), target.id);
      const moved = editor.getPageShapeIds(target.id);
      if (descendants.some(shape => !moved.has(shape.id))) throw new ToolError("PAGE_MOVE_FAILED", "The native editor could not move every requested shape.");
    });
    return { pageId: target.id, changedIds: descendants.map(shape => shape.id), currentPageId: editor.getCurrentPageId() };
  }
  return { pageId: target.id, deleted: args.operation === "delete", currentPageId: editor.getCurrentPageId() };
}
