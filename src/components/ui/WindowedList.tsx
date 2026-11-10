"use client";

import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

type WindowedListProps<T> = {
  items: readonly T[];
  /** Fixed height of every row, in px. */
  rowHeight: number;
  /** Gap between rows, in px. */
  gap?: number;
  /** Extra rows rendered above and below what shows. */
  overscan?: number;
  getKey: (item: T, index: number) => string;
  renderRow: (item: T, index: number) => ReactNode;
  className?: string;
  style?: CSSProperties;
  testId?: string;
  /** Scrolls this row to the middle. Pass a new object to scroll again. */
  reveal?: { index: number } | null;
};

/**
 * A scrolling list that renders only the rows in view. Every row has the same
 * height, so the window is plain arithmetic and 1000 rows cost what 20 do. It
 * is the scroll container itself: give it a height (or flex-1 with min-h-0).
 */
export function WindowedList<T>({
  items,
  rowHeight,
  gap = 0,
  overscan = 6,
  getKey,
  renderRow,
  className = "",
  style,
  testId,
  reveal,
}: WindowedListProps<T>) {
  const box = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(600);

  const step = rowHeight + gap;

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    setViewport(el.clientHeight);
    const observer = new ResizeObserver(() => setViewport(el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !reveal) return;
    const target = reveal.index * step - (el.clientHeight - rowHeight) / 2;
    el.scrollTop = Math.max(0, target);
    setScrollTop(el.scrollTop);
  }, [reveal, step, rowHeight]);

  const onScroll = useCallback(() => {
    const el = box.current;
    if (el) setScrollTop(el.scrollTop);
  }, []);

  const total = items.length === 0 ? 0 : items.length * step - gap;
  const first = Math.max(0, Math.floor(scrollTop / step) - overscan);
  const last = Math.min(items.length, Math.ceil((scrollTop + viewport) / step) + overscan);

  const rows: ReactNode[] = [];
  for (let i = first; i < last; i++) {
    const item = items[i];
    rows.push(
      <div
        key={getKey(item, i)}
        style={{ position: "absolute", left: 0, right: 0, top: i * step, height: rowHeight }}
      >
        {renderRow(item, i)}
      </div>,
    );
  }

  return (
    <div ref={box} onScroll={onScroll} data-testid={testId} className={`overflow-y-auto thin-scroll ${className}`} style={style}>
      <div style={{ position: "relative", height: total }}>{rows}</div>
    </div>
  );
}
