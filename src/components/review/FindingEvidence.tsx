"use client";

// What a finding's source says, in the three states the data really has
// (research.md): the quote is in the source, the quote is in the source but
// says the opposite, the quote is not in the source, the source is gone.
// Never a check mark, never the name of whatever produced the review.
// Paper R6.5.

import { useMemo, type RefObject } from "react";

import { Popover } from "@/components/ui/Popover";

import type { Fuente, ReviewEvidence } from "@/lib/storage/types";
import { verifyEvidence } from "../../../sidecar/src/review-contract";

export type EvidenceRow = {
  key: string;
  name: string;
  status: string;
  warn: boolean;
};

export function evidenceRows(
  evidence: ReviewEvidence[] | undefined,
  sources: Fuente[] | undefined,
): EvidenceRow[] {
  return verifyEvidence(evidence ?? undefined, sources ?? []).map((item, i) => {
    const name = sources?.find((s) => s.id === item.sourceId)?.nombre ?? "Fuente";
    if (item.verification === "missing_source") {
      return { key: `${item.sourceId}:${i}`, name, status: "Ya no está en tus fuentes", warn: true };
    }
    if (item.verification !== "verified") {
      return { key: `${item.sourceId}:${i}`, name, status: "No aparece en la fuente", warn: true };
    }
    return {
      key: `${item.sourceId}:${i}`,
      name,
      status:
        item.relation === "contradicts"
          ? "Coincide con tu fuente, pero dice lo contrario"
          : "Coincide con tu fuente",
      warn: false,
    };
  });
}

function DocIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="flex-none">
      <path d="M4.4 1.8h4.9l3.1 3.1v9.3H4.4a.8.8 0 0 1-.8-.8V2.6a.8.8 0 0 1 .8-.8z" fill="none" stroke="#6B665C" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M9.3 1.8v3.1h3.1" fill="none" stroke="#6B665C" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

function WarnIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden className="flex-none">
      <path d="M8 2.2l6.2 11a.6.6 0 0 1-.5.9H2.3a.6.6 0 0 1-.5-.9z" fill="none" stroke="var(--color-ink-1)" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 6.3v3.4" fill="none" stroke="var(--color-ink-1)" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="11.8" r=".9" fill="var(--color-ink-1)" />
    </svg>
  );
}

/** The small source chip. Toggles the rows; a warning icon when any row warns. */
export function EvidenceChip({
  evidence,
  sources,
  open,
  onToggle,
  chipRef,
}: {
  chipRef: RefObject<HTMLButtonElement | null>;
  evidence: ReviewEvidence[] | undefined;
  sources: Fuente[] | undefined;
  open: boolean;
  onToggle: () => void;
}) {
  const rows = useMemo(() => evidenceRows(evidence, sources), [evidence, sources]);
  if (rows.length === 0) return null;
  const warn = rows.some((r) => r.warn);
  const label = rows.length === 1 ? rows[0].name : `${rows[0].name} y ${rows.length - 1} más`;
  return (
    <button
      ref={chipRef}
      type="button"
      data-testid="finding-source"
      aria-expanded={open}
      onClick={onToggle}
      className="flex h-[30px] min-w-0 cursor-pointer items-center gap-[6px] rounded-[8px] text-left"
    >
      {warn ? <WarnIcon size={14} /> : <DocIcon />}
      <span className="truncate text-[12px] leading-[16px] text-ink-3">{label}</span>
    </button>
  );
}

/** R6.5: a 264 px popover opened from the chip, one row per source. */
export function EvidencePopover({
  anchor,
  open,
  onClose,
  evidence,
  sources,
}: {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  evidence: ReviewEvidence[] | undefined;
  sources: Fuente[] | undefined;
}) {
  const rows = useMemo(() => evidenceRows(evidence, sources), [evidence, sources]);
  // Beside the card the chip lives in, never over it (Paper R6.5: 8 px to its
  // right, top aligned with the card, clear of the board toolbar), so «Ya lo resolví» stays in view.
  const host = useMemo<RefObject<HTMLElement | null>>(
    () => ({
      get current() {
        return anchor.current?.closest<HTMLElement>("[data-sheet]") ?? null;
      },
      set current(_v: HTMLElement | null) {},
    }),
    [anchor],
  );
  const card = useMemo<RefObject<HTMLElement | null>>(
    () => ({
      get current() {
        return anchor.current?.closest<HTMLElement>('[data-testid="finding"]') ?? null;
      },
      set current(_v: HTMLElement | null) {},
    }),
    [anchor],
  );
  if (rows.length === 0) return null;
  return (
    <Popover
      anchor={anchor}
      open={open}
      onClose={onClose}
      side="bottom"
      align="start"
      width={264}
      size="compact"
      testId="finding-evidence"
      besideOf={host}
      topOf={card}
      clearBottom={56}
      keepsParent
    >
      <div className="flex flex-col gap-[2px] p-[8px] font-sans">
        {rows.map((r) => (
          <div key={r.key} className="flex items-start gap-[12px] rounded-[10px] p-[10px]">
            <span className="grid h-[20px] w-[20px] flex-none place-items-center">
              {r.warn ? <WarnIcon /> : <DocIcon />}
            </span>
            <span className="flex min-w-0 flex-col gap-[2px]">
              <span className="text-[13px] font-semibold leading-[18px] text-ink-1">{r.name}</span>
              <span className="text-[13px] leading-[18px] text-ink-2">{r.status}</span>
            </span>
          </div>
        ))}
      </div>
    </Popover>
  );
}
