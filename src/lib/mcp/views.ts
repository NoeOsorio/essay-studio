import { readReview } from "@/components/review/useReviewResult";
import { currentHistoryPreview } from "@/components/panels/HistoryPreview";
import { liveNoteId } from "@/lib/board-notes";
import { ALL_SAGES } from "@/lib/sages";
import { listHistory } from "@/lib/storage";
import { useStore } from "@/lib/store";
import type { Sage } from "@/lib/storage/types";
import { ToolError, type JsonObject } from "../../../shared/mcp";

const BUILTIN_AGENTS = ["em", "sis", "pra", "cri"];

function current() {
  const essay = useStore.getState().current;
  if (!essay) throw new ToolError("ESSAY_CHANGED", "No essay is open.");
  return essay;
}

/** Ajustes needs no essay: agents belong to the app. */
export function openSettingsView(args: JsonObject): void {
  const agentId = args.agentId;
  if (agentId !== undefined && (typeof agentId !== "string" || !(BUILTIN_AGENTS.includes(agentId) || useStore.getState().agents.some(agent => agent.id === agentId)))) {
    throw new ToolError("AGENT_NOT_FOUND", "agentId must be em, sis, pra, cri or an agent id (c_<uuid>) from list_agents.");
  }
  useStore.getState().openSettings({ ...(typeof agentId === "string" ? { agentId } : {}) });
}

/** Everything a client can ask the app to show, besides the board and the stamp. Starts no model. */
export async function openAppPanel(args: JsonObject): Promise<void> {
  const panel = args.panel as string | undefined;
  if (!panel) return;
  const store = useStore.getState();
  if (panel === "settings") return openSettingsView(args);
  if (panel === "none") { store.setReviewView(null); store.closeNote(); store.setOverlay(null); return; }
  if (panel === "history") return store.openHistory();
  if (panel === "review") return store.openReview();
  if (panel === "sources") return store.openFuentes();
  if (panel === "rubric") return store.openRubrica();
  const essay = current();
  if (panel === "version") {
    if (typeof args.takenAt !== "string") throw new ToolError("INVALID_ARGUMENTS", "panel version needs takenAt from list_versions.");
    const known = (await listHistory(essay.id)).some(meta => meta.takenAt === args.takenAt);
    if (!known) throw new ToolError("NOT_FOUND", "That version does not exist. Read list_versions.");
    store.openHistory();
    useStore.getState().setHistoryRequest(args.takenAt);
    return;
  }
  if (panel === "note") {
    if (typeof args.noteId !== "string" || !liveNoteId(essay.board, args.noteId)) throw new ToolError("NOT_FOUND", "That note is not on this essay's board. Read get_board.");
    store.openNote(args.noteId, { focus: true });
    return;
  }
  if (panel === "report" || panel === "corrections") {
    const reading = readReview(essay);
    const running = !!store.review && store.review.essayId === essay.id && Object.values(store.review.passes).some(pass => pass.status === "running");
    // The stamp only exists once something was reviewed, underlined or is running; the surfaces hang from it.
    if (!running && !reading.result.wasEvaluated && reading.views.length === 0) throw new ToolError("NOTHING_TO_SHOW", "There is nothing to show yet: run a review or add findings first.");
    if (panel === "report" && (running || reading.result.overall === null)) throw new ToolError("NOTHING_TO_SHOW", "The report card needs a score. Wait for the review to end or run it again.");
    if (panel === "corrections" && args.criterioId !== undefined && !essay.rubrica?.criterios.some(criterion => criterion.id === args.criterioId)) throw new ToolError("NOT_FOUND", "That criterion is not in the rubric. Read get_rubric.");
    if (store.scorebarDismissed) store.showScorebar();
    store.setReviewView(panel === "report" ? { essayId: essay.id, kind: "report" } : { essayId: essay.id, kind: "corrections", criterioId: typeof args.criterioId === "string" ? args.criterioId : null });
    return;
  }
  if (panel === "interrogation") {
    const run = store.questionRun;
    if (run && run.status !== "ended") throw new ToolError("RUN_ACTIVE", "Questions are being asked now. Wait for them or cancel with control_run.");
    const sages = args.sages as string[] | undefined;
    for (const sage of sages ?? []) {
      if ((ALL_SAGES as readonly string[]).includes(sage)) continue;
      const agent = store.agents.find(item => item.id === sage);
      if (!agent) throw new ToolError("AGENT_NOT_FOUND", `No agent has the id ${sage}. Read list_agents.`);
      if (agent.does === "review") throw new ToolError("INVALID_ARGUMENTS", `The agent ${agent.name} only reviews; it cannot ask questions.`);
    }
    if (args.text !== undefined && args.sourceId !== undefined) throw new ToolError("INVALID_ARGUMENTS", "Choose text or a saved source, not both.");
    if (typeof args.sourceId === "string" && !essay.fuentes?.some(source => source.id === args.sourceId)) throw new ToolError("SOURCE_NOT_FOUND", "The source is not in this essay.");
    store.openLectura(undefined, typeof args.text === "string" ? args.text : "");
    useStore.getState().setLecturaPreset(sages || args.sourceId ? { ...(sages ? { sages: sages as Sage[] } : {}), ...(typeof args.sourceId === "string" ? { sourceId: args.sourceId } : {}) } : null);
    return;
  }
}

/** What is open on screen besides the panels get_basic_info already names. */
export function describeView(): JsonObject {
  const state = useStore.getState();
  const view = state.reviewView && state.reviewView.essayId === state.current?.id ? state.reviewView : null;
  return {
    settings: state.settingsOpen,
    reportCard: view?.kind === "report",
    corrections: view?.kind === "corrections" ? { criterioId: view.criterioId } : null,
    note: state.noteView?.id ?? null,
    historyPreview: currentHistoryPreview()?.takenAt ?? null,
  };
}
