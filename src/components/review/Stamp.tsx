"use client";

// The paper stamp. Presentational: a `computeBenchmark` result in, the stamp
// out. Pure props, no app state. The connected ScoreStamp supplies the test
// ids. Spec 007 reuses it on the library cards.

import { useState } from "react";

import { tiltOf } from "@/components/ui/StickyNote";
import type { BenchmarkResult } from "@/lib/benchmark/score";

/**
 * toolbar: the editor's bar. card: the featured library card (Paper R1.1).
 * desk: the smaller desk cards (R1.1). ledger: a row of the long list (R1.3).
 */
export type StampSize = "toolbar" | "card" | "desk" | "ledger";

type StampProps = {
  result: Pick<BenchmarkResult, "overall" | "isStale">;
  size: StampSize;
  /** Essay id. The desk and ledger stamps tilt a little differently each, derived from it (Paper varies them). */
  tiltSeed?: string;
  /** A review is running: spinner, the previous number (if any) waits. */
  running?: boolean;
  /** Test hooks owned by the connected stamp; this component sets none itself. */
  testIds?: { number?: string; stale?: string };
};

/** `10` with no decimal, otherwise one decimal. */
export function formatStamp(overall: number): string {
  const r = Math.round(overall * 10) / 10;
  return r >= 10 ? "10" : r.toFixed(1);
}

const METRICS = {
  toolbar: {
    pad: 4,
    perf: "radial-gradient(circle, transparent 2.1px, rgb(255, 255, 255) 2.5px) -3.5px -3.5px / 7px 7px",
    drop: "drop-shadow(0 1px 1.5px rgba(60, 45, 10, 0.25))",
    rotate: "-4deg",
    radius: 3,
    ring: 1.5,
    height: 28,
    emptyWidth: 47,
    padX: 9,
    gap: 6,
    font: 16,
    line: 20,
    tracking: "-0.02em",
    icon: 13,
    spinner: 12,
  },
  card: {
    pad: 6,
    perf: "radial-gradient(circle, transparent 3px, rgb(255, 255, 255) 3.6px) -5px -5px / 10px 10px",
    drop: "drop-shadow(0 2px 3px rgba(60, 45, 10, 0.25))",
    rotate: "6deg",
    radius: 4,
    ring: 2,
    height: 52,
    emptyWidth: 88,
    padX: 16,
    gap: 8,
    font: 28,
    line: 32,
    tracking: "-0.02em",
    icon: 20,
    spinner: 22,
  },
  // Paper R1.1, the smaller desk cards.
  desk: {
    pad: 5,
    perf: "radial-gradient(circle, transparent 2.5px, rgb(255, 255, 255) 3px) -4.25px -4.25px / 8.5px 8.5px",
    drop: "drop-shadow(0 1px 2px rgba(60, 45, 10, 0.25))",
    rotate: "-4deg",
    radius: 3,
    ring: 1.5,
    height: 36,
    emptyWidth: 61,
    padX: 11,
    gap: 6,
    font: 19,
    line: 24,
    tracking: "-0.02em",
    icon: 14,
    spinner: 16,
  },
  // Paper R1.3, one row of the 1000 essay list.
  ledger: {
    pad: 3,
    perf: "radial-gradient(circle, transparent 1.8px, rgb(255, 255, 255) 2.2px) -3px -3px / 6px 6px",
    drop: "drop-shadow(0 1px 1px rgba(60, 45, 10, 0.2))",
    rotate: "3deg",
    radius: 2,
    ring: 1.2,
    height: 20,
    emptyWidth: 34,
    padX: 5,
    gap: 4,
    font: 12,
    line: 16,
    tracking: "0",
    icon: 10,
    spinner: 10,
  },
} as const;

function Spinner({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden
      className="flex-none animate-spin motion-reduce:animate-none"
    >
      <circle cx="8" cy="8" r="6" fill="none" stroke="rgba(29,27,24,0.12)" strokeWidth="2.4" />
      <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="var(--color-ink-1)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function RefreshIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden className="flex-none">
      <path d="M11 5a4.5 4.5 0 1 0 .4 3" fill="none" stroke="var(--color-ink-2)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M11.4 2.2V5H8.6" fill="none" stroke="var(--color-ink-2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Stamp({ result, size, tiltSeed, running = false, testIds }: StampProps) {
  const m = METRICS[size];
  // Small stamps lean by their essay's own hash, in the same family as the notes' tilt.
  const rotate = tiltSeed && (size === "desk" || size === "ledger") ? `${tiltOf(tiltSeed) * 2}deg` : m.rotate;
  // A finished run (running goes true to false) plays the arrival once.
  // Derived during render, so no effect and no ref.
  const [wasRunning, setWasRunning] = useState(running);
  const [arriving, setArriving] = useState(false);
  if (running !== wasRunning) {
    setWasRunning(running);
    setArriving(wasRunning && !running);
  }
  const hasNumber = result.overall !== null;
  const worn = (result.isStale || running) && hasNumber;
  const ink = worn ? "var(--color-ink-3)" : "var(--color-ink-1)";
  const ring = hasNumber && !worn ? "var(--color-ink-1)" : "var(--color-ink-3)";

  return (
    <span
      data-stamp-size={size}
      className={arriving ? "flex flex-none stamp-arrive" : "flex flex-none"}
      onAnimationEnd={arriving ? () => setArriving(false) : undefined}
      style={{
        background: m.perf,
        padding: m.pad,
        filter: m.drop,
        rotate,
        transformOrigin: "50% 50%",
      }}
    >
      <span
        className="flex items-center justify-center"
        style={{
          backgroundColor: "#FFFFFF",
          borderRadius: m.radius,
          boxShadow: `inset 0 0 0 ${m.ring}px ${ring}`,
          height: m.height,
          gap: m.gap,
          paddingInline: hasNumber ? m.padX : 0,
          minWidth: hasNumber ? undefined : m.emptyWidth,
        }}
      >
        {running ? <Spinner size={hasNumber ? m.spinner : m.spinner + 2} /> : null}
        {hasNumber ? (
          <span
            data-testid={testIds?.number}
            className="font-mono font-semibold"
            style={{
              color: ink,
              fontSize: m.font,
              lineHeight: `${m.line}px`,
              letterSpacing: m.tracking,
            }}
          >
            {formatStamp(result.overall as number)}
          </span>
        ) : null}
        {result.isStale && hasNumber && !running ? (
          <span data-testid={testIds?.stale} className="flex flex-none">
            <RefreshIcon size={m.icon} />
          </span>
        ) : null}
      </span>
    </span>
  );
}
