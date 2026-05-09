import type { SVGProps } from "react";

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
