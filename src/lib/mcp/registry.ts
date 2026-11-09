import { useStore } from "@/lib/store";
import { appendSnapshot, listEssays } from "@/lib/storage";
import { CAPABILITY_VERSION, PROTOCOL_VERSION, MAX_REQUEST_BYTES, ToolError, TOOL_DEFINITIONS, validateArgs, type BridgeRequest, type BridgeResponse, type JsonObject } from "../../../shared/mcp";
import { ensureDocument, readDocument, readTextSelection, validateDocumentTool, handleDocumentTool } from "./document";
import { ensureBoard, getBoardSelection, getBoardSummary, handleBoardTool, validateBoardTool, applyBoardHistory, prepareBoardAsset, resetBoardUploads } from "./board";
import { editLibrary, readLibrary, validateLibraryEdit } from "./library";
import { matches, page } from "./collections";
import { startReview, startInterrogation, getReviewJob, cancelReviewJob, cancelReviewScope, listReviewerProfiles, validateReviewApplication, applyReviewResults } from "@/lib/reviews/jobs";
import { editAnnotations } from "@/lib/reviews/actions";
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
    resetBoardUploads();
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
  const effect = name === "import_board_asset" && args.operation !== "finish" ? "job" : definition.effect;
  const essayId = args.essayId as string;
  if (name === "get_basic_info") {
    const state = useStore.getState();
    return envelope({ app: "Essay Studio", view: state.view, saveStatus: state.saveStatus.kind,
      essay: state.current ? { id: state.current.id, title: state.current.title, mode: state.current.mode, language: state.current.language ?? "es", wordCount: state.current.wordCount } : null,
      board: { open: state.boardOpen, ...getBoardSummary() },
      capabilities: { protocolVersion: PROTOCOL_VERSION, capabilityVersion: CAPABILITY_VERSION, platform: "macos", tools: TOOL_DEFINITIONS.map(tool => ({ name: tool.name, effect: tool.effect })) } });
  }
  if (name === "list_essays") {
    const items = await listEssays(); guard();
    const result = page(items.filter(item => matches(args.query, item.title) && (!args.mode || item.mode === args.mode) && (!args.language || (item.language ?? "es") === args.language)), args);
    return envelope({ ...result, essays: result.items });
  }
  if (name === "list_reviewer_profiles") return envelope(listReviewerProfiles());
  if (["open_essay", "create_essay", "close_essay", "delete_essay"].includes(name)) {
    if (args.revision !== undefined) checkRevision(args.revision);
    const state = useStore.getState(); const before = state.current;
    if (name === "create_essay" && typeof args.title === "string" && /[\r\n]/u.test(args.title)) throw new ToolError("INVALID_ARGUMENTS", "Essay titles must use a single line.");
    if (name === "close_essay" || name === "delete_essay") assertContext(essayId);
    if (before) { await flushDurable(before.id); guard(); if (args.revision !== undefined) checkRevision(args.revision); }
    if (name === "open_essay") {
      await useStore.getState().openEssay(essayId, before?.id ?? null); guard(true); assertContext(essayId);
      await ensureDocument(essayId); guard(true);
    } else if (name === "create_essay") {
      const createdId = await useStore.getState().newEssay(args.mode as "academico" | "blog" | undefined); guard(true);
      const created = useStore.getState().current;
      if (!createdId || !created || created.id !== createdId || useStore.getState().saveStatus.kind !== "saved") throw new ToolError("CREATE_FAILED", "The essay was not created or navigation changed; inspect the library before retrying.");
      const captured = created;
      await ensureDocument(created.id); guard(true);
      if (useStore.getState().current !== captured) throw new ToolError("OUTCOME_UNKNOWN", "The new essay changed before initialization completed. Read it before continuing.");
      if (args.title !== undefined) handleDocumentTool("edit_document", { essayId: created.id, operation: "rename", title: args.title });
      if (args.language !== undefined) useStore.getState().updateLanguage(args.language as "es" | "en");
      await flushDurable(created.id); guard(true);
      return envelope({ created: true, title: useStore.getState().current!.title, saved: true }, created.id);
    } else {
      await useStore.getState().closeEssay(); guard(true);
      if (useStore.getState().current !== null || useStore.getState().view !== "list") throw new ToolError("OUTCOME_UNKNOWN", "Closing was interrupted. Inspect current state before continuing.");
      if (name === "delete_essay") {
        await useStore.getState().removeEssay(essayId); guard(true);
        const listed = await listEssays(); guard(true);
        if (listed.some(item => item.id === essayId)) throw new ToolError("DELETE_FAILED", "The essay could not be deleted.");
        if (useStore.getState().current?.id === essayId) throw new ToolError("OUTCOME_UNKNOWN", "The essay was reopened while deletion was dispatched. Inspect current state before continuing.");
      }
      return envelope({ closed: true, deleted: name === "delete_essay", saved: true });
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
  if (effect !== "read") checkRevision(args.revision);
  if (name === "import_board_asset") {
    if (args.operation !== "finish") return envelope(handleBoardTool(name, args), essayId);
    await prepareBoardAsset(args); guard(); assertContext(essayId); checkRevision(args.revision);
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
    const result = name === "start_review" ? startReview({ ...common, pases: args.pases as Pase[] | undefined, reviewerProfile: args.reviewerProfile as string | undefined }) : startInterrogation({ ...common, sages: args.sages as Sage[] | undefined, text: args.text as string | undefined, sourceId: args.sourceId as string | undefined });
    return envelope(result, essayId);
  }
  if (definition.effect === "view") {
    guard(); checkRevision(args.revision);
    if (name === "set_app_view") {
      const state = useStore.getState();
      if (typeof args.boardOpen === "boolean" && state.boardOpen !== args.boardOpen) state.toggleBoard();
      const panels = { sources: "fuentes", rubric: "rubrica", history: "history", review: "pluma", interrogation: "lectura", none: null } as const;
      if (args.panel === "history") useStore.getState().openHistory();
      else if (args.panel !== undefined) useStore.getState().setOverlay(panels[args.panel as keyof typeof panels]);
      return envelope({ changed: true }, essayId);
    }
    const value = boardSurface ? handleBoardTool(name, args) : handleDocumentTool(name, args);
    return envelope(value, essayId);
  }
  if (name === "edit_document") validateDocumentTool(name, args);
  else if (boardSurface && name !== "editor_history" && name !== "apply_review_results") validateBoardTool(name, args);
  else if (name === "edit_source" || name === "edit_rubric" || name === "update_essay") validateLibraryEdit(name, args);
  if (name === "apply_review_results") validateReviewApplication(args as Parameters<typeof validateReviewApplication>[0]);
  if (name === "update_essay" && args.reviewerProfile !== undefined && !REVIEWER_PROFILES.some(profile => profile.id === args.reviewerProfile)) throw new ToolError("INVALID_ARGUMENTS", "Unknown reviewer profile.");
  checkRevision(args.revision);
  const thisBatch = `${requestSession}:${essayId}`;
  if (batchKey !== thisBatch) {
    await flushDurable(essayId); guard(); checkRevision(args.revision);
    const essay = structuredClone(useStore.getState().current!);
    try { await appendSnapshot({ takenAt: new Date().toISOString(), kind: "manual", essay }); }
    catch { throw new ToolError("SNAPSHOT_FAILED", "The safety version could not be saved. No edit was applied."); }
    guard(); assertContext(essayId); checkRevision(args.revision); batchKey = thisBatch;
  }
  guard(); assertContext(essayId); checkRevision(args.revision);
  let result: unknown;
  if (name === "restore_version") {
    const restored = await useStore.getState().restoreVersion(args.takenAt as string, () => { guard(); assertContext(essayId); checkRevision(args.revision); }); guard(true); assertContext(essayId); batchKey = null;
    if (!restored) throw new ToolError("RESTORE_FAILED", "The safety save failed or the essay changed. No successful restore is confirmed; inspect current state.");
    result = { restored: true };
  } else if (name === "create_version") { const created = await useStore.getState().snapshotNow("manual"); guard(true); assertContext(essayId); if (!created) throw new ToolError("SNAPSHOT_FAILED", "The version could not be created or the essay changed."); result = { created: true, takenAt: created }; }
  else if (name === "editor_history") result = args.surface === "board" ? applyBoardHistory(args.direction as "undo" | "redo") : handleDocumentTool(name, args);
  else if (name === "apply_review_results") result = applyReviewResults(args as Parameters<typeof applyReviewResults>[0]);
  else if (name === "edit_annotations") result = editAnnotations(args as Parameters<typeof editAnnotations>[0]);
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
