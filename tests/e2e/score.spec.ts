import { test, expect } from "@playwright/test";
import {
  computeBenchmark,
  extractAnotacionesFromContent,
  MAX_SCORE,
  PENALTY,
  PENALTY_PER_MISSING_PASADA,
  pasadasForMode,
  type AppliedAnotacion,
} from "../../src/lib/benchmark/score";
import type {
  EssayMode,
  EvaluacionMeta,
  Pase,
  Rubrica,
} from "../../src/lib/storage/types";

// Default fixture for the new args shape: academico, full coverage,
// evaluated 10s ago, not stale.
const T0 = "2026-05-19T20:00:00.000Z";
const T_LATER = "2026-05-19T20:30:00.000Z";

function fullCoverage(mode: EssayMode = "academico"): EvaluacionMeta {
  return { evaluadoEn: T0, pasadasCubiertas: pasadasForMode(mode) };
}

function partialCoverage(
  covered: Pase[],
  mode: EssayMode = "academico",
): EvaluacionMeta {
  // Validate that `covered` is a subset of the mode's available pasadas.
  const available = new Set(pasadasForMode(mode));
  return {
    evaluadoEn: T0,
    pasadasCubiertas: covered.filter((p) => available.has(p)),
  };
}

/**
 * Unit-style coverage of the pure benchmark scoring function. No
 * browser needed — these run inside Playwright's Node runtime as
 * a sanity layer on top of the TipTap → DOM E2E suite.
 */

function makeAnotacion(
  partial: Partial<AppliedAnotacion> & { severidad: AppliedAnotacion["severidad"] },
  i = 0,
): AppliedAnotacion {
  return {
    id: partial.id ?? `a${i}`,
    sage: partial.sage ?? "sis",
    pase: partial.pase ?? "coherencia",
    severidad: partial.severidad,
    mensaje: partial.mensaje ?? "msg",
    sugerencia: partial.sugerencia,
    criterioId: partial.criterioId,
  };
}

const SAMPLE_RUBRICA: Rubrica = {
  criterios: [
    { id: "c1", nombre: "Coherencia", peso: 4, descripcion: "" },
    { id: "c2", nombre: "Evidencia", peso: 5, descripcion: "" },
    { id: "c3", nombre: "Estilo", peso: 2, descripcion: "" },
  ],
};

test("PENALTY constants match the calibration (suave)", () => {
  expect(PENALTY.alta).toBe(2);
  expect(PENALTY.media).toBe(1);
  expect(PENALTY.baja).toBe(0.5);
  expect(PENALTY_PER_MISSING_PASADA).toBe(1);
  expect(MAX_SCORE).toBe(10);
});

test("never evaluated → overall null + wasEvaluated false (empty state, not fake 10/10)", () => {
  const r = computeBenchmark({
    anotaciones: [],
    rubrica: SAMPLE_RUBRICA,
    evaluacionMeta: undefined,
    essayMode: "academico",
    essayUpdatedAt: T0,
  });
  expect(r.overall).toBeNull();
  expect(r.wasEvaluated).toBe(false);
  expect(r.hasRubrica).toBe(true);
  expect(r.hasAnotaciones).toBe(false);
});

test("evaluated + clean + full coverage → real 10.0 (the perfect state)", () => {
  const r = computeBenchmark({
    anotaciones: [],
    rubrica: SAMPLE_RUBRICA,
    evaluacionMeta: fullCoverage("academico"),
    essayMode: "academico",
    essayUpdatedAt: T0,
  });
  expect(r.overall).toBe(10);
  expect(r.wasEvaluated).toBe(true);
  expect(r.coverageRatio).toBe(1);
  expect(r.missingPasadas).toEqual([]);
});

test("evaluated + clean + partial coverage (3 of 4) → capped at 9, not 10", () => {
  const r = computeBenchmark({
    anotaciones: [],
    rubrica: SAMPLE_RUBRICA,
    evaluacionMeta: partialCoverage(
      ["coherencia", "estilo", "argumento"],
      "academico",
    ),
    essayMode: "academico",
    essayUpdatedAt: T0,
  });
  expect(r.overall).toBe(9);
  expect(r.missingPasadas).toEqual(["apa"]);
  expect(r.coverageRatio).toBeCloseTo(0.75, 5);
});

