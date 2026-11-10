// Small glyphs shared by the library surfaces (Paper R1.1, R1.2).

type IconProps = { size?: number; stroke?: string; width?: number };

export function AcademicIcon({ size = 16, stroke = "var(--color-ink-2)", width = 1.4 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden className="flex-none">
      <path d="M1.5 6L8 3l6.5 3L8 9 1.5 6Z" fill="none" stroke={stroke} strokeWidth={width} strokeLinejoin="round" />
      <path d="M4.5 7.5v3c0 1 1.6 2 3.5 2s3.5-1 3.5-2v-3" fill="none" stroke={stroke} strokeWidth={width} strokeLinejoin="round" />
    </svg>
  );
}

export function BlogIcon({ size = 16, stroke = "var(--color-ink-2)", width = 1.4 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden className="flex-none">
      <rect x="2" y="2.5" width="12" height="11" rx="2" fill="none" stroke={stroke} strokeWidth={width} />
      <path d="M2 5.5h12M5 8.5h6M5 11h4" fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round" />
    </svg>
  );
}

export function ArrowRight({ size = 16, stroke = "var(--color-ink-1)" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden className="flex-none">
      <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SearchIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden className="flex-none">
      <circle cx="7" cy="7" r="4.25" fill="none" stroke="var(--color-ink-3)" strokeWidth="1.5" />
      <path d="M10.2 10.2L13.5 13.5" fill="none" stroke="var(--color-ink-3)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function TrashIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden className="flex-none">
      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" fill="none" stroke="var(--color-ink-2)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DotsIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden className="flex-none">
      <circle cx="4" cy="9" r="1.4" fill="var(--color-ink-2)" />
      <circle cx="9" cy="9" r="1.4" fill="var(--color-ink-2)" />
      <circle cx="14" cy="9" r="1.4" fill="var(--color-ink-2)" />
    </svg>
  );
}
