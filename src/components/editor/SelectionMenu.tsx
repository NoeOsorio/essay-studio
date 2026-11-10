"use client";

import { BubbleMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/react";

import { AgentChip } from "@/components/ui/AgentChip";
import { Tooltip } from "@/components/ui/Tooltip";
import { AGENTS, type AgentId } from "@/lib/agent-identity";
import { useStore } from "@/lib/store";

/**
 * Floating bubble that appears over a non-empty selection in the
 * TipTap editor. Pick an agent to ask about the highlighted text;
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
        className="flex items-center gap-[6px] rounded-[12px] bg-sheet p-[5px] shadow-[0_0_0_1px_#1D1B1814,0_8px_24px_-6px_#1D1B1838]"
        data-testid="sage-selection-menu"
      >
        <span className="pl-[6px] font-sans text-[12px] font-medium leading-[16px] text-ink-3">
          Preguntas
        </span>
        {AGENTS.map((s) => (
          <Tooltip key={s.id} label={s.lens} side="top">
            <button
              type="button"
              aria-label={`Recibir preguntas de ${s.name}`}
              // Prevent the mousedown from blurring the editor (which
              // would collapse the selection before our onClick reads
              // it). Standard pattern for bubble-menu controls.
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                const { state } = editor;
                const { from, to } = state.selection;
                const text = state.doc.textBetween(from, to, " ").trim();
                if (text.length === 0) return;
                openLectura(s.id as AgentId, text, { instant: e.detail === 0 });
              }}
              className={`grid h-[24px] w-[24px] flex-none cursor-pointer place-items-center rounded-[5px] shadow-[inset_0_0_0_1px_#00000014] press ${s.chipClass}`}
            >
              <AgentChip author={s.id} size={14} />
            </button>
          </Tooltip>
        ))}
      </div>
    </BubbleMenu>
  );
}
