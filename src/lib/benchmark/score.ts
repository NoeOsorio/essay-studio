// Benchmark scoring — derived directly from the Pluma Roja
// anotaciones the user has applied to the essay.
//
// Design principle: the score is *not* asked of the model. It's a
// deterministic function of what the council flagged. That gives the
// number meaning: 10/10 = no anotaciones left = literally nothing
// the council wants you to fix. Descartar an annotation → the score
// recovers immediately. Action and number stay coupled.
//
// Pure module: no React, no store, easy to unit-test.
//
// Penalty per severity (calibrated to "indulgente — anima a iterar"):
//   alta   → −2
//   media  → −1
//   baja   → −0.5
// Max score = 10. Floor at 0.

import type {
  Anotacion,
  Criterio,
  EssayMode,
  EvaluacionMeta,
  Pase,
  Rubrica,
  Severidad,
} from "@/lib/storage/types";

export const MAX_SCORE = 10;

export const PENALTY: Record<Severidad, number> = {
  alta: 2,
  media: 1,
  baja: 0.5,
};

/**
 * Each missing pasada (versus what the mode supports) penalizes the
 * overall by this much. Reflects the rule "10/10 only if you ran
 * everything" — 1 missing pasada in academico caps you at 9, two
 * missings at 8, etc. Per-criterio scores stay honest about what was
 * checked.
 */
export const PENALTY_PER_MISSING_PASADA = 1;

/** Which pasadas the current essay mode supports. APA is academico-only. */
export function pasadasForMode(mode: EssayMode): Pase[] {
  return mode === "blog"
    ? ["coherencia", "estilo", "argumento"]
    : ["coherencia", "estilo", "argumento", "apa"];
}

/** Minimal shape of an applied annotation, as read from a TipTap doc. */
export type AppliedAnotacion = Pick<
  Anotacion,
  "id" | "sage" | "pase" | "severidad" | "mensaje" | "sugerencia" | "criterioId"
>;

/** A snapshot of one criterio's score + the anotaciones that affect it. */
export type CriterioBreakdown = {
  criterio: Criterio;
  score: number;
  anotaciones: AppliedAnotacion[];
};

/** Result of running the benchmark for one essay. */
export type BenchmarkResult = {
  /** Overall weighted score, or `null` if there's nothing to score
   *  (i.e. the user has never run Evaluar on this essay). */
  overall: number | null;
  /** Per-criterio breakdown (empty when no rúbrica). */
  perCriterio: CriterioBreakdown[];
  /** Anotaciones the sage didn't link to any criterio. They count toward
   *  the overall score but don't show in any per-criterio ring. */
  general: AppliedAnotacion[];
  /** Convenience flags for empty-state UI. */
  hasRubrica: boolean;
  hasAnotaciones: boolean;
  /** True iff the user has ever run Evaluar (regardless of outcome). */
  wasEvaluated: boolean;
  /** Pasadas that ran in the last Evaluar, or null if never. */
  pasadasCubiertas: Pase[] | null;
  /** Pasadas that are *possible* in this essay's mode (academico has 4, blog 3). */
  pasadasDisponibles: Pase[];
  /** Pasadas the mode supports but the user did not run last time. */
  missingPasadas: Pase[];
  /** 0–1; 1 = full coverage of the mode's pasadas. */
  coverageRatio: number;
  /** True iff the essay was edited after the last Evaluar run (the
   *  score may not reflect current text). */
  isStale: boolean;
};

/**
 * Walk a TipTap JSON document and pull every `annotation` mark out
 * as a flat list. We use the marks themselves as the source of truth
 * (no separate side store) — same data the popover reads.
 */
export function extractAnotacionesFromContent(
  content: unknown,
): AppliedAnotacion[] {
  const out: AppliedAnotacion[] = [];
  const seen = new Set<string>();
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const n = node as {
      type?: string;
      marks?: { type?: string; attrs?: Record<string, unknown> }[];
      content?: unknown[];
    };
    if (Array.isArray(n.marks)) {
      for (const m of n.marks) {
        if (m.type !== "annotation") continue;
        const a = m.attrs ?? {};
        const id = typeof a.id === "string" ? a.id : null;
        if (!id) continue;
        // The mark can repeat across split text nodes — dedupe by id.
        if (seen.has(id)) continue;
        seen.add(id);
        out.push({
          id,
          sage: a.sage as AppliedAnotacion["sage"],
          pase: a.pase as AppliedAnotacion["pase"],
          severidad: a.severidad as Severidad,
          mensaje:
            typeof a.mensaje === "string" ? (a.mensaje as string) : "",
          sugerencia:
            typeof a.sugerencia === "string" && a.sugerencia.length > 0
              ? (a.sugerencia as string)
              : undefined,
          criterioId:
            typeof a.criterioId === "string" && a.criterioId.length > 0
              ? (a.criterioId as string)
              : undefined,
        });
      }
    }
    if (Array.isArray(n.content)) {
      for (const child of n.content) walk(child);
    }
  };
  walk(content);
  return out;
}

/** Penalty contributed by a single anotación. */
function penaltyFor(anotacion: AppliedAnotacion): number {
  return PENALTY[anotacion.severidad] ?? 0;
}

/** Score for one criterio given the anotaciones tagged to it. Floor 0. */
function scoreFor(anotaciones: AppliedAnotacion[]): number {
  const penalty = anotaciones.reduce((sum, a) => sum + penaltyFor(a), 0);
  return Math.max(0, MAX_SCORE - penalty);
}

