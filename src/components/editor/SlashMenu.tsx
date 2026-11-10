"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import type {
  SlashIcon,
  SlashItem,
  SlashSuggestionProps,
} from "./extensions/SlashCommand";

export type SlashMenuRef = {
  onKeyDown: (event: KeyboardEvent) => boolean;
};

export const SlashMenu = forwardRef<SlashMenuRef, SlashSuggestionProps>(
  function SlashMenu({ items, command }, ref) {
    const [selected, setSelected] = useState(0);

    // Clamp during render so we never index out of `items`. When the
    // query narrows the list, the highlight falls back to the last
    // visible item without a cascading state update.
    const safeSelected =
      items.length === 0 ? 0 : Math.min(selected, items.length - 1);

    useImperativeHandle(ref, () => ({
      onKeyDown: (event: KeyboardEvent): boolean => {
        if (items.length === 0) return false;
        if (event.key === "ArrowUp") {
          setSelected((s) => {
            const cur = Math.min(s, items.length - 1);
            return (cur + items.length - 1) % items.length;
          });
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelected((s) => {
            const cur = Math.min(s, items.length - 1);
            return (cur + 1) % items.length;
          });
          return true;
        }
        if (event.key === "Enter") {
          const item = items[safeSelected];
          if (item) command(item);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="w-[272px] rounded-[14px] bg-sheet p-[14px] font-sans text-[13px] leading-[18px] text-ink-3 shadow-[0_0_0_1px_#1D1B1814,0_16px_36px_-10px_#1D1B1833,0_2px_6px_#1D1B180F]">
          Sin resultados
        </div>
      );
    }

    return (
      <div
        data-testid="slash-menu"
        className="flex w-[272px] max-h-[420px] flex-col gap-[2px] overflow-y-auto thin-scroll rounded-[14px] bg-sheet p-[6px] shadow-[0_0_0_1px_#1D1B1814,0_16px_36px_-10px_#1D1B1833,0_2px_6px_#1D1B180F]"
      >
        {items.map((item, i) => (
          <SlashRow
            key={item.key}
            item={item}
            active={i === safeSelected}
            onMouseEnter={() => setSelected(i)}
            onClick={() => command(item)}
          />
        ))}
      </div>
    );
  },
);

const TILE = "grid place-items-center flex-none h-[30px] w-[30px] rounded-[8px] bg-sheet shadow-[0_0_0_1px_#1D1B1814]";
const STROKE = { fill: "none", stroke: "var(--color-ink-1)", strokeLinecap: "round", strokeLinejoin: "round" } as const;

function Glyph({ icon }: { icon: SlashIcon }) {
  const heading = (big: string, small: string, bigPx: number, smallPx: number) => (
    <span className="font-serif font-semibold leading-none text-ink-1">
      <span style={{ fontSize: bigPx }}>{big}</span>
      <span className="font-sans text-ink-3" style={{ fontSize: smallPx }}>
        {small}
      </span>
    </span>
  );
  switch (icon) {
    case "t1":
      return heading("T", "1", 19, 12);
    case "t2":
      return heading("T", "2", 15, 12);
    case "t3":
      return heading("T", "3", 12, 12);
    case "paragraph":
      return <span className="font-serif text-[17px] font-semibold leading-[18px] text-ink-1">¶</span>;
    case "quote":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 9.5c0-3 1.2-4.6 3.2-5.3M3 9.5h3v3H3v-3ZM9 9.5c0-3 1.2-4.6 3.2-5.3M9 9.5h3v3H9v-3Z" {...STROKE} strokeWidth="1.4" />
        </svg>
      );
    case "bullet":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="3.5" cy="4.5" r="1" fill="var(--color-ink-1)" />
          <circle cx="3.5" cy="8" r="1" fill="var(--color-ink-1)" />
          <circle cx="3.5" cy="11.5" r="1" fill="var(--color-ink-1)" />
          <path d="M6.5 4.5h7M6.5 8h7M6.5 11.5h7" {...STROKE} strokeWidth="1.4" />
        </svg>
      );
    case "ordered":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.5 3.5h1v3M2.5 6.5h2M2.5 9.5h2l-2 3h2M6.5 4.5h7M6.5 11h7" {...STROKE} strokeWidth="1.2" />
        </svg>
      );
    case "code":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5" {...STROKE} strokeWidth="1.4" />
        </svg>
      );
    case "divider":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.5 8h11" {...STROKE} strokeWidth="1.4" />
        </svg>
      );
  }
}

function SlashRow({
  item,
  active,
  onClick,
  onMouseEnter,
}: {
  item: SlashItem;
  active: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      // The editor keeps focus while the menu is open.
      onMouseDown={(e) => e.preventDefault()}
      data-active={active}
      className={`flex h-[44px] w-full flex-none cursor-pointer items-center gap-[12px] rounded-[9px] px-[8px] text-left ${
        active ? "bg-shade" : "bg-transparent"
      }`}
    >
      <span className={TILE} aria-hidden="true">
        <Glyph icon={item.icon} />
      </span>
      <span className="font-sans text-[14px] font-medium leading-[18px] text-ink-1">{item.title}</span>
    </button>
  );
}
