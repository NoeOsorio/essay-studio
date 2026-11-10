// Glyphs drawn for the toolbar and the Más panel, copied from Paper R2.1,
// R2.4 and the states on page 08 (E4, E5). Stroke colors are CSS variables so
// the same glyph serves active and inactive states.

type IconProps = { size?: number; color?: string };

const INK = "var(--color-ink-1)";
const INK2 = "var(--color-ink-2)";
const INK3 = "var(--color-ink-3)";
const ERR = "var(--color-err)";

export function BackChevron({ size = 16, color = INK }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className="flex-none">
      <path d="M10 3.5L5.5 8L10 12.5" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const CLOUD = "M5 13.5h7.5a3 3 0 0 0 .4-6 4 4 0 0 0-7.7-1A3.3 3.3 0 0 0 5 13.5Z";

export function CloudSaved({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true" className="flex-none">
      <path d={CLOUD} fill="none" stroke={INK3} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M7 10l1.5 1.5L11 9" fill="none" stroke={INK3} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CloudDirty({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true" className="flex-none">
      <path d={CLOUD} fill="none" stroke={INK3} strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="9" cy="10" r="1.7" fill={INK3} />
    </svg>
  );
}

export function CloudError({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true" className="flex-none">
      <path d={CLOUD} fill="none" stroke={ERR} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M9 7.8v2.6M9 12v.1" fill="none" stroke={ERR} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** Ring with a quarter arc; turns while saving or working. */
export function Spinner({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className="flex-none animate-spin motion-reduce:animate-none">
      <circle cx="8" cy="8" r="6" fill="none" stroke="rgba(29,27,24,0.12)" strokeWidth="2" />
      <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function ViewEssay({ color = INK3 }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="3" y="2.5" width="10" height="11" rx="2" fill="none" stroke={color} strokeWidth="1.4" />
      <path d="M5.5 6h5M5.5 8.5h5M5.5 11h3" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function ViewBoard({ color = INK3 }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" fill="none" stroke={color} strokeWidth="1.4" />
      <path d="M8 2.5v11" fill="none" stroke={color} strokeWidth="1.4" />
      <rect x="10" y="5" width="3" height="3" rx=".6" fill={color} />
    </svg>
  );
}

/** Three overlapping notes, as drawn on Hazme preguntas. */
export function NotesStack() {
  return (
    <svg width="20" height="18" viewBox="0 0 20 18" aria-hidden="true" className="flex-none">
      <rect x="2.5" y="3.5" width="10" height="10" rx="1" transform="rotate(-12 7.5 8.5)" fill="#CADDFF" stroke="#1D1B188C" strokeWidth="0.8" />
      <rect x="5.5" y="3" width="10" height="10" rx="1" transform="rotate(6 10.5 8)" fill="#BDEBD6" stroke="#1D1B188C" strokeWidth="0.8" />
      <rect x="7.5" y="5" width="10" height="10" rx="1" transform="rotate(-3 12.5 10)" fill="#FFE08A" stroke="#1D1B188C" strokeWidth="0.8" />
    </svg>
  );
}

export function CheckMark({ color = "#FFFFFF" }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="flex-none">
      <path d="M3 8.5l3 3 7-7" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MoreDots() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="4" cy="9" r="1.4" fill={INK2} />
      <circle cx="9" cy="9" r="1.4" fill={INK2} />
      <circle cx="14" cy="9" r="1.4" fill={INK2} />
    </svg>
  );
}

export function SourcesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="flex-none">
      <path d="M2.5 3.5c2-.8 3.7-.8 5.5.5v9c-1.8-1.3-3.5-1.3-5.5-.5v-9ZM13.5 3.5c-2-.8-3.7-.8-5.5.5v9c1.8-1.3 3.5-1.3 5.5-.5v-9Z" fill="none" stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

export function RubricIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="flex-none">
      <rect x="2.5" y="2" width="11" height="12" rx="2" fill="none" stroke={INK} strokeWidth="1.4" />
      <path d="M5 6l1 1 2-2M5 10l1 1 2-2M9.5 6.5h1.5M9.5 10.5h1.5" fill="none" stroke={INK} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function HistoryIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="flex-none">
      <path d="M2.8 8a5.2 5.2 0 1 0 1.6-3.8" fill="none" stroke={INK} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M2.5 2.5v2.5H5M8 5.2V8l2 1.4" fill="none" stroke={INK} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PlugIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className="flex-none">
      <path d="M6 2v3M10 2v3M8 11v3" fill="none" stroke={INK} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M4.5 5h7v2.5a3.5 3.5 0 0 1-7 0V5Z" fill="none" stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

export function WarnTriangle({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className="flex-none">
      <path d="M8 2.2l6.2 11H1.8l6.2-11Z" fill="none" stroke={ERR} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 6.6v3M8 11.4v.1" fill="none" stroke={ERR} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
