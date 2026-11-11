import type { Editor, JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";
import { TextSelection } from "@tiptap/pm/state";
import type { Transaction } from "@tiptap/pm/state";
import { useStore } from "@/lib/store";
import { ToolError, MAX_REQUEST_BYTES, type JsonObject } from "../../../shared/mcp";
import { validateRichContent, validateFormatting, applyFormatting, nativeDocumentTransaction, type Formatting } from "./document-content";
import { readEvaluation } from "./evaluation";
import { deriveFindings } from "@/lib/review/findings";

let liveDocument: { editor: Editor; essayId: string } | null = null;
let titleInput: { essayId: string; replace: (title: string) => boolean; editor?: Editor } | null = null;
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

export function registerTitleInput(essayId: string, replace: (title: string) => boolean, editor?: Editor): () => void {
  const registration = { essayId, replace, editor };
  titleInput = registration;
  return () => { if (titleInput === registration) titleInput = null; };
}

export function getTitleEditor(essayId: string): Editor {
  const editor = titleInput?.essayId === essayId ? titleInput.editor : undefined;
  if (useStore.getState().current?.id !== essayId || !editor || editor.isDestroyed) {
    throw new ToolError("EDITOR_NOT_READY", "The requested essay's title is not ready.");
  }
  return editor;
}

export async function ensureTitle(essayId: string): Promise<Editor> {
  const deadline = performance.now() + 2000;
  while (performance.now() < deadline) {
    if (useStore.getState().current?.id !== essayId) throw new ToolError("ESSAY_CHANGED", "The open essay changed.");
    try { return getTitleEditor(essayId); } catch (err) {
      if (!(err instanceof ToolError) || err.code !== "EDITOR_NOT_READY") throw err;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 16));
  }
  throw new ToolError("EDITOR_NOT_READY", "The requested essay's title did not mount.");
}

export function isTitleInputFocused(essayId: string): boolean {
  const editor = titleInput?.essayId === essayId ? titleInput.editor : undefined;
  return !!editor && !editor.isDestroyed && editor.view.dom.contains(document.activeElement);
}

export function readTitleHistory(essayId: string): JsonObject {
  const editor = getTitleEditor(essayId);
  return { canUndo: editor.can().undo(), canRedo: editor.can().redo() };
}

export function applyTitleHistory(essayId: string, direction: "undo" | "redo"): JsonObject {
  const editor = getTitleEditor(essayId);
  if (editor.view.composing || !editor.isEditable) throw new ToolError("EDITOR_BUSY", "Finish the title input composition before editing.");
  const changed = editor.commands[direction]();
  if (changed && useStore.getState().current?.title !== editor.state.doc.textContent) {
    useStore.getState().updateTitle(editor.state.doc.textContent);
  }
  return { changed, title: editor.state.doc.textContent, ...readTitleHistory(essayId) };
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

// Reserve transport space for envelope, metadata and UTF-8 expansion. Reads
// return explicit continuation positions instead of increasing the IPC limit.
const MAX_READ_POSITIONS = Math.floor(MAX_REQUEST_BYTES / 64);
const MAX_PAGE_BLOCKS = 200;
const MAX_RESPONSE_BYTES = Math.floor(MAX_REQUEST_BYTES / 2);

function checkedRange(editor: Editor, from: unknown, to: unknown): { from: number; to: number } {
  if (typeof from !== "number" || !Number.isInteger(from) || typeof to !== "number" || !Number.isInteger(to)
    || from < 0 || to < from || to > editor.state.doc.content.size
    || splitsSurrogate(editor.state.doc, from) || splitsSurrogate(editor.state.doc, to)) {
    throw new ToolError("INVALID_RANGE", "Use valid document positions from the latest document or selection response.");
  }
  return { from, to };
}

function pageInteger(value: unknown, fallback: number, maximum = Number.MAX_SAFE_INTEGER): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > maximum) {
    throw new ToolError("INVALID_ARGUMENTS", "Invalid document pagination.");
  }
  return value;
}

function checkResponseSize(result: JsonObject): JsonObject {
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > MAX_RESPONSE_BYTES) {
    throw new ToolError("READ_TOO_LARGE", "Read a smaller document range or page, and fetch source content separately.");
  }
  return result;
}

