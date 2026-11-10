import type { CSSProperties, ReactNode } from "react";
import { identityOf, type AuthorId } from "@/lib/agent-identity";

export const NOTE_WIDTH = 212;

/**
 * Deterministic tilt in degrees from a note id: FNV-1a (32 bit) mapped into
 * -2 to 2.5, skipping plus or minus 0.5 so every note reads as tilted.
 */
export function tiltOf(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // 0..1, then to -2..2.5 in steps of 0.5 (10 values), dropping -0.5, 0, 0.5.
  const steps = [-2, -1.5, -1, 1, 1.5, 2, 2.5];
  return steps[h % steps.length];
}

type StickyNoteProps = {
  author: AuthorId;
  title?: ReactNode;
  tilt?: number;
  tape?: boolean;
  /** Width in px; the board note is NOTE_WIDTH, the ghosts on the empty board are narrower. */
  width?: number;
  /** testid on the author row (icon and name). */
  authorTestId?: string;
  children: ReactNode;
};

/**
 * The note, drawn in one place. Presentational only, with no canvas library import.
 * Values come from Paper: width 212, padding 22/18/20, gap 10, radius 3.
 */
export function StickyNote({
  author,
  title,
  tilt = 0,
  tape = true,
  width = NOTE_WIDTH,
  authorTestId,
  children,
}: StickyNoteProps) {
  const id = identityOf(author);
  const Icon = id.Icon;
  const style: CSSProperties = {
    width,
    background: id.note,
    borderRadius: 3,
    boxShadow: "#3C2D0A14 0 1px 1px, #3C2D0A4D 0 10px 20px -8px",
    padding: "22px 18px 20px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    position: "relative",
    rotate: `${tilt}deg`,
    transformOrigin: "50% 50%",
    boxSizing: "border-box",
    color: id.text,
  };
  return (
    <div data-sticky-note style={style}>
      <div data-testid={authorTestId} className="flex items-center gap-[6px]" style={{ color: id.ink }}>
        <Icon size={16} />
        <span className="font-sans text-[12px] font-semibold leading-[16px]">{id.name}</span>
      </div>
      {title ? (
        <div className="font-serif text-[17px] font-medium leading-[23px]">{title}</div>
      ) : null}
      <div className="font-serif text-[17px] leading-[23px]">{children}</div>
      {tape ? (
        <div
          aria-hidden="true"
          className="note-tape"
          style={{
            position: "absolute",
            top: -11,
            left: (width - (width < NOTE_WIDTH ? 72 : 76)) / 2,
            width: width < NOTE_WIDTH ? 72 : 76,
            height: 22,
            background: "#FFFDF5BD",
            boxShadow: "#3C2D0A29 0 1px 3px",
            rotate: "-4deg",
            transformOrigin: "0 0",
          }}
        />
      ) : null}
    </div>
  );
}