test("evaluated + clean + partial coverage (2 of 4) → capped at 8", () => {
  const r = computeBenchmark({
    anotaciones: [],
    rubrica: SAMPLE_RUBRICA,
    evaluacionMeta: partialCoverage(
      ["coherencia", "estilo"],
      "academico",
    ),
    essayMode: "academico",
    essayUpdatedAt: T0,
  });
  expect(r.overall).toBe(8);
  expect(r.missingPasadas.sort()).toEqual(["apa", "argumento"]);
});

test("one anotación baja against criterio → that criterio is 9.5/10", () => {
  const r = computeBenchmark({
    anotaciones: [makeAnotacion({ severidad: "baja", criterioId: "c1" })],
    rubrica: SAMPLE_RUBRICA,
    evaluacionMeta: fullCoverage("academico"),
    essayMode: "academico",
    essayUpdatedAt: T0,
  });
  const c1 = r.perCriterio.find((b) => b.criterio.id === "c1")!;
  expect(c1.score).toBe(9.5);
  const c2 = r.perCriterio.find((b) => b.criterio.id === "c2")!;
  expect(c2.score).toBe(10);
});

test("one anotación alta → criterio drops to 8/10", () => {
  const r = computeBenchmark({
    anotaciones: [makeAnotacion({ severidad: "alta", criterioId: "c1" })],
    rubrica: SAMPLE_RUBRICA,
    evaluacionMeta: fullCoverage("academico"),
    essayMode: "academico",
    essayUpdatedAt: T0,
  });
  const c1 = r.perCriterio.find((b) => b.criterio.id === "c1")!;
  expect(c1.score).toBe(8);
});

test("five high-severity anotaciones on one criterio → floored at 0", () => {
  const annos = Array.from({ length: 5 }, (_, i) =>
    makeAnotacion({ severidad: "alta", criterioId: "c1" }, i),
  );
  const r = computeBenchmark({
    anotaciones: annos,
    rubrica: SAMPLE_RUBRICA,
    evaluacionMeta: fullCoverage("academico"),
    essayMode: "academico",
    essayUpdatedAt: T0,
  });
  expect(r.perCriterio.find((b) => b.criterio.id === "c1")!.score).toBe(0);
});

test("overall is weighted by criterio peso, not unweighted average", () => {
  // c1 (peso 4): 1 alta → 8
  // c2 (peso 5): clean → 10
  // c3 (peso 2): 1 alta → 8
  // weighted = (8*4 + 10*5 + 8*2) / (4+5+2) = (32+50+16) / 11 ≈ 8.9
  const r = computeBenchmark({
    anotaciones: [
      makeAnotacion({ severidad: "alta", criterioId: "c1" }, 0),
      makeAnotacion({ severidad: "alta", criterioId: "c3" }, 1),
    ],
    rubrica: SAMPLE_RUBRICA,
    evaluacionMeta: fullCoverage("academico"),
    essayMode: "academico",
    essayUpdatedAt: T0,
  });
  expect(r.overall).toBe(8.9);
});

test("coverage penalty stacks with anotación penalty", () => {
  // 1 alta on c1 → baseOverall ≈ 8.9 (per above). Partial coverage (3
  // of 4) deducts 1 more → 7.9.
  const r = computeBenchmark({
    anotaciones: [makeAnotacion({ severidad: "alta", criterioId: "c1" })],
    rubrica: SAMPLE_RUBRICA,
    evaluacionMeta: partialCoverage(
      ["coherencia", "estilo", "argumento"],
      "academico",
    ),
    essayMode: "academico",
    essayUpdatedAt: T0,
  });
  // baseOverall = (8*4 + 10*5 + 10*2) / 11 = (32+50+20)/11 ≈ 9.27 → minus 1 = 8.27
  expect(r.overall).toBeCloseTo(8.3, 1);
});

