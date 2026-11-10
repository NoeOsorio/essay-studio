"use client";

// Board tools (Paper R2.1): bottom-left, icons only plus fit. Tooltips carry
// the names and keys. Zoom has no buttons; the wheel and the keyboard remain.

import type { ReactNode } from "react";
import { Tooltip } from "@/components/ui/Tooltip";

export type BoardTool = "select" | "postit" | "arrow";

type ToolbarProps = {
  active: BoardTool;
  onTool: (t: BoardTool) => void;
  onFit: () => void;
};

const STROKE = "var(--color-ink-2)";

function SelectGlyph({ on }: { on: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="flex-none">
      <path d="M4 2.5l8 5.2-3.6.9-1.7 3.4L4 2.5Z" fill={on ? "#FFFFFF" : "none"} stroke={on ? "#FFFFFF" : STROKE} strokeWidth={on ? 1.2 : 1.4} strokeLinejoin="round" />
    </svg>
  );
}

function NoteGlyph({ on }: { on: boolean }) {
  const c = on ? "#FFFFFF" : STROKE;
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="flex-none">
      <path d="M3 3h10v6.5L9.5 13H3V3Z" fill="none" stroke={c} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M9.5 13V9.5H13" fill="none" stroke={c} strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowGlyph({ on }: { on: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="flex-none">
      <path d="M3 13L13 3M7 3h6v6" fill="none" stroke={on ? "#FFFFFF" : STROKE} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FitGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="flex-none">
      <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" fill="none" stroke={STROKE} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BoardToolbar({ active, onTool, onFit }: ToolbarProps) {
  return (
    <div
      className="absolute left-[16px] bottom-[16px] z-[3] flex items-center gap-[2px] p-[4px] rounded-[12px] bg-sheet shadow-[0_0_0_1px_#1D1B1814,0_4px_14px_-4px_#1D1B182E]"
      onMouseDown={(e) => e.preventDefault()}
    >
      <ToolButton testId="board-tool-select" label="Seleccionar" shortcut="V" active={active === "select"} onClick={() => onTool("select")}>
        <SelectGlyph on={active === "select"} />
      </ToolButton>
      <ToolButton testId="board-tool-note" label="Nota" shortcut="N" active={active === "postit"} onClick={() => onTool("postit")}>
        <NoteGlyph on={active === "postit"} />
      </ToolButton>
      <ToolButton testId="board-tool-arrow" label="Flecha" shortcut="A" active={active === "arrow"} onClick={() => onTool("arrow")}>
        <ArrowGlyph on={active === "arrow"} />
      </ToolButton>
      <div aria-hidden="true" className="flex-none h-[18px] w-[1px] mx-[4px] bg-[#1D1B181A]" />
      <ToolButton testId="board-tool-fit" label="Ver todo" shortcut="⇧1" active={false} onClick={onFit}>
        <FitGlyph />
      </ToolButton>
    </div>
  );
}

function ToolButton({
  children,
  active,
  label,
  shortcut,
  testId,
  onClick,
}: {
  children: ReactNode;
  active: boolean;
  label: string;
  shortcut: string;
  testId: string;
  onClick: () => void;
}) {
  return (
    <Tooltip label={label} shortcut={shortcut} side="top">
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        data-testid={testId}
        data-active={active}
        onClick={onClick}
        className={`grid place-items-center flex-none h-[34px] w-[34px] rounded-[8px] press cursor-pointer ${
          active ? "bg-ink-1" : "bg-transparent hover:bg-shade"
        }`}
      >
        {children}
      </button>
    </Tooltip>
  );
}
