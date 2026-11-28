"use client";

// Reading view of one note: the same sticky note drawn large over a veil, so a
// long note can be read and edited without zooming the board. A sibling of
// <Tldraw>. Title and text are editable in place and save on their own; Esc or
// a click on the veil close it. The whole editing session is one undo step.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  renderPlaintextFromRichText,
  toRichText,
  useValue,
  type Editor,
  type TLNoteShape,
} from "tldraw";
import { StickyNote } from "@/components/ui/StickyNote";
import { useSheetBehavior } from "@/components/ui/Popover";
import { identityOf } from "@/lib/agent-identity";
import { deriveFindings } from "@/lib/review/findings";
import { linkFindingNote, revealFinding } from "@/lib/review/actions";
import { useStore } from "@/lib/store";
import { referenceOf } from "@/lib/canvas/note-reference";
import type { PostItMeta } from "./note-shape";
import { ReferenceSection } from "./NoteReference";

/** Saves this long after the last keystroke, and always on close. */
const SAVE_DELAY_MS = 400;

const LINK =
  "flex h-[32px] items-center gap-[4px] cursor-pointer font-sans text-[13px] font-medium leading-[16px] text-ink-2 transition-colors duration-[120ms] hover:text-ink-1";
const QUIET =
  "flex h-[32px] items-center cursor-pointer font-sans text-[13px] leading-[16px] text-ink-3 transition-colors duration-[120ms] hover:text-ink-1";
const FIELD =
  "block w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-inherit outline-none placeholder:text-current placeholder:opacity-40 [font:inherit] [overflow-wrap:anywhere]";

export function NoteReading({ editor }: { editor: Editor }) {
  const noteView = useStore((s) => s.noteView);
  const noteId = noteView?.id ?? null;
  const note = useValue(
    "reading note",
    () => {
      if (!noteId) return null;
      const shape = editor.getShape(noteId as TLNoteShape["id"]);
      return shape && shape.type === "note" ? (shape as TLNoteShape) : null;
    },
    [editor, noteId],
  );

  // The note was deleted while it was open (undo, the assistant): nothing to read.
  useEffect(() => {
    if (noteId && !note) useStore.getState().closeNote();
  }, [noteId, note]);

  if (!note) return null;
  return <Sheet key={note.id} editor={editor} note={note} />;
}

/** A textarea that grows with its content, so the sheet scrolls, not the field. */
function useAutosize(value: string) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return ref;
}

