import { critique, interrogate, parsePreguntas, parseAnnotationsDetailed, buildAnotacion } from "@/lib/agents";
import { useStore } from "@/lib/store";
import { MAX_PAGE_SIZE } from "@/lib/mcp/collections";
import { getDocumentEditor } from "@/lib/mcp/document";
import { defaultPasesForMode, defaultSagesForMode, ALL_SAGES } from "@/lib/sages";
import { REVIEWER_PROFILES, DEFAULT_REVIEWER_PROFILE } from "../../../sidecar/src/model-profiles";
import { ToolError } from "../../../shared/mcp";
import type { Anotacion, Essay, Pase, ReviewProvenance, Sage } from "@/lib/storage/types";
import { annotationRanges, availableAnnotationIds, assertReviewDocumentEditable, applyEvaluation, materializeReviewQuestions, requireReviewBoard } from "./actions";

export type ReviewTask = { key: string; sage: Sage; pase?: Pase; status: "running" | "completed" | "failed"; raw: string; annotations: Anotacion[]; questions: { id: string; text: string; sage: Sage }[]; error?: string; costUsd?: number; provenance?: ReviewProvenance; invalidLines?: number; unavailableAnnotationIds?: string[] };
export type ReviewJob = { id: string; essayId: string; kind: "review" | "interrogation"; status: "running" | "completed" | "failed" | "cancelled"; tasks: ReviewTask[]; fingerprint: string; applied: boolean; controller: AbortController; scope?: string; operationId: string; requestKey: string };
const jobs = new Map<string, ReviewJob>();
const operations = new Map<string, string>();
const listeners = new Set<() => void>();
const LEDGER_PREFIX = "essay-studio:review-operation:";
// Keep individual tool responses comfortably below the existing 2 MiB IPC frame.
const PAGE_LIMIT = MAX_PAGE_SIZE;
const TEXT_LIMIT = 32_768;
export const reviewFingerprint = (essay: Essay | null): string => essay ? JSON.stringify([essay.id, essay.content, essay.fuentes ?? [], essay.rubrica ?? null, essay.mode, essay.language ?? "es"]) : "closed";
export function subscribeReviewJobs(listener: () => void): () => void { listeners.add(listener); return () => listeners.delete(listener); }
const notify = () => { for (const listener of listeners) listener(); };
function current(essayId: string): Essay {
  const essay = useStore.getState().current;
  if (!essay || essay.id !== essayId) throw new ToolError("ESSAY_CHANGED", "The requested essay is not open.");
  return essay;
}
function lookup(args: { essayId: string; jobId: string }): ReviewJob {
  const job = jobs.get(args.jobId);
  if (!job || job.essayId !== args.essayId) throw new ToolError("JOB_NOT_FOUND", "This job is unavailable. It was not restarted or repeated.");
  return job;
}
export function getReviewJobState(jobId: string): ReviewJob | undefined { return jobs.get(jobId); }
export function listReviewerProfiles() { return { profiles: REVIEWER_PROFILES, defaultProfile: DEFAULT_REVIEWER_PROFILE }; }
export function getReviewJob(args: { essayId: string; jobId: string; offset?: number; limit?: number; query?: string; rawFrom?: number; rawTo?: number; resultId?: string; from?: number; to?: number }) {
  const job = lookup(args);
  const offset = args.offset ?? 0;
  const limit = args.limit ?? 50;
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > PAGE_LIMIT) throw new ToolError("INVALID_ARGUMENTS", `Use a nonnegative offset and limit from 1 to ${PAGE_LIMIT}.`);
  const query = (args.query ?? "").toLowerCase();
  const all = job.kind === "review" ? job.tasks.flatMap((task) => task.annotations.map((a) => ({ kind: "annotation", ...a }))) : job.tasks.flatMap((task) => task.questions.map((q) => ({ kind: "question", ...q })));
  const filtered = query ? all.filter((item) => JSON.stringify(item).toLowerCase().includes(query)) : all;
  const rawFrom = args.rawFrom ?? 0;
  const rawTo = args.rawTo ?? rawFrom;
  if (!Number.isSafeInteger(rawFrom) || !Number.isSafeInteger(rawTo) || rawFrom < 0 || rawTo < rawFrom || rawTo - rawFrom > TEXT_LIMIT) throw new ToolError("INVALID_ARGUMENTS", "Request raw output in ranges of at most 32768 UTF-16 units.");
  let detail: { resultId: string; json: string; from: number; to: number; length: number } | undefined;
  if (args.resultId !== undefined) {
    const result = all.find((item) => item.id === args.resultId);
    if (!result) throw new ToolError("RESULT_NOT_FOUND", "This result is not in the job.");
    const json = JSON.stringify(result);
    const from = args.from ?? 0;
    const to = args.to ?? Math.min(json.length, from + TEXT_LIMIT);
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to < from || to > json.length || to - from > TEXT_LIMIT) throw new ToolError("INVALID_ARGUMENTS", "Request result JSON in ranges of at most 32768 UTF-16 units.");
    detail = { resultId: args.resultId, json: json.slice(from, to), from, to, length: json.length };
  }
  return { jobId: job.id, essayId: job.essayId, kind: job.kind, status: job.status, applied: job.applied,
    stale: job.fingerprint !== reviewFingerprint(useStore.getState().current),
    tasks: job.tasks.map((task) => ({ key: task.key, sage: task.sage, pase: task.pase, status: task.status, error: task.error, costUsd: task.costUsd, provenance: task.provenance, invalidLines: task.invalidLines, unavailableAnnotationIds: task.unavailableAnnotationIds,
      ...(args.rawFrom !== undefined || args.rawTo !== undefined ? { raw: task.raw.slice(rawFrom, rawTo), rawLength: task.raw.length } : {}) })),
    results: filtered.slice(offset, offset + limit).map((item) => ({ id: item.id, kind: item.kind, sage: item.sage, preview: ("mensaje" in item ? item.mensaje : item.text).slice(0, 240) })), detail, nextOffset: offset + limit < filtered.length ? offset + limit : null, total: filtered.length };
}
function reserve(args: { essayId: string; operationId: string; userRequested: boolean; scope?: string }, kind: ReviewJob["kind"], request: unknown): ReviewJob {
  if (args.userRequested !== true || !args.operationId || args.operationId.length > 256) throw new ToolError("EXPLICIT_REQUEST_REQUIRED", "Model execution requires an explicit user request and a stable operation ID.");
  const essay = current(args.essayId);
  const requestKey = JSON.stringify([kind, reviewFingerprint(essay), request]);
  const existingId = operations.get(args.operationId);
  if (existingId) {
    const existing = jobs.get(existingId)!;
    if (existing.requestKey !== requestKey || existing.essayId !== args.essayId) throw new ToolError("OPERATION_CONFLICT", "This operation ID already belongs to different inputs.");
    return existing;
  }
  // Persist only opaque identifiers, never essay text or source content. After a
  // renderer restart the outcome is unknown, so a repeated ID is refused.
  const ledgerKey = LEDGER_PREFIX + args.operationId;
  const id = crypto.randomUUID();
  try {
    if (localStorage.getItem(ledgerKey)) throw new ToolError("OUTCOME_UNKNOWN", "This operation was already started in an earlier app session. It was not repeated.");
    localStorage.setItem(ledgerKey, id);
  } catch (error) {
    if (error instanceof ToolError) throw error;
    throw new ToolError("OPERATION_LEDGER_FAILED", "The app could not record this operation safely. No model was started.");
  }
  const job: ReviewJob = { id, essayId: essay.id, kind, status: "running", tasks: [], fingerprint: reviewFingerprint(essay), applied: false, controller: new AbortController(), scope: args.scope, operationId: args.operationId, requestKey };
  jobs.set(id, job); operations.set(args.operationId, id);
  return job;
}
function sageFor(pase: Pase, mode: Essay["mode"]): Sage { return pase === "coherencia" ? "sis" : pase === "argumento" ? "cri" : pase === "estilo" && mode === "blog" ? "pra" : "em"; }
function finalize(job: ReviewJob): void {
  if (job.status === "cancelled") return;
  job.status = job.tasks.some((task) => task.status === "failed") ? "failed" : "completed";
  if (job.kind === "review" && job.fingerprint === reviewFingerprint(useStore.getState().current)) {
    // Navigation can remount the editor after generation. Application always
    // validates against the live editor again, even if this preview is deferred.
    try {
      const available = availableAnnotationIds(getDocumentEditor(job.essayId), job.tasks.flatMap((task) => task.annotations));
      for (const task of job.tasks) task.unavailableAnnotationIds = task.annotations.filter((annotation) => !available.has(annotation.id)).map((annotation) => annotation.id);
    } catch (error) {
      if (!(error instanceof ToolError) || error.code !== "EDITOR_NOT_READY") throw error;
    }
  }
  notify();
}
export function startReview(args: { essayId: string; operationId: string; userRequested: boolean; pases?: Pase[]; reviewerProfile?: string; scope?: string }) {
  const essay = current(args.essayId);
  const passes = args.pases ?? defaultPasesForMode(essay.mode);
  const allowed = defaultPasesForMode(essay.mode);
  if (!passes.length || new Set(passes).size !== passes.length || passes.some((pase) => !allowed.includes(pase))) throw new ToolError("INVALID_ARGUMENTS", "Choose distinct review passes available for this essay mode.");
  const profile = args.reviewerProfile ?? essay.reviewerProfile ?? DEFAULT_REVIEWER_PROFILE;
  if (!REVIEWER_PROFILES.some((item) => item.id === profile)) throw new ToolError("INVALID_ARGUMENTS", "Unknown reviewer profile. No fallback was attempted.");
  const text = getDocumentEditor(essay.id).state.doc.textBetween(0, getDocumentEditor(essay.id).state.doc.content.size, "\n\n");
  if (!text.trim()) throw new ToolError("INVALID_ARGUMENTS", "The essay is empty.");
  const job = reserve(args, "review", { passes, profile });
  if (job.tasks.length) return getReviewJob({ essayId: essay.id, jobId: job.id });
  const captured = structuredClone(essay);
  job.tasks = passes.map((pase) => ({ key: pase, pase, sage: sageFor(pase, essay.mode), status: "running", raw: "", annotations: [], questions: [] }));
  void Promise.all(job.tasks.map(async (task) => {
    try {
      const result = await critique({ sage: task.sage, pase: task.pase!, text, rubrica: captured.rubrica?.criterios, fuentes: captured.fuentes, language: captured.language ?? "es", reviewerProfile: profile, signal: job.controller.signal,
        onUpdate: (update) => { if (job.status !== "cancelled" && update.kind === "token") { task.raw += update.delta; notify(); } } });
      if (job.status === "cancelled") return;
      const parsed = parseAnnotationsDetailed(result.result, captured.fuentes ?? []);
      task.raw = result.result; task.costUsd = result.costUsd; task.provenance = result.provenance;
      task.invalidLines = parsed.invalidLines.length;
      task.annotations = parsed.annotations.map((raw) => buildAnotacion(raw, task.sage, task.pase!, new Date().toISOString(), captured.rubrica?.criterios, result.provenance));
      task.status = "completed";
    } catch { if (job.status !== "cancelled") { task.status = "failed"; task.error = "The review did not complete. No result was applied."; } }
    notify();
  })).then(() => finalize(job));
  notify();
  return getReviewJob({ essayId: essay.id, jobId: job.id });
}
export function startInterrogation(args: { essayId: string; operationId: string; userRequested: boolean; sages?: Sage[]; text?: string; sourceId?: string; scope?: string }) {
  const essay = current(args.essayId);
  if (args.text !== undefined && args.sourceId !== undefined) throw new ToolError("INVALID_ARGUMENTS", "Choose text or a saved source, not both.");
  const source = args.sourceId ? essay.fuentes?.find((item) => item.id === args.sourceId) : undefined;
  if (args.sourceId && !source) throw new ToolError("SOURCE_NOT_FOUND", "The source is not in this essay.");
  const text = args.text ?? source?.contenido ?? getDocumentEditor(essay.id).state.doc.textContent;
  if (!text.trim()) throw new ToolError("INVALID_ARGUMENTS", "Provide text to interrogate.");
  const sages = args.sages ?? defaultSagesForMode(essay.mode);
  if (!sages.length || new Set(sages).size !== sages.length || sages.some((sage) => !ALL_SAGES.includes(sage))) throw new ToolError("INVALID_ARGUMENTS", "Choose distinct reviewers.");
  const job = reserve(args, "interrogation", { sages, text, sourceId: args.sourceId });
  if (job.tasks.length) return getReviewJob({ essayId: essay.id, jobId: job.id });
  job.tasks = sages.map((sage) => ({ key: sage, sage, status: "running", raw: "", annotations: [], questions: [] }));
  void Promise.all(job.tasks.map(async (task) => {
    try {
      const result = await interrogate({ sage: task.sage, text, language: essay.language ?? "es", signal: job.controller.signal,
        onUpdate: (update) => { if (job.status !== "cancelled" && update.kind === "token") { task.raw += update.delta; notify(); } } });
      if (job.status === "cancelled") return;
      task.raw = result.result; task.costUsd = result.costUsd; task.provenance = result.provenance;
      task.questions = parsePreguntas(result.result).filter(Boolean).map((question) => ({ id: crypto.randomUUID(), text: question, sage: task.sage }));
      task.status = "completed";
    } catch { if (job.status !== "cancelled") { task.status = "failed"; task.error = "The interrogation did not complete. No questions were saved."; } }
    notify();
  })).then(() => finalize(job));
  notify();
  return getReviewJob({ essayId: essay.id, jobId: job.id });
}
export function cancelReviewJob(args: { essayId: string; jobId: string }) {
  const job = lookup(args);
  if (job.status === "running") { job.status = "cancelled"; job.controller.abort(); notify(); }
  return getReviewJob(args);
}
export function cancelReviewScope(scope: string): void { for (const job of jobs.values()) if (job.scope === scope && job.status === "running") cancelReviewJob({ essayId: job.essayId, jobId: job.id }); }
export type ApplyReviewArgs = { essayId: string; jobId: string; annotationIds?: string[]; questionIds?: string[] };
export function validateReviewApplication(args: ApplyReviewArgs): void {
  const job = lookup(args);
  if (job.applied) throw new ToolError("ALREADY_APPLIED", "These results were already applied.");
  if (job.status === "running" || job.status === "cancelled") throw new ToolError("JOB_NOT_COMPLETE", "Only finished, uncancelled results can be applied.");
  if (job.fingerprint !== reviewFingerprint(current(args.essayId))) throw new ToolError("STALE_REVIEW", "The essay or its sources changed. Review it again before applying.");
  const selected = job.kind === "review" ? args.annotationIds : args.questionIds;
  if (!selected || new Set(selected).size !== selected.length || (job.kind === "review" ? args.questionIds !== undefined : args.annotationIds !== undefined)) throw new ToolError("INVALID_ARGUMENTS", "Provide explicit result IDs of the correct kind.");
  const validIds = new Set(job.tasks.flatMap((task) => job.kind === "review" ? task.annotations.map((a) => a.id) : task.questions.map((q) => q.id)));
  if (selected.some((id) => !validIds.has(id))) throw new ToolError("INVALID_ARGUMENTS", "A selected result is not in this job.");
  if (!job.tasks.some((task) => task.status === "completed")) throw new ToolError("JOB_FAILED", "This job has no completed results.");
  if (job.kind === "review") {
    const editor = getDocumentEditor(args.essayId);
    assertReviewDocumentEditable(editor);
    annotationRanges(editor, job.tasks.flatMap((task) => task.annotations).filter((a) => selected.includes(a.id)));
  }
  else requireReviewBoard(args.essayId, job.tasks.map((task) => ({ sage: task.sage, preguntas: task.questions.filter((q) => selected.includes(q.id)).map((q) => q.text) })));
}
export function applyReviewResults(args: ApplyReviewArgs) {
  validateReviewApplication(args);
  const job = lookup(args);
  if (job.kind === "review") {
    const selected = new Set(args.annotationIds);
    applyEvaluation(args.essayId, job.tasks.flatMap((task) => task.annotations).filter((a) => selected.has(a.id)),
      job.tasks.filter((task) => task.status === "completed" && !task.invalidLines).map((task) => task.pase!),
      job.tasks.filter((task) => task.status === "completed").map((task) => ({ pase: task.pase!, provenance: task.provenance })));
  } else {
    const selected = new Set(args.questionIds);
    const batches = job.tasks.map((task) => ({ sage: task.sage, preguntas: task.questions.filter((q) => selected.has(q.id)).map((q) => q.text) })).filter((batch) => batch.preguntas.length);
    materializeReviewQuestions(args.essayId, batches);
    for (const batch of batches) useStore.getState().addInterrogatorio({ ...batch, generadoEn: new Date().toISOString(), costoUsd: job.tasks.find((task) => task.sage === batch.sage)?.costUsd });
  }
  job.applied = true; notify();
  return { jobId: job.id, applied: true };
}

/** UI and MCP observe the same job; closing a view never starts another run. */
export function waitReviewJob(jobId: string, onUpdate: (job: ReviewJob) => void): Promise<ReviewJob> {
  return new Promise((resolve, reject) => {
    let stop = () => undefined as void;
    const update = () => {
      const job = jobs.get(jobId);
      if (!job) { stop(); reject(new ToolError("JOB_NOT_FOUND", "The review job is unavailable.")); return; }
      onUpdate(job);
      if (job.status !== "running") { stop(); resolve(job); }
    };
    stop = subscribeReviewJobs(update);
    update();
  });
}
