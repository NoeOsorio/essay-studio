"use client";

import { BubbleMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/react";

import { Avatar, type SageKey } from "@/components/ui/Avatar";
import { useStore } from "@/lib/store";

const SAGES: { key: SageKey; initials: string; name: string }[] = [
  { key: "em",  initials: "EM", name: "El Empirista" },
  { key: "sis", initials: "SI", name: "El Sistémico" },
  { key: "pra", initials: "PR", name: "El Práctico" },
  { key: "cri", initials: "CR", name: "El Crítico" },
];

/**
 * Floating bubble that appears over a non-empty selection in the
 * TipTap editor. Pick a sage to interrogate the highlighted text;
 * the overlay opens prefilled with that text.
 */
export function SelectionMenu({ editor }: { editor: Editor | null }) {
  const openLectura = useStore((s) => s.openLectura);

  if (!editor) return null;

  return (
    <BubbleMenu
      editor={editor}
      // Only show when the selection has content (skip empty ranges,
      // node-selection placeholders, and during composition).
      shouldShow={({ editor, state, from, to }) => {
        if (!editor.isEditable) return false;
        if (from === to) return false;
        const text = state.doc.textBetween(from, to, " ").trim();
        return text.length > 0;
      }}
    >
      <div
        className="flex items-center gap-1.5 px-2 py-1.5 bg-paper-2 border border-rule-2 rounded-full shadow-(--shadow-pop)"
        data-testid="sage-selection-menu"
      >
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-3 pl-1 pr-0.5">
          Interrogar
        </span>
        {SAGES.map((s) => (
          <button
            key={s.key}
            type="button"
            title={`${s.name} · interrogar selección`}
            aria-label={`Interrogar como ${s.name}`}
            // Prevent the mousedown from blurring the editor (which
            // would collapse the selection before our onClick reads
            // it). Standard pattern for bubble-menu controls.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const { state } = editor;
              const { from, to } = state.selection;
              const text = state.doc.textBetween(from, to, " ").trim();
              if (text.length === 0) return;
              openLectura(s.key, text);
            }}
            className="p-0 bg-transparent border-0 cursor-pointer transition-transform hover:scale-110"
          >
            <Avatar sage={s.key} initials={s.initials} size={22} title={s.name} />
          </button>
        ))}
      </div>
    </BubbleMenu>
  );
}
