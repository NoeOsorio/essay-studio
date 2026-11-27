import type { Editor } from "@tiptap/core";
import type { Editor as BoardEditor, TLShapeId } from "tldraw";
import { findCitaRange } from "@/lib/editor/findCita";
import { getDocumentEditor } from "@/lib/mcp/document";
import { liveBoardEditor } from "@/lib/mcp/board";
import { openLanding, placeNote, endLanding } from "@/lib/questions/landing";
import { linkFindingNote, markCardNotApplicable, reopenCard, resolveCard, useReplacement as replaceWithSuggestion } from "@/lib/review/actions";
import { deriveFindings } from "@/lib/review/findings";
import { reviewFingerprint } from "@/lib/review/fingerprint";
import { matchFirstLetterCase, replacementIsGrounded, reviewCorpus, writeReviewFindings } from "@/lib/review/run";
import { buildAnotacion } from "@/lib/agents";
import { boardNoteIds } from "@/lib/board-notes";
import { useStore } from "@/lib/store";
import { ToolError } from "../../../shared/mcp";
import type { Anotacion, AgentColorKey, Interrogatorio, Sage } from "@/lib/storage/types";

/**
 * Questions of one agent for the board. `agent` is the name and color of a
 * custom agent (shown on its notes); `own` marks the writer's own question,
 * whose single entry in `preguntas` is the answer and whose note is titled
 * with the question.
 */
export type QuestionBatch = { sage: Sage; preguntas: string[]; costoUsd?: number; agent?: { name: string; color: AgentColorKey }; own?: { question: string } };

/** What an application of questions needs from the board, checked before anything is written. */
export function requireReviewBoard(essayId: string, batches: QuestionBatch[] = []): BoardEditor {
  const editor = liveBoardEditor(essayId);
  if (editor.getIsReadonly()) throw new ToolError("READ_ONLY", "The board is read-only.");
  if (!Array.isArray(batches) || batches.some((batch) => !batch || !(["em", "sis", "pra", "cri"].includes(batch.sage) || /^c_./u.test(batch.sage)) || !Array.isArray(batch.preguntas) || batch.preguntas.some((text) => typeof text !== "string" || !text.trim()))) throw new ToolError("INVALID_ARGUMENTS", "Provide valid selected questions.");
  const count = batches.reduce((sum, batch) => sum + batch.preguntas.length, 0);
  if (editor.getCurrentPageShapeIds().size + count > editor.options.maxShapesPerPage) throw new ToolError("BOARD_CAPACITY", "The selected questions exceed the board capacity.");
  // A question run in the panel owns the landing region; a second one would collide with it.
  const run = useStore.getState().questionRun;
  if (run && run.status !== "ended") throw new ToolError("EDITOR_BUSY", "Questions are being written to the board. Wait for them to finish.");
  return editor;
}

/**
 * Put the selected questions on the board the way the questions panel does:
 * one column per agent to the right of what is there, the same note, nothing
 * existing moved. The interrogation entries are saved with the job id as the
 * run, so they replace themselves if the same job is applied again.
 */
export function materializeReviewQuestions(essayId: string, batches: QuestionBatch[], runId: string, fuenteId?: string): void {
  const editor = requireReviewBoard(essayId, batches);
  const nonEmpty = batches.filter((batch) => batch.preguntas.length > 0);
  if (nonEmpty.length === 0) return;
  const generadoEn = new Date().toISOString();
  const session = openLanding(editor, essayId, [...new Set(nonEmpty.map((batch) => batch.sage))], nonEmpty.some((batch) => batch.own));
  const created: TLShapeId[] = [];
  try {
    for (const batch of nonEmpty) for (const text of batch.preguntas) {
      created.push(placeNote(session, editor, { sage: batch.sage, text, ...(batch.agent ? { agentName: batch.agent.name, agentColor: batch.agent.color } : {}), ...(batch.own ? { title: batch.own.question } : {}), ...(fuenteId ? { fuenteId } : {}) }));
    }
    if (created.some((id) => !editor.getShape(id))) throw new ToolError("EDIT_REJECTED", "The board did not create every selected question.");
  } catch (error) {
    // Nothing partial stays on the board.
    editor.run(() => editor.deleteShapes(created.filter((id) => editor.getShape(id))), { history: "ignore" });
    throw error;
  } finally {
    endLanding(session);
  }
  const entries: Interrogatorio[] = nonEmpty.map((batch) => ({
    sage: batch.sage, preguntas: batch.own ? [batch.own.question] : batch.preguntas, generadoEn, runId, ...(batch.own ? { propia: true as const } : {}),
    ...(batch.costoUsd ? { costoUsd: batch.costoUsd } : {}),
    ...(fuenteId ? { fuenteId } : {}),
  }));
  useStore.getState().replaceInterrogatoriosForRun(runId, entries);
}

