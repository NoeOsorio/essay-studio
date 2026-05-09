"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import type {
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
        <div className="rounded-[10px] border border-rule-2 bg-paper-2 shadow-(--shadow-pop) p-3 text-[12px] font-mono text-ink-3">
          Sin resultados
        </div>
      );
    }

    return (
      <div className="rounded-[10px] border border-rule-2 bg-paper-2 shadow-(--shadow-pop) p-1.5 min-w-[260px] max-h-[320px] overflow-y-auto thin-scroll">
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
      className={`w-full text-left flex items-baseline gap-3 px-2.5 py-1.5 rounded-[6px] cursor-pointer transition-colors ${
        active ? "bg-paper-3" : "bg-transparent hover:bg-paper-3"
      }`}
    >
      <span className="font-serif text-[14px] text-ink-1">{item.title}</span>
      {item.hint ? (
        <span className="font-mono text-[10px] text-ink-3 tracking-[0.04em]">
          {item.hint}
        </span>
      ) : null}
    </button>
  );
}
