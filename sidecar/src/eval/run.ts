import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { prepareReview, runReview, ReviewRunError } from "../runner.js";
import { resolveReviewerProfile, DEFAULT_REVIEWER_PROFILE } from "../model-profiles.js";
import { arg, numberArg, hash, loadCorpus, DEFAULT_RUNS, readJson, writePrivate, cliError } from "./io.js";
import { validateCorpus } from "./validate.js";
import type { RunPlan, PlannedCall, CallRecord } from "./schema.js";
import { API_RATES, PARSER_VERSION, requestForCase, validateRunPlan } from "./plan.js";

async function preparePlan(): Promise<{ plan: RunPlan; path: string }> {
  const corpus = await loadCorpus(); validateCorpus(corpus);
  const split = arg("--split") ?? "development";
  if (!["development", "holdout", "all"].includes(split)) throw new Error("--split must be development, holdout or all.");
  const profileIds = (arg("--profiles") ?? DEFAULT_REVIEWER_PROFILE).split(",");
  if (!profileIds.length || new Set(profileIds).size !== profileIds.length) throw new Error("Provide distinct reviewer profiles.");
  const profiles = profileIds.map((id) => resolveReviewerProfile(id));
  const maxInputTokens = numberArg("--max-input-tokens", 32000);
  const maxOutputTokens = numberArg("--max-output-tokens", 2000);
  const timeoutMs = numberArg("--timeout-ms", 120000);
  if (![maxInputTokens, maxOutputTokens, timeoutMs].every(Number.isSafeInteger)) throw new Error("Token and timeout ceilings must be safe integers.");
  const selected = corpus.cases.filter((item) => split === "all" || item.split === split);
  if (!selected.length) throw new Error("No cases selected.");
  const calls: PlannedCall[] = [];
  let sdkVersion = "unknown";
  for (const item of selected) for (const profile of profiles) {
    // Deliberately exclude expected findings, forbidden corrections and gold labels.
    const request = requestForCase(item, corpus, profile.id, randomUUID());
    const prepared = await prepareReview(request);
    sdkVersion = prepared.provenance.sdkVersion;
    // UTF-8 bytes form a deliberately conservative input allowance, not an
    // exact provider tokenizer estimate. Provider-added wrappers may differ.
    const inputBytes = Buffer.byteLength(prepared.userPrompt + prepared.systemPrompt, "utf8");
    if (inputBytes > maxInputTokens) throw new Error(`Conservative input allowance exceeded for case ${item.id}; raise the explicit ceiling after reviewing the dry run.`);
    const rates = profile.model ? API_RATES[profile.model] : undefined;
    calls.push({ caseId: item.id, family: item.family, split: item.split,
      profileId: profile.id, request, caseHash: hash(JSON.stringify(item)),
      promptHash: prepared.provenance.promptHash, sourceHashes: prepared.provenance.sourceHashes,
      requestedModel: profile.model ?? null, inputTokenCeiling: maxInputTokens,
      outputTokenCeiling: maxOutputTokens,
      estimatedUsd: rates ? (maxInputTokens * rates.input + maxOutputTokens * rates.output) / 1_000_000 : null,
    });
  }
  const plan: RunPlan = {
    version: 1, id: randomUUID(), createdAt: new Date().toISOString(), corpusHash: corpus.corpusHash,
    corpusDirectory: corpus.directory, parserVersion: PARSER_VERSION, sdkVersion,
    modelInferenceExecuted: false, calls, totalCalls: calls.length,
    estimatedUsd: calls.some((call) => call.estimatedUsd === null) ? null : calls.reduce((total, call) => total + call.estimatedUsd!, 0),
    timeoutMs, maxInputTokens, maxOutputTokens,
    pricing: { source: "https://platform.claude.com/docs/en/about-claude/pricing", retrievedAt: "2026-11-07",
      note: "API planning estimate only; OAuth subscription use is different. Byte allowance is conservative, provider overhead and accounting may differ; SDK budget accounting is not a hard billing cap." },
  };
  const directory = resolve(arg("--out-dir") ?? DEFAULT_RUNS, plan.id);
  validateRunPlan(plan, corpus);
  const path = resolve(directory, "plan.json");
  await writePrivate(path, plan);
  const planSha256 = hash(await readFile(path, "utf8"));
  await writePrivate(resolve(directory, "approval-request.json"), {
    planSha256, totalCalls: plan.totalCalls, estimatedUsd: plan.estimatedUsd,
    approved: false, note: "Not an approval. A human must approve this exact manifest and a nonzero consumption budget before --execute.",
  });
  return { plan, path };
}