function Sheet({ editor, note }: { editor: Editor; note: TLNoteShape }) {
  const sheet = useRef<HTMLDivElement | null>(null);

  const meta = note.meta as PostItMeta;
  const id = identityOf(meta.author, meta);
  const reference = referenceOf(meta);

  // Local drafts; the note itself is only written when they differ from it.
  const [title, setTitle] = useState(() => (typeof meta.title === "string" ? meta.title : ""));
  const [text, setText] = useState(() => renderPlaintextFromRichText(editor, note.props.richText));
  const titleRef = useAutosize(title);
  const textRef = useAutosize(text);
  const timer = useRef<number | null>(null);
  const marked = useRef(false);
  // Mirrors the drafts for save(), which also runs from timers and unmount.
  const latest = useRef({ title, text });

  const save = () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const shape = editor.getShape(note.id) as TLNoteShape | undefined;
    if (!shape) return;
    const { title: nextTitle, text: nextText } = latest.current;
    const savedTitle = typeof (shape.meta as PostItMeta).title === "string" ? ((shape.meta as PostItMeta).title as string) : "";
    const savedText = renderPlaintextFromRichText(editor, shape.props.richText);
    const titleChanged = nextTitle.trim() !== savedTitle;
    const textChanged = nextText !== savedText;
    if (!titleChanged && !textChanged) return;
    // One stopping point for the whole session: a single Cmd+Z undoes it.
    if (!marked.current) {
      editor.markHistoryStoppingPoint("note-reading-edit");
      marked.current = true;
    }
    editor.updateShape<TLNoteShape>({
      id: shape.id,
      type: "note",
      ...(textChanged ? { props: { richText: toRichText(nextText) } } : {}),
      ...(titleChanged ? { meta: { ...shape.meta, title: nextTitle.trim() } } : {}),
    });
  };

  const schedule = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(save, SAVE_DELAY_MS);
  };

  const close = () => {
    save();
    useStore.getState().closeNote();
  };
  useSheetBehavior({ open: true, onClose: close, sheet, keepFocus: true });

  // Whatever path closes the sheet, nothing typed is lost.
  useEffect(() => () => save(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Start with the cursor at the end of the text, ready to type.
  useEffect(() => {
    // After the frame: the double-click that opened the sheet finishes on the
    // board, which would otherwise take focus back.
    const raf = requestAnimationFrame(() => {
      const el = textRef.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      el.setSelectionRange(el.value.length, el.value.length);
    });
    return () => cancelAnimationFrame(raf);
  }, [textRef]);

  const content = useStore((s) => s.current?.content);
  const findings = useStore((s) => s.current?.findings);
  const linked = useMemo(
    () => (content ? deriveFindings(content, findings).filter((v) => v.noteId === note.id) : []),
    [content, findings, note.id],
  );
  const firstLocated = linked.find((v) => v.located);

  return (
    <div
      className="reading-veil fixed inset-0 z-[900] grid place-items-center bg-[#1D1B1866] p-[24px]"
      data-testid="note-reading"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={sheet}
        tabIndex={-1}
        role="dialog"
        aria-label={title || "Nota"}
        className="reading-sheet flex max-h-full flex-col gap-[14px] outline-none"
        style={{ width: 560, maxWidth: "100%" }}
      >
        <div className="min-h-0 overflow-y-auto overflow-x-hidden rounded-[3px] pt-[12px]" data-testid="note-reading-scroll">
          <StickyNote
            reading
            author={id.id}
            record={meta}
            title={
              <textarea
                ref={titleRef}
                rows={1}
                value={title}
                placeholder="Título"
                aria-label="Título de la nota"
                data-testid="note-reading-title"
                className={FIELD}
                onChange={(e) => {
                  const v = e.target.value.replace(/\n/g, " ");
                  latest.current = { ...latest.current, title: v };
                  setTitle(v);
                  schedule();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    textRef.current?.focus();
                  }
                }}
              />
            }
            width={560}
            authorTestId="note-reading-author"
          >
            <textarea
              ref={textRef}
              rows={1}
              value={text}
              placeholder="Escribe la nota"
              aria-label="Texto de la nota"
              data-testid="note-reading-text"
              className={FIELD}
              onChange={(e) => {
                latest.current = { ...latest.current, text: e.target.value };
                setText(e.target.value);
                schedule();
              }}
            />
            {reference ? (
              <ReferenceSection
                reference={reference}
                onOpenSource={() => {
                  const sourceId = reference.sourceId;
                  close();
                  if (sourceId) useStore.getState().showFuente(sourceId);
                }}
              />
            ) : null}
            {linked.length > 0 ? (
              <div className="mt-[24px] flex items-center gap-[16px] font-sans" data-testid="note-reading-actions">
                {firstLocated ? (
                  <button
                    type="button"
                    className={LINK}
                    data-testid="note-reading-essay"
                    onClick={() => {
                      close();
                      requestAnimationFrame(() => revealFinding(firstLocated.id));
                    }}
                  >
                    Ver en el ensayo
                    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5L8 6l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`${QUIET} ml-auto`}
                  data-testid="note-reading-unlink"
                  onClick={() => {
                    for (const v of linked) linkFindingNote(v.id, null);
                  }}
                >
                  Quitar vínculo
                </button>
              </div>
            ) : null}
          </StickyNote>
        </div>
      </div>
    </div>
  );
}
