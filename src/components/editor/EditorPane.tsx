"use client";

import { useEffect, useMemo, useRef } from "react";
import { EditorContent, ReactRenderer, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import type { JSONContent } from "@tiptap/core";

import { useStore } from "@/lib/store";
import type { Pase } from "@/lib/storage/types";
import { TitleInput } from "./TitleInput";
import { SlashMenu, type SlashMenuRef } from "./SlashMenu";
import { SelectionMenu } from "./SelectionMenu";
import { AnnotationPopover } from "./AnnotationPopover";
import {
  SlashCommand,
  type SlashSuggestionProps,
} from "./extensions/SlashCommand";
import { Annotation } from "./extensions/Annotation";
import { applyEvaluation, editAnnotations } from "@/lib/reviews/actions";
import type { Anotacion, ReviewProvenance } from "@/lib/storage/types";
import { registerDocument } from "@/lib/mcp/document";

export function EditorPane() {
  const current = useStore((s) => s.current);
  const boardOpen = useStore((s) => s.boardOpen);
  const updateContent = useStore((s) => s.updateContent);
  const updateTitle = useStore((s) => s.updateTitle);
  const restoreNonce = useStore((s) => s.restoreNonce);

  // Mounting key — when the user opens a different essay, fully
  // remount the TipTap editor instead of trying to swap content. We
  // also bump on `restoreNonce` so restoring a version forces a fresh
  // mount with the restored content (TipTap's `content` prop isn't
  // reactive after mount).
  const essayId = current?.id ?? "none";
  const subtreeKey = `${essayId}#${restoreNonce}`;

  if (!current) return null;

  // When the board is hidden, the editor pane gets the full width
  // of the window. Center the prose column so it doesn't read as a
  // wall hugging the left margin.
  const innerClass = boardOpen
    ? "px-[88px] pt-16 pb-[100px] max-w-none"
    : "px-[88px] pt-16 pb-[100px] max-w-[920px] mx-auto";

  return (
    <div className="relative overflow-y-auto thin-scroll bg-paper">
      {/* Single key on the wrapper: when the user opens a different
          essay, the whole subtree (title + editor + meta) remounts
          with the new initial values. */}
      <div key={subtreeKey} className={innerClass}>
        <TitleInput
          essayId={essayId}
          initialValue={current.title === "Sin título" ? "" : current.title}
          onChange={updateTitle}
        />
        <DocMeta />
        <TipTapEditor
          essayId={essayId}
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
      <span className="kbd">⌘ B</span> negrita
      <span className="kbd">⌘ I</span> cursiva
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
        placeholder: "Empieza a escribir, o usa “/” para insertar bloques…",
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

  // Pluma Roja → apply selected anotaciones as annotation marks. The
  // event detail carries an array of Anotacion objects already filtered
  // to "checked" by the modal; we resolve each cita to a doc range and
  // add the mark with all its attrs. Citas not found get logged + a
  // toast-ish window event so the modal can show a fallback list.
  useEffect(() => {
    if (!editor) return;
    const handler = (e: Event) => {
      const detail = (
        e as CustomEvent<{
          anotaciones: Anotacion[];
          pasadasCubiertas?: Pase[];
          reviewerRuns?: { pase: Pase; provenance?: ReviewProvenance }[];
        }>
      ).detail;
      if (!detail) return;
      const essayId = useStore.getState().current?.id;
      if (!essayId) return;
      applyEvaluation(essayId, detail.anotaciones ?? [], detail.pasadasCubiertas ?? [], detail.reviewerRuns);
    };
    window.addEventListener("pluma-roja:apply", handler as EventListener);
    return () =>
      window.removeEventListener(
        "pluma-roja:apply",
        handler as EventListener,
      );
  }, [editor]);

  // Benchmark drilldown dispatches `pluma-roja:dismiss` when the user
  // clicks "Descartar" on an anotación card. Same TipTap command path
  // the popover uses — keeps the doc as the single source of truth.
  useEffect(() => {
    if (!editor) return;
    const handler = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      if (!id) return;
      const essayId = useStore.getState().current?.id;
      if (essayId) editAnnotations({ essayId, operation: "discard", ids: [id] });
    };
    window.addEventListener("pluma-roja:dismiss", handler as EventListener);
    return () =>
      window.removeEventListener(
        "pluma-roja:dismiss",
        handler as EventListener,
      );
  }, [editor]);

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

  // Popover / drilldown despachan `pluma-roja:apply-reemplazo` cuando
  // el usuario aprieta "Reemplazar" en una anotación. El editor
  // sustituye el texto marcado por el reemplazo. Multi-block marks
  // devuelven false → surface un alert para que el usuario sepa
  // que tiene que aplicarlo manualmente.
  useEffect(() => {
    if (!editor) return;
    const handler = (e: Event) => {
      const detail = (
        e as CustomEvent<{ id: string; reemplazo: string }>
      ).detail;
      if (!detail?.id || !detail.reemplazo) return;
      const essayId = useStore.getState().current?.id;
      if (!essayId) return;
      try { editAnnotations({ essayId, operation: "apply", ids: [detail.id] }); }
      catch { window.alert("No se puede aplicar este reemplazo. Edita el texto directamente."); }
    };
    window.addEventListener(
      "pluma-roja:apply-reemplazo",
      handler as EventListener,
    );
    return () =>
      window.removeEventListener(
        "pluma-roja:apply-reemplazo",
        handler as EventListener,
      );
  }, [editor]);

  return (
    <>
      <EditorContent editor={editor} />
      <SelectionMenu editor={editor} />
      <AnnotationPopover editor={editor} />
    </>
  );
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
