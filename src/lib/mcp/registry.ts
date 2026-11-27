import { useStore } from "@/lib/store";
import { appendSnapshot, listEssays } from "@/lib/storage";
import { CAPABILITY_VERSION, PROTOCOL_VERSION, MAX_REQUEST_BYTES, ToolError, TOOL_DEFINITIONS, validateArgs, type BridgeRequest, type BridgeResponse, type JsonObject } from "../../../shared/mcp";
import { ensureDocument, ensureTitle, readTitleHistory, readDocument, readTextSelection, validateDocumentTool, handleDocumentTool } from "./document";
import { ensureBoard, getBoardSelection, getBoardSummary, handleBoardTool, validateBoardTool, applyBoardHistory, prepareBoardAsset, resetBoardUploads } from "./board";
import { editLibrary, readLibrary, validateLibraryEdit } from "./library";
import { listEssaysTool } from "./essays";
import { confirmProposalTool, importAssignmentTool, prepareUpload, readSourceCitation, resetMaterialUploads, uploadStep } from "./materials";
import { describeView, openAppPanel, openSettingsView } from "./views";
import { startReview, startInterrogation, getReviewJob, cancelReviewJob, cancelReviewScope, listReviewerProfiles, validateReviewApplication, applyReviewResults } from "@/lib/reviews/jobs";
import { addFindings, editAnnotations, linkNote } from "@/lib/reviews/actions";
import { editAgent, improveAgentInstructions, listAgents } from "./agents";
import { controlRun, describeRuns } from "./runs";
import type { Pase, Sage } from "@/lib/storage/types";
import { REVIEWER_PROFILES } from "../../../sidecar/src/model-profiles";

let sessionId: string | null = null;
let revisionEpoch = "";
let revisionNumber = 0;
let stopRevisionTracking: (() => void) | null = null;
let batchKey: string | null = null;
let tail: Promise<unknown> = Promise.resolve();
const operationResults = new Map<string, { signature: string; result: Promise<BridgeResponse>; bytes?: number }>();
// Match the native 16-request concurrency budget rather than retaining content indefinitely.
const OPERATION_CACHE_BYTES = 16 * MAX_REQUEST_BYTES;
let operationCacheBytes = 0;
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}

