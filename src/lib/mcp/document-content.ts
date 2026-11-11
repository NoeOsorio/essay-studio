import { isActive, type ChainedCommands, type Editor, type JSONContent } from "@tiptap/core";
import type { MarkType, NodeType } from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";
import type { Transaction } from "@tiptap/pm/state";
import { ToolError } from "../../../shared/mcp";

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ToolError("INVALID_CONTENT", "Expected JSON object content.");
  return value as Record<string, unknown>;
}

function keys(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new ToolError("INVALID_CONTENT", "Unknown document content field.");
}

function attributes(type: NodeType | MarkType, raw: unknown): Record<string, unknown> | undefined {
  if (raw === undefined) return undefined;
  const attrs = object(raw);
  const definitions = type.spec.attrs ?? {};
  for (const [name, value] of Object.entries(attrs)) {
    if (!Object.hasOwn(definitions, name)) throw new ToolError("INVALID_CONTENT", `Unknown attribute for ${type.name}.`);
    const fallback: unknown = definitions[name]?.default;
    if (value !== null && fallback !== null && fallback !== undefined && typeof value !== typeof fallback) {
      throw new ToolError("INVALID_CONTENT", `Invalid attribute type for ${type.name}.`);
    }
    if (value !== null && !["string", "number", "boolean"].includes(typeof value)) {
      throw new ToolError("INVALID_CONTENT", "Document attributes must be scalar values.");
    }
    if (typeof value === "number" && !Number.isFinite(value)) throw new ToolError("INVALID_CONTENT", "Document attributes must be finite.");
  }
  if (type.name === "heading" && attrs.level !== undefined && ![1, 2, 3].includes(attrs.level as number)) {
    throw new ToolError("INVALID_CONTENT", "Heading levels must be 1, 2 or 3.");
  }
  if (type.name === "orderedList" && attrs.start !== undefined && (typeof attrs.start !== "number" || !Number.isInteger(attrs.start) || attrs.start < 1)) {
    throw new ToolError("INVALID_CONTENT", "Ordered list start must be a positive integer.");
  }
  if (type.name === "link") {
    for (const name of ["href", "target", "rel", "class"]) {
      if (attrs[name] !== undefined && attrs[name] !== null && typeof attrs[name] !== "string") {
        throw new ToolError("INVALID_CONTENT", "Link attributes must be strings.");
      }
    }
    if (attrs.href !== undefined && (typeof attrs.href !== "string" || !safeLink(attrs.href))) {
      throw new ToolError("INVALID_CONTENT", "Links must use a safe web, mail, telephone or local fragment URL.");
    }
    if (attrs.target !== undefined && attrs.target !== null && !["_blank", "_self", "_parent", "_top"].includes(attrs.target as string)) {
      throw new ToolError("INVALID_CONTENT", "Invalid link target.");
    }
  }
  if (type.name === "codeBlock" && attrs.language !== undefined && attrs.language !== null && typeof attrs.language !== "string") {
    throw new ToolError("INVALID_CONTENT", "Code language must be text.");
  }
  return attrs;
}

function safeLink(href: string): boolean {
  if (!href || /[\u0000-\u0020\u007f]/u.test(href)) return false;
  if (href.startsWith("#") || (href.startsWith("/") && !href.startsWith("//") && !href.includes("\\"))) return true;
  try { return ["http:", "https:", "mailto:", "tel:"].includes(new URL(href).protocol); }
  catch { return false; }
}

/** Validate before PM parsing, which otherwise silently ignores unknown attrs. */
export function validateRichContent(editor: Editor, input: unknown): JSONContent | JSONContent[] {
  const visit = (value: unknown): JSONContent => {
    const raw = object(value);
    keys(raw, ["type", "attrs", "content", "marks", "text"]);
    if (typeof raw.type !== "string" || !Object.hasOwn(editor.schema.nodes, raw.type)) {
      throw new ToolError("INVALID_CONTENT", "Unknown document node type.");
    }
    const type = editor.schema.nodes[raw.type]!;
    const attrs = attributes(type, raw.attrs);
    if (raw.text !== undefined && (raw.type !== "text" || typeof raw.text !== "string" || !raw.text)) {
      throw new ToolError("INVALID_CONTENT", "Only text nodes accept nonempty text.");
    }
    if (raw.type === "text" && (typeof raw.text !== "string" || raw.content !== undefined || raw.attrs !== undefined)) {
      throw new ToolError("INVALID_CONTENT", "Text nodes require text and optional marks only.");
    }
    if (raw.content !== undefined && !Array.isArray(raw.content)) throw new ToolError("INVALID_CONTENT", "Node content must be an array.");
    if (raw.marks !== undefined && !Array.isArray(raw.marks)) throw new ToolError("INVALID_CONTENT", "Node marks must be an array.");
    const marks = (raw.marks as unknown[] | undefined)?.map((value) => {
      const mark = object(value);
      keys(mark, ["type", "attrs"]);
      if (typeof mark.type !== "string" || mark.type === "annotation" || !Object.hasOwn(editor.schema.marks, mark.type)) {
        throw new ToolError("INVALID_CONTENT", "Unknown or protected document mark.");
      }
      const attrs = attributes(editor.schema.marks[mark.type]!, mark.attrs);
      if (mark.type === "link" && (typeof attrs?.href !== "string" || !safeLink(attrs.href))) {
        throw new ToolError("INVALID_CONTENT", "Link marks require a safe href.");
      }
      return { type: mark.type, ...(attrs ? { attrs } : {}) };
    });
    if (marks && new Set(marks.map((mark) => mark.type)).size !== marks.length) throw new ToolError("INVALID_CONTENT", "Duplicate document marks.");
    const node: JSONContent = { type: raw.type, ...(attrs ? { attrs } : {}),
      ...(typeof raw.text === "string" ? { text: raw.text } : {}),
      ...(Array.isArray(raw.content) ? { content: raw.content.map(visit) } : {}), ...(marks ? { marks } : {}) };
    try { editor.schema.nodeFromJSON(node).check(); }
    catch { throw new ToolError("INVALID_CONTENT", "The live document schema rejected this content."); }
    return node;
  };
  if (Array.isArray(input)) {
    if (input.length === 0) throw new ToolError("INVALID_CONTENT", "Use a plain text replacement to remove content.");
    return input.map(visit);
  }
  const parsed = visit(input);
  // A complete document is a convenient input, but a doc node cannot be a child
  // of the live document. Insert its checked children as a native fragment.
  return parsed.type === editor.schema.topNodeType.name ? parsed.content ?? [] : parsed;
}

