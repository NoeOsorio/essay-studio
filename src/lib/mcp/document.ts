import type { Editor, JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";
import type { Transaction } from "@tiptap/pm/state";
import { useStore } from "@/lib/store";
import { ToolError, type JsonObject } from "../../../shared/mcp";

let liveDocument: { editor: Editor; essayId: string } | null = null;
let titleInput: { essayId: string; replace: (title: string) => boolean } | null = null;
const blockIds = new WeakMap<ProseMirrorNode, string>();

/** The instance, rather than a saved JSON copy, is the editable document. */
export function registerDocument(editor: Editor, essayId: string): () => void {
  const registration = { editor, essayId };
  liveDocument = registration;
  let positions = new Map<number, string>();
  const rememberBlocks = () => {
    const next = new Map<number, string>();
    editor.state.doc.descendants((node, pos) => {
      if (!node.isTextblock) return;
      const id = blockIds.get(node) ?? positions.get(pos) ?? crypto.randomUUID();
      blockIds.set(node, id); next.set(pos, id);
    });
    positions = next;
  };
  rememberBlocks();
  const mapBlocks = ({ transaction }: { transaction: Transaction }) => {
    if (!transaction.docChanged) return;
    const mapped = new Map<number, string>();
    for (const [position, id] of positions) {
      const result = transaction.mapping.mapResult(position, 1);
      if (!result.deleted && transaction.doc.nodeAt(result.pos)?.isTextblock) mapped.set(result.pos, id);
    }
    positions = mapped;
    rememberBlocks();
  };
  editor.on("transaction", mapBlocks);
  return () => {
    editor.off("transaction", mapBlocks);
    if (liveDocument === registration) liveDocument = null;
  };
}

export function registerTitleInput(essayId: string, replace: (title: string) => boolean): () => void {
  const registration = { essayId, replace };
  titleInput = registration;
  return () => { if (titleInput === registration) titleInput = null; };
}

export function getDocumentEditor(essayId: string): Editor {
  if (useStore.getState().current?.id !== essayId || liveDocument?.essayId !== essayId || liveDocument.editor.isDestroyed) {
    throw new ToolError("EDITOR_NOT_READY", "The requested essay's editor is not ready. Read app context and retry.");
  }
  return liveDocument.editor;
}

export async function ensureDocument(essayId: string): Promise<Editor> {
  // Mounting follows a React commit, not network latency. Stop instead of editing
  // a detached instance if the user navigates during the mount.
  const deadline = performance.now() + 2000;
  while (performance.now() < deadline) {
    if (useStore.getState().current?.id !== essayId) throw new ToolError("ESSAY_CHANGED", "The open essay changed.");
    try { return getDocumentEditor(essayId); } catch (err) {
      if (!(err instanceof ToolError) || err.code !== "EDITOR_NOT_READY") throw err;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 16));
  }
  throw new ToolError("EDITOR_NOT_READY", "The requested essay's editor did not mount.");
}

export function readDocument(args: JsonObject): JsonObject {
  const essayId = args.essayId as string;
  const editor = getDocumentEditor(essayId);
  const essay = useStore.getState().current!;
  const blocks: JsonObject[] = [];
  const annotations: JsonObject[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.isTextblock) {
      let blockId = blockIds.get(node);
      if (!blockId) { blockId = crypto.randomUUID(); blockIds.set(node, blockId); }
      blocks.push({ id: blockId, type: node.type.name, from: pos + 1, to: pos + node.nodeSize - 1, text: node.textContent });
    }
    if (args.includeAnnotations && node.isText) {
      for (const mark of node.marks) if (mark.type.name === "annotation") {
        annotations.push({ from: pos, to: pos + node.nodeSize, ...mark.attrs });
      }
    }
  });
  return {
    title: essay.title, language: essay.language ?? "es", mode: essay.mode,
    text: editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n\n"),
    blocks, positionUnit: "ProseMirror positions; text offsets use UTF-16",
    ...(args.includeSources ? { sources: essay.fuentes ?? [] } : {}),
    ...(args.includeRubric ? { rubric: essay.rubrica ?? null } : {}),
    ...(args.includeAnnotations ? { annotations } : {}),
  };
}

