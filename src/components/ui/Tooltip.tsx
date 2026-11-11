"use client";

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";

const FIRST_DELAY_MS = 400;
const NEIGHBOR_WINDOW_MS = 300;

// Shared across every tooltip: while one is open, or within 300 ms of the
// last one closing, neighbors open at once.
let openCount = 0;
let lastClosedAt = 0;

function warm(): boolean {
  return openCount > 0 || Date.now() - lastClosedAt < NEIGHBOR_WINDOW_MS;
}

type TooltipProps = {
  label: string;
  shortcut?: string;
  side?: "top" | "bottom";
  /**
   * A sentence instead of a short label (Paper R3.5): 13 px, radius 10, 232 wide,
   * wrapping, with a pointer. Short labels with a shortcut keep the default form.
   */
  sentence?: boolean;
  children: ReactElement<{ "aria-describedby"?: string }>;
  /** Classes for the wrapper; default inline-flex. Use to let the trigger stretch in a flex row. */
  className?: string;
};

type Placement = { x: number; y: number; shift: number };

/** Paper R3.5: width of the sentence form, and how far it stays from the screen edge. */
const SENTENCE_WIDTH = 232;
const SENTENCE_GAP = 18;
const EDGE = 8;

export function Tooltip({ label, shortcut, side = "bottom", sentence = false, className, children }: TooltipProps) {
  const id = useId();
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [place, setPlace] = useState<Placement | null>(null);
  const [animate, setAnimate] = useState(true);
  const isOpen = place !== null;
  const openRef = useRef(false);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const show = useCallback(
    (withAnimation: boolean) => {
      const el = wrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setAnimate(withAnimation);
      const gap = sentence ? SENTENCE_GAP : 8;
      const center = r.left + r.width / 2;
      // The sentence form stays inside the window; its pointer keeps aiming at the trigger.
      const half = SENTENCE_WIDTH / 2;
      const x = sentence ? Math.min(Math.max(center, EDGE + half), window.innerWidth - EDGE - half) : center;
      setPlace({
        x,
        y: side === "bottom" ? r.bottom + gap : r.top - gap,
        shift: center - x,
      });
      if (!openRef.current) {
        openRef.current = true;
        openCount += 1;
      }
    },
    [side, sentence],
  );

  const hide = useCallback(() => {
    clearTimer();
    setPlace(null);
    if (openRef.current) {
      openRef.current = false;
      openCount = Math.max(0, openCount - 1);
      lastClosedAt = Date.now();
    }
  }, []);

  useEffect(() => hide, [hide]);

  const onEnter = () => {
    clearTimer();
    if (warm()) show(true);
    else timer.current = setTimeout(() => show(true), FIRST_DELAY_MS);
  };

  const onFocus = (e: React.FocusEvent) => {
    // Keyboard focus opens with no delay and no animation.
    if ((e.target as HTMLElement).matches(":focus-visible")) {
      clearTimer();
      show(false);
    }
  };

  const child = isValidElement(children)
    ? cloneElement(children, { "aria-describedby": isOpen ? id : undefined })
    : children;

  return (
    <>
      <span
        ref={wrapRef}
        className={className ?? "inline-flex"}
        onMouseEnter={onEnter}
        onMouseLeave={hide}
        onMouseDown={hide}
        onFocus={onFocus}
        onBlur={hide}
        onKeyDown={(e) => {
          if (e.key === "Escape") hide();
        }}
      >
        {child}
      </span>
      {place && typeof document !== "undefined"
        ? createPortal(
            <div
              style={{
                position: "fixed",
                left: place.x,
                top: place.y,
                transform: side === "bottom" ? "translateX(-50%)" : "translate(-50%, -100%)",
                zIndex: 1000,
                pointerEvents: "none",
              }}
            >
              {sentence ? (
                <div
                  id={id}
                  role="tooltip"
                  data-sentence
                  className={`${animate ? "tooltip-in" : ""} relative w-[232px] rounded-[10px] bg-ink-1 px-3 py-[10px] font-sans text-[13px] leading-[18px] text-white shadow-[0_8px_20px_-6px_#1D1B1838]`}
                >
                  {label}
                  <svg
                    width="14"
                    height="7"
                    viewBox="0 0 14 7"
                    aria-hidden="true"
                    className="absolute"
                    style={{
                      left: 109 + place.shift,
                      ...(side === "top" ? { bottom: -6 } : { top: -6, transform: "rotate(180deg)" }),
                    }}
                  >
                    <path d="M0 0L7 7L14 0Z" fill="var(--color-ink-1)" />
                  </svg>
                </div>
              ) : (
                <div
                  id={id}
                  role="tooltip"
                  className={`${animate ? "tooltip-in" : ""} flex items-center gap-2 whitespace-nowrap rounded-[6px] bg-ink-1 px-2 py-1 font-sans text-[12px] font-medium leading-[16px] text-paper-2`}
                >
                  <span>{label}</span>
                  {shortcut ? (
                    <span className="font-mono text-[12px] font-normal opacity-70">{shortcut}</span>
                  ) : null}
                </div>
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
