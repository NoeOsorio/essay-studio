"use client";

// Keep or discard, on hover of a note this run just landed (Paper R3.2 and
// R1.5). Lives outside <Tldraw>, like NoteBar. Mouse down is prevented so the
// board and the essay keep their focus; discarding peels the note away and is
// one undo step. The offer stays until the writer chooses, the next run
// starts, or the essay closes.

import { useEffect, useRef, useState } from "react";
import { useValue, type Editor } from "tldraw";
import { Tooltip } from "@/components/ui/Tooltip";
import { discardNote, keepNote } from "@/lib/questions/run";
import { useStore } from "@/lib/store";

export type LandedNoteActionsProps = { editor: Editor };

const BAR_WIDTH = 64;
const BAR_HEIGHT = 34;
const EDGE = 8;
const CLEARANCE = 4;
const HIDE_DELAY_MS = 140;

export function LandedNoteActions({ editor }: LandedNoteActionsProps) {
  const landed = useStore((s) => (s.questionRun?.essayId === s.current?.id ? s.questionRun?.justLanded : undefined));

  const hovered = useValue(
    "landed hover",
    () => {
      const id = editor.getHoveredShapeId();
      if (id && landed?.includes(id)) return id as string;
      const only = editor.getOnlySelectedShapeId();
      return only && landed?.includes(only) ? (only as string) : null;
    },
    [editor, landed],
  );

  // The pointer crossing from the note to the bar must not hide it.
  const overBar = useRef(false);
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (hovered) {
      const t = setTimeout(() => setShown(hovered), 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      if (!overBar.current) setShown(null);
    }, HIDE_DELAY_MS);
    return () => clearTimeout(t);
  }, [hovered]);

  const id = shown && landed?.includes(shown) ? shown : null;

  const place = useValue(
    "landed actions placement",
    () => {
      if (!id) return null;
      if (editor.isIn("select.translating")) return null;
      const bounds = editor.getShapePageBounds(id as never);
      if (!bounds) return null;
      const view = editor.getViewportScreenBounds();
      const topLeft = editor.pageToViewport({ x: bounds.x, y: bounds.y });
      const right = editor.pageToViewport({ x: bounds.x + bounds.w, y: bounds.y + bounds.h });
      // Like Paper (R3.2, 6FG-0): beside the note, 16 px past its right edge,
      // its bottom 12 px above the note's bottom. Past the board edge it goes to the left side.
      const maxLeft = Math.max(EDGE, view.w - BAR_WIDTH - EDGE);
      const clampTop = (y: number) => Math.min(Math.max(y, EDGE), Math.max(EDGE, view.h - BAR_HEIGHT - EDGE));
      // Every other note, in screen space: the bar never covers one.
      const others = editor
        .getCurrentPageShapes()
        .filter((sh) => sh.id !== id && sh.type === "note")
        .flatMap((sh) => {
          const b = editor.getShapePageBounds(sh.id);
          if (!b) return [];
          const a = editor.pageToViewport({ x: b.x, y: b.y });
          const z = editor.pageToViewport({ x: b.x + b.w, y: b.y + b.h });
          return [{ l: a.x, t: a.y, r: z.x, b: z.y }];
        });
      const clear = (left: number, top: number) =>
        left >= EDGE &&
        left <= maxLeft &&
        others.every(
          (o) =>
            left + BAR_WIDTH + CLEARANCE <= o.l ||
            left - CLEARANCE >= o.r ||
            top + BAR_HEIGHT + CLEARANCE <= o.t ||
            top - CLEARANCE >= o.b,
        );
      // Paper (R3.2, 6FG-0): 16 px past the note's right edge, bottom 12 px above its
      // bottom. If the next column is too close, the left side; if neither fits,
      // over the note's own top right corner.
      const top = clampTop(right.y - 12 - BAR_HEIGHT);
      const sides = [right.x + 16, topLeft.x - 16 - BAR_WIDTH];
      const side = sides.find((l) => clear(l, top));
      const left = side ?? Math.min(Math.max(right.x - BAR_WIDTH - 6, EDGE), maxLeft);
      if (side === undefined) return { left, top: clampTop(topLeft.y + 6) };
      return { left, top };
    },
    [editor, id],
  );

  if (!id || !place) return null;

  const act = (fn: (shapeId: string) => void) => {
    overBar.current = false;
    setShown(null);
    fn(id);
  };

  return (
    <div
      data-testid="landed-actions"
      data-board-surface
      className="absolute z-[4] flex gap-[2px] rounded-[10px] bg-sheet p-[3px] shadow-[0_0_0_1px_#1D1B1814,0_6px_16px_-6px_#1D1B1838]"
      style={{ left: place.left, top: place.top }}
      onMouseDown={(e) => e.preventDefault()}
      onMouseEnter={() => {
        overBar.current = true;
      }}
      onMouseLeave={() => {
        overBar.current = false;
        setShown(null);
      }}
    >
      <Tooltip label="Conservar" side="top">
        <button
          type="button"
          aria-label="Conservar"
          data-testid="landed-keep"
          onClick={() => act(keepNote)}
          className="grid h-[28px] w-[28px] flex-none cursor-pointer place-items-center rounded-[7px] hover:bg-shade"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 8.5l3 3 7-7" fill="none" stroke="var(--color-ink-1)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </Tooltip>
      <Tooltip label="Descartar" side="top">
        <button
          type="button"
          aria-label="Descartar"
          data-testid="landed-discard"
          onClick={() => act(discardNote)}
          className="grid h-[28px] w-[28px] flex-none cursor-pointer place-items-center rounded-[7px] hover:bg-shade"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" fill="none" stroke="var(--color-ink-2)" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </Tooltip>
    </div>
  );
}