export function availableAnnotationIds(editor: Editor, annotations: Anotacion[]): Set<string> {
  const ids = new Set<string>();
  const seen = new Map<string, number>();
  for (const annotation of annotations) {
    const skip = seen.get(annotation.cita) ?? 0;
    if (!findCitaRange(editor, annotation.cita, skip)) continue;
    ids.add(annotation.id); seen.set(annotation.cita, skip + 1);
  }
  return ids;
}

export function assertReviewDocumentEditable(editor: Editor): void {
  if (editor.view.composing || !editor.isEditable) throw new ToolError("EDITOR_BUSY", "Finish the current text composition before editing review results.");
}

/**
 * Apply or close findings by id through the same actions the cards use, so the
 * records, the underlines, the undo steps and the score stay in step. Ids are
 * finding ids: the ones the document lists as annotations or as findings.
 *
 * apply: replace the underlined text with the finding's replacement (closed as
 *   resolved by replacement). Discard: close as not applicable. Clear: remove
 *   every finding and the evaluation, as Limpiar evaluación does.
 */
export function editAnnotations(args: { essayId: string; operation: "apply" | "discard" | "clear" | "resolve" | "reopen"; ids?: string[] }): { changed: boolean } {
  const editor = getDocumentEditor(args.essayId);
  assertReviewDocumentEditable(editor);
  const essay = useStore.getState().current;
  if (!essay || essay.id !== args.essayId) throw new ToolError("ESSAY_CHANGED", "The requested essay is not open.");
  const views = deriveFindings(essay.content, essay.findings);
  if (args.operation === "clear") {
    const changed = views.length > 0 || (essay.findings?.length ?? 0) > 0 || essay.evaluacionMeta !== undefined;
    useStore.getState().clearEvaluacion();
    return { changed };
  }
  const ids = args.ids;
  if (!ids || !ids.length || new Set(ids).size !== ids.length) throw new ToolError("INVALID_ARGUMENTS", "Provide explicit, distinct annotation IDs.");
  if (args.operation === "reopen") {
    // The card's Reabrir: only findings closed as resolved come back.
    for (const id of ids) if (!views.some((item) => item.id === id && item.status === "resolved")) throw new ToolError("ANNOTATION_NOT_FOUND", "An annotation ID is not a resolved finding of the current document.");
    reopenCard(ids);
    return { changed: true };
  }
  const selected = ids.map((id) => {
    const view = views.find((item) => item.id === id && item.status === "open");
    if (!view) throw new ToolError("ANNOTATION_NOT_FOUND", "An annotation ID is not an open finding of the current document.");
    if (args.operation === "apply" && (!view.located || !view.reemplazo || view.spansBlocks || view.from === null || view.to === null)) throw new ToolError("EDIT_REJECTED", "The selected suggestion cannot be applied within one block.");
    return view;
  });
  if (args.operation === "discard") {
    markCardNotApplicable(ids);
    return { changed: true };
  }
  if (args.operation === "resolve") {
    // «Ya lo resolví»: closes the findings without touching the text.
    resolveCard(ids);
    return { changed: true };
  }
  const sorted = selected.sort((a, b) => (b.from ?? 0) - (a.from ?? 0));
  for (let i = 1; i < sorted.length; i++) if ((sorted[i]!.to ?? 0) > (sorted[i - 1]!.from ?? 0)) throw new ToolError("INVALID_ARGUMENTS", "Apply overlapping suggestions separately.");
  // From the end of the text backwards, so earlier positions stay valid.
  for (const view of sorted) {
    const done = replaceWithSuggestion(view.id);
    if (!done.ok) throw new ToolError("EDIT_REJECTED", "A suggestion could not be applied. Earlier ones in this request were applied; read the document before continuing.");
  }
  return { changed: true };
}

const FINDING_KEYS = new Set(["cita", "mensaje", "severidad", "reemplazo", "criterioId", "noteId", "occurrence"]);

/**
 * Corrections written by the writer's own assistant: the same records,
 * underlines, cards and score as the app's agents, under the identity «Tu
 * asistente», with no model call. Each item is checked on its own; the rest
 * go in. The batch is one transaction and one undo. Without `replaceOwn` it
 * adds to what the assistant sent before; with it, only the assistant's own
 * open findings are replaced.
 */
