"use client";

// One reading of the open essay for every stamp surface: the derived
// findings and the benchmark computed from the open ones.

import { useMemo } from "react";

import { computeBenchmark, type BenchmarkResult } from "@/lib/benchmark/score";
import type { Pase } from "@/lib/storage/types";
import { deriveFindings, openForScore, type FindingView } from "@/lib/review/findings";
import { reviewFingerprint } from "@/lib/review/fingerprint";
import { useStore } from "@/lib/store";

export type BenchmarkArgs = Parameters<typeof computeBenchmark>[0];

export type ReviewReading = {
  views: FindingView[];
  result: BenchmarkResult;
  /** The arguments behind `result`, for `reachableScore`. */
  args: BenchmarkArgs;
};

/** Who owns each pass: the agent shown for it. */
export function agentOfPase(pase: Pase, mode: "academico" | "blog"): "em" | "sis" | "pra" | "cri" {
  if (pase === "coherencia") return "sis";
  if (pase === "argumento") return "cri";
  if (pase === "apa") return "em";
  return mode === "blog" ? "pra" : "em";
}

export function useReviewReading(): ReviewReading | null {
  const current = useStore((s) => s.current);
  return useMemo<ReviewReading | null>(() => {
    if (!current) return null;
    const views = deriveFindings(current.content, current.findings);
    const args: BenchmarkArgs = {
      anotaciones: openForScore(views),
      contentFingerprint: current.evaluacionMeta ? reviewFingerprint(current) : undefined,
      rubrica: current.rubrica,
      evaluacionMeta: current.evaluacionMeta,
      essayMode: current.mode,
      essayUpdatedAt: current.updatedAt,
    };
    return { views, result: computeBenchmark(args), args };
  }, [current]);
}