export function readDocument(args: JsonObject): JsonObject {
  const essayId = args.essayId as string;
  const editor = getDocumentEditor(essayId);
  const essay = useStore.getState().current!;
  const size = editor.state.doc.content.size;
  const from = pageInteger(args.from, 0, size);
  let end = args.to === undefined ? Math.min(size, from + MAX_READ_POSITIONS) : pageInteger(args.to, size, size);
  if (args.to === undefined && splitsSurrogate(editor.state.doc, end)) end -= 1;
  const range = checkedRange(editor, from, end);
  if (range.to - range.from > MAX_READ_POSITIONS) {
    throw new ToolError("READ_TOO_LARGE", `Read at most ${MAX_READ_POSITIONS} document positions at once.`);
  }
  const offset = pageInteger(args.offset, 0);
  const limit = pageInteger(args.limit, 100, MAX_PAGE_BLOCKS);
  if (limit === 0 || (args.query !== undefined && typeof args.query !== "string")
    || (args.format !== undefined && args.format !== "text" && args.format !== "json")) {
    throw new ToolError("INVALID_ARGUMENTS", "Invalid document query or format.");
  }
  const query = typeof args.query === "string" ? args.query.toLocaleLowerCase() : "";
  const blocks: JsonObject[] = [];
  const annotations: JsonObject[] = [];
  let total = 0;
  let textBudget = MAX_READ_POSITIONS;
  editor.state.doc.descendants((node, pos) => {
    if (node.isTextblock && (!query || node.textContent.toLocaleLowerCase().includes(query))) {
      const index = total++;
      if (index >= offset && blocks.length < limit && textBudget > 0) {
        let blockId = blockIds.get(node);
        if (!blockId) { blockId = crypto.randomUUID(); blockIds.set(node, blockId); }
        let text = node.textContent.slice(0, textBudget);
        if (text.length < node.textContent.length && /[\uD800-\uDBFF]$/u.test(text)) text = text.slice(0, -1);
        textBudget -= text.length;
        blocks.push({ id: blockId, type: node.type.name, attrs: node.attrs, from: pos + 1,
          to: pos + node.nodeSize - 1, text, textTruncated: text.length < node.textContent.length });
      }
    }
    if (args.includeAnnotations && node.isText && pos < range.to && pos + node.nodeSize > range.from) {
      for (const mark of node.marks) if (mark.type.name === "annotation") {
        annotations.push({ from: Math.max(pos, range.from), to: Math.min(pos + node.nodeSize, range.to), ...mark.attrs, status: "open" });
      }
    }
  });
  // Findings with no underline: open and not located, resolved, and not
  // applicable (included so a client does not propose them again).
  const derived = deriveFindings(essay.content, essay.findings).filter((v) => !v.located);
  const hidden = (essay.findings ?? []).filter((r) => r.status === "not_applicable" && !derived.some((v) => v.id === r.id));
  const findings: JsonObject[] = [
    ...derived.map((v) => ({
      id: v.id, sage: v.sage, pase: v.pase, severidad: v.severidad, cita: v.cita, mensaje: v.mensaje,
      status: v.status, located: false,
    })),
    ...hidden.map((r) => ({
      id: r.id, sage: r.sage, pase: r.pase, severidad: r.severidad, cita: r.cita, mensaje: r.mensaje,
      status: r.status, located: false,
    })),
  ];
  const sources = essay.fuentes ?? [];
  const sourcesFit = new TextEncoder().encode(JSON.stringify(sources)).byteLength <= MAX_RESPONSE_BYTES / 4;
  const criteria = essay.rubrica?.criterios ?? [];
  return checkResponseSize({
    title: essay.title, language: essay.language ?? "es", mode: essay.mode,
    text: editor.state.doc.textBetween(range.from, range.to, "\n\n"),
    blocks, totalBlocks: total, offset, nextOffset: offset + blocks.length < total ? offset + blocks.length : null,
    range: { ...range, documentSize: size, nextFrom: range.to < size ? range.to : null },
    positionUnit: "ProseMirror positions; text offsets use UTF-16",
    ...(args.format === "json" ? { content: editor.state.doc.slice(range.from, range.to).toJSON() } : {}),
    ...(args.includeSources ? { sources: sourcesFit ? sources : sources.slice(0, MAX_PAGE_BLOCKS).map(({ id, nombre, cita, origen }) => ({ id, nombre, cita, origen })),
      sourcesTruncated: !sourcesFit, totalSources: sources.length } : {}),
    ...(args.includeRubric ? { rubric: essay.rubrica ? { criterios: criteria.slice(0, MAX_PAGE_BLOCKS) } : null,
      rubricTruncated: criteria.length > MAX_PAGE_BLOCKS } : {}),
    ...(args.includeAnnotations ? { annotations, findings } : {}),
    ...(args.includeEvaluation ? { evaluation: readEvaluation(essay, args, useStore.getState().scorebarDismissed) } : {}),
  });
}