test("anotaciones without criterioId go to the 'general' bucket", () => {
  const r = computeBenchmark({
    anotaciones: [
      makeAnotacion({ severidad: "alta", criterioId: "c1" }, 0),
      makeAnotacion({ severidad: "alta" /* no criterioId */ }, 1),
    ],
    rubrica: SAMPLE_RUBRICA,
    evaluacionMeta: fullCoverage("academico"),
    essayMode: "academico",
    essayUpdatedAt: T0,
  });
  expect(r.perCriterio.find((b) => b.criterio.id === "c1")!.score).toBe(8);
  expect(r.general).toHaveLength(1);
  for (const b of r.perCriterio) {
    expect(b.anotaciones.every((a) => a.criterioId === b.criterio.id)).toBe(
      true,
    );
  }
});

test("without rúbrica → overall computed from all anotaciones, perCriterio empty", () => {
  const r = computeBenchmark({
    anotaciones: [
      makeAnotacion({ severidad: "alta" }, 0),
      makeAnotacion({ severidad: "media" }, 1),
      makeAnotacion({ severidad: "baja" }, 2),
    ],
    rubrica: undefined,
    evaluacionMeta: fullCoverage("academico"),
    essayMode: "academico",
    essayUpdatedAt: T0,
  });
  // 10 − 2 − 1 − 0.5 = 6.5
  expect(r.overall).toBe(6.5);
  expect(r.perCriterio).toEqual([]);
  expect(r.hasRubrica).toBe(false);
  expect(r.hasAnotaciones).toBe(true);
});

test("essay updated after evaluation → isStale true", () => {
  const r = computeBenchmark({
    anotaciones: [],
    rubrica: SAMPLE_RUBRICA,
    evaluacionMeta: fullCoverage("academico"),
    essayMode: "academico",
    essayUpdatedAt: T_LATER, // ← later than evaluadoEn
  });
  expect(r.isStale).toBe(true);
  // Overall still computes (10 because clean + full coverage).
  expect(r.overall).toBe(10);
});

test("essay updated equal to evaluadoEn → isStale false (no false positive on apply)", () => {
  const r = computeBenchmark({
    anotaciones: [],
    rubrica: SAMPLE_RUBRICA,
    evaluacionMeta: fullCoverage("academico"),
    essayMode: "academico",
    essayUpdatedAt: T0,
  });
  expect(r.isStale).toBe(false);
});

test("blog mode has 3 pasadas; full coverage of 3 → 10/10 possible", () => {
  const r = computeBenchmark({
    anotaciones: [],
    rubrica: SAMPLE_RUBRICA,
    evaluacionMeta: fullCoverage("blog"),
    essayMode: "blog",
    essayUpdatedAt: T0,
  });
  expect(r.overall).toBe(10);
  expect(r.pasadasDisponibles).toHaveLength(3);
  expect(r.missingPasadas).toEqual([]);
});

test("extracts anotaciones from a TipTap doc and dedupes by id (split text nodes)", () => {
  const content = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "primer span",
            marks: [
              {
                type: "annotation",
                attrs: {
                  id: "x1",
                  sage: "em",
                  pase: "estilo",
                  severidad: "alta",
                  mensaje: "msg1",
                  sugerencia: "fix1",
                  criterioId: "c2",
                },
              },
            ],
          },
          {
            // Same mark id continuing across a text-node split — should dedupe.
            type: "text",
            text: " sigue",
            marks: [
              {
                type: "annotation",
                attrs: { id: "x1", severidad: "alta" },
              },
            ],
          },
          {
            type: "text",
            text: "otro",
            marks: [
              {
                type: "annotation",
                attrs: {
                  id: "x2",
                  sage: "sis",
                  pase: "coherencia",
                  severidad: "baja",
                  mensaje: "msg2",
                },
              },
            ],
          },
        ],
      },
    ],
  };
  const out = extractAnotacionesFromContent(content);
  expect(out).toHaveLength(2);
  expect(out.map((a) => a.id).sort()).toEqual(["x1", "x2"]);
  // First one keeps its full attrs (the richer occurrence wins).
  const x1 = out.find((a) => a.id === "x1")!;
  expect(x1.mensaje).toBe("msg1");
  expect(x1.sugerencia).toBe("fix1");
  expect(x1.criterioId).toBe("c2");
});
