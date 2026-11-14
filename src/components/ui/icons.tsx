import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = (p: IconProps) => ({ width: 15, height: 15, ...p });

export function ChevronLeft(p: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} {...base(p)}>
      <path d="M10 3 L5 8 L10 13" />
    </svg>
  );
}

export function MoreHorizontal(p: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" {...base(p)}>
      <circle cx="3" cy="8" r="1.4" />
      <circle cx="8" cy="8" r="1.4" />
      <circle cx="13" cy="8" r="1.4" />
    </svg>
  );
}

export function GripDots(p: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" width={12} height={12} {...p}>
      <circle cx="6"  cy="4"  r="1.2" />
      <circle cx="10" cy="4"  r="1.2" />
      <circle cx="6"  cy="8"  r="1.2" />
      <circle cx="10" cy="8"  r="1.2" />
      <circle cx="6"  cy="12" r="1.2" />
      <circle cx="10" cy="12" r="1.2" />
    </svg>
  );
}

export function GroupIcon(p: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} {...base(p)}>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  );
}

export function CursorIcon(p: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" {...base(p)}>
      <path d="M3 2 L13 8 L8 9 L7 14 Z" />
    </svg>
  );
}

export function StickyIcon(p: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} {...base(p)}>
      <rect x="3" y="2.5" width="10" height="11" rx="1" />
    </svg>
  );
}

export function ArrowIcon(p: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} {...base(p)}>
      <path d="M2 8 L13 8 M9 4 L13 8 L9 12" />
    </svg>
  );
}

export function GroupDashedIcon(p: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} {...base(p)}>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" strokeDasharray="2 2" />
    </svg>
  );
}

export function MicIcon(p: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" {...base(p)}>
      <rect x="6" y="2" width="4" height="8" rx="2" />
      <path d="M3.5 8a4.5 4.5 0 0 0 9 0" stroke="currentColor" strokeWidth={1.3} fill="none" />
      <line x1="8" y1="12.5" x2="8" y2="14.5" stroke="currentColor" strokeWidth={1.3} />
    </svg>
  );
}

export function ZoomMinus(p: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} {...base(p)}>
      <line x1="3" y1="8" x2="13" y2="8" />
    </svg>
  );
}

export function ZoomPlus(p: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} {...base(p)}>
      <line x1="3" y1="8" x2="13" y2="8" />
      <line x1="8" y1="3" x2="8" y2="13" />
    </svg>
  );
}

export function ZoomFit(p: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} {...base(p)}>
      <path d="M3 6 V3 H6 M10 3 H13 V6 M13 10 V13 H10 M6 13 H3 V10" />
    </svg>
  );
}

/** Frame with a right-hand sidebar; the sidebar fills when `active`. */
export function PanelRightIcon({ active = false, ...p }: IconProps & { active?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} {...base(p)}>
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <line x1="10" y1="3" x2="10" y2="13" />
      {active ? (
        <rect x="10" y="3" width="4" height="10" fill="currentColor" stroke="none" />
      ) : null}
    </svg>
  );
}

/* ---------------------------------------------------------
   Agent glyphs. 16 px grid, 1.6 stroke, colored by the caller
   through `currentColor` (copied from the Paper agent chips).
   --------------------------------------------------------- */
type GlyphProps = { size?: number };

function glyph(size: number | undefined, children: ReactNode) {
  const s = size ?? 16;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: "inline-block", flexShrink: 0 }}
    >
      {children}
    </svg>
  );
}

/** Evidencia: magnifier. */
export function GlyphEvidencia({ size }: GlyphProps) {
  return glyph(
    size,
    <>
      <circle cx="7" cy="7" r="4.25" />
      <path d="M10.2 10.2L13.5 13.5" />
    </>,
  );
}

/** Sistemas: two arrows chasing each other. */
export function GlyphSistemas({ size }: GlyphProps) {
  return glyph(
    size,
    <>
      <path d="M12.6 6.2A5 5 0 0 0 3.6 5" />
      <path d="M3.4 9.8a5 5 0 0 0 9 1.2" />
      <path d="M3.2 2.6v2.6h2.6M12.8 13.4v-2.6h-2.6" />
    </>,
  );
}

/** Práctica: target. */
export function GlyphPractica({ size }: GlyphProps) {
  return glyph(
    size,
    <>
      <circle cx="8" cy="8" r="5.5" />
      <circle cx="8" cy="8" r="2.2" fill="currentColor" />
    </>,
  );
}

/** Objeciones: opposing arrows. */
export function GlyphObjeciones({ size }: GlyphProps) {
  return glyph(
    size,
    <>
      <path d="M2.5 5.5h10M10 3l2.5 2.5L10 8" />
      <path d="M13.5 10.5h-10M6 8l-2.5 2.5L6 13" />
    </>,
  );
}

/** Tú: pencil. */
export function GlyphTu({ size }: GlyphProps) {
  return glyph(
    size,
    <>
      <path d="M3 13l.8-3L10.6 3.2a1.4 1.4 0 0 1 2 0l.2.2a1.4 1.4 0 0 1 0 2L6 12.2z" />
      <path d="M9.4 4.4l2.2 2.2" />
    </>,
  );
}

/* Glyphs for the agents the writer makes. Same 16 px grid and stroke as above. */

/** Spelling: an A with a check. */
export function GlyphOrtografia({ size }: GlyphProps) {
  return glyph(
    size,
    <>
      <path d="M2.4 11.2L5.6 3.6l3.2 7.6M3.5 8.8h4.2" />
      <path d="M9.6 11.2l1.8 1.8 3-3.6" />
    </>,
  );
}

/** Pen. */
export function GlyphPluma({ size }: GlyphProps) {
  return glyph(
    size,
    <>
      <path d="M10.8 2.8l2.4 2.4-7.4 7.4-3.2.8.8-3.2z" />
      <path d="M9.2 4.4l2.4 2.4" />
    </>,
  );
}

/** Book. */
export function GlyphLibro({ size }: GlyphProps) {
  return glyph(
    size,
    <>
      <path d="M8 4.2C6.8 3.2 5 2.8 2.6 3v8.8c2.4-.2 4.2.2 5.4 1.2 1.2-1 3-1.4 5.4-1.2V3c-2.4-.2-4.2.2-5.4 1.2z" />
      <path d="M8 4.2V13" />
    </>,
  );
}

/** Quote marks. */
export function GlyphCita({ size }: GlyphProps) {
  return glyph(
    size,
    <>
      <path d="M3 9.6V8c0-2.2 1-3.4 2.8-3.8M3 9.6h2.8V12H3z" />
      <path d="M9.2 9.6V8c0-2.2 1-3.4 2.8-3.8M9.2 9.6H12V12H9.2z" />
    </>,
  );
}

/** List. */
export function GlyphLista({ size }: GlyphProps) {
  return glyph(
    size,
    <>
      <path d="M6.2 4.4h7M6.2 8h7M6.2 11.6h7" />
      <path d="M2.8 4.4h.01M2.8 8h.01M2.8 11.6h.01" />
    </>,
  );
}

/** Spark. */
export function GlyphChispa({ size }: GlyphProps) {
  return glyph(
    size,
    <>
      <path d="M8 2.2c.5 3.4 1.6 4.5 5 5-3.4.5-4.5 1.6-5 5-.5-3.4-1.6-4.5-5-5 3.4-.5 4.5-1.6 5-5z" />
    </>,
  );
}
