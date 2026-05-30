"use client";

import { useEffect, useMemo, useRef } from "react";
import { EditorContent, ReactRenderer, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import type { Editor, JSONContent } from "@tiptap/core";

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
import { findCitaRange } from "@/lib/editor/findCita";
import type { Anotacion } from "@/lib/storage/types";

export function EditorPane() {
  const current = useStore((s) => s.current);
  const boardOpen = useStore((s) => s.boardOpen);
  const updateContent = useStore((s) => s.updateContent);
  const updateTitle = useStore((s) => s.updateTitle);

  // Mounting key — when the user opens a different essay, fully
  // remount the TipTap editor instead of trying to swap content.
  const essayId = current?.id ?? "none";

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
      <div key={essayId} className={innerClass}>
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
        }>
      ).detail;
      if (!detail) return;
      // Apply any anotaciones the user kept (may be empty — "clean" run).
      if (detail.anotaciones && detail.anotaciones.length > 0) {
        applyAnotaciones(editor, detail.anotaciones);
      }
      // Record the evaluation event itself, so the Benchmark knows
      // the council ran (vs. "never evaluated"). Pasadas cubiertas
      // drives the partial-coverage gate on a perfect 10/10.
      if (detail.pasadasCubiertas && detail.pasadasCubiertas.length > 0) {
        // Defer one tick so the mark-application's `updateContent`
        // flush settles first — `recordEvaluacion` reads `updatedAt`
        // and syncs `evaluadoEn` to it.
        queueMicrotask(() => {
          useStore.getState().recordEvaluacion(detail.pasadasCubiertas ?? []);
        });
      }
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
      editor.commands.removeAnnotationById(id);
    };
    window.addEventListener("pluma-roja:dismiss", handler as EventListener);
    return () =>
      window.removeEventListener(
        "pluma-roja:dismiss",
        handler as EventListener,
      );
  }, [editor]);

  // Benchmark drilldown also dispatches `pluma-roja:apply-suggestion`
  // when the user clicks "Aplicar" on a card. The editor replaces the
  // marked text with the sugerencia. Multi-block marks return false →
  // surface a toast so the user knows to apply manually.
  useEffect(() => {
    if (!editor) return;
    const handler = (e: Event) => {
      const detail = (
        e as CustomEvent<{ id: string; sugerencia: string }>
      ).detail;
      if (!detail?.id || !detail.sugerencia) return;
      const applied = editor.commands.applyAnnotationSuggestion(
        detail.id,
        detail.sugerencia,
      );
      if (!applied) {
        window.alert(
          "La sugerencia cruza varios bloques (párrafo/heading). Aplícala manualmente.",
        );
      }
    };
    window.addEventListener(
      "pluma-roja:apply-suggestion",
      handler as EventListener,
    );
    return () =>
      window.removeEventListener(
        "pluma-roja:apply-suggestion",
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

/**
 * Walk a batch of anotaciones, resolve each cita to a ProseMirror
 * range, and add the annotation mark. The `seenCitaCounts` map lets
 * repeated citas resolve to successive occurrences (avoids two flags
 * landing on top of each other for the same span).
 */
function applyAnotaciones(editor: Editor, anotaciones: Anotacion[]) {
  const seenCitaCounts = new Map<string, number>();
  const unresolved: Anotacion[] = [];
  for (const a of anotaciones) {
    const key = a.cita;
    const skip = seenCitaCounts.get(key) ?? 0;
    const range = findCitaRange(editor, a.cita, skip);
    if (!range) {
      unresolved.push(a);
      continue;
    }
    seenCitaCounts.set(key, skip + 1);
    editor
      .chain()
      .setAnnotation(range.from, range.to, {
        id: a.id,
        sage: a.sage,
        pase: a.pase,
        severidad: a.severidad,
        mensaje: a.mensaje,
        sugerencia: a.sugerencia ?? null,
        criterioId: a.criterioId ?? null,
      })
      .run();
  }
  if (unresolved.length > 0) {
    // Bubble unresolved anotaciones up via a follow-up event so the UI
    // can surface them (e.g. as a small list in the topbar). Not
    // surfaced in v1 — the click-popover only renders applied ones.
    window.dispatchEvent(
      new CustomEvent("pluma-roja:unresolved", {
        detail: { anotaciones: unresolved },
      }),
    );
  }
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
