"use client";

// Reading view of one note: the same sticky note drawn large over a veil, so a
// long note can be read without zooming the board. A sibling of <Tldraw>.
// Esc and a click on the veil close it; Editar hands the note back to the
// board in edit mode.

import { useEffect, useMemo, useRef } from "react";
import {
  renderPlaintextFromRichText,
  startEditingShapeWithRichText,
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

const ACTION =
  "cursor-pointer text-[14px] font-medium leading-[20px] text-ink-2 transition-colors duration-[120ms] hover:text-ink-1";

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
  return <Sheet editor={editor} note={note} />;
}

function Sheet({ editor, note }: { editor: Editor; note: TLNoteShape }) {
  const sheet = useRef<HTMLDivElement | null>(null);
  const close = () => useStore.getState().closeNote();
  useSheetBehavior({ open: true, onClose: close, sheet });

  const content = useStore((s) => s.current?.content);
  const findings = useStore((s) => s.current?.findings);
  const linked = useMemo(
    () => (content ? deriveFindings(content, findings).filter((v) => v.noteId === note.id) : []),
    [content, findings, note.id],
  );
  const firstLocated = linked.find((v) => v.located);

  const meta = note.meta as PostItMeta;
  const id = identityOf(meta.author, meta);
  const title = typeof meta.title === "string" ? meta.title : "";
  const reference = referenceOf(meta);
  const text = renderPlaintextFromRichText(editor, note.props.richText);

  const edit = () => {
    close();
    editor.select(note.id);
    startEditingShapeWithRichText(editor, note.id, { selectAll: false });
  };

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
        <div className="min-h-0 overflow-auto rounded-[3px] pt-[12px]" data-testid="note-reading-scroll">
          <StickyNote
            reading
            author={id.id}
            record={meta}
            title={title || undefined}
            width={560}
            authorTestId="note-reading-author"
          >
            <div className="whitespace-pre-wrap" data-testid="note-reading-text">
              {text}
            </div>
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
          </StickyNote>
        </div>
        <div className="flex flex-none items-center justify-center gap-[20px] rounded-[12px] bg-sheet px-[16px] py-[10px] shadow-(--shadow-sheet-compact)">
          <button type="button" className={ACTION} data-testid="note-reading-edit" onClick={edit}>
            Editar
          </button>
          {firstLocated ? (
            <button
              type="button"
              className={ACTION}
              data-testid="note-reading-essay"
              onClick={() => {
                close();
                requestAnimationFrame(() => revealFinding(firstLocated.id));
              }}
            >
              Ver en el ensayo
            </button>
          ) : null}
          {linked.length > 0 ? (
            <button
              type="button"
              className={ACTION}
              data-testid="note-reading-unlink"
              onClick={() => {
                for (const v of linked) linkFindingNote(v.id, null);
              }}
            >
              Quitar vínculo
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
