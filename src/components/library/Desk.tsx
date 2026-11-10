"use client";

// The desk (Paper R1.1, and «Biblioteca, dos a once ensayos»). The newest
// essay is a large sheet; the rest are paper cards on a three column grid,
// each tilted by its id. A stamp shows only on essays that were reviewed.

import type { CSSProperties } from "react";
import { Stamp } from "@/components/review/Stamp";
import { tiltOf } from "@/components/ui/StickyNote";
import { formatCount, type LibraryRow } from "@/lib/library/rows";
import { EssayRowMenu } from "./EssayRowMenu";
import { AcademicIcon, ArrowRight, BlogIcon } from "./icons";

type DeskProps = {
  /** Newest first. */
  rows: LibraryRow[];
  onOpen: (id: string) => void;
};

type Variant = "white" | "ruled" | "cream" | "grid";
const VARIANTS: readonly Variant[] = ["white", "ruled", "cream", "grid"];

/** Stable pick from the id, from the same hash that tilts it. */
function variantOf(id: string): Variant {
  return VARIANTS[Math.round((tiltOf(id) + 2) * 2) % VARIANTS.length];
}

const CARD_SHADOW = "0 0 0 1px #1D1B180F, 0 2px 4px #3C2D0A1A, 0 20px 32px -16px #3C2D0A33";

const SURFACE: Record<Variant, { className: string; radius: number; padTop: number }> = {
  white: { className: "bg-sheet", radius: 12, padTop: 34 },
  ruled: { className: "paper-ruled", radius: 4, padTop: 38 },
  cream: { className: "paper-cream", radius: 4, padTop: 34 },
  grid: { className: "paper-grid", radius: 4, padTop: 34 },
};

function countLine(row: LibraryRow): string {
  const words = row.entry.wordCount;
  if (words <= 0) return "";
  const base = `${formatCount(words)} ${words === 1 ? "palabra" : "palabras"}`;
  return row.minutes ? `${base}, ${row.minutes} min de lectura` : base;
}

function TypeLabel({ row }: { row: LibraryRow }) {
  const academic = row.entry.mode === "academico";
  return (
    <div className="flex items-center gap-[6px]">
      {academic ? <AcademicIcon /> : <BlogIcon />}
      <span className="font-sans text-[13px] font-medium leading-[16px] text-ink-2">
        {academic ? "Académico" : "Blog"}
      </span>
    </div>
  );
}

function CardStamp({ row, featured }: { row: LibraryRow; featured: boolean }) {
  if (!row.score) return null;
  // Same Stamp as the editor, at card size; the smaller cards scale it down.
  const style: CSSProperties = featured
    ? { right: -22, top: -26 }
    : { right: -14, top: -18 };
  return (
    <div className="absolute" style={style} data-testid="card-stamp">
      <Stamp result={row.score} size={featured ? "card" : "desk"} tiltSeed={row.entry.id} />
    </div>
  );
}

function Tape({ left, width, tilt, color }: { left: number; width: number; tilt: number; color: string }) {
  return (
    <div
      aria-hidden
      className="absolute"
      style={{
        left,
        top: -10,
        width,
        height: 22,
        background: color,
        boxShadow: "#3C2D0A29 0 1px 3px",
        rotate: `${tilt}deg`,
        transformOrigin: "0% 0%",
      }}
    />
  );
}