export function readTextSelection(essayId: string): JsonObject {
  const editor = getDocumentEditor(essayId);
  const { from, to, empty } = editor.state.selection;
  let textTo = Math.min(to, from + MAX_READ_POSITIONS);
  if (splitsSurrogate(editor.state.doc, textTo)) textTo -= 1;
  return { from, to, empty, text: editor.state.doc.textBetween(from, textTo, "\n"), textTruncated: textTo < to, nextFrom: textTo < to ? textTo : null };
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
    if (typeof args.title !== "string" || /[\r\n\u2028\u2029]/u.test(args.title)
      || args.text !== undefined || args.from !== undefined || args.to !== undefined || args.content !== undefined || args.formatting !== undefined) {
      throw new ToolError("INVALID_ARGUMENTS", "Rename requires a single-line title and no text range.");
    }
    const titleEditor = getTitleEditor(args.essayId as string);
    if (titleEditor.view.composing || !titleEditor.isEditable) throw new ToolError("EDITOR_BUSY", "Finish the title input composition before editing.");
    return;
  }
  const insertion = args.operation === "insert" || args.operation === "rich_insert";
  checkedRange(editor, args.from, insertion ? args.from : args.to);
  if (args.title !== undefined || (insertion && args.to !== undefined)) {
    throw new ToolError("INVALID_ARGUMENTS", "This edit has incompatible fields.");
  }
  if (args.operation === "insert" || args.operation === "replace") {
    if (typeof args.text !== "string" || args.content !== undefined || args.formatting !== undefined) {
      throw new ToolError("INVALID_ARGUMENTS", "Plain text edits require text only.");
    }
  } else if (args.operation === "rich_insert" || args.operation === "rich_replace") {
    if (args.text !== undefined || args.formatting !== undefined) throw new ToolError("INVALID_ARGUMENTS", "Rich edits require JSON content only.");
    validateRichContent(editor, args.content);
  } else if (args.operation === "format") {
    if (args.text !== undefined || args.content !== undefined) throw new ToolError("INVALID_ARGUMENTS", "Formatting does not replace content.");
    validateFormatting(editor, args.formatting);
    const from = args.from as number;
    const to = args.to as number;
    if (!editor.state.doc.resolve(from).parent.inlineContent || !editor.state.doc.resolve(to).parent.inlineContent) {
      throw new ToolError("INVALID_RANGE", "Formatting endpoints must be inside text blocks.");
    }
  } else throw new ToolError("INVALID_ARGUMENTS", "Unknown document operation.");
}

export function validateDocumentTool(name: string, args: JsonObject): void {
  if (name === "edit_document") return validateDocumentEdit(args);
  if (name === "editor_history" && args.surface === "title") {
    const editor = getTitleEditor(args.essayId as string);
    if (editor.view.composing || !editor.isEditable) throw new ToolError("EDITOR_BUSY", "Finish the title input composition before editing.");
    if (args.direction !== "undo" && args.direction !== "redo") throw new ToolError("INVALID_ARGUMENTS", "Choose undo or redo.");
    return;
  }
  const editor = getDocumentEditor(args.essayId as string);
  if (editor.view.composing) throw new ToolError("EDITOR_BUSY", "Finish the current input composition first.");
  if (name === "set_text_selection") {
    const { from, to } = checkedRange(editor, args.from, args.to ?? args.from);
    if (!editor.state.doc.resolve(from).parent.inlineContent || !editor.state.doc.resolve(to).parent.inlineContent) {
      throw new ToolError("INVALID_RANGE", "Text selection endpoints must be inside text blocks.");
    }
  } else if (name === "editor_history") {
    if (args.surface !== "document" || (args.direction !== "undo" && args.direction !== "redo")) {
      throw new ToolError("INVALID_ARGUMENTS", "Choose document history and an undo or redo direction.");
    }
  } else throw new ToolError("UNKNOWN_TOOL", "Unknown document tool.");
}

export function handleDocumentTool(name: string, args: JsonObject): JsonObject {
  validateDocumentTool(name, args);
  if (name === "edit_document") return editDocument(args);
  if (name === "editor_history" && args.surface === "title") return applyTitleHistory(args.essayId as string, args.direction as "undo" | "redo");
  const editor = getDocumentEditor(args.essayId as string);
  if (name === "set_text_selection") {
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, args.from as number, (args.to ?? args.from) as number)).scrollIntoView());
    return { changed: false, selection: readTextSelection(args.essayId as string) };
  }
  const changed = args.direction === "undo" ? editor.commands.undo() : editor.commands.redo();
  return { changed };
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
  const to = args.operation === "insert" || args.operation === "rich_insert" ? from : args.to as number;
  if (args.operation === "format") {
    const changed = applyFormatting(editor, from, to, args.formatting as Formatting);
    return { changed, from, to };
  }
  if (args.operation === "rich_insert" || args.operation === "rich_replace") {
    const content = validateRichContent(editor, args.content);
    const changed = nativeDocumentTransaction(editor, (chain) => chain
      .insertContentAt({ from, to }, content, { errorOnInvalidContent: true, updateSelection: true }));
    return { changed, from, to };
  }
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
    nativeDocumentTransaction(editor, (chain) => chain
      .insertContentAt({ from, to }, paragraphs, { errorOnInvalidContent: true, updateSelection: true }));
  }
  // Isolate the next human edit from this native undo step as well.
  editor.view.dispatch(closeHistory(editor.state.tr));
  return { changed: true, from, to, insertedCharacters: text.length };
}
