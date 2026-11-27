import { identityOf } from "@/lib/agent-identity";
import { cancelReview, runPases, sageForPase, startReview as startPanelReview } from "@/lib/review/run";
import { retryAgent, retryOwn, stopQuestionRun } from "@/lib/questions/run";
import { useStore } from "@/lib/store";
import { ToolError, type JsonObject } from "../../../shared/mcp";

/** The review and the question run of the open essay, whoever started them: the panels or a client job. */
export function describeRuns(): { reviewRun: JsonObject | null; questionRun: JsonObject | null } {
  const state = useStore.getState();
  const essayId = state.current?.id;
  const mode = state.current?.mode ?? "academico";
  const review = state.review?.essayId === essayId ? state.review : null;
  const outcome = state.reviewOutcome?.essayId === essayId ? state.reviewOutcome : null;
  const passes = review ? runPases(review).filter((pase) => review.passes[pase].status !== "idle") : [];
  const reviewRun = review || outcome ? {
    status: passes.some((pase) => review!.passes[pase].status === "running") ? "running" : "finished",
    passes: passes.map((pase) => ({ pase, agent: identityOf(sageForPase(pase, mode)).name, status: review!.passes[pase].status, progress: Math.round(review!.passes[pase].progress) })),
    ...(outcome ? { outcome: outcome.kind, ...("failed" in outcome ? { failedPases: outcome.failed } : {}), ...("fuentesOmitidas" in outcome && outcome.fuentesOmitidas?.length ? { omittedSources: outcome.fuentesOmitidas } : {}) } : {}),
  } : null;
  const run = state.questionRun?.essayId === essayId ? state.questionRun : null;
  const questionRun = run ? {
    status: run.status, source: run.source.label,
    agents: run.agents.map((agent) => ({ sage: agent.sage, name: identityOf(agent.sage).name, phase: agent.phase, notesLanded: agent.landedCount, ...(agent.failure ? { failure: agent.failure } : {}) })),
    ...(run.own ? { ownQuestion: { question: run.own.question, answeredBy: identityOf(run.own.sage).name, phase: run.own.phase, ...(run.own.failure ? { failure: run.own.failure } : {}) } } : {}),
    notesAwaitingDecision: run.justLanded.length,
  } : null;
  return { reviewRun, questionRun };
}

/** cancel or retry the run in the open essay, with the same functions as the panels' buttons. */
export function controlRun(args: { essayId: string; run: "review" | "questions"; action: "cancel" | "retry"; userRequested?: boolean }): JsonObject {
  const state = useStore.getState();
  if (state.current?.id !== args.essayId) throw new ToolError("ESSAY_CHANGED", "The requested essay is not open.");
  if (args.action === "retry" && args.userRequested !== true) throw new ToolError("EXPLICIT_REQUEST_REQUIRED", "Retrying uses models and requires an explicit user request (userRequested=true).");
  if (args.run === "review") {
    const review = state.review?.essayId === args.essayId ? state.review : null;
    const running = !!review && runPases(review).some((pase) => review.passes[pase].status === "running");
    if (args.action === "cancel") {
      if (!running) return { changed: false, reason: "No review is running." };
      cancelReview();
      return { changed: true };
    }
    if (running) throw new ToolError("RUN_ACTIVE", "A review is still running. Wait for it or cancel it.");
    if (state.reviewOutcome?.kind === "too_long") return { changed: false, reason: "The essay is too long to review at once; retrying cannot help." };
    const failed = review ? runPases(review).filter((pase) => review.passes[pase].status === "failed") : [];
    if (!failed.length) return { changed: false, reason: "No pass failed." };
    startPanelReview(failed);
    return { changed: true, retried: failed };
  }
  const run = state.questionRun?.essayId === args.essayId ? state.questionRun : null;
  if (args.action === "cancel") {
    if (run?.status !== "running") return { changed: false, reason: "No questions are being asked." };
    stopQuestionRun();
    return { changed: true };
  }
  if (!run || run.status === "stopping") return { changed: false, reason: "There is no run to retry." };
  const failed = run.agents.filter((agent) => agent.phase === "failed").map((agent) => agent.sage);
  const ownFailed = run.own?.phase === "failed";
  for (const sage of failed) retryAgent(sage);
  if (ownFailed) retryOwn();
  return failed.length || ownFailed ? { changed: true, retried: failed, ownQuestion: ownFailed } : { changed: false, reason: "No agent failed." };
}
