/** Production inference path, shared with explicit, budget-approved benchmark execution. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { query, type AccountInfo, type Options, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { buildExtractPrompt, extractSystemPrompt } from "./extract-prompts.js";
import { buildAskPrompt, buildCritiquePrompt, buildInterrogationPrompt, loadSagePrompt } from "./prompts.js";
import { getReviewerProfile } from "./model-profiles.js";
import { assertReviewRequest, type ReviewRequest, type ReviewProvenance } from "./review-contract.js";

export type RunReviewOptions = {
  onToken?: (delta: string) => void; signal?: AbortSignal;
  maxBudgetUsd?: number; timeoutMs?: number; maxOutputTokens?: number;
};
export type ReviewResult = { result: string; costUsd?: number; usage?: unknown; modelUsage?: unknown; provenance: ReviewProvenance };
export class ReviewRunError extends Error {
  constructor(public code: string, message: string, public details?: Partial<ReviewResult>) { super(message); }
}
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const require = createRequire(import.meta.url);
async function sdkVersion(): Promise<string> {
  const packageFile = join(dirname(require.resolve("@anthropic-ai/claude-agent-sdk")), "package.json");
  const value: unknown = JSON.parse(await readFile(packageFile, "utf8"));
  if (!value || typeof value !== "object" || !("version" in value) || typeof value.version !== "string") throw new Error("Cannot establish SDK provenance.");
  return value.version;
}

function sourceHashesOf(req: ReviewRequest): ReviewProvenance["sourceHashes"] {
  switch (req.type) {
    case "critique": return (req.fuentes ?? []).map((source) => ({ sourceId: source.id, sha256: sha256(source.contenido) }));
    case "interrogate":
    case "ask":
    case "extract": return [];
    default: { const unreachable: never = req; throw new Error(`Unknown request type: ${String(unreachable)}`); }
  }
}

/** Safe dry preparation: reads only local prompt/package files, never initializes the SDK. */
export async function prepareReview(req: ReviewRequest) {
  assertReviewRequest(req);
  const profile = getReviewerProfile(req.reviewerProfile);
  let userPrompt: string;
  switch (req.type) {
    case "critique": userPrompt = buildCritiquePrompt(req); break;
    case "interrogate": userPrompt = buildInterrogationPrompt(req); break;
    case "ask": userPrompt = buildAskPrompt(req); break;
    case "extract": userPrompt = buildExtractPrompt(req); break;
    default: { const unreachable: never = req; throw new Error(`Unknown request type: ${String(unreachable)}`); }
  }
  // Extraction has no persona: a fixed prompt per task, never a sage file.
  const systemPrompt = req.type === "extract" ? extractSystemPrompt(req.task) : await loadSagePrompt(req.sage);
  const provenance: ReviewProvenance = {
    profileId: profile.id, ...(profile.model ? { requestedModel: profile.model } : {}),
    sdkVersion: await sdkVersion(), promptHash: sha256(JSON.stringify({ systemPrompt, userPrompt })),
    sourceHashes: sourceHashesOf(req),
    startedAt: new Date().toISOString(), tools: [], settingSources: [],
  };
  return { userPrompt, systemPrompt, provenance, optionsSummary: {
    model: profile.model ?? null, tools: [], settingSources: [], strictMcpConfig: true,
    maxTurns: 1, persistSession: false, provider: "claude-code-oauth", profileId: profile.id,
  } };
}