export function addFindings(args: { essayId: string; findings: unknown[]; replaceOwn?: boolean }): {
  added: { id: string; located: boolean; replacementDropped?: boolean }[];
  rejected: { index: number; reason: string }[];
} {
  const editor = getDocumentEditor(args.essayId);
  assertReviewDocumentEditable(editor);
  const essay = useStore.getState().current;
  if (!essay || essay.id !== args.essayId) throw new ToolError("ESSAY_CHANGED", "The requested essay is not open.");
  const generadoEn = new Date().toISOString();
  const corpus = reviewCorpus(essay.content, essay.fuentes);
  const rejected: { index: number; reason: string }[] = [];
  const boardNotes = boardNoteIds(essay.board);
  const anotaciones: Anotacion[] = [];
  const indexOf = new Map<string, number>();
  const occurrences = new Map<string, number>();
  const dropped = new Set<string>();
  args.findings.forEach((item, index) => {
    const reject = (reason: string) => { rejected.push({ index, reason }); };
    if (!item || typeof item !== "object" || Array.isArray(item)) return reject("The finding must be an object.");
    const f = item as Record<string, unknown>;
    if (Object.keys(f).some((key) => !FINDING_KEYS.has(key))) return reject("Unknown field. Use cita, mensaje, severidad, reemplazo, criterioId, noteId and occurrence.");
    if (typeof f.cita !== "string" || !f.cita.trim()) return reject("cita is required: literal text from the essay.");
    if (f.cita.length > 2000) return reject("cita is longer than 2000 characters.");
    if (typeof f.mensaje !== "string" || !f.mensaje.trim()) return reject("mensaje is required.");
    if (f.mensaje.length > 600) return reject("mensaje is longer than 600 characters.");
    if (f.severidad !== "alta" && f.severidad !== "media" && f.severidad !== "baja") return reject("severidad must be alta, media or baja.");
    if (f.reemplazo !== undefined && (typeof f.reemplazo !== "string" || f.reemplazo.length > 2000)) return reject("reemplazo must be text of at most 2000 characters.");
    if (f.criterioId !== undefined && typeof f.criterioId !== "string") return reject("criterioId must be a rubric criterion id.");
    if (f.noteId !== undefined) {
      if (typeof f.noteId !== "string" || !f.noteId) return reject("noteId must be the id of a note on this essay's board.");
      if (!boardNotes.has(f.noteId)) return reject("noteId is not a note on this essay's board.");
    }
    if (f.occurrence !== undefined && (typeof f.occurrence !== "number" || !Number.isSafeInteger(f.occurrence) || f.occurrence < 0)) return reject("occurrence must be an integer of 0 or more.");
    const a = buildAnotacion(
      { cita: f.cita, mensaje: f.mensaje.trim(), severidad: f.severidad, ...(typeof f.reemplazo === "string" && f.reemplazo.trim() ? { reemplazo: f.reemplazo.trim() } : {}), ...(typeof f.criterioId === "string" ? { criterioId: f.criterioId } : {}) },
      "as", "asistente", generadoEn, essay.rubrica?.criterios,
    );
    if (typeof f.noteId === "string") a.noteId = f.noteId;
    // The same guards as the agents: the replacement keeps the first-letter case and brings nothing the essay and its sources do not have.
    if (a.reemplazo) {
      if (replacementIsGrounded(a.reemplazo, corpus)) a.reemplazo = matchFirstLetterCase(a.reemplazo, a.cita);
      else { a.reemplazo = undefined; dropped.add(a.id); }
    }
    if (typeof f.occurrence === "number") occurrences.set(a.id, f.occurrence);
    indexOf.set(a.id, index);
    anotaciones.push(a);
  });
  if (anotaciones.length === 0) return { added: [], rejected };
  const written = writeReviewFindings(
    editor,
    [{ pase: "asistente", invalid: 0, anotaciones }],
    reviewFingerprint(essay),
    generadoEn,
    { replacePases: args.replaceOwn ? ["asistente"] : [], history: true, occurrences },
  );
  const writtenIds = new Set(written.map((w) => w.id));
  for (const a of anotaciones) {
    if (!writtenIds.has(a.id)) rejected.push({ index: indexOf.get(a.id)!, reason: "The writer already closed a correction of the assistant on this sentence." });
  }
  rejected.sort((x, y) => x.index - y.index);
  return { added: written.map((w) => ({ ...w, ...(dropped.has(w.id) ? { replacementDropped: true } : {}) })), rejected };
}

/** Point a correction at a board note, or clear the link. Same action as the cards' Vincular nota. */
export function linkNote(args: { essayId: string; findingId: string; noteId: string | null }): { changed: boolean; noteId: string | null } {
  const editor = getDocumentEditor(args.essayId);
  assertReviewDocumentEditable(editor);
  const essay = useStore.getState().current;
  if (!essay || essay.id !== args.essayId) throw new ToolError("ESSAY_CHANGED", "The requested essay is not open.");
  if (args.noteId !== null && (typeof args.noteId !== "string" || !boardNoteIds(essay.board).has(args.noteId))) throw new ToolError("NOTE_NOT_FOUND", "noteId is not a note on this essay's board.");
  const exists = deriveFindings(essay.content, essay.findings).some((view) => view.id === args.findingId);
  if (!exists) throw new ToolError("ANNOTATION_NOT_FOUND", "The finding does not exist in the current document.");
  return { changed: linkFindingNote(args.findingId, args.noteId), noteId: args.noteId };
}
