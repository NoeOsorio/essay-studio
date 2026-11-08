/** JSON-lines desktop sidecar. OAuth usage draws on Claude plan limits. */
import { assertReviewRequest, type ReviewRequest } from "./review-contract.js";
import { getReviewerProfile } from "./model-profiles.js";
import { runReview, ReviewRunError } from "./runner.js";

const emit = (event: Record<string, unknown>) => process.stdout.write(JSON.stringify(event) + "\n");
const active = new Map<string, AbortController>();
// Bound IPC memory and simultaneous SDK processes; council/passes fit in eight.
const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const MAX_CONCURRENT_REVIEWS = 8;
let stdinBuffer = "";

async function handleReview(req: ReviewRequest): Promise<void> {
  const controller = new AbortController();
  active.set(req.id, controller);
  emit({ id: req.id, type: "started" });
  try {
    const completed = await runReview(req, { signal: controller.signal, onToken: (delta) => emit({ id: req.id, type: "token", delta }) });
    emit({ id: req.id, type: "complete", ...completed });
  } catch (error) {
    const known = error instanceof ReviewRunError;
    emit({ id: req.id, type: "error", code: known ? error.code : "REVIEW_FAILED",
      message: known ? error.message : "Reviewer could not prepare this request.",
      ...(known && error.details ? { costUsd: error.details.costUsd, provenance: error.details.provenance } : {}) });
  } finally { active.delete(req.id); }
}

function handleLine(line: string): void {
  let raw: unknown;
  try { raw = JSON.parse(line); } catch { emit({ id: "<parse>", type: "error", message: "Invalid JSON request." }); return; }
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const id = typeof value.id === "string" ? value.id : "<invalid>";
  if (value.type === "ping") { emit({ id, type: "complete", result: "pong" }); return; }
  if (value.type === "cancel") { active.get(id)?.abort(); return; }
  try {
    assertReviewRequest(raw);
    getReviewerProfile(raw.reviewerProfile);
    if (active.has(id)) throw new Error("Duplicate active review ID.");
    if (active.size >= MAX_CONCURRENT_REVIEWS) throw new Error("Reviewer is busy. Wait for active reviews to finish.");
  } catch (error) {
    emit({ id, type: "error", message: error instanceof Error ? error.message : "Invalid review request." }); return;
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
    if (Buffer.byteLength(line) > MAX_REQUEST_BYTES) { emit({ id: "<parse>", type: "error", message: "Review request exceeds the 2 MiB IPC budget." }); continue; }
    if (line.trim()) handleLine(line);
  }
  if (Buffer.byteLength(stdinBuffer) > MAX_REQUEST_BYTES) { stdinBuffer = ""; emit({ id: "<parse>", type: "error", message: "Review request exceeds the 2 MiB IPC budget." }); }
});
function stop() { for (const controller of active.values()) controller.abort(); process.exit(0); }
process.stdin.on("end", stop);
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
