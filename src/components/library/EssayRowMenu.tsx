"use client";

// The per-essay menu, shared by the desk cards and the ruled lines (Paper
// Slice 0, «Biblioteca, borrar y menús»). A «…» appears on hover and with
// the keyboard; a right click opens the same menu at the pointer. Items are
// a list, so Renombrar or Duplicar can join Borrar later.

import { useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { Panel } from "@/components/ui/Panel";
import { Popover } from "@/components/ui/Popover";
import { useStore } from "@/lib/store";
import { DotsIcon, TrashIcon } from "./icons";

type Props = {
  id: string;
  /** The title the confirmation quotes. */
  title: string;
  /** Where the «…» sits: bottom right of a card, or end of a ruled line. */
  placement: "card" | "featured" | "row";
  onOpen: () => void;
  className?: string;
  style?: CSSProperties;
  testId?: string;
  children: ReactNode;
};

type Stage = "closed" | "menu" | "confirm";

const DOTS_POS: Record<Props["placement"], string> = {
  card: "bottom-[60px] right-[8px]",
  featured: "bottom-[46px] right-[16px]",
  row: "top-[4px] right-[12px]",
};

export function EssayRowMenu({ id, title, placement, onOpen, className, style, testId, children }: Props) {
  const removeEssay = useStore((s) => s.removeEssay);
  const [stage, setStage] = useState<Stage>("closed");
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const dotsRef = useRef<HTMLButtonElement | null>(null);
  const pointRef = useRef<HTMLSpanElement | null>(null);
  const anchor = useRef<HTMLElement | null>(null);

  const openMenu = (fromPointer: { x: number; y: number } | null) => {
    setAt(fromPointer);
    anchor.current = fromPointer ? pointRef.current : dotsRef.current;
    setStage("menu");
  };

  const onContext = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const box = e.currentTarget.getBoundingClientRect();
    // The point span lives inside the wrapper and moves in the same commit
    // as the menu opens, before the popover measures its anchor.
    setAt({ x: e.clientX - box.left, y: e.clientY - box.top });
    anchor.current = pointRef.current;
    setStage("menu");
  };

  const close = () => setStage("closed");

  return (
    <div
      data-testid={testId}
      data-essay-id={id}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter") onOpen();
        if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
          e.preventDefault();
          openMenu(null);
        }
      }}
      onContextMenu={onContext}
      className={`group relative cursor-pointer outline-none ${className ?? ""}`}
      style={style}
    >
      {children}
      <button
        ref={dotsRef}
        type="button"
        aria-label="Más acciones"
        aria-haspopup="menu"
        aria-expanded={stage === "menu"}
        data-testid="essay-row-menu"
        onClick={(e) => {
          e.stopPropagation();
          openMenu(null);
        }}
        className={`absolute ${DOTS_POS[placement]} grid place-items-center h-[28px] w-[28px] rounded-[8px] cursor-pointer press shadow-[0_0_0_1px_#1D1B1814] transition-opacity duration-[var(--dur-press)] ease-out focus-visible:opacity-100 group-hover:opacity-100 ${
          stage === "menu" ? "opacity-100 bg-shade" : "opacity-0 bg-sheet"
        }`}
      >
        <DotsIcon />
      </button>
      <span
        ref={pointRef}
        aria-hidden
        className="pointer-events-none absolute"
        style={{ left: at?.x ?? 0, top: at?.y ?? 0, width: 0, height: 0 }}
      />
      <Popover
        anchor={anchor}
        open={stage === "menu"}
        onClose={close}
        align="start"
        width={140}
        testId="essay-row-menu-panel"
      >
        <div className="flex flex-col gap-[2px] p-[6px]" onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
          <button
            type="button"
            data-testid="essay-row-delete"
            onClick={() => setStage("confirm")}
            className="flex items-center gap-[8px] h-[34px] px-[10px] rounded-[8px] hover:bg-shade cursor-pointer text-left"
          >
            <TrashIcon />
            <span className="font-sans text-[13px] font-medium leading-[16px] text-ink-1">Borrar</span>
          </button>
        </div>
      </Popover>
      <Panel open={stage === "confirm"} onClose={close} width={340} testId="essay-delete-confirm">
        <div className="flex flex-col gap-[18px] p-[20px]" onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
          <div className="flex flex-col gap-[6px]">
            <div className="font-sans text-[15px] font-medium leading-[21px] text-ink-1">
              ¿Borrar «{title}»?
            </div>
            <div className="font-sans text-[13px] leading-[18px] text-ink-2">No se puede deshacer.</div>
          </div>
          <div className="flex justify-end gap-[8px]">
            <button
              type="button"
              onClick={close}
              className="flex items-center h-[36px] px-[16px] rounded-[10px] bg-shade press cursor-pointer font-sans text-[13px] font-medium leading-[16px] text-ink-1"
            >
              Cancelar
            </button>
            <button
              type="button"
              data-testid="essay-delete-confirm-ok"
              onClick={() => {
                close();
                void removeEssay(id);
              }}
              className="flex items-center h-[36px] px-[16px] rounded-[10px] bg-ink-1 press cursor-pointer font-sans text-[13px] font-medium leading-[16px] text-white"
            >
              Borrar
            </button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
