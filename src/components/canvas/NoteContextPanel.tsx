"use client";

import { useValue, type Editor, type TLNoteShape } from "tldraw";
import type { PostItAuthor, PostItKind, PostItMeta } from "./note-shape";

const AUTHORS: { key: PostItAuthor; label: string; tone: string }[] = [
  { key: "tu",  label: "TÚ",        tone: "ink" },
  { key: "em",  label: "Empirista", tone: "em"  },
  { key: "sis", label: "Sistémico", tone: "sis" },
  { key: "pra", label: "Práctico",  tone: "pra" },
  { key: "cri", label: "Crítico",   tone: "cri" },
];

const KINDS: { key: PostItKind; label: string }[] = [
  { key: "concepto", label: "Concepto" },
  { key: "pregunta", label: "Pregunta" },
  { key: "conexion", label: "Conexión" },
  { key: "cita",     label: "Cita" },
  { key: "critica",  label: "Crítica" },
];

/**
 * Floating panel that appears when a single note shape is selected.
 * Lets the user assign author + kind via pills; values are persisted
 * to the shape's `meta` field and survive saves.
 */
export function NoteContextPanel({ editor }: { editor: Editor }) {
  const selectedNote = useValue(
    "selected note",
    () => {
      const id = editor.getOnlySelectedShapeId();
      if (!id) return null;
      const shape = editor.getShape(id);
      if (!shape || shape.type !== "note") return null;
      return shape as TLNoteShape;
    },
    [editor],
  );

  if (!selectedNote) return null;

  const meta = (selectedNote.meta ?? {}) as PostItMeta;
  const author = meta.author ?? "tu";
  const kind = meta.kind ?? "concepto";

  const updateMeta = (patch: Partial<PostItMeta>) => {
    // Stamp createdAt the first time the user assigns author/kind, so
    // the timestamp on the note starts ticking from that moment. This
    // runs only inside click handlers, never during render.
    const next: PostItMeta = { ...meta, ...patch };
    if (next.createdAt === undefined) {
      // eslint-disable-next-line react-hooks/purity -- handler only
      next.createdAt = Date.now();
    }
    editor.updateShape({
      id: selectedNote.id,
      type: "note",
      meta: { ...selectedNote.meta, ...next },
    });
  };

  return (
    <div
      className="absolute z-[5] bg-paper-2 border border-rule-2 rounded-[10px] shadow-(--shadow-pop) p-3 flex flex-col gap-2.5"
      style={{ right: 14, top: 110, width: 240 }}
    >
      <Group label="Autor">
        {AUTHORS.map((a) => (
          <Pill
            key={a.key}
            active={author === a.key}
            tone={a.tone}
            onClick={() => updateMeta({ author: a.key })}
          >
            {a.label}
          </Pill>
        ))}
      </Group>

      <Group label="Tipo">
        {KINDS.map((k) => (
          <Pill
            key={k.key}
            active={kind === k.key}
            tone="ink"
            onClick={() => updateMeta({ kind: k.key })}
          >
            {k.label}
          </Pill>
        ))}
      </Group>
    </div>
  );
}

function Group({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[9px] font-semibold text-ink-3 uppercase tracking-[0.14em]">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function Pill({
  children,
  active,
  tone,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  tone: string;
  onClick: () => void;
}) {
  const activeStyle: Record<string, string> = {
    ink: "bg-ink-1 text-paper border-ink-1",
    em:  "bg-em-bg  text-em-ink  border-em",
    sis: "bg-sis-bg text-sis-ink border-sis",
    pra: "bg-pra-bg text-pra-ink border-pra",
    cri: "bg-cri-bg text-cri-ink border-cri",
  };
  const cls = active
    ? (activeStyle[tone] ?? activeStyle.ink)
    : "bg-transparent text-ink-2 border-rule-2 hover:bg-paper-3";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-6 px-2.5 rounded-full border font-sans text-[11px] font-medium cursor-pointer transition-colors ${cls}`}
    >
      {children}
    </button>
  );
}