function Featured({ row, onOpen }: { row: LibraryRow; onOpen: (id: string) => void }) {
  const { entry } = row;
  const untitled = entry.title.trim().length === 0;
  return (
    <EssayRowMenu
      id={entry.id}
      title={row.displayTitle}
      placement="featured"
      onOpen={() => onOpen(entry.id)}
      testId="essay-featured"
      className="col-span-2 flex flex-col justify-between h-[420px] rounded-[14px] bg-sheet pt-[56px] pb-[40px] px-[64px]"
      style={{
        boxShadow: "0 0 0 1px #1D1B180F, 0 2px 4px #3C2D0A1A, 0 24px 40px -18px #3C2D0A33",
        rotate: "-0.6deg",
        transformOrigin: "0% 0%",
      }}
    >
      <div
        aria-hidden
        className="absolute left-[380px] top-[-13px] h-[26px] w-[104px]"
        style={{ background: "#EADCB8B3", boxShadow: "#FFFFFF66 0 0 0 1px inset, #3C2D0A26 0 1px 2px", rotate: "2deg", transformOrigin: "0% 0%" }}
      />
      <div className="flex flex-col gap-[22px] max-w-[640px]">
        <h2
          className={`font-serif font-medium text-[44px] leading-[50px] tracking-[-0.015em] line-clamp-3 ${untitled ? "text-ink-3" : "text-ink-1"}`}
        >
          {row.displayTitle}
        </h2>
        {entry.excerpt ? (
          <p className="font-serif text-[19px] leading-[31px] text-ink-2 line-clamp-3">{entry.excerpt}</p>
        ) : null}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-[18px]">
          <TypeLabel row={row} />
          <span className="font-sans text-[13px] leading-[16px] text-ink-3">{countLine(row)}</span>
        </div>
        <span className="flex items-center gap-[8px] h-[36px] pl-[14px] pr-[12px] rounded-[10px] bg-shade font-sans text-[13px] font-medium leading-[16px] text-ink-1">
          Seguir escribiendo
          <ArrowRight />
        </span>
      </div>
      <CardStamp row={row} featured />
    </EssayRowMenu>
  );
}

function Card({ row, onOpen }: { row: LibraryRow; onOpen: (id: string) => void }) {
  const { entry } = row;
  const variant = variantOf(entry.id);
  const surface = SURFACE[variant];
  const tilt = tiltOf(entry.id);
  const untitled = entry.title.trim().length === 0;
  const tapeLeft = 24 + ((Math.round((tilt + 2) * 2) * 37) % 150);
  return (
    <EssayRowMenu
      id={entry.id}
      title={row.displayTitle}
      placement="card"
      onOpen={() => onOpen(entry.id)}
      testId="essay-card"
      className={`flex flex-col justify-between h-[248px] px-[30px] pb-[26px] ${surface.className}`}
      style={{
        borderRadius: surface.radius,
        paddingTop: surface.padTop,
        boxShadow: CARD_SHADOW,
        rotate: `${tilt * 0.7}deg`,
        transformOrigin: "50% 50%",
      }}
    >
      {variant === "white" || variant === "cream" ? (
        <Tape left={tapeLeft} width={72} tilt={tilt * 3} color="#FFFDF5BD" />
      ) : null}
      <h2
        className={`font-serif font-medium text-[26px] leading-[32px] tracking-[-0.01em] line-clamp-2 ${untitled ? "text-ink-3" : "text-ink-1"}`}
      >
        {row.displayTitle}
      </h2>
      {entry.excerpt ? (
        <p className="font-serif text-[17px] leading-[24px] text-ink-2 line-clamp-1">{entry.excerpt}</p>
      ) : (
        <span />
      )}
      <div className="flex items-center justify-between gap-[14px]">
        <TypeLabel row={row} />
        <span className="font-sans text-[13px] leading-[16px] text-ink-3 truncate">{countLine(row)}</span>
      </div>
      <CardStamp row={row} featured={false} />
    </EssayRowMenu>
  );
}

export function Desk({ rows, onOpen }: DeskProps) {
  const [first, ...rest] = rows;
  if (!first) return null;
  return (
    <div
      data-testid="library-desk"
      className="grid grid-cols-3 content-start gap-x-[56px] gap-y-[60px] px-[56px] pt-[30px] pb-[72px]"
    >
      <Featured row={first} onOpen={onOpen} />
      {rest.map((row) => (
        <Card key={row.entry.id} row={row} onOpen={onOpen} />
      ))}
    </div>
  );
}
