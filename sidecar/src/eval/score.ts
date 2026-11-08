import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { parseAnnotationsDetailed } from "../annotation-parser.js";
import { arg, loadCorpus, readJson, writePrivate, DEFAULT_RUNS, cliError } from "./io.js";
import { validateCorpus } from "./validate.js";
import type { RunPlan, CallRecord, Corpus } from "./schema.js";
import { validateRunPlan } from "./plan.js";

type Judgement = {
  caseId: string; profileId: string; status: "adjudicated"; adjudicator: string;
  annotationMatches: { annotationIndex: number; expectedFindingId: string | null; support: "supported" | "contradicted" | "not_addressed" | "unverifiable"; useful: number; warrantedUncertainty: number; preservesVoice: number }[];
  missedExpectedFindingIds: string[];
};
export type EvaluationInput = { plan: RunPlan; records: CallRecord[] };
export async function readEvaluationInput(): Promise<EvaluationInput> {
  const resultPath = arg("--results");
  if (resultPath) return readJson<EvaluationInput>(resolve(resultPath));
  const planPath = arg("--plan");
  if (!planPath) throw new Error("Provide --results or --plan; no synthetic model outputs are generated.");
  return { plan: await readJson<RunPlan>(resolve(planPath)), records: [] };
}

export function assess(input: EvaluationInput, corpus: Corpus, judgments: Judgement[] = []) {
  validateRunPlan(input.plan, corpus);
  if (!Array.isArray(input.records) || !Array.isArray(judgments)) throw new Error("Results and adjudications must be arrays.");
  const judgmentKeys = new Set<string>();
  for (const judgment of judgments) {
    const key = `${judgment.caseId}:${judgment.profileId}`;
    if (judgmentKeys.has(key) || !input.records.some((record) => record.caseId === judgment.caseId && record.profileId === judgment.profileId)) throw new Error("Unknown or duplicate human adjudication.");
    judgmentKeys.add(key);
  }
  const seen = new Set<string>();
  const results = input.records.map((record) => {
    const key = `${record.caseId}:${record.profileId}`;
    if (seen.has(key)) throw new Error("Duplicate case/profile result; repetitions require a distinct captured run.");
    seen.add(key);
    const item = corpus.cases.find((c) => c.id === record.caseId);
    const call = input.plan.calls.find((c) => c.caseId === record.caseId && c.profileId === record.profileId);
    if (!item || !call) throw new Error("Result does not belong to the captured plan.");
    if (!["complete", "error"].includes(record.status) || !Number.isFinite(record.durationMs) || record.durationMs < 0) throw new Error("Invalid observed call record.");
    const sources = item.sourceIds.map((id) => { const source = corpus.sources.find((s) => s.id === id)!; return { id: source.id, contenido: source.content }; });
    const parsed = parseAnnotationsDetailed(record.rawOutput ?? "", sources);
    const rawPresent = typeof record.rawOutput === "string";
    const annotations = parsed.annotations;
    const anchors = annotations.map((a) => {
      const first = item.draft.indexOf(a.cita);
      return { present: a.cita.length > 0 && first !== -1, ambiguous: a.cita.length > 0 && first !== -1 && item.draft.indexOf(a.cita, first + 1) !== -1 };
    });
    const evidence = annotations.flatMap((a) => a.evidence ?? []);
    const judgment = judgments.find((j) => j.caseId === record.caseId && j.profileId === record.profileId);
    let quality: { precision: number | null; recall: number | null; truePositives: number; falsePositives: number; falseNegatives: number; supported: number; contradicted: number; notAddressed: number; unverifiable: number } | null = null;
    if (judgment) {
      if (item.answerKeyStatus !== "adjudicated" || !item.answerKeyProvenance.humanAdjudicator || judgment.status !== "adjudicated" || !judgment.adjudicator) throw new Error("Quality metrics require independently adjudicated answer keys and judgments.");
      if (judgment.annotationMatches.length !== annotations.length || new Set(judgment.annotationMatches.map((m) => m.annotationIndex)).size !== annotations.length) throw new Error("Every annotation needs exactly one human judgment.");
      const expected = new Set(item.expectedFindings.map((f) => f.id));
      const matched = new Set<string>();
      let falsePositives = 0;
      for (const match of judgment.annotationMatches) {
        if (!Number.isInteger(match.annotationIndex) || match.annotationIndex < 0 || match.annotationIndex >= annotations.length || !["supported", "contradicted", "not_addressed", "unverifiable"].includes(match.support)
          || ![match.useful, match.warrantedUncertainty, match.preservesVoice].every((score) => Number.isInteger(score) && score >= 1 && score <= 5)) throw new Error("Invalid human judgment.");
        if (match.expectedFindingId === null) falsePositives += 1;
        else {
          if (!expected.has(match.expectedFindingId) || matched.has(match.expectedFindingId)) throw new Error("Unknown/duplicate matched defect; deduplicate findings before scoring.");
          matched.add(match.expectedFindingId);
        }
      }
      const missing = [...expected].filter((id) => !matched.has(id));
      if (new Set(judgment.missedExpectedFindingIds).size !== missing.length || missing.some((id) => !judgment.missedExpectedFindingIds.includes(id))) throw new Error("Missed-defect adjudication is incomplete.");
      quality = { precision: annotations.length ? matched.size / annotations.length : null,
        recall: expected.size ? matched.size / expected.size : null,
        truePositives: matched.size, falsePositives, falseNegatives: missing.length,
        supported: judgment.annotationMatches.filter((m) => m.support === "supported").length,
        contradicted: judgment.annotationMatches.filter((m) => m.support === "contradicted").length,
        notAddressed: judgment.annotationMatches.filter((m) => m.support === "not_addressed").length,
        unverifiable: judgment.annotationMatches.filter((m) => m.support === "unverifiable").length };
    }
    const provenance = record.provenance as { resolvedModel?: unknown; requestedModel?: unknown; profileId?: unknown; sourceHashes?: unknown; promptHash?: unknown; sdkVersion?: unknown } | undefined;
    const provenanceComparable = typeof provenance?.resolvedModel === "string" && !!provenance.resolvedModel
      && provenance.profileId === call.profileId && (provenance.requestedModel ?? null) === call.requestedModel
      && (call.requestedModel === null || provenance.resolvedModel === call.requestedModel)
      && JSON.stringify(provenance.sourceHashes) === JSON.stringify(call.sourceHashes)
      && provenance.promptHash === call.promptHash && provenance.sdkVersion === input.plan.sdkVersion;
    return { caseId: item.id, profileId: record.profileId, family: item.family, split: item.split,
      runStatus: record.status, recordError: !!record.error, rawOutputPresent: rawPresent, rawLines: parsed.rawLines,
      parserInvalidLines: parsed.invalidLines, parsedAnnotations: annotations.length,
      anchorsMissing: anchors.filter((a) => !a.present).length, anchorsAmbiguous: anchors.filter((a) => a.ambiguous).length,
      evidenceSpans: evidence.length, evidenceInvalid: evidence.filter((e) => e.verification !== "verified").length,
      evidenceLiteralVerified: evidence.filter((e) => e.verification === "verified").length,
      unknownCriterionIds: annotations.filter((annotation) => annotation.criterioId !== undefined).length,
      provenanceComparable,
      requestedModel: call.requestedModel, resolvedModel: typeof provenance?.resolvedModel === "string" ? provenance.resolvedModel : null,
      durationMs: record.durationMs, costUsd: record.costUsd ?? null,
      answerKeyStatus: item.answerKeyStatus, semanticAndVoiceAssessment: quality ? "human-adjudicated" : "pending-human-adjudication", quality,
    };
  });
  const missing = input.plan.calls.filter((call) => !seen.has(`${call.caseId}:${call.profileId}`)).map((call) => ({ caseId: call.caseId, profileId: call.profileId, status: "not-run" }));
  const profileModels = new Map<string, Set<string>>();
  for (const result of results) if (result.resolvedModel) {
    const models = profileModels.get(result.profileId) ?? new Set<string>();
    models.add(result.resolvedModel); profileModels.set(result.profileId, models);
  }
  const modelResolutionConsistent = [...profileModels.values()].every((models) => models.size === 1);
  return { corpusHash: corpus.corpusHash, plannedCalls: input.plan.calls.length, completedRecords: input.records.filter((r) => r.status === "complete").length,
    errorRecords: input.records.filter((r) => r.status === "error").length, missingCalls: missing,
    modelResolutionConsistent,
    modelQualityMeasured: results.length > 0 && missing.length === 0 && modelResolutionConsistent && results.every((r) => r.quality !== null && r.runStatus === "complete" && !r.recordError && r.rawOutputPresent && r.provenanceComparable),
    results, note: "Literal-span verification is not proof of semantic support. Empty output has undefined precision, not a perfect score. Missing/error runs remain visible; no overall quality grade is fabricated." };
}
async function main() {
  const input = await readEvaluationInput(); const corpus = await loadCorpus(input.plan.corpusDirectory); validateCorpus(corpus);
  const adjudications = arg("--adjudications") ? await readJson<Judgement[]>(resolve(arg("--adjudications")!)) : [];
  const result = assess(input, corpus, adjudications);
  const out = arg("--out") ?? resolve(DEFAULT_RUNS, input.plan.id, "score.json");
  await writePrivate(out, result);
  console.log(JSON.stringify({ modelQualityMeasured: result.modelQualityMeasured, completedRecords: result.completedRecords, missingCalls: result.missingCalls.length, scorePath: out }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(cliError);