/** Build options separately so the tool/auth fences can be inspected without inference. */
export function reviewOptions(systemPrompt: string, profileId: string | undefined, abortController: AbortController, budget?: number, maxOutputTokens?: number): Options {
  const profile = getReviewerProfile(profileId);
  if (budget !== undefined && (!Number.isFinite(budget) || budget <= 0)) throw new ReviewRunError("INVALID_BUDGET", "Review budget must be positive.");
  if (maxOutputTokens !== undefined && (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 1)) throw new ReviewRunError("INVALID_OUTPUT_LIMIT", "Output token limit must be a positive safe integer.");
  const env = { ...process.env };
  if (maxOutputTokens !== undefined) env.CLAUDE_CODE_MAX_OUTPUT_TOKENS = String(maxOutputTokens);
  // The app's contract is Claude Code OAuth; never silently consume an API-key
  // account, proxy or alternate provider inherited from the launching terminal.
  for (const key of [
    "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "ANTHROPIC_UNIX_SOCKET", "ANTHROPIC_CUSTOM_HEADERS",
    "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY", "CLAUDE_CODE_USE_ANTHROPIC_AWS", "CLAUDE_CODE_USE_MANTLE",
    "CLAUDE_CODE_OAUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR", "CLAUDE_CODE_OAUTH_REFRESH_TOKEN",
  ]) delete env[key];
  return {
    systemPrompt, tools: [], allowedTools: [], mcpServers: {}, strictMcpConfig: true,
    plugins: [], settingSources: [], settings: { forceLoginMethod: "claudeai" }, persistSession: false, maxTurns: 1,
    includePartialMessages: true, abortController,
    ...(profile.model ? { model: profile.model } : {}),
    ...(budget === undefined ? {} : { maxBudgetUsd: budget }),
    env,
    canUseTool: async () => ({ behavior: "deny", message: "Reviewers cannot execute tools." }),
    // SDK diagnostics can contain user text or credentials. Surface only our
    // controlled error categories; never forward raw subprocess stderr.
    stderr: () => undefined,
  };
}

/** AccountInfo is initialization metadata, obtained before releasing input.
 * apiKeySource on system/init reports "none" for several auth modes, not just
 * OAuth. The account's provider/token source disambiguates those modes.
 */
export function assertOAuthAccount(account: AccountInfo): void {
  // CLI 2.1.141's account initializer reports subscriptionType instead of
  // tokenSource for a stored subscription login. Console reports 'Claude API'.
  const subscription = account.tokenSource === undefined && [
    "Claude Pro", "Claude Max", "Claude Team", "Claude Enterprise",
  ].includes(account.subscriptionType ?? "");
  if (account.apiProvider !== "firstParty" || (account.tokenSource !== "claude.ai" && !subscription)
    || (account.apiKeySource !== undefined && account.apiKeySource !== "none")) {
    throw new ReviewRunError("AUTH_MODE_MISMATCH", "Reviewer requires the existing Claude Code claude.ai login. No API-key, bearer-token or cloud-provider fallback was allowed.");
  }
}

