"use client";

// The bar that floats above the selected note (Paper R2.1): who wrote it, what
// kind it is, and delete. A sibling of <Tldraw>, never inside it, so the
// canvas background cannot swallow its clicks. Mouse down is prevented so the
// board keeps focus; the kind menu is a Popover that never moves focus either.

import { useRef, useState } from "react";
import { useValue, type Editor, type TLNoteShape } from "tldraw";
import { NOTE_AUTHORS, type AuthorId } from "@/lib/agent-identity";
import { peelNote } from "@/lib/canvas/note-motion";
import { Popover } from "@/components/ui/Popover";
import { Tooltip } from "@/components/ui/Tooltip";
import type { PostItKind, PostItMeta } from "./note-shape";

const KINDS: { key: PostItKind; label: string }[] = [
  { key: "concepto", label: "Concepto" },
  { key: "pregunta", label: "Pregunta" },
  { key: "conexion", label: "Conexión" },
  { key: "cita", label: "Cita" },
  { key: "critica", label: "Crítica" },
];

/** Rough width, only used to keep the bar inside the board. */
const BAR_WIDTH = 330;
const BAR_HEIGHT = 40;

type Placement = { left: number; top: number };

export function NoteBar({ editor }: { editor: Editor }) {
  const note = useValue(
    "note bar shape",
    () => {
      const id = editor.getOnlySelectedShapeId();
      if (!id) return null;
      const shape = editor.getShape(id);
      return shape && shape.type === "note" ? (shape as TLNoteShape) : null;
    },
    [editor],
  );

  const placement = useValue<Placement | null>(
    "note bar placement",
    () => {
      if (!note) return null;
      // Dragging moves the note under the pointer; the bar waits.
      if (editor.isIn("select.translating")) return null;
      const bounds = editor.getShapePageBounds(note.id);
      if (!bounds) return null;
      const view = editor.getViewportScreenBounds();
      const zoom = editor.getZoomLevel();
      const topLeft = editor.pageToViewport({ x: bounds.x, y: bounds.y });
      const left = Math.min(Math.max(topLeft.x - 4, 8), Math.max(8, view.w - BAR_WIDTH - 8));
      let top = topLeft.y - 58;
      if (top < 8) top = topLeft.y + bounds.h * zoom + 14;
      top = Math.min(top, Math.max(8, view.h - BAR_HEIGHT - 8));
      return { left, top };
    },
    [editor, note?.id],
  );

  if (!note || !placement) return null;
  return <Bar editor={editor} note={note} placement={placement} />;
}

function Bar({ editor, note, placement }: { editor: Editor; note: TLNoteShape; placement: Placement }) {
  const kindRef = useRef<HTMLButtonElement | null>(null);
  const [kindOpen, setKindOpen] = useState(false);

  const meta = (note.meta ?? {}) as PostItMeta;
  const author: AuthorId = NOTE_AUTHORS.find((a) => a.id === meta.author)?.id ?? "tu";
  const kind = KINDS.find((k) => k.key === meta.kind) ?? KINDS[0];

  // One undo step each: a stopping point, then the change.
  const updateMeta = (patch: Partial<PostItMeta>, mark: string) => {
    const next: PostItMeta = { ...meta, ...patch };
    // eslint-disable-next-line react-hooks/purity -- handler only
    if (next.createdAt === undefined) next.createdAt = Date.now();
    editor.markHistoryStoppingPoint(mark);
    editor.updateShape<TLNoteShape>({ id: note.id, type: "note", meta: { ...note.meta, ...next } });
  };

  return (
    <div
      data-testid="note-bar"
      className="absolute z-[4] flex items-center gap-[4px] p-[5px] rounded-[12px] bg-sheet shadow-[0_0_0_1px_#1D1B1814,0_8px_24px_-6px_#1D1B1838]"
      style={{ left: placement.left, top: placement.top }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div role="radiogroup" aria-label="Autor" className="flex items-center gap-[6px] px-[6px]">
        {NOTE_AUTHORS.map((a) => {
          const on = a.id === author;
          const Icon = a.Icon;
          return (
            <Tooltip key={a.id} label={a.name} side="top">
              <button
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={a.name}
                data-testid={`note-bar-author-${a.id}`}
                data-active={on}
                onClick={() => updateMeta({ author: a.id }, "note author")}
                className="grid place-items-center flex-none h-[24px] w-[24px] rounded-[5px] cursor-pointer"
                style={{
                  background: a.note,
                  color: a.ink,
                  boxShadow: on
                    ? "#1D1B1824 0 0 0 1px, var(--color-sheet) 0 0 0 2.5px, var(--color-ink-1) 0 0 0 4px"
                    : "#00000014 0 0 0 1px inset",
                }}
              >
                <Icon size={14} />
              </button>
            </Tooltip>
          );
        })}
      </div>

      <button
        ref={kindRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={kindOpen}
        data-testid="note-bar-kind"
        onClick={() => setKindOpen((v) => !v)}
        className="flex items-center gap-[6px] h-[28px] pl-[10px] pr-[8px] rounded-[8px] bg-shade cursor-pointer"
      >
        <span className="font-sans text-[13px] font-medium leading-[16px] text-ink-1">{kind.label}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="flex-none">
          <path d="M3 4.5L6 7.5L9 4.5" fill="none" stroke="var(--color-ink-2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <Popover
        anchor={kindRef}
        open={kindOpen}
        onClose={() => setKindOpen(false)}
        side="bottom"
        align="start"
        keepFocus
        instant
        width={176}
        testId="note-bar-kind-menu"
      >
        <div role="listbox" aria-label="Tipo de nota" className="flex flex-col gap-[2px] p-[6px]" onMouseDown={(e) => e.preventDefault()}>
          {KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              role="option"
              aria-selected={k.key === kind.key}
              data-testid={`note-bar-kind-${k.key}`}
              onClick={() => {
                updateMeta({ kind: k.key }, "note kind");
                setKindOpen(false);
              }}
              className={`flex items-center h-[32px] px-[10px] rounded-[8px] font-sans text-[13px] font-medium leading-[16px] text-ink-1 text-left cursor-pointer ${
                k.key === kind.key ? "bg-shade" : "hover:bg-shade"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
      </Popover>

      <Tooltip label="Quitar nota" shortcut="⌫" side="top">
        <button
          type="button"
          aria-label="Quitar nota"
          data-testid="note-bar-delete"
          onClick={() => peelNote(editor, note.id)}
          className="grid place-items-center flex-none h-[28px] w-[28px] rounded-[8px] hover:bg-shade cursor-pointer"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="flex-none">
            <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" fill="none" stroke="var(--color-ink-2)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </Tooltip>
    </div>
  );
}
