import type { Essay } from "@/lib/storage/types";
import { computeBenchmark, extractAnotacionesFromContent } from "@/lib/benchmark/score";
import type { JsonObject } from "../../../shared/mcp";
import { matches, page } from "./collections";

/** Read the same score the UI computes, including persisted clean evaluations. */
export function readEvaluation(essay: Essay, args: JsonObject, dismissed: boolean): JsonObject {
  const score = computeBenchmark({
    anotaciones: extractAnotacionesFromContent(essay.content),
    rubrica: essay.rubrica, evaluacionMeta: essay.evaluacionMeta,
    essayMode: essay.mode, essayUpdatedAt: essay.updatedAt,
  });
  const criteria = score.perCriterio.filter(item => matches(args.query, item.criterio.nombre, item.criterio.descripcion));
  return {
    overall: score.overall, wasEvaluated: score.wasEvaluated, isStale: score.isStale,
    hasRubric: score.hasRubrica, hasAnnotations: score.hasAnotaciones,
    coverageRatio: score.coverageRatio, coveredPasses: score.pasadasCubiertas,
    availablePasses: score.pasadasDisponibles, missingPasses: score.missingPasadas,
    visible: !dismissed && (score.wasEvaluated || score.hasAnotaciones),
    evaluatedAt: essay.evaluacionMeta?.evaluadoEn ?? null,
    reviewerRuns: (essay.evaluacionMeta?.reviewerRuns ?? []).map(run => ({
      pase: run.pase, profileId: run.provenance?.profileId,
      requestedModel: run.provenance?.requestedModel, resolvedModel: run.provenance?.resolvedModel,
    })),
    criteria: page(criteria.map(item => ({ id: item.criterio.id, name: item.criterio.nombre, weight: item.criterio.peso, score: item.score, annotationCount: item.anotaciones.length })), args),
    generalAnnotationCount: score.general.length,
  };
}
