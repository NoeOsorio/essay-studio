import type { Editor } from "@tiptap/core";
import type { Mark } from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";
import { findCitaRange } from "@/lib/editor/findCita";
import { getDocumentEditor } from "@/lib/mcp/document";
import { useStore } from "@/lib/store";
import { ToolError } from "../../../shared/mcp";
import type { Anotacion, Pase, ReviewProvenance, Sage } from "@/lib/storage/types";

export type QuestionBatch = { sage: Sage; preguntas: string[] };
let board: { essayId: string; apply: (batches: QuestionBatch[]) => void; validate: (batches: QuestionBatch[]) => void } | null = null;
export function registerReviewBoard(essayId: string, apply: (batches: QuestionBatch[]) => void, validate: (batches: QuestionBatch[]) => void): () => void {
  const registration = { essayId, apply, validate };
  board = registration;
  return () => { if (board === registration) board = null; };
}
export function requireReviewBoard(essayId: string, batches: QuestionBatch[] = []): void {
  if (board?.essayId !== essayId) throw new ToolError("EDITOR_NOT_READY", "Open the board before saving questions.");
  board.validate(batches);
}
export function materializeReviewQuestions(essayId: string, batches: QuestionBatch[]): void {
  requireReviewBoard(essayId, batches);
  board!.apply(batches);
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

export function annotationRanges(editor: Editor, annotations: Anotacion[]) {
  const seen = new Map<string, number>();
  return annotations.map((annotation) => {
    const skip = seen.get(annotation.cita) ?? 0;
    const range = findCitaRange(editor, annotation.cita, skip);
    if (!range) throw new ToolError("ANNOTATION_NOT_FOUND", "An annotation quote no longer matches the document.");
    seen.set(annotation.cita, skip + 1);
    return { annotation, range };
  });
}

/** All mark additions are validated first and dispatched as one native action. */
export function applyAnnotations(editor: Editor, annotations: Anotacion[]): void {
  assertReviewDocumentEditable(editor);
  const ranges = annotationRanges(editor, annotations);
  if (!ranges.length) return;
  const type = editor.state.schema.marks.annotation;
  if (!type) throw new ToolError("EDIT_REJECTED", "The editor does not support annotations.");
  const tr = closeHistory(editor.state.tr);
  for (const { annotation: a, range } of ranges) tr.addMark(range.from, range.to, type.create({
    id: a.id, sage: a.sage, pase: a.pase, severidad: a.severidad,
    mensaje: a.mensaje, reemplazo: a.reemplazo ?? null, criterioId: a.criterioId ?? null,
    evidence: a.evidence ?? null, provenance: a.provenance ?? null,
  }));
  tr.doc.check();
  editor.view.dispatch(tr);
  editor.view.dispatch(closeHistory(editor.state.tr));
}

export function applyEvaluation(essayId: string, annotations: Anotacion[], passes: Pase[], runs?: { pase: Pase; provenance?: ReviewProvenance }[]): void {
  const editor = getDocumentEditor(essayId);
  applyAnnotations(editor, annotations);
  // TipTap's update event updates the live store synchronously before this call.
  useStore.getState().recordEvaluacion(passes, runs);
}

export function editAnnotations(args: { essayId: string; operation: "apply" | "discard" | "clear"; ids?: string[] }): { changed: boolean } {
  const editor = getDocumentEditor(args.essayId);
  assertReviewDocumentEditable(editor);
  const fragments: { from: number; to: number; mark: Mark }[] = [];
  const marks = new Map<string, { replacement: string | null; from: number; to: number; parent: number; contiguous: boolean }>();
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    for (const mark of node.marks) if (mark.type.name === "annotation") {
      fragments.push({ from: pos, to: pos + node.nodeSize, mark });
      if (typeof mark.attrs.id !== "string") continue;
      const existing = marks.get(mark.attrs.id);
      const parent = editor.state.doc.resolve(pos).start();
      marks.set(mark.attrs.id, { replacement: typeof mark.attrs.reemplazo === "string" ? mark.attrs.reemplazo : null,
        from: existing?.from ?? pos, to: pos + node.nodeSize, parent: existing && existing.parent !== parent ? -1 : parent, contiguous: !existing || existing.contiguous && existing.to === pos });
    }
  });
  const ids = args.operation === "clear" ? [...marks.keys()] : args.ids;
  if (!ids || !ids.length || new Set(ids).size !== ids.length) {
    if (args.operation === "clear") {
      const changed = fragments.length > 0 || useStore.getState().current?.evaluacionMeta !== undefined;
      if (fragments.length) {
        const tr = closeHistory(editor.state.tr);
        for (const fragment of fragments) tr.removeMark(fragment.from, fragment.to, fragment.mark);
        tr.doc.check(); editor.view.dispatch(tr);
        editor.view.dispatch(closeHistory(editor.state.tr));
      }
      useStore.getState().clearEvaluacion();
      return { changed };
    }
    throw new ToolError("INVALID_ARGUMENTS", "Provide explicit, distinct annotation IDs.");
  }
  const selected = ids.map((id) => {
    const mark = marks.get(id);
    if (!mark) throw new ToolError("ANNOTATION_NOT_FOUND", "An annotation ID is not in the current document.");
    if (args.operation === "apply" && (!mark.replacement || mark.parent < 0 || !mark.contiguous)) throw new ToolError("EDIT_REJECTED", "The selected suggestion cannot be applied within one block.");
    return { id, ...mark };
  });
  const type = editor.state.schema.marks.annotation;
  if (!type) throw new ToolError("EDIT_REJECTED", "The editor does not support annotations.");
  const tr = closeHistory(editor.state.tr);
  if (args.operation === "apply") {
    const sorted = selected.sort((a, b) => b.from - a.from);
    for (let i = 1; i < sorted.length; i++) if (sorted[i]!.to > sorted[i - 1]!.from) throw new ToolError("INVALID_ARGUMENTS", "Apply overlapping suggestions separately.");
    for (const item of sorted) {
      tr.insertText(item.replacement!, item.from, item.to);
      const inherited: Mark[] = [];
      tr.doc.nodesBetween(item.from, item.from + item.replacement!.length, (node) => {
        for (const mark of node.marks) if (mark.type === type && mark.attrs.id === item.id && !inherited.some((other) => other.eq(mark))) inherited.push(mark);
      });
      for (const mark of inherited) tr.removeMark(item.from, item.from + item.replacement!.length, mark);
    }
  } else {
    const selectedIds = new Set(ids);
    for (const fragment of fragments) if (args.operation === "clear" || selectedIds.has(fragment.mark.attrs.id as string)) tr.removeMark(fragment.from, fragment.to, fragment.mark);
  }
  tr.doc.check();
  editor.view.dispatch(tr);
  editor.view.dispatch(closeHistory(editor.state.tr));
  if (args.operation === "clear") useStore.getState().clearEvaluacion();
  return { changed: true };
}
