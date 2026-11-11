// A library row: one LibraryEntry plus everything the list derives from it.
// Derived on the renderer, never stored. The score is the editor's score:
// one `computeBenchmark` call fed as contracts/score-inputs.md says.

import { computeBenchmark, type BenchmarkResult } from "@/lib/benchmark/score";
import { deriveFindings, openForScore } from "@/lib/review/findings";
import type { LibraryEntry } from "@/lib/storage/types";

export type LibraryRow = {
  entry: LibraryEntry;
  displayTitle: string;
  /** Reading minutes; null at 0 words. */
  minutes: number | null;
  /** Null when the essay has no review inputs at all. */
  score: BenchmarkResult | null;
  /** Milliseconds used to order and group by date. */
  effectiveMs: number;
  /** "YYYY-MM" of `effectiveMs`, local time. */
  monthKey: string;
};

const WORDS_PER_MINUTE = 230;

/** Spanish grouping with a separator also for four digits: 1.000. */
const NUMBERS = new Intl.NumberFormat("es", { useGrouping: "always" });

export function formatCount(n: number): string {
  return NUMBERS.format(n);
}

function validMs(iso: string): number | null {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * `updatedAt` if it is a valid date that is not in the future, else the
 * file's modification time. `fileModifiedMs` is the only exact time the
 * renderer takes from the index.
 */
export function effectiveMsOf(entry: LibraryEntry, nowMs: number): number {
  const ms = validMs(entry.updatedAt);
  return ms !== null && ms <= nowMs ? ms : entry.fileModifiedMs;
}

export function monthKeyOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function scoreOf(entry: LibraryEntry): BenchmarkResult | null {
  const review = entry.review;
  if (!review) return null;
  const anotaciones = openForScore(
    deriveFindings({ type: "doc", content: review.blocks }, review.findings),
  );
  return computeBenchmark({
    anotaciones,
    rubrica: review.rubrica,
    evaluacionMeta: review.evaluacionMeta,
    essayMode: entry.mode,
    essayUpdatedAt: entry.updatedAt,
    contentFingerprint: review.evaluacionMeta?.currentFingerprint,
  });
}

export function toRow(entry: LibraryEntry, nowMs: number = Date.now()): LibraryRow {
  const title = entry.title.trim();
  const effectiveMs = effectiveMsOf(entry, nowMs);
  return {
    entry,
    displayTitle: title.length > 0 ? title : "Sin título",
    minutes:
      entry.wordCount > 0
        ? Math.max(1, Math.round(entry.wordCount / WORDS_PER_MINUTE))
        : null,
    score: scoreOf(entry),
    effectiveMs,
    monthKey: monthKeyOf(effectiveMs),
  };
}
