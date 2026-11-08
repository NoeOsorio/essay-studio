import type { CritiqueRequest } from "../review-contract.js";
export type Family = "evidence" | "citation" | "apa" | "calibration" | "voice" | "injection";
export type CorpusSource = {
  id: string; familyId: string; title: string; kind: "synthetic" | "permitted-excerpt";
  content: string; contentSha256: string; attribution: string; permittedUse: string;
  privacy: "public" | "private";
  url?: string; capturedAt: string; printedPagesVerified: boolean;
  locator: { section: string; paragraph: number };
};
export type ExpectedFinding = {
  id: string; essayQuote: string; essayFrom: number; essayTo: number;
  diagnosis: string; severity: "alta" | "media" | "baja";
  evidence: { sourceId: string; quote: string; from: number; to: number }[];
};
export type BenchmarkCase = {
  id: string; family: Family; split: "development" | "holdout";
  sourceIds: string[]; draft: string; language: "es" | "en";
  sage: "em" | "sis" | "pra" | "cri";
  pase: "coherencia" | "estilo" | "argumento" | "apa";
  answerKeyStatus: "draft" | "reviewed" | "adjudicated";
  answerKeyProvenance: { author: string; method: string; humanAdjudicator: string | null };
  expectedFindings: ExpectedFinding[]; forbiddenCorrections: string[];
  expectedBehavior: string; ruleReferences: string[];
};
export type CorpusManifest = {
  version: 1; name: string; createdAt: string;
  files: { sourcesSha256: string; casesSha256: string };
  policy: string; sources: number; cases: number;
};
export type Corpus = { manifest: CorpusManifest; sources: CorpusSource[]; cases: BenchmarkCase[]; corpusHash: string; directory: string };
export type PlannedCall = {
  caseId: string; family: Family; split: BenchmarkCase["split"]; profileId: string;
  request: CritiqueRequest; caseHash: string; promptHash: string; sourceHashes: {sourceId:string;sha256:string}[];
  requestedModel: string | null; inputTokenCeiling: number; outputTokenCeiling: number;
  estimatedUsd: number | null;
};
export type RunPlan = {
  version: 1; id: string; createdAt: string; corpusHash: string; corpusDirectory: string;
  parserVersion: string; sdkVersion: string; modelInferenceExecuted: false;
  calls: PlannedCall[]; totalCalls: number; estimatedUsd: number | null;
  timeoutMs: number; maxInputTokens: number; maxOutputTokens: number;
  pricing: { source: string; retrievedAt: string; note: string };
};
export type CallRecord = {
  caseId: string; profileId: string; status: "complete" | "error";
  durationMs: number; rawOutput?: string; error?: string; costUsd?: number;
  provenance?: unknown; usage?: unknown; modelUsage?: unknown;
};
