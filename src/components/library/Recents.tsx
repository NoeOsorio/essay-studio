"use client";

// The recents strip above the ruled page (Paper R1.3 top): the latest essay
// as a smaller sheet and the next three as paper cards. The same essays are
// left out of the lines below.

import type { CSSProperties } from "react";
import { Stamp } from "@/components/review/Stamp";
import { tiltOf } from "@/components/ui/StickyNote";
import { formatCount, type LibraryRow } from "@/lib/library/rows";
import { EssayRowMenu } from "./EssayRowMenu";
import { AcademicIcon, ArrowRight, BlogIcon } from "./icons";

/** Height of the strip, from Paper. The ledger needs it for its scroll math. */
export const RECENTS_H = 292;

const CARD_SHADOW = "0 0 0 1px #1D1B180F, 0 2px 4px #3C2D0A1A, 0 20px 32px -16px #3C2D0A33";

type Surface = { className: string; radius: number; tape: { left: number; width: number; tilt: number } | null; lift: number };
// Paper draws the three cards as ruled, cream and white paper, each a little
// lower or higher than the last.
const SURFACES: Surface[] = [
  { className: "paper-ruled", radius: 4, tape: null, lift: 14 },
  { className: "paper-cream", radius: 4, tape: { left: 62, width: 66, tilt: 3 }, lift: 26 },
  { className: "bg-sheet", radius: 12, tape: { left: 16, width: 60, tilt: -6 }, lift: 12 },
];

function counts(row: LibraryRow, long: boolean): string {
  const words = row.entry.wordCount;
  if (words <= 0) return "";
  const base = `${formatCount(words)} ${words === 1 ? "palabra" : "palabras"}`;
  if (!row.minutes) return base;
  return long ? `${base}, ${row.minutes} min de lectura` : `${base}, ${row.minutes} min`;
}

function TypeMark({ row, size }: { row: LibraryRow; size: "lg" | "sm" }) {
  const academic = row.entry.mode === "academico";
  return (
    <div className="flex items-center gap-[6px] flex-none">
      {academic ? <AcademicIcon /> : <BlogIcon />}
      {size === "lg" ? (
        <span className="font-sans text-[13px] font-medium leading-[16px] text-ink-2">
          {academic ? "Académico" : "Blog"}
        </span>
      ) : null}
    </div>
  );
}

function Corner({ row, big }: { row: LibraryRow; big: boolean }) {
  if (!row.score) return null;
  const style: CSSProperties = big
    ? { right: -22, top: -26 }
    : { right: -14, top: -18 };
  return (
    <div className="absolute" style={style} data-testid="card-stamp">
      <Stamp result={row.score} size={big ? "card" : "desk"} tiltSeed={row.entry.id} />
    </div>
  );
}

function Latest({ row, onOpen }: { row: LibraryRow; onOpen: (id: string) => void }) {
  const { entry } = row;
  const untitled = entry.title.trim().length === 0;
  return (
    <EssayRowMenu
      id={entry.id}
      title={row.displayTitle}
      placement="featured"
      onOpen={() => onOpen(entry.id)}
      testId="essay-featured"
      className="flex flex-1 min-w-[400px] max-w-[660px] flex-col justify-between h-[244px] rounded-[14px] bg-sheet pt-[32px] pb-[26px] px-[44px]"
      style={{
        boxShadow: "0 0 0 1px #1D1B180F, 0 2px 4px #3C2D0A1A, 0 24px 40px -18px #3C2D0A33",
        rotate: "-0.6deg",
        transformOrigin: "0% 0%",
        // Room above for the stamp that hangs off the top corner, so the
        // scrolling page never clips it.
        marginTop: 20,
      }}
    >
      <div
        aria-hidden
        className="absolute left-[280px] top-[-11px] h-[22px] w-[92px]"
        style={{ background: "#EADCB8B3", boxShadow: "#FFFFFF66 0 0 0 1px inset, #3C2D0A26 0 1px 2px", rotate: "2deg", transformOrigin: "0% 0%" }}
      />
      <div className="flex max-w-[520px] flex-col gap-[10px]">
        <h2
          className={`font-serif font-medium text-[32px] leading-[37px] tracking-[-0.015em] line-clamp-3 ${untitled ? "text-ink-3" : "text-ink-1"}`}
        >
          {row.displayTitle}
        </h2>
        {entry.excerpt ? (
          <p className="font-serif text-[17px] leading-[25px] text-ink-2 line-clamp-1">{entry.excerpt}</p>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-[16px]">
        <div className="flex min-w-0 items-center gap-[16px]">
          <TypeMark row={row} size="lg" />
          <span className="truncate font-sans text-[13px] leading-[16px] text-ink-3">{counts(row, true)}</span>
        </div>
        <span className="flex flex-none items-center gap-[8px] h-[36px] pl-[14px] pr-[12px] rounded-[10px] bg-shade font-sans text-[13px] font-medium leading-[16px] text-ink-1">
          Seguir escribiendo
          <ArrowRight />
        </span>
      </div>
      <Corner row={row} big />
    </EssayRowMenu>
  );
}

function Small({ row, index, onOpen }: { row: LibraryRow; index: number; onOpen: (id: string) => void }) {
  const { entry } = row;
  const surface = SURFACES[index % SURFACES.length];
  const untitled = entry.title.trim().length === 0;
  return (
    <EssayRowMenu
      id={entry.id}
      title={row.displayTitle}
      placement="card"
      onOpen={() => onOpen(entry.id)}
      testId="essay-card"
      className={`flex w-[196px] flex-none flex-col justify-between h-[200px] px-[18px] pt-[28px] pb-[16px] ${surface.className}`}
      style={{
        marginTop: surface.lift,
        marginLeft: index === 0 ? 30 : 0,
        borderRadius: surface.radius,
        boxShadow: CARD_SHADOW,
        rotate: `${tiltOf(entry.id) * 0.8}deg`,
        transformOrigin: "0% 0%",
      }}
    >
      {surface.tape ? (
        <div
          aria-hidden
          className="absolute top-[-10px] h-[20px]"
          style={{
            left: surface.tape.left,
            width: surface.tape.width,
            background: "#FFFDF5BD",
            boxShadow: "#3C2D0A29 0 1px 3px",
            rotate: `${surface.tape.tilt}deg`,
            transformOrigin: "0% 0%",
          }}
        />
      ) : null}
      <h2
        className={`font-serif font-medium text-[21px] leading-[27px] tracking-[-0.01em] line-clamp-3 ${untitled ? "text-ink-3" : "text-ink-1"}`}
      >
        {row.displayTitle}
      </h2>
      <div className={`flex items-center gap-[6px] ${surface.className === "paper-ruled" ? "bg-white" : ""}`}>
        <TypeMark row={row} size="sm" />
        <span className="truncate font-sans text-[12px] leading-[16px] text-ink-3">{counts(row, false)}</span>
      </div>
      <Corner row={row} big={false} />
    </EssayRowMenu>
  );
}

export function Recents({ rows, onOpen }: { rows: LibraryRow[]; onOpen: (id: string) => void }) {
  const [first, ...rest] = rows;
  if (!first) return null;
  return (
    <div
      data-testid="library-recents"
      className="flex flex-none items-start gap-[16px] pl-[56px] pr-[56px] pt-[16px]"
      style={{ height: RECENTS_H }}
    >
      <Latest row={first} onOpen={onOpen} />
      {rest.map((row, i) => (
        <Small key={row.entry.id} row={row} index={i} onOpen={onOpen} />
      ))}
    </div>
  );
}