/**
 * Aggregate the benchmark across the essay's anotaciones, rúbrica, and
 * Evaluar metadata.
 *
 * States the result encodes:
 *
 *   - **Never evaluated** (`evaluacionMeta` is undefined):
 *     `overall = null`, `wasEvaluated = false`. UI shows "—" + CTA
 *     "Corre Evaluar para puntuar". We refuse to make up a 10/10
 *     before the council has looked.
 *
 *   - **Evaluated, perfect, full coverage**: `overall = 10`,
 *     `coverageRatio = 1`, no missing pasadas. The 10/10 the user
 *     wanted: the council ran every dimension and had nothing to say.
 *
 *   - **Evaluated, perfect, partial coverage**: overall capped at
 *     `10 − missing_pasadas * PENALTY_PER_MISSING_PASADA`. Honors the
 *     rule "no 10/10 unless every pasada ran". `missingPasadas`
 *     surfaces what's missing so the UI can nudge.
 *
 *   - **Evaluated, with issues**: normal weighted score from the
 *     anotaciones, with the coverage cap applied on top.
 *
 *   - **Stale**: `isStale = true` when the essay was edited after the
 *     last Evaluar (`updatedAt > evaluadoEn`). The score still
 *     computes, but the UI should warn it may not reflect the current
 *     text.
 */
export function computeBenchmark(args: {
  anotaciones: AppliedAnotacion[];
  rubrica: Rubrica | undefined;
  evaluacionMeta: EvaluacionMeta | undefined;
  essayMode: EssayMode;
  essayUpdatedAt: string;
}): BenchmarkResult {
  const { anotaciones, rubrica, evaluacionMeta, essayMode, essayUpdatedAt } =
    args;

  const hasAnotaciones = anotaciones.length > 0;
  const hasRubrica = !!rubrica && rubrica.criterios.length > 0;
  const wasEvaluated = !!evaluacionMeta;

  const pasadasDisponibles = pasadasForMode(essayMode);
  const pasadasCubiertas = evaluacionMeta?.pasadasCubiertas ?? null;
  const missingPasadas = wasEvaluated
    ? pasadasDisponibles.filter((p) => !pasadasCubiertas!.includes(p))
    : [];
  const coverageRatio = wasEvaluated
    ? (pasadasDisponibles.length - missingPasadas.length) /
      pasadasDisponibles.length
    : 0;

  const isStale = wasEvaluated
    ? essayUpdatedAt > (evaluacionMeta!.evaluadoEn ?? "")
    : false;

  // Bucket by criterioId (needed even on the "never evaluated" path
  // so we can still return per-criterio breakdowns for the editor
  // popover etc. — though the overall will be null).
  const byCriterio = new Map<string, AppliedAnotacion[]>();
  const general: AppliedAnotacion[] = [];
  for (const a of anotaciones) {
    if (a.criterioId) {
      const list = byCriterio.get(a.criterioId) ?? [];
      list.push(a);
      byCriterio.set(a.criterioId, list);
    } else {
      general.push(a);
    }
  }

  const perCriterio: CriterioBreakdown[] = hasRubrica
    ? rubrica!.criterios.map((c) => {
        const list = byCriterio.get(c.id) ?? [];
        return { criterio: c, score: scoreFor(list), anotaciones: list };
      })
    : [];

  // The user has never run Evaluar → no honest overall to show.
  if (!wasEvaluated) {
    return {
      overall: null,
      perCriterio: perCriterio.map((b) => ({ ...b, score: round1(b.score) })),
      general,
      hasRubrica,
      hasAnotaciones,
      wasEvaluated: false,
      pasadasCubiertas: null,
      pasadasDisponibles,
      missingPasadas: [],
      coverageRatio: 0,
      isStale: false,
    };
  }

  // Base overall:
  //  - With rúbrica: weighted average of per-criterio scores by peso,
  //    plus a notional "general" bucket (weight = 1) for orphan
  //    anotaciones so they still drag the number.
  //  - Without rúbrica: a single bucket with all anotaciones.
  let baseOverall: number;
  if (hasRubrica) {
    const generalScore = scoreFor(general);
    const weighted = perCriterio.reduce(
      (acc, b) => ({
        sum: acc.sum + b.score * b.criterio.peso,
        weight: acc.weight + b.criterio.peso,
      }),
      { sum: 0, weight: 0 },
    );
    const generalWeight = general.length > 0 ? 1 : 0;
    const totalWeight = weighted.weight + generalWeight;
    baseOverall =
      totalWeight === 0
        ? MAX_SCORE
        : (weighted.sum + generalScore * generalWeight) / totalWeight;
  } else {
    baseOverall = scoreFor(anotaciones);
  }

  // Coverage cap: each missing pasada deducts a flat penalty from the
  // overall. Honors "no 10/10 unless every pasada ran".
  const coveragePenalty = missingPasadas.length * PENALTY_PER_MISSING_PASADA;
  const overall = Math.max(0, baseOverall - coveragePenalty);

  return {
    overall: round1(overall),
    perCriterio: perCriterio.map((b) => ({ ...b, score: round1(b.score) })),
    general,
    hasRubrica,
    hasAnotaciones,
    wasEvaluated: true,
    pasadasCubiertas,
    pasadasDisponibles,
    missingPasadas,
    coverageRatio,
    isStale,
  };
}

/** One decimal place, for display. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
