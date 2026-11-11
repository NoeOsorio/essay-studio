import type { Editor } from "@tiptap/core";
import type { Editor as BoardEditor, TLShapeId } from "tldraw";
import { findCitaRange } from "@/lib/editor/findCita";
import { getDocumentEditor } from "@/lib/mcp/document";
import { liveBoardEditor } from "@/lib/mcp/board";
import { openLanding, placeNote, endLanding } from "@/lib/questions/landing";
import { markCardNotApplicable, useReplacement as replaceWithSuggestion } from "@/lib/review/actions";
import { deriveFindings } from "@/lib/review/findings";
import { useStore } from "@/lib/store";
import { ToolError } from "../../../shared/mcp";
import type { Anotacion, Interrogatorio, Sage } from "@/lib/storage/types";

export type QuestionBatch = { sage: Sage; preguntas: string[]; costoUsd?: number };

/** What an application of questions needs from the board, checked before anything is written. */
export function requireReviewBoard(essayId: string, batches: QuestionBatch[] = []): BoardEditor {
  const editor = liveBoardEditor(essayId);
  if (editor.getIsReadonly()) throw new ToolError("READ_ONLY", "The board is read-only.");
  if (!Array.isArray(batches) || batches.some((batch) => !batch || !["em", "sis", "pra", "cri"].includes(batch.sage) || !Array.isArray(batch.preguntas) || batch.preguntas.some((text) => typeof text !== "string" || !text.trim()))) throw new ToolError("INVALID_ARGUMENTS", "Provide valid selected questions.");
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
  const session = openLanding(editor, essayId, nonEmpty.map((batch) => batch.sage));
  const created: TLShapeId[] = [];
  try {
    for (const batch of nonEmpty) for (const text of batch.preguntas) {
      created.push(placeNote(session, editor, { sage: batch.sage, text, ...(fuenteId ? { fuenteId } : {}) }));
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
    sage: batch.sage, preguntas: batch.preguntas, generadoEn, runId,
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
export function editAnnotations(args: { essayId: string; operation: "apply" | "discard" | "clear"; ids?: string[] }): { changed: boolean } {
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
  const sorted = selected.sort((a, b) => (b.from ?? 0) - (a.from ?? 0));
  for (let i = 1; i < sorted.length; i++) if ((sorted[i]!.to ?? 0) > (sorted[i - 1]!.from ?? 0)) throw new ToolError("INVALID_ARGUMENTS", "Apply overlapping suggestions separately.");
  // From the end of the text backwards, so earlier positions stay valid.
  for (const view of sorted) {
    const done = replaceWithSuggestion(view.id);
    if (!done.ok) throw new ToolError("EDIT_REJECTED", "A suggestion could not be applied. Earlier ones in this request were applied; read the document before continuing.");
  }
  return { changed: true };
}