export function startRegistry(): () => void {
  if (stopRevisionTracking) return () => undefined;
  revisionEpoch = crypto.randomUUID();
  stopRevisionTracking = useStore.subscribe((state, previous) => {
    if (state.current !== previous.current || state.restoreNonce !== previous.restoreNonce || state.view !== previous.view) revisionNumber += 1;
    if (state.current?.id !== previous.current?.id) batchKey = null;
  });
  return () => { stopRevisionTracking?.(); stopRevisionTracking = null; setBridgeSession(null); };
}
export function setBridgeSession(next: string | null): void {
  if (sessionId !== next) {
    resetBoardUploads(); resetMaterialUploads();
    if (sessionId) cancelReviewScope(sessionId);
    batchKey = null; revisionNumber += 1;
  }
  sessionId = next;
}
export function getRevision(): string { return `${revisionEpoch}:${useStore.getState().current?.id ?? "none"}:${revisionNumber}`; }
function assertContext(essayId: string): void {
  if (useStore.getState().current?.id !== essayId || useStore.getState().view !== "editor") throw new ToolError("ESSAY_CHANGED", "The requested essay is not open. Read app context before continuing.");
}
function checkRevision(expected: unknown): void {
  if (expected !== getRevision()) throw new ToolError("STALE_REVISION", "The essay changed. Read it again before editing.");
}
export async function flushDurable(essayId: string): Promise<void> {
  assertContext(essayId); await useStore.getState().flush(); assertContext(essayId);
  if (useStore.getState().saveStatus.kind !== "saved") throw new ToolError("SAVE_FAILED", "The edit is visible but has not been saved. Do not repeat it; retry finish_work.");
}
function envelope(result: unknown, essayId?: string): JsonObject {
  return { ...(typeof result === "object" && result !== null && !Array.isArray(result) ? result : { value: result }), ...(essayId ? { essayId } : {}), revision: getRevision() };
}
async function run(request: BridgeRequest, requestSession: string, deadline: number): Promise<unknown> {
  const guard = (applied = false) => {
    if (!sessionId || sessionId !== requestSession) throw new ToolError(applied ? "OUTCOME_UNKNOWN" : "DISCONNECTED", applied ? "The session changed after dispatch. Read state; do not repeat the operation." : "The MCP session ended.");
    if (!applied && performance.now() > deadline) throw new ToolError("REQUEST_EXPIRED", "The queued request expired before dispatch.");
  };
  guard(); validateArgs(request.name, request.args);
  const { name, args } = request;
  const definition = TOOL_DEFINITIONS.find(tool => tool.name === name)!;
  const effect = name === "import_board_asset" && args.operation !== "finish" ? "job" : name === "edit_board_page" && args.operation === "delete" ? "destructive" : definition.effect;
  const essayId = args.essayId as string;
  /** The first edit of a batch saves a safety version; later edits of the same batch reuse it. */
  const safety = async (): Promise<void> => {
    const thisBatch = `${requestSession}:${essayId}`;
    if (batchKey === thisBatch) return;
    await flushDurable(essayId); guard(); checkRevision(args.revision);
    const essay = structuredClone(useStore.getState().current!);
    try { await appendSnapshot({ takenAt: new Date().toISOString(), kind: "manual", essay }); }
    catch { throw new ToolError("SNAPSHOT_FAILED", "The safety version could not be saved. No edit was applied."); }
    guard(); assertContext(essayId); checkRevision(args.revision); batchKey = thisBatch;
  };
  /** After a long model wait: the save, with a changed essay reported as an unknown outcome. */
  const saveAfterWait = async (): Promise<void> => {
    try { await flushDurable(essayId); }
    catch (error) {
      if (error instanceof ToolError && error.code === "ESSAY_CHANGED") throw new ToolError("OUTCOME_UNKNOWN", "The essay changed while waiting. Read saved state; do not repeat the operation.");
      throw error;
    }
  };
  if (name === "get_basic_info") {
    const state = useStore.getState();
    let titleHistory: JsonObject = { ready: false };
    if (state.current) {
      try { titleHistory = { ready: true, ...readTitleHistory(state.current.id) }; }
      catch (error) { if (!(error instanceof ToolError) || error.code !== "EDITOR_NOT_READY") throw error; }
    }
    const panelNames = { fuentes: "sources", rubrica: "rubric", history: "history", review: "review", lectura: "interrogation" } as const;
    return envelope({ app: "Essay Studio", view: state.view, saveStatus: state.saveStatus.kind,
      titleHistory, activePanel: state.overlay ? panelNames[state.overlay] : null, scorebarDismissed: state.scorebarDismissed, appView: describeView(),
      essay: state.current ? { id: state.current.id, title: state.current.title, mode: state.current.mode, language: state.current.language ?? "es", wordCount: state.current.wordCount } : null,
      board: { open: state.boardOpen, ...getBoardSummary() },
      ...describeRuns(),
      capabilities: { protocolVersion: PROTOCOL_VERSION, capabilityVersion: CAPABILITY_VERSION, platform: "macos", tools: TOOL_DEFINITIONS.map(tool => ({ name: tool.name, effect: tool.effect })) } });
  }
  if (name === "list_essays") {
    const listed = await listEssaysTool(args); guard();
    return envelope(listed);
  }
  if (name === "list_reviewer_profiles") return envelope(listReviewerProfiles());
  // Agents belong to the app, not to an essay: no open essay or revision is needed.
  if (name === "list_agents") return envelope(listAgents());
  if (name === "edit_agent") { const result = await editAgent(args); guard(true); return envelope(result); }
  if (name === "improve_agent_instructions") { const result = await improveAgentInstructions(args); guard(true); return envelope(result); }
  if (name === "set_app_view" && args.essayId === undefined) {
    if (args.panel !== "settings") throw new ToolError("INVALID_ARGUMENTS", "essayId and revision are required, except to open settings.");
    openSettingsView(args);
    return envelope({ changed: true });
  }
  if (name === "set_app_view" && args.revision === undefined) throw new ToolError("INVALID_ARGUMENTS", "set_app_view needs the revision from get_basic_info.");
  if (name === "control_run") return envelope(controlRun(args as Parameters<typeof controlRun>[0]), essayId);
  if (["open_essay", "create_essay", "close_essay", "delete_essay"].includes(name)) {
    if (args.revision !== undefined) checkRevision(args.revision);
    const state = useStore.getState(); const before = state.current;
    if (name === "create_essay" && typeof args.title === "string" && /[\r\n\u2028\u2029]/u.test(args.title)) throw new ToolError("INVALID_ARGUMENTS", "Essay titles must use a single line.");
    // delete_essay can also remove an essay that is not open; the open one stays untouched then.
    const deletingOther = name === "delete_essay" && before?.id !== essayId;
    if (name === "close_essay" || name === "delete_essay" && !deletingOther) assertContext(essayId);
    if (before) { await flushDurable(before.id); guard(); if (args.revision !== undefined) checkRevision(args.revision); }
    if (name === "open_essay") {
      await useStore.getState().openEssay(essayId, before?.id ?? null); guard(true); assertContext(essayId);
      await ensureDocument(essayId); guard(true);
    } else if (name === "create_essay") {
      const createdId = await useStore.getState().newEssay(args.mode as "academico" | "blog" | undefined); guard(true);
      const created = useStore.getState().current;
      if (!createdId || !created || created.id !== createdId || useStore.getState().saveStatus.kind !== "saved") throw new ToolError("CREATE_FAILED", "The essay was not created or navigation changed; inspect the library before retrying.");
      const captured = created;
      await ensureDocument(created.id);
      if (args.title !== undefined) await ensureTitle(created.id);
      guard(true);
      if (useStore.getState().current !== captured) throw new ToolError("OUTCOME_UNKNOWN", "The new essay changed before initialization completed. Read it before continuing.");
      if (args.title !== undefined) handleDocumentTool("edit_document", { essayId: created.id, operation: "rename", title: args.title });
      if (args.language !== undefined) useStore.getState().updateLanguage(args.language as "es" | "en");
      await flushDurable(created.id); guard(true);
      return envelope({ created: true, title: useStore.getState().current!.title, saved: true }, created.id);
    } else {
      if (!deletingOther) {
        await useStore.getState().closeEssay(); guard(true);
        if (useStore.getState().current !== null || useStore.getState().view !== "list") throw new ToolError("OUTCOME_UNKNOWN", "Closing was interrupted. Inspect current state before continuing.");
      } else if (!(await listEssays()).some(item => item.id === essayId)) throw new ToolError("NOT_FOUND", "That essay does not exist. Read list_essays.");
      guard(true);
      if (name === "delete_essay") {
        await useStore.getState().removeEssay(essayId); guard(true);
        const listed = await listEssays(); guard(true);
        if (listed.some(item => item.id === essayId)) throw new ToolError("DELETE_FAILED", "The essay could not be deleted.");
        if (useStore.getState().current?.id === essayId) throw new ToolError("OUTCOME_UNKNOWN", "The essay was reopened while deletion was dispatched. Inspect current state before continuing.");
      }
      return envelope({ closed: !deletingOther, deleted: name === "delete_essay", saved: true });
    }
    return envelope({ title: useStore.getState().current?.title, saved: true }, essayId);
  }
  // Jobs can be inspected or cancelled after navigating to another essay.
  if (name === "get_review_job" || name === "cancel_review_job") {
    return envelope(name === "get_review_job" ? getReviewJob(args as Parameters<typeof getReviewJob>[0]) : cancelReviewJob(args as Parameters<typeof cancelReviewJob>[0]), essayId);
  }
  assertContext(essayId);
  if (name === "finish_work") { await flushDurable(essayId); guard(true); batchKey = null; return envelope({ saved: true }, essayId); }
  if (effect !== "read") checkRevision(args.revision);
  const boardSurface = definition.surface === "board" || name === "editor_history" && args.surface === "board" || name === "apply_review_results" && args.questionIds !== undefined;
  if (boardSurface) { await ensureBoard(essayId); guard(); assertContext(essayId); }
  if (definition.surface === "document" || definition.surface === "review") { await ensureDocument(essayId); guard(); assertContext(essayId); }
  if (name === "edit_document" && args.operation === "rename" || name === "editor_history" && args.surface === "title") { await ensureTitle(essayId); guard(); assertContext(essayId); }
  if (effect !== "read") checkRevision(args.revision);
  if (name === "import_board_asset") {
    if (args.operation !== "finish") return envelope(handleBoardTool(name, args), essayId);
    await prepareBoardAsset(args); guard(); assertContext(essayId); checkRevision(args.revision);
  }
  if (name === "import_source_file") {
    if (args.operation !== "finish") return envelope(uploadStep("source", args), essayId);
    await prepareUpload("source", args); guard(); assertContext(essayId); checkRevision(args.revision);
  }
  if (name === "import_assignment" || name === "read_source_citation") {
    const upload = name === "import_assignment" && ["begin", "append", "cancel"].includes(args.operation as string);
    if (upload) return envelope(uploadStep("assignment", args), essayId);
    // Refuse before saving anything: reading uses a model.
    if (args.userRequested !== true) throw new ToolError("EXPLICIT_REQUEST_REQUIRED", "This reads with a model and requires an explicit user request (userRequested=true).");
    if (name === "import_assignment" && args.operation === "finish") { await prepareUpload("assignment", args); guard(); assertContext(essayId); checkRevision(args.revision); }
    await safety(); guard(); assertContext(essayId); checkRevision(args.revision);
    const value = name === "import_assignment" ? await importAssignmentTool(args) : await readSourceCitation(args);
    guard(true); assertContext(essayId);
    await saveAfterWait(); guard(true);
    return envelope(value, essayId);
  }
  if (name === "get_document") return envelope(readDocument(args), essayId);
  if (name === "get_selection") return envelope({ textSelection: readTextSelection(essayId), boardNodeIds: getBoardSelection() }, essayId);
  if (definition.effect === "read") {
    const revision = getRevision();
    const value = definition.surface === "library" ? await readLibrary(name, args) : await handleBoardTool(name, args);
    guard(); assertContext(essayId); checkRevision(revision); return envelope(value, essayId);
  }
  if (definition.effect === "model") {
    guard(); checkRevision(args.revision);
    const common = { essayId, operationId: args.operationId as string, userRequested: args.userRequested === true, scope: requestSession };
    const result = name === "start_review" ? startReview({ ...common, pases: args.pases as Pase[] | undefined, reviewerProfile: args.reviewerProfile as string | undefined }) : startInterrogation({ ...common, sages: args.sages as Sage[] | undefined, text: args.text as string | undefined, sourceId: args.sourceId as string | undefined, ownQuestion: args.ownQuestion as string | undefined });
    return envelope(result, essayId);
  }
  if (definition.effect === "view") {
    guard(); checkRevision(args.revision);
    if (name === "set_app_view") {
      const state = useStore.getState();
      if (typeof args.boardOpen === "boolean" && state.boardOpen !== args.boardOpen) state.toggleBoard();
      if (args.scorebarVisible === false) useStore.getState().dismissScorebar();
      else if (args.scorebarVisible === true) useStore.getState().showScorebar();
      await openAppPanel(args); guard(); assertContext(essayId);
      return envelope({ changed: true }, essayId);
    }
    const value = boardSurface ? handleBoardTool(name, args) : handleDocumentTool(name, args);
    if (name === "set_board_page") {
      await flushDurable(essayId); guard(true);
      if (getBoardSummary().currentPageId !== args.pageId) throw new ToolError("VIEW_CHANGED", "The active page changed while saving. Read app context before continuing.");
    }
    return envelope(value, essayId);
  }
  if (name === "edit_document" || name === "editor_history" && args.surface !== "board") validateDocumentTool(name, args);
  else if (boardSurface && name !== "editor_history" && name !== "apply_review_results") validateBoardTool(name, args);
  else if (name === "edit_source" || name === "edit_rubric" || name === "update_essay") validateLibraryEdit(name, args);
  if (name === "apply_review_results") validateReviewApplication(args as Parameters<typeof validateReviewApplication>[0]);
  if (name === "update_essay" && args.reviewerProfile !== undefined && !REVIEWER_PROFILES.some(profile => profile.id === args.reviewerProfile)) throw new ToolError("INVALID_ARGUMENTS", "Unknown reviewer profile.");
  checkRevision(args.revision);
  await safety();
  guard(); assertContext(essayId); checkRevision(args.revision);
  let result: unknown;
  if (name === "restore_version") {
    const restored = await useStore.getState().restoreVersion(args.takenAt as string, () => { guard(); assertContext(essayId); checkRevision(args.revision); }); guard(true); assertContext(essayId); batchKey = null;
    if (!restored) throw new ToolError("RESTORE_FAILED", "The safety save failed or the essay changed. No successful restore is confirmed; inspect current state.");
    result = { restored: true };
  } else if (name === "create_version") { const created = await useStore.getState().snapshotNow("manual"); guard(true); assertContext(essayId); if (!created) throw new ToolError("SNAPSHOT_FAILED", "The version could not be created or the essay changed."); result = { created: true, takenAt: created }; }
  else if (name === "editor_history") result = args.surface === "board" ? applyBoardHistory(args.direction as "undo" | "redo") : handleDocumentTool(name, args);
  else if (name === "confirm_rubric_proposal") result = await confirmProposalTool(args);
  else if (name === "apply_review_results") result = applyReviewResults(args as Parameters<typeof applyReviewResults>[0]);
  else if (name === "edit_annotations") result = editAnnotations(args as Parameters<typeof editAnnotations>[0]);
  else if (name === "link_note") result = linkNote(args as Parameters<typeof linkNote>[0]);
  else if (name === "add_findings") result = addFindings(args as Parameters<typeof addFindings>[0]);
  else if (definition.surface === "library") result = editLibrary(name, args);
  else if (boardSurface) result = handleBoardTool(name, args);
  else result = handleDocumentTool(name, args);
  if (result instanceof Promise) throw new ToolError("INTERNAL_ERROR", "A native edit must execute synchronously.");
  try { await flushDurable(essayId); }
  catch (error) {
    if (error instanceof ToolError && error.code === "ESSAY_CHANGED") throw new ToolError("OUTCOME_UNKNOWN", "The edit ran before navigation. Read saved state; do not repeat it.");
    throw error;
  }
  guard(true); return envelope({ ...(result as JsonObject), saved: true }, essayId);
}

