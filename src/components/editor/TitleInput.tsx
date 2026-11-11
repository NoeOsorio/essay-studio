"use client";

import { useEffect, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Document from "@tiptap/extension-document";
import { closeHistory } from "@tiptap/pm/history";
import { TextSelection } from "@tiptap/pm/state";
import { registerTitleInput } from "@/lib/mcp/document";
import { useStore } from "@/lib/store";

const TitleDocument = Document.extend({ content: "paragraph" });
const titleExtensions = [
  TitleDocument,
  StarterKit.configure({
    document: false, blockquote: false, bold: false, bulletList: false,
    code: false, codeBlock: false, dropcursor: false, gapcursor: false,
    hardBreak: false, heading: false, horizontalRule: false, italic: false,
    listItem: false, listKeymap: false, link: false, orderedList: false,
    strike: false, underline: false, trailingNode: false,
  }),
];
const singleLine = (text: string) => text.replace(/[\r\n\u2028\u2029]+/gu, " ");

type TitleInputProps = {
  essayId: string;
  initialValue: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

/** A plain title with an editor-local history, isolated from body and overlays. */
export function TitleInput({ essayId, initialValue, onChange, placeholder = "Título" }: TitleInputProps) {
  const [empty, setEmpty] = useState(initialValue.length === 0);
  const editor = useEditor({
    extensions: titleExtensions,
    content: { type: "doc", content: [{ type: "paragraph", ...(initialValue ? { content: [{ type: "text", text: singleLine(initialValue) }] } : {}) }] },
    immediatelyRender: false,
    editorProps: {
      attributes: {
        role: "textbox", "aria-label": "Título del ensayo", "aria-multiline": "false",
        "data-placeholder": placeholder, "data-empty": String(empty),
        class: "title-input relative font-serif font-medium text-[40px] tracking-[-0.015em] text-ink-1 leading-[46px] outline-none caret-ink-1 [&_p]:m-0 before:absolute before:inset-0",
        style: "min-height: 46px",
      },
      handleKeyDown(view, event) {
        if (event.key !== "Enter" || event.isComposing || view.composing) return false;
        event.preventDefault();
        view.dom.blur();
        return true;
      },
      handlePaste(view, event) {
        event.preventDefault();
        const text = singleLine(event.clipboardData?.getData("text/plain") ?? "");
        if (text) view.dispatch(view.state.tr.insertText(text));
        return true;
      },
      handleDrop(view, event, _slice, moved) {
        if (moved) return false;
        event.preventDefault();
        const text = singleLine(event.dataTransfer?.getData("text/plain") ?? "");
        if (text) {
          const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.from;
          view.dispatch(view.state.tr.insertText(text, at));
        }
        return true;
      },
    },
    onUpdate({ editor }) {
      if (useStore.getState().current?.id !== essayId) return;
      const text = editor.state.doc.textContent;
      setEmpty(text.length === 0);
      onChange(text);
    },
  }, [essayId]);

  useEffect(() => {
    if (!editor) return;
    return registerTitleInput(essayId, (title) => {
      if (editor.isDestroyed || !editor.isEditable || editor.view.composing || singleLine(title) !== title) return false;
      if (editor.state.doc.textContent === title) return true;
      // Native ProseMirror transactions give title changes their own undo stack.
      // They do not invoke WebKit's document-wide editable history.
      const tr = closeHistory(editor.state.tr).insertText(title, 1, editor.state.doc.content.size - 1);
      tr.setSelection(TextSelection.create(tr.doc, 1 + title.length));
      tr.doc.check();
      editor.view.dispatch(tr);
      editor.view.dispatch(closeHistory(editor.state.tr));
      editor.view.focus();
      return editor.state.doc.textContent === title;
    }, editor);
  }, [editor, essayId]);

  return <EditorContent editor={editor} />;
}
