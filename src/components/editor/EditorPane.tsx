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
import {
  SlashCommand,
  type SlashSuggestionProps,
} from "./extensions/SlashCommand";

export function EditorPane() {
  const current = useStore((s) => s.current);
  const updateContent = useStore((s) => s.updateContent);
  const updateTitle = useStore((s) => s.updateTitle);

  // Mounting key — when the user opens a different essay, fully
  // remount the TipTap editor instead of trying to swap content.
  const essayId = current?.id ?? "none";

  if (!current) return null;

  return (
    <div className="relative overflow-y-auto thin-scroll bg-paper">
      {/* Single key on the wrapper: when the user opens a different
          essay, the whole subtree (title + editor + meta) remounts
          with the new initial values. */}
      <div key={essayId} className="px-[88px] pt-16 pb-[100px] max-w-none">
        <TitleInput
          initialValue={current.title === "Sin título" ? "" : current.title}
          onChange={updateTitle}
        />
        <DocMeta />
        <TipTapEditor
          initialContent={current.content}
          onChange={updateContent}
        />
        <SlashHint />
      </div>
    </div>
  );
}

function DocMeta() {
  const current = useStore((s) => s.current);
  if (!current) return null;
  const dot = (
    <span className="w-[3px] h-[3px] bg-ink-4 rounded-full inline-block" />
  );
  const editedAgo = relativeTime(current.updatedAt);
  return (
    <div className="font-mono text-[11px] text-ink-3 mb-12 tracking-[0.04em] flex gap-3 items-center">
      <span>{current.wordCount.toLocaleString("es")} palabras</span>
      {dot}
      <span>{current.mode}</span>
      {dot}
      <span>edit {editedAgo}</span>
    </div>
  );
}

function SlashHint() {
  return (
    <div className="font-mono text-[11px] text-ink-3 tracking-[0.04em] flex items-center gap-2.5 mt-8">
      <span className="kbd">/</span> insertar bloque
      <span className="text-ink-4">·</span>
      <span className="kbd">⌘ B</span> negrita
      <span className="text-ink-4">·</span>
      <span className="kbd">⌘ I</span> cursiva
    </div>
  );
}

function TipTapEditor({
  initialContent,
  onChange,
}: {
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
        placeholder: "Empieza a escribir, o usa “/” para insertar bloques…",
        showOnlyWhenEditable: true,
        showOnlyCurrent: true,
      }),
      CharacterCount.configure({}),
      SlashCommand.configure({ render: slashRenderer }),
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

  // Cleanup the floating menu if the editor unmounts mid-suggestion.
  useEffect(() => {
    return () => {
      slashRef.current.renderer?.destroy();
      slashRef.current.el?.remove();
    };
  }, []);

  return <EditorContent editor={editor} />;
}

function relativeTime(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms)) return "—";
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}
