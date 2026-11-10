"use client";

// Jump to any month and year that has essays (Paper Slice 0, «Saltar a un
// mes»). Years on the left, a three by four month grid on the right; months
// without essays are dimmed and do nothing.

import { useState, type RefObject } from "react";
import { Popover } from "@/components/ui/Popover";
import { MONTHS_SHORT, parseMonthKey } from "@/lib/library/ledger";

type Props = {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  /** Years with essays, newest first, with the months that have any. */
  years: { year: number; months: Set<number> }[];
  /** The month the page is showing now, «YYYY-MM». */
  currentKey: string | null;
  onPick: (monthKey: string) => void;
};

export function MonthJump(props: Props) {
  return (
    <Popover anchor={props.anchor} open={props.open} onClose={props.onClose} align="start" testId="month-jump">
      {props.open ? <Grid {...props} /> : null}
    </Popover>
  );
}

function Grid({ years, currentKey, onPick }: Props) {
  const current = currentKey ? parseMonthKey(currentKey) : null;
  const [year, setYear] = useState(() => current?.year ?? years[0]?.year ?? new Date().getFullYear());
  const available = years.find((y) => y.year === year)?.months ?? new Set<number>();

  return (
    <div className="flex gap-[16px] p-[8px]">
      <div className="flex flex-col gap-[2px] max-h-[260px] overflow-y-auto thin-scroll">
        {years.map((y) => (
          <button
            key={y.year}
            type="button"
            data-testid={`month-jump-year-${y.year}`}
            onClick={() => setYear(y.year)}
            className={`flex items-center h-[32px] px-[12px] rounded-[8px] cursor-pointer flex-none font-sans text-[13px] leading-[16px] hover:bg-shade ${
              y.year === year ? "bg-shade font-semibold text-ink-1" : "font-medium text-ink-2"
            }`}
          >
            {y.year}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-[2px] content-start">
        {MONTHS_SHORT.map((name, m) => {
          const has = available.has(m);
          const isCurrent = current !== null && current.year === year && current.month === m;
          return (
            <button
              key={name}
              type="button"
              disabled={!has}
              data-testid={`month-jump-${year}-${String(m + 1).padStart(2, "0")}`}
              onClick={() => onPick(`${year}-${String(m + 1).padStart(2, "0")}`)}
              className={`flex items-center justify-center h-[32px] w-[56px] rounded-[8px] font-sans text-[13px] leading-[16px] ${
                has ? "cursor-pointer hover:bg-shade" : "cursor-default"
              } ${isCurrent ? "bg-shade font-semibold text-ink-1" : has ? "font-medium text-ink-2" : "font-medium text-[#1D1B1847]"}`}
            >
              {name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
