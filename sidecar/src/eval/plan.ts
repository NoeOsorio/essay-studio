import { hash } from "./io.js";
import type { BenchmarkCase, Corpus, RunPlan } from "./schema.js";
import type { CritiqueRequest } from "../review-contract.js";
import { resolveReviewerProfile } from "../model-profiles.js";

export const PARSER_VERSION = "review-annotations-v2-evidence";
// Official API planning rates captured 2026-11-07. Not an OAuth billing promise.
export const API_RATES: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
};

export function requestForCase(item: BenchmarkCase, corpus: Corpus, profileId: string, id: string): CritiqueRequest {
  return {
    id, type: "critique", sage: item.sage, pase: item.pase,
    text: item.draft, language: item.language, reviewerProfile: profileId,
    fuentes: item.sourceIds.map((sourceId) => {
      const source = corpus.sources.find((s) => s.id === sourceId)!;
      return { id: source.id, nombre: source.title, contenido: source.content, origen: "texto" };
    }),
  };
}

const positiveInteger = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const digest = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const amount = (value: unknown) => value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
const fail = () => { throw new Error("Invalid or changed run plan. No model was called."); };

/** Validate a captured plan before any inference or interpretation of results. */
export function validateRunPlan(value: unknown, corpus: Corpus): RunPlan {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
  const plan = value as RunPlan;
  if (plan.version !== 1 || plan.modelInferenceExecuted !== false || typeof plan.id !== "string" || !plan.id
    || !Number.isFinite(Date.parse(plan.createdAt)) || plan.corpusHash !== corpus.corpusHash
    || plan.parserVersion !== PARSER_VERSION || typeof plan.sdkVersion !== "string" || !plan.sdkVersion
    || !positiveInteger(plan.maxInputTokens) || !positiveInteger(plan.maxOutputTokens)
    || !positiveInteger(plan.timeoutMs) || plan.timeoutMs > 600_000
    || !positiveInteger(plan.totalCalls) || !Array.isArray(plan.calls) || plan.calls.length !== plan.totalCalls
    || !amount(plan.estimatedUsd)) return fail();
  const seen = new Set<string>();
  for (const call of plan.calls) {
    if (!call || typeof call !== "object" || typeof call.caseId !== "string" || typeof call.profileId !== "string") return fail();
    const key = `${call.caseId}:${call.profileId}`;
    if (seen.has(key)) return fail();
    seen.add(key);
    const item = corpus.cases.find((candidate) => candidate.id === call.caseId);
    if (!item || call.family !== item.family || call.split !== item.split || call.caseHash !== hash(JSON.stringify(item))
      || !digest(call.promptHash) || call.inputTokenCeiling !== plan.maxInputTokens || call.outputTokenCeiling !== plan.maxOutputTokens
      || !amount(call.estimatedUsd) || !call.request || typeof call.request.id !== "string" || !call.request.id) return fail();
    const profile = resolveReviewerProfile(call.profileId);
    if (call.requestedModel !== (profile.model ?? null)) return fail();
    // Reconstruct production input from the sealed case. The answer key can
    // never be smuggled into a call while retaining the original case hash.
    const expected = requestForCase(item, corpus, profile.id, call.request.id);
    if (JSON.stringify(call.request) !== JSON.stringify(expected)) return fail();
    const expectedHashes = expected.fuentes!.map((source) => ({ sourceId: source.id, sha256: hash(source.contenido) }));
    if (JSON.stringify(call.sourceHashes) !== JSON.stringify(expectedHashes)) return fail();
    const rates = profile.model ? API_RATES[profile.model] : undefined;
    const estimate = rates ? (plan.maxInputTokens * rates.input + plan.maxOutputTokens * rates.output) / 1_000_000 : null;
    if (call.estimatedUsd !== estimate) return fail();
  }
  const total = plan.calls.some((call) => call.estimatedUsd === null) ? null : plan.calls.reduce((sum, call) => sum + call.estimatedUsd!, 0);
  if (plan.estimatedUsd !== total) return fail();
  return plan;
}
