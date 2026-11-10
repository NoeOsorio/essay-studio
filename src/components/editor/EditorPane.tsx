"use client";

import { useEffect, useMemo, useRef } from "react";
import { EditorContent, ReactRenderer, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import type { JSONContent } from "@tiptap/core";

import { useStore } from "@/lib/store";
import { TitleInput } from "./TitleInput";
import { SlashMenu, type SlashMenuRef } from "./SlashMenu";
import { SelectionMenu } from "./SelectionMenu";
import { AnnotationPopover } from "./AnnotationPopover";
import {
  SlashCommand,
  type SlashSuggestionProps,
} from "./extensions/SlashCommand";
import { Annotation } from "./extensions/Annotation";
import { registerDocument } from "@/lib/mcp/document";
import { HistoryPreview, useHistoryPreview } from "@/components/panels/HistoryPreview";

export function EditorPane() {
  const current = useStore((s) => s.current);
  const updateContent = useStore((s) => s.updateContent);
  const updateTitle = useStore((s) => s.updateTitle);
  const restoreNonce = useStore((s) => s.restoreNonce);
  // A version chosen in Historial is shown over the sheet. The live editor
  // below stays mounted and registered, so MCP edits, autosave and undo
  // never see the preview.
  const preview = useHistoryPreview();

  // Mounting key — when the user opens a different essay, fully
  // remount the TipTap editor instead of trying to swap content. We
  // also bump on `restoreNonce` so restoring a version forces a fresh
  // mount with the restored content (TipTap's `content` prop isn't
  // reactive after mount).
  const essayId = current?.id ?? "none";
  const subtreeKey = `${essayId}#${restoreNonce}`;

  if (!current) return null;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
    <div
      className="relative flex-1 min-h-0 overflow-y-auto thin-scroll"
      inert={preview ? true : undefined}
    >
      {/* Single key on the wrapper: when the user opens a different
          essay, the whole subtree (title + editor + meta) remounts
          with the new initial values. */}
      <div key={subtreeKey} className="flex flex-col gap-[28px] px-[72px] pt-[64px] pb-[40px]">
        <TitleInput
          essayId={essayId}
          initialValue={current.title === "Sin título" ? "" : current.title}
          onChange={updateTitle}
        />
        <TipTapEditor
          essayId={essayId}
          initialContent={current.content}
          onChange={updateContent}
        />
      </div>
    </div>
    {preview ? <HistoryPreview snapshot={preview} /> : null}
    </div>
  );
}

function TipTapEditor({
  essayId,
  initialContent,
  onChange,
}: {
  essayId: string;
  initialContent: JSONContent;
  onChange: (content: JSONContent, wordCount: number) => void;
}) {
  // Holds the React renderer for the slash menu so we can position
  // and update it from outside React.
  const slashRef = useRef<{
    renderer: ReactRenderer<SlashMenuRef> | null;
    el: HTMLDivElement | null;
  }>({ renderer: null, el: null });

  const slashRenderer = useMemo(
    () => () => {
      function position(rect: { top: number; left: number; bottom: number }) {
        const el = slashRef.current.el;
        if (!el) return;
        el.style.position = "fixed";
        el.style.top = `${rect.bottom + 6}px`;
        el.style.left = `${rect.left}px`;
        el.style.zIndex = "50";
      }

      return {
        onStart(props: SlashSuggestionProps) {
          if (!props.clientRect) return;
          const rect = props.clientRect();
          if (!rect) return;
          slashRef.current.renderer = new ReactRenderer(SlashMenu, {
            props,
            editor: props.editor,
          });
          const el = slashRef.current.renderer.element as HTMLDivElement;
          slashRef.current.el = el;
          document.body.appendChild(el);
          position(rect);
        },
        onUpdate(props: SlashSuggestionProps) {
          slashRef.current.renderer?.updateProps(props);
          if (!props.clientRect) return;
          const rect = props.clientRect();
          if (rect) position(rect);
        },
        onKeyDown(props: { event: KeyboardEvent }) {
          if (props.event.key === "Escape") {
            slashRef.current.renderer?.destroy();
            slashRef.current.el?.remove();
            slashRef.current = { renderer: null, el: null };
            return true;
          }
          return slashRef.current.renderer?.ref?.onKeyDown(props.event) ?? false;
        },
        onExit() {
          slashRef.current.renderer?.destroy();
          slashRef.current.el?.remove();
          slashRef.current = { renderer: null, el: null };
        },
      };
    },
    [],
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        // Enable hard break, but make Enter break out of lists/quotes naturally.
      }),
      Placeholder.configure({
        placeholder: "Escribe aquí, o pulsa /",
        showOnlyWhenEditable: true,
        showOnlyCurrent: true,
      }),
      CharacterCount.configure({}),
      SlashCommand.configure({ render: slashRenderer }),
      Annotation,
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: "tiptap-content focus:outline-none",
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor }) => {
      const wc = editor.storage.characterCount.words?.() ?? 0;
      onChange(editor.getJSON(), wc);
    },
    immediatelyRender: false,
  });

  useEffect(() => {
    if (!editor) return;
    return registerDocument(editor, essayId);
  }, [editor, essayId]);

  // Cleanup the floating menu if the editor unmounts mid-suggestion.
  useEffect(() => {
    return () => {
      slashRef.current.renderer?.destroy();
      slashRef.current.el?.remove();
    };
  }, []);

  // Sesión 17 — store.clearEvaluacion() despacha este event para
  // quitar TODAS las marks del doc de una sola pasada. El comando
  // clearAllAnnotations del Mark recorre el doc y removeMark cada
  // annotation. El onUpdate del editor dispara updateContent, así
  // que el flush + el reset de evaluacionMeta que hace la store
  // quedan consistentes.
  useEffect(() => {
    if (!editor) return;
    const handler = () => {
      editor.commands.clearAllAnnotations();
    };
    window.addEventListener("editor:clear-annotations", handler);
    return () =>
      window.removeEventListener("editor:clear-annotations", handler);
  }, [editor]);

  return (
    <>
      <EditorContent editor={editor} />
      <SelectionMenu editor={editor} />
      <AnnotationPopover editor={editor} />
    </>
  );
}
