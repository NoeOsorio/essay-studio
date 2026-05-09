"use client";

import { useEffect, useRef, useState } from "react";
import type {
  PostItAuthor,
  PostItKind,
} from "./note-shape";

export type PostItDraft = {
  author: PostItAuthor;
  kind: PostItKind;
  text: string;
};

type Props = {
  open: boolean;
  initial?: PostItDraft;
  onCancel: () => void;
  onConfirm: (draft: PostItDraft) => void;
};

/**
 * Wrapper that mounts/unmounts the modal based on `open`. This means
 * the inner component's local state is created fresh every time the
 * modal opens — no setState-in-effect needed to reset.
 */
export function PostItModal(props: Props) {
  if (!props.open) return null;
  return <PostItModalInner {...props} />;
}

function PostItModalInner({ initial, onCancel, onConfirm }: Props) {

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

  const [author, setAuthor] = useState<PostItAuthor>(initial?.author ?? "tu");
  const [kind, setKind] = useState<PostItKind>(initial?.kind ?? "concepto");
  const [text, setText] = useState(initial?.text ?? "");
  const ref = useRef<HTMLTextAreaElement>(null);

  // Focus the textarea on mount (which now runs only when the modal opens).
  useEffect(() => {
    const id = requestAnimationFrame(() => ref.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  // Esc to cancel, Cmd/Ctrl+Enter to confirm.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        onConfirm({ author, kind, text: text.trim() });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [author, kind, text, onCancel, onConfirm]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink-1/30 backdrop-blur-[2px]"
      onClick={onCancel}
    >
      <div
        className="w-[420px] bg-paper-2 border border-rule-2 rounded-[14px] shadow-(--shadow-pop) p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="font-serif italic text-[18px] text-ink-1 mb-4">
          Nuevo post-it
        </div>

        <Field label="Autor">
          <div className="flex flex-wrap gap-1.5">
            {AUTHORS.map((a) => (
              <Pill
                key={a.key}
                active={author === a.key}
                tone={a.tone}
                onClick={() => setAuthor(a.key)}
              >
                {a.label}
              </Pill>
            ))}
          </div>
        </Field>

        <Field label="Tipo">
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((k) => (
              <Pill
                key={k.key}
                active={kind === k.key}
                tone="ink"
                onClick={() => setKind(k.key)}
              >
                {k.label}
              </Pill>
            ))}
          </div>
        </Field>

        <Field label="Texto">
          <textarea
            ref={ref}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Lo que estás pensando…"
            rows={4}
            className="w-full resize-none p-3 rounded-[8px] border border-rule-2 bg-paper text-ink-1 font-serif text-[14px] leading-[1.55] outline-none focus:border-rule-3"
          />
        </Field>

        <div className="flex items-center justify-between mt-4">
          <span className="font-mono text-[10px] text-ink-3 tracking-[0.06em]">
            <span className="kbd">⌘ ⏎</span> guardar · <span className="kbd">ESC</span> cancelar
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="h-8 px-3.5 rounded-[8px] border border-rule-2 bg-transparent text-ink-2 font-sans text-[12.5px] font-medium hover:bg-paper-3 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={text.trim().length === 0}
              onClick={() =>
                onConfirm({ author, kind, text: text.trim() })
              }
              className="h-8 px-4 rounded-[8px] bg-ink-1 text-paper border border-ink-1 font-sans text-[12.5px] font-medium hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              Crear
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block mb-3.5">
      <span className="font-mono text-[10px] font-semibold text-ink-3 uppercase tracking-[0.12em] mb-1.5 block">
        {label}
      </span>
      {children}
    </label>
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
    ? activeStyle[tone] ?? activeStyle.ink
    : "bg-transparent text-ink-2 border-rule-2 hover:bg-paper-3";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-7 px-3 rounded-full border font-sans text-[12px] font-medium cursor-pointer transition-colors ${cls}`}
    >
      {children}
    </button>
  );
}
