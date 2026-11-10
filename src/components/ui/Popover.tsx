"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

// Paper R4.1, R5.1 (panels and cards): radius 16, a 1 px ring and a warm
// drop in one shadow, no border. R6.5 evidence is the compact size: radius 14
// and the lighter ring shadow Paper uses on cards.
export const SHEET_CLASS =
  "bg-sheet rounded-[16px] shadow-(--shadow-sheet) text-ink-1 outline-none";
export const SHEET_COMPACT_CLASS =
  "bg-sheet rounded-[14px] shadow-(--shadow-sheet-compact) text-ink-1 outline-none";

// Open sheets, oldest first. Esc closes only the last one.
const openSheets: object[] = [];

/**
 * Behavior shared by Popover and Panel: Esc in capture phase with
 * stopImmediatePropagation (so tldraw and the sheet do not both react),
 * outside pointer down, and focus restore.
 */
export function useSheetBehavior(opts: {
  open: boolean;
  onClose: () => void;
  sheet: RefObject<HTMLElement | null>;
  /** Elements whose pointer down must not count as outside. */
  ignore?: RefObject<HTMLElement | null>;
  /** Where focus returns on close; default is the element focused on open. */
  returnTo?: RefObject<HTMLElement | null>;
  keepFocus?: boolean;
  /** Stay open on outside pointer down, so the text behind stays editable. */
  persistent?: boolean;
}) {
  const { open, onClose, sheet, ignore, returnTo, keepFocus, persistent } = opts;
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const prior = document.activeElement as HTMLElement | null;
    const returnEl = returnTo?.current ?? null;
    if (!keepFocus) sheet.current?.focus({ preventScroll: true });
    const token = {};
    openSheets.push(token);

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (openSheets[openSheets.length - 1] !== token) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      closeRef.current();
    };
    const onDown = (e: PointerEvent) => {
      if (persistent) return;
      const t = e.target as Node | null;
      if (!t) return;
      if (sheet.current?.contains(t)) return;
      // A sheet opened from this one (the evidence card) does not count as outside.
      if (t instanceof Element && t.closest("[data-keeps-parent]")) return;
      if (ignore?.current?.contains(t)) return;
      closeRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown, true);
      const at = openSheets.indexOf(token);
      if (at >= 0) openSheets.splice(at, 1);
      if (!keepFocus) {
        const target = returnEl ?? prior;
        if (target && document.contains(target)) target.focus({ preventScroll: true });
      }
    };
  }, [open, keepFocus, persistent, sheet, ignore, returnTo]);
}

type PopoverProps = {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
  keepFocus?: boolean;
  instant?: boolean;
  width?: number;
  /** Shift from the aligned position, in px. */
  offset?: { x?: number; y?: number };
  persistent?: boolean;
  size?: "regular" | "compact";
  testId?: string;
  /**
   * Place the sheet beside this element (right of it, left when there is no
   * room) instead of under the anchor; the anchor then only sets the top.
   */
  besideOf?: RefObject<HTMLElement | null>;
  /** With besideOf: align the sheet's top with this element instead of the anchor. */
  topOf?: RefObject<HTMLElement | null>;
  /** Keep this many px free at the bottom of the window (a floating toolbar). */
  clearBottom?: number;
  /** The sheet belongs to another sheet: pressing on it does not close that one. */
  keepsParent?: boolean;
  children: ReactNode;
};

type Pos = { left: number; top: number; originX: number; originY: number };

const GAP = 8;
const MARGIN = 10;

export function Popover({
  anchor,
  open,
  onClose,
  side = "bottom",
  align = "end",
  keepFocus,
  instant,
  width,
  offset,
  persistent,
  size = "regular",
  testId,
  besideOf,
  topOf,
  clearBottom = 0,
  keepsParent,
  children,
}: PopoverProps) {
  const sheet = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<Pos | null>(null);

  const dx = offset?.x ?? 0;
  const dy = offset?.y ?? 0;

  useSheetBehavior({ open, onClose, sheet, ignore: anchor, returnTo: anchor, keepFocus, persistent });

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      const el = sheet.current;
      if (!a || !el) return;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let s = side;
      const fitsBottom = a.bottom + GAP + h <= vh - MARGIN;
      const fitsTop = a.top - GAP - h >= MARGIN;
      if (s === "bottom" && !fitsBottom && fitsTop) s = "top";
      else if (s === "top" && !fitsTop && fitsBottom) s = "bottom";

      let left =
        align === "start" ? a.left : align === "center" ? a.left + a.width / 2 - w / 2 : a.right - w;
      let top = s === "bottom" ? a.bottom + GAP + dy : a.top - GAP - h - dy;
      const beside = besideOf?.current?.getBoundingClientRect();
      if (beside) {
        left = beside.right + GAP + dx;
        if (left + w > vw - MARGIN) left = beside.left - GAP - w - dx;
        top = (topOf?.current?.getBoundingClientRect().top ?? a.top) + dy;
      }
      left = Math.min(Math.max(left + (beside ? 0 : dx), MARGIN), Math.max(MARGIN, vw - w - MARGIN));
      top = Math.min(Math.max(top, MARGIN), Math.max(MARGIN, vh - h - MARGIN - clearBottom));

      const cx = a.left + a.width / 2;
      setPos({
        left,
        top,
        originX: Math.min(Math.max(cx - left, 0), w),
        originY: s === "bottom" ? 0 : h,
      });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, anchor, side, align, width, dx, dy, besideOf, topOf, clearBottom]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={sheet}
      tabIndex={-1}
      data-testid={testId}
      data-sheet=""
      data-keeps-parent={keepsParent ? "" : undefined}
      className={`${size === "compact" ? SHEET_COMPACT_CLASS : SHEET_CLASS} ${instant ? "" : "sheet-in"}`}
      style={{
        position: "fixed",
        zIndex: 900,
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        width,
        visibility: pos ? "visible" : "hidden",
        transformOrigin: pos ? `${pos.originX}px ${pos.originY}px` : "0 0",
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