export function readTextSelection(essayId: string): JsonObject {
  const editor = getDocumentEditor(essayId);
  const { from, to, empty } = editor.state.selection;
  return { from, to, empty, text: editor.state.doc.textBetween(from, to, "\n") };
}

function splitsSurrogate(doc: ProseMirrorNode, position: number): boolean {
  if (position <= 0 || position >= doc.content.size) return false;
  const pair = doc.textBetween(position - 1, position + 1, "", "");
  return pair.length === 2 && pair.charCodeAt(0) >= 0xd800 && pair.charCodeAt(0) <= 0xdbff
    && pair.charCodeAt(1) >= 0xdc00 && pair.charCodeAt(1) <= 0xdfff;
}

/** Validate the operation before a safety snapshot or any native transaction. */
export function validateDocumentEdit(args: JsonObject): void {
  const editor = getDocumentEditor(args.essayId as string);
  if (editor.view.composing) throw new ToolError("EDITOR_BUSY", "Finish the current input composition before editing.");
  if (args.operation === "rename") {
    if (typeof args.title !== "string" || args.title.includes("\n") || args.title.includes("\r") || args.text !== undefined || args.from !== undefined || args.to !== undefined) {
      throw new ToolError("INVALID_ARGUMENTS", "Rename requires a single-line title and no text range.");
    }
    if (titleInput?.essayId !== args.essayId) throw new ToolError("EDITOR_NOT_READY", "The essay title is not ready.");
    return;
  }
  const { from, text } = args;
  const to = args.operation === "insert" ? from : args.to;
  if (typeof from !== "number" || !Number.isInteger(from) || typeof to !== "number" || !Number.isInteger(to)
    || typeof text !== "string" || args.title !== undefined || (args.operation === "insert" && args.to !== undefined)
    || from < 0 || to < from || to > editor.state.doc.content.size
    || splitsSurrogate(editor.state.doc, from) || splitsSurrogate(editor.state.doc, to)) {
    throw new ToolError("INVALID_RANGE", "Use valid document positions from the latest document or selection response.");
  }
}

/** Synchronous after the registry's final revision/session check. */
export function editDocument(args: JsonObject): JsonObject {
  validateDocumentEdit(args);
  const essayId = args.essayId as string;
  const editor = getDocumentEditor(essayId);
  if (args.operation === "rename") {
    const title = args.title as string;
    if (useStore.getState().current?.title === title) return { changed: false };
    if (!titleInput!.replace(title)) throw new ToolError("EDIT_REJECTED", "The native title editor could not apply an undoable rename.");
    if (useStore.getState().current?.title !== title) useStore.getState().updateTitle(title);
    return { changed: true, title };
  }
  const from = args.from as number;
  const to = args.operation === "insert" ? from : args.to as number;
  const text = (args.text as string).replace(/\r\n?/g, "\n");
  if (from === to && !text) return { changed: false };
  if (!text.includes("\n")) {
    const tr = closeHistory(editor.state.tr).insertText(text, from, to);
    tr.doc.check();
    editor.view.dispatch(tr.scrollIntoView());
  } else {
    // JSON content is constructed from literal text, never parsed as HTML.
    const paragraphs: JSONContent[] = text.split("\n").map((line) => ({
      type: "paragraph", ...(line ? { content: [{ type: "text", text: line }] } : {}),
    }));
    const applied = editor.chain().command(({ tr }) => { closeHistory(tr); return true; })
      .insertContentAt({ from, to }, paragraphs, { errorOnInvalidContent: true, updateSelection: true }).run();
    if (!applied) throw new ToolError("EDIT_REJECTED", "The document schema rejected this edit.");
  }
  // Isolate the next human edit from this native undo step as well.
  editor.view.dispatch(closeHistory(editor.state.tr));
  return { changed: true, from, to, insertedCharacters: text.length };
}