export type Formatting = { nodeType?: string; markType?: string; attrs?: Record<string, unknown>; remove?: boolean };
const formattableNodes = ["paragraph", "heading", "codeBlock", "blockquote", "bulletList", "orderedList"];

export function validateFormatting(editor: Editor, input: unknown): Formatting {
  const raw = object(input);
  keys(raw, ["nodeType", "markType", "attrs", "remove"]);
  if ((raw.nodeType !== undefined && typeof raw.nodeType !== "string")
    || (raw.markType !== undefined && typeof raw.markType !== "string")
    || (typeof raw.nodeType === "string") === (typeof raw.markType === "string")
    || (raw.remove !== undefined && typeof raw.remove !== "boolean")) {
    throw new ToolError("INVALID_CONTENT", "Formatting requires exactly one node or mark type.");
  }
  if (typeof raw.markType === "string") {
    if (raw.markType === "annotation" || !Object.hasOwn(editor.schema.marks, raw.markType)) throw new ToolError("INVALID_CONTENT", "Unknown or protected mark type.");
    const attrs = attributes(editor.schema.marks[raw.markType]!, raw.attrs);
    if (raw.markType === "link" && !raw.remove && (typeof attrs?.href !== "string" || !safeLink(attrs.href))) {
      throw new ToolError("INVALID_CONTENT", "Link formatting requires a safe href.");
    }
  } else {
    const name = raw.nodeType as string;
    if (!formattableNodes.includes(name) || !Object.hasOwn(editor.schema.nodes, name)) throw new ToolError("INVALID_CONTENT", "Unsupported block formatting type.");
    attributes(editor.schema.nodes[name]!, raw.attrs);
  }
  return raw as Formatting;
}

/** Tiptap chains normally dispatch even when a callback returns false. Capture
 * the transaction and dispatch only after every command and PM check succeeds. */
export function nativeDocumentTransaction(editor: Editor, build: (chain: ChainedCommands) => ChainedCommands): boolean {
  let pending: Transaction | null = null;
  const chain = editor.chain().command(({ tr }) => {
    pending = tr;
    tr.setMeta("preventDispatch", true);
    closeHistory(tr);
    return true;
  });
  let applied: boolean;
  try { applied = build(chain).run(); }
  catch { throw new ToolError("EDIT_REJECTED", "The document schema rejected this edit."); }
  if (!applied || !pending) throw new ToolError("EDIT_REJECTED", "The native editor could not apply this edit.");
  const transaction = pending as Transaction;
  try { transaction.doc.check(); }
  catch { throw new ToolError("EDIT_REJECTED", "The resulting document is invalid."); }
  const changed = transaction.docChanged;
  transaction.setMeta("preventDispatch", false);
  editor.view.dispatch(transaction.scrollIntoView());
  editor.view.dispatch(closeHistory(editor.state.tr));
  return changed;
}

export function applyFormatting(editor: Editor, from: number, to: number, formatting: Formatting): boolean {
  validateFormatting(editor, formatting);
  return nativeDocumentTransaction(editor, (chain) => chain.setTextSelection({ from, to }).command(({ state, commands }) => {
    if (formatting.markType) {
      return formatting.remove ? commands.unsetMark(formatting.markType) : commands.setMark(formatting.markType, formatting.attrs);
    }
    const name = formatting.nodeType!;
    if (name === "bulletList" || name === "orderedList") {
      if (formatting.remove) return !isActive(state, name) || commands.liftListItem("listItem");
      return isActive(state, name, formatting.attrs) || commands.toggleList(name, "listItem", false, formatting.attrs);
    }
    if (name === "blockquote") {
      return formatting.remove ? !isActive(state, name) || commands.lift(name)
        : isActive(state, name) || commands.wrapIn(name, formatting.attrs);
    }
    return commands.setNode(formatting.remove ? "paragraph" : name, formatting.remove ? undefined : formatting.attrs);
  }));
}