type Approval = { approved: true; planSha256: string; approvedBy: string; approvedAt: string; maxCalls: number; maxBudgetUsd: number; privateSourcesApproved: boolean };
async function executeApprovedPlan(): Promise<void> {
  const planPath = arg("--plan"), approvalPath = arg("--approval-file");
  if (!planPath || !approvalPath) throw new Error("Execution requires --plan and a separately human-approved --approval-file. No model was called.");
  const bytes = await readFile(resolve(planPath), "utf8");
  const raw: unknown = JSON.parse(bytes);
  if (!raw || typeof raw !== "object" || !("corpusDirectory" in raw) || typeof raw.corpusDirectory !== "string") throw new Error("Invalid plan corpus directory. No model was called.");
  const corpus = await loadCorpus(raw.corpusDirectory); validateCorpus(corpus);
  const plan = validateRunPlan(raw, corpus);
  const approval = await readJson<Approval>(resolve(approvalPath));
  if (approval.approved !== true || approval.planSha256 !== hash(bytes) || !approval.approvedBy || !Number.isFinite(Date.parse(approval.approvedAt))
    || !Number.isSafeInteger(approval.maxCalls) || approval.maxCalls < plan.totalCalls || !Number.isFinite(approval.maxBudgetUsd) || approval.maxBudgetUsd <= 0) {
    throw new Error("Missing or mismatched human approval/budget. No model was called.");
  }
  if (plan.estimatedUsd !== null && plan.estimatedUsd > approval.maxBudgetUsd) throw new Error("Approved budget is below the planning estimate. No model was called.");
  const selectedSourceIds = new Set(plan.calls.flatMap((call) => call.request.fuentes?.map((source) => source.id) ?? []));
  if (corpus.sources.some((source) => selectedSourceIds.has(source.id) && source.privacy === "private") && approval.privateSourcesApproved !== true) throw new Error("Selected private sources require explicit inclusion approval, regardless of corpus folder. No model was called.");
  // Verify every call before the first inference, including current prompt/profile.
  for (const call of plan.calls) {
    const item = corpus.cases.find((candidate) => candidate.id === call.caseId);
    if (!item || call.caseHash !== hash(JSON.stringify(item))) throw new Error("Case changed since approval. No model was called.");
    const profile = resolveReviewerProfile(call.profileId);
    if ((profile.model ?? null) !== call.requestedModel) throw new Error("Model profile changed since approval. No model was called.");
    const prepared = await prepareReview(call.request);
    if (prepared.provenance.promptHash !== call.promptHash || prepared.provenance.sdkVersion !== plan.sdkVersion || JSON.stringify(prepared.provenance.sourceHashes) !== JSON.stringify(call.sourceHashes)) throw new Error("Runtime prompt/source/SDK changed since approval. No model was called.");
    if (Buffer.byteLength(prepared.userPrompt + prepared.systemPrompt, "utf8") > call.inputTokenCeiling) throw new Error("Input allowance changed since approval. No model was called.");
  }
  const records: CallRecord[] = [];
  let spent = 0;
  const executionId = randomUUID();
  const directory = resolve(arg("--out-dir") ?? DEFAULT_RUNS, executionId);
  // A consumption approval covers one attempt, not unlimited reruns of the
  // same manifest. Exclusive creation also rejects simultaneous executions.
  await writePrivate(resolve(dirname(resolve(planPath)), "execution-claimed.json"), { executionId, planSha256: hash(bytes), claimedAt: new Date().toISOString() });
  await writePrivate(resolve(directory, "execution.json"), { planSha256: hash(bytes), approvedBy: approval.approvedBy, startedAt: new Date().toISOString(), plan });
  for (const call of plan.calls) {
    const remaining = approval.maxBudgetUsd - spent;
    if (remaining <= 0 || (call.estimatedUsd !== null && call.estimatedUsd > remaining)) break;
    const started = performance.now();
    const record: CallRecord = { caseId: call.caseId, profileId: call.profileId, status: "error", durationMs: 0 };
    try {
      const result = await runReview(call.request, { maxBudgetUsd: remaining, timeoutMs: plan.timeoutMs, maxOutputTokens: call.outputTokenCeiling });
      record.status = "complete"; record.rawOutput = result.result; record.costUsd = result.costUsd;
      record.provenance = result.provenance; record.usage = result.usage; record.modelUsage = result.modelUsage;
      if (typeof result.costUsd === "number" && Number.isFinite(result.costUsd) && result.costUsd >= 0) spent += result.costUsd;
      else record.error = "Cost metadata unavailable; no further calls scheduled.";
    } catch (error) {
      record.error = "Provider/runtime call failed; no automatic retries or model fallback. Consumption may be unknown.";
      if (error instanceof ReviewRunError && error.details) {
        record.costUsd = error.details.costUsd; record.provenance = error.details.provenance;
        record.usage = error.details.usage; record.modelUsage = error.details.modelUsage;
        if (typeof record.costUsd === "number" && Number.isFinite(record.costUsd) && record.costUsd >= 0) spent += record.costUsd;
      }
    }
    record.durationMs = performance.now() - started; records.push(record);
    await writePrivate(resolve(directory, `${String(records.length).padStart(3, "0")}.json`), record);
    if (record.status !== "complete" || record.error || !record.provenance) break;
  }
  await writePrivate(resolve(directory, "results.json"), { executionId, plan, records, estimatedSpendUsd: spent, complete: records.length === plan.calls.length && records.every((r) => r.status === "complete" && !r.error),
    qualityMeasured: false, note: "Raw outputs and costs are observations, not human-adjudicated quality scores. SDK budgets are not hard billing caps." });
  console.log(JSON.stringify({ executionId, completedCalls: records.length, requestedCalls: plan.totalCalls, estimatedSpendUsd: spent, outputDirectory: directory, qualityMeasured: false }));
}

async function main(): Promise<void> {
  if (process.argv.includes("--execute")) { await executeApprovedPlan(); return; }
  if (arg("--plan") || arg("--approval-file")) throw new Error("Use --execute only after explicit human approval. The default command is a dry run.");
  const { plan, path } = await preparePlan();
  console.log(JSON.stringify({ mode: "dry-run", modelCalls: 0, cases: new Set(plan.calls.map((c) => c.caseId)).size, totalPlannedCalls: plan.totalCalls, estimatedUsd: plan.estimatedUsd, planPath: path, planSha256: hash(await readFile(path, "utf8")), answerKeysHumanAdjudicated: false }, null, 2));
}
main().catch(cliError);
