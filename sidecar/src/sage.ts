/** JSON-lines desktop sidecar. OAuth usage draws on Claude plan limits. */
import { assertReviewRequest, MAX_REQUEST_BYTES, ReviewRequestError, type ReviewRequest } from "./review-contract.js";
import { createQuestionEmitter } from "./question-stream.js";
import { getReviewerProfile } from "./model-profiles.js";
import { runReview, ReviewRunError } from "./runner.js";

const emit = (event: Record<string, unknown>) => process.stdout.write(JSON.stringify(event) + "\n");
const active = new Map<string, AbortController>();
// Bound simultaneous SDK processes: 4 review passes + 5 questions (4 agents + 1 own) + 2 extractions = 11.
const MAX_CONCURRENT_REVIEWS = 11;
let stdinBuffer = "";

async function handleReview(req: ReviewRequest): Promise<void> {
  const controller = new AbortController();
  active.set(req.id, controller);
  emit({ id: req.id, type: "started" });
  const questions = req.type === "interrogate"
    ? createQuestionEmitter((index, text) => emit({ id: req.id, type: "question", index, text }))
    : null;
  try {
    const completed = await runReview(req, { signal: controller.signal, onToken: (delta) => { emit({ id: req.id, type: "token", delta }); questions?.push(delta); } });
    if (questions && questions.finish(completed.result) === 0) throw new ReviewRunError("NO_QUESTIONS", "The reviewer returned no usable questions.");
    if (req.type === "ask" && !completed.result.trim()) throw new ReviewRunError("NO_ANSWER", "The reviewer returned no answer.");
    emit({ id: req.id, type: "complete", ...completed });
  } catch (error) {
    const known = error instanceof ReviewRunError;
    emit({ id: req.id, type: "error", code: known ? error.code : error instanceof ReviewRequestError ? error.code : "REVIEW_FAILED",
      message: known ? error.message : "Reviewer could not prepare this request.",
      ...(known && error.details ? { costUsd: error.details.costUsd, provenance: error.details.provenance } : {}) });
  } finally { active.delete(req.id); }
}

function handleLine(line: string): void {
  let raw: unknown;
  try { raw = JSON.parse(line); } catch { emit({ id: "<parse>", type: "error", code: "INVALID_REQUEST", message: "Invalid JSON request." }); return; }
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const id = typeof value.id === "string" ? value.id : "<invalid>";
  if (value.type === "ping") { emit({ id, type: "complete", result: "pong" }); return; }
  if (value.type === "cancel") { active.get(id)?.abort(); return; }
  try {
    assertReviewRequest(raw);
    getReviewerProfile(raw.reviewerProfile);
    if (active.has(id)) throw new ReviewRequestError("INVALID_REQUEST", "Duplicate active review ID.");
    if (active.size >= MAX_CONCURRENT_REVIEWS) throw new ReviewRunError("BUSY", "Reviewer is busy. Wait for active reviews to finish.");
  } catch (error) {
    const code = error instanceof ReviewRequestError || error instanceof ReviewRunError ? error.code : "INVALID_REQUEST";
    emit({ id, type: "error", code, message: error instanceof Error ? error.message : "Invalid review request." }); return;
  }
  void handleReview(raw);
}

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => {
  stdinBuffer += chunk;
  let nl: number;
  while ((nl = stdinBuffer.indexOf("\n")) !== -1) {
    const line = stdinBuffer.slice(0, nl);
    stdinBuffer = stdinBuffer.slice(nl + 1);
    if (Buffer.byteLength(line) > MAX_REQUEST_BYTES) { emit({ id: "<parse>", type: "error", code: "SOURCE_TOO_LARGE", message: "Review request exceeds the 2 MiB IPC budget." }); continue; }
    if (line.trim()) handleLine(line);
  }
  if (Buffer.byteLength(stdinBuffer) > MAX_REQUEST_BYTES) { stdinBuffer = ""; emit({ id: "<parse>", type: "error", code: "SOURCE_TOO_LARGE", message: "Review request exceeds the 2 MiB IPC budget." }); }
});
function stop() { for (const controller of active.values()) controller.abort(); process.exit(0); }
process.stdin.on("end", stop);
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