export async function runReview(req: ReviewRequest, config: RunReviewOptions = {}): Promise<ReviewResult> {
  const prepared = await prepareReview(req);
  const timeoutMs = config.timeoutMs ?? 120_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 600_000) throw new ReviewRunError("INVALID_TIMEOUT", "Review timeout must be between zero and ten minutes.");
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (config.signal?.aborted) throw new ReviewRunError("CANCELLED", "Review was cancelled before execution.");
  config.signal?.addEventListener("abort", abort, { once: true });
  // A desktop review must not leave an unbounded child process. Callers may
  // choose a shorter deadline for a budgeted benchmark; maximum is ten minutes.
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  let result = "";
  let costUsd: number | undefined;
  let usage: unknown;
  let modelUsage: unknown;
  const provenance = prepared.provenance;
  let initialized = false;
  let completed = false;
  let session: ReturnType<typeof query> | undefined;
  let releaseInput!: () => void;
  const inputGate = new Promise<void>((resolve) => { releaseInput = resolve; });
  const stopInput = () => { releaseInput(); session?.close(); };
  controller.signal.addEventListener("abort", stopInput, { once: true });
  async function* gatedPrompt(): AsyncGenerator<SDKUserMessage> {
    await inputGate;
    if (!controller.signal.aborted) yield {
      type: "user", message: { role: "user", content: prepared.userPrompt },
      parent_tool_use_id: null, session_id: "",
    };
  }
  try {
    const options = reviewOptions(prepared.systemPrompt, req.reviewerProfile, controller, config.maxBudgetUsd, config.maxOutputTokens);
    // Streaming input stays gated while the CLI returns account initialization.
    // No prompt/model request is submitted before the OAuth-only fence passes.
    session = query({ prompt: gatedPrompt(), options });
    if (controller.signal.aborted) { stopInput(); throw new Error("Review aborted during initialization."); }
    const account = await session.accountInfo();
    assertOAuthAccount(account);
    provenance.authMode = "claude-code-oauth";
    releaseInput();
    for await (const message of session) {
      if (message.type === "system" && message.subtype === "init") {
        provenance.resolvedModel = message.model;
        provenance.cliVersion = message.claude_code_version;
        provenance.tools = [...message.tools];
        if (message.tools.length || message.mcp_servers.length) throw new ReviewRunError("TOOL_FENCE_FAILED", "Reviewer initialized an unexpected executable tool surface.");
        // SDK 0.2.141's union incorrectly lists legacy 'oauth'; the bundled CLI
        // reports 'none' for claude.ai. Do not treat that field alone as proof.
        if (String(message.apiKeySource) !== "none") throw new ReviewRunError("AUTH_MODE_MISMATCH", "Reviewer initialized an unexpected API-key source. No fallback was accepted.");
        if (provenance.requestedModel && message.model !== provenance.requestedModel) throw new ReviewRunError("MODEL_MISMATCH", "The runtime selected a different model than requested. No fallback was accepted.");
        initialized = true;
      } else if (message.type === "stream_event") {
        const event = message.event;
        if (!initialized) throw new ReviewRunError("MISSING_PROVENANCE", "Reviewer did not establish model and tool provenance before generation.");
        if (event.type === "content_block_delta" && event.delta.type === "text_delta" && event.delta.text) config.onToken?.(event.delta.text);
      } else if (message.type === "assistant") {
        if (!initialized) throw new ReviewRunError("MISSING_PROVENANCE", "Reviewer did not establish model and tool provenance before generation.");
        for (const block of message.message.content) if (block.type === "text") result += block.text;
      } else if (message.type === "result") {
        costUsd = message.total_cost_usd;
        usage = message.usage;
        modelUsage = message.modelUsage;
        provenance.modelUsage = modelUsage;
        if (message.subtype !== "success") throw new ReviewRunError(message.subtype === "error_max_budget_usd" ? "BUDGET_EXCEEDED" : "REVIEW_FAILED", "Review did not complete successfully; partial output is not a clean evaluation.", { costUsd, usage, modelUsage, provenance });
        if (!initialized || !provenance.resolvedModel) throw new ReviewRunError("MISSING_PROVENANCE", "Reviewer completed without model provenance.");
        result = message.result || result;
        completed = true;
      }
    }
    if (config.signal?.aborted) throw new ReviewRunError("CANCELLED", "Review was cancelled.", { costUsd, usage, modelUsage, provenance });
    if (!completed) {
      if (timedOut) throw new ReviewRunError("TIMEOUT", "Review timed out; no complete evaluation was recorded.", { costUsd, usage, modelUsage, provenance });
      throw new ReviewRunError("INCOMPLETE_REVIEW", "Reviewer ended without a successful completion event.");
    }
    return { result: result.trim(), costUsd, usage, modelUsage, provenance };
  } catch (error) {
    controller.abort();
    if (error instanceof ReviewRunError) throw error;
    throw new ReviewRunError(timedOut ? "TIMEOUT" : config.signal?.aborted ? "CANCELLED" : "REVIEW_FAILED",
      timedOut ? "Review timed out; no complete evaluation was recorded." : config.signal?.aborted ? "Review was cancelled." : "Reviewer could not complete the request. Check model availability and the Claude Code session.",
      { costUsd, usage, modelUsage, provenance });
  } finally {
    releaseInput();
    session?.close();
    clearTimeout(timer);
    controller.signal.removeEventListener("abort", stopInput);
    config.signal?.removeEventListener("abort", abort);
  }
}