/** Serialize editor work; operation IDs reconcile retries without a second edit. */
export async function executeRequest(request: BridgeRequest, requestSession: string): Promise<BridgeResponse> {
  if (!sessionId || sessionId !== requestSession) return Promise.resolve({ requestId: request.requestId, ok: false, error: { code: "DISCONNECTED", message: "The MCP session ended." } });
  try { validateArgs(request.name, request.args); }
  catch (error) { return Promise.resolve({ requestId: request.requestId, ok: false, error: { code: error instanceof ToolError ? error.code : "INVALID_ARGUMENTS", message: "Invalid MCP arguments." } }); }
  const definition = TOOL_DEFINITIONS.find(tool => tool.name === request.name);
  const operationId = typeof request.args.operationId === "string" && definition?.effect !== "read" ? request.args.operationId : undefined;
  const { revision: ignoredRevision, ...semanticArgs } = request.args;
  void ignoredRevision;
  const signature = operationId ? Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(canonical([request.name, semanticArgs])))))).map(byte => byte.toString(16).padStart(2, "0")).join("") : "";
  if (!sessionId || sessionId !== requestSession) return { requestId: request.requestId, ok: false, error: { code: "DISCONNECTED", message: "The MCP session ended." } };
  if (operationId) {
    const existing = operationResults.get(operationId);
    if (existing) {
      if (existing.signature !== signature) return Promise.resolve({ requestId: request.requestId, ok: false, error: { code: "OPERATION_CONFLICT", message: "This operation ID belongs to different arguments." } });
      return existing.result.then(response => sessionId !== requestSession ? { requestId: request.requestId, ok: false, error: { code: "DISCONNECTED", message: "The MCP session ended." } } : { ...response, requestId: request.requestId });
    }
    if (operationResults.size >= 65_536) return Promise.resolve({ requestId: request.requestId, ok: false, error: { code: "OPERATION_HISTORY_FULL", message: "Restart the app before issuing new operation IDs." } });
    // Reserve before dispatch, storing no content. After a renderer restart the
    // previous outcome cannot be established from memory, so refuse replay.
    try {
      const ledgerKey = `essay-studio:mcp-operation:${operationId}`;
      if (localStorage.getItem(ledgerKey)) return Promise.resolve({ requestId: request.requestId, ok: false, error: { code: "OUTCOME_UNKNOWN", message: "This operation was dispatched in an earlier app session. Inspect saved state; it was not repeated." } });
      localStorage.setItem(ledgerKey, "dispatched");
    } catch { return Promise.resolve({ requestId: request.requestId, ok: false, error: { code: "OPERATION_LEDGER_FAILED", message: "The app could not record this operation safely. Nothing was dispatched." } }); }
  }
  const deadline = performance.now() + 20_000;
  const operation = tail.then(async (): Promise<BridgeResponse> => {
    try {
      const result = await run(request, requestSession, deadline);
      if (new TextEncoder().encode(JSON.stringify(result)).byteLength > MAX_REQUEST_BYTES - 1024) throw new ToolError("RESPONSE_TOO_LARGE", "Request a smaller page or content range. Do not repeat an edit.");
      return { requestId: request.requestId, ok: true, result };
    } catch (error) { return { requestId: request.requestId, ok: false, error: error instanceof ToolError ? { code: error.code, message: error.message } : { code: "OPERATION_FAILED", message: "The operation could not complete. Read current state before retrying." } }; }
  });
  tail = operation.then(() => undefined, () => undefined);
  if (operationId) {
    const entry = { signature, result: operation, bytes: 0 };
    operationResults.set(operationId, entry);
    void operation.then(response => {
      if (!response.ok && ["STALE_REVISION", "REQUEST_EXPIRED"].includes(response.error?.code ?? "")) {
        // These codes are issued only before the native operation. A fresh
        // revision can retry the same intent without risking a second edit.
        operationResults.delete(operationId);
        try { localStorage.removeItem(`essay-studio:mcp-operation:${operationId}`); } catch { /* Persistent reservation remains fail-closed. */ }
        return;
      }
      entry.bytes = new TextEncoder().encode(JSON.stringify(response)).byteLength;
      operationCacheBytes += entry.bytes;
      for (const saved of operationResults.values()) {
        if (operationCacheBytes <= OPERATION_CACHE_BYTES) break;
        if (!saved.bytes) continue;
        operationCacheBytes -= saved.bytes; saved.bytes = 0;
        saved.result = Promise.resolve({ requestId: "", ok: false, error: { code: "OUTCOME_UNKNOWN", message: "The cached response exceeded the session memory budget. Read saved state; this operation will not be repeated." } });
      }
    });
  }
  return operation;
}
