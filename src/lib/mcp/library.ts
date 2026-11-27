import { useStore } from "@/lib/store";
import { listHistory, readSnapshot } from "@/lib/storage";
import { withReference } from "@/lib/materials/apa";
import type { Criterio, Fuente } from "@/lib/storage/types";
import { liveNoteId } from "@/lib/board-notes";
import { deriveFindings, type FindingView } from "@/lib/review/findings";
import { ToolError, type JsonObject } from "../../../shared/mcp";
import { matches, page, textRange } from "./collections";
import { citationPatchFromArgs, finishSourceUpload, forgetRemoved, pendingProposal, rememberRemoved, removedSource, saveSource, sourceFields } from "./materials";

function current() {
  const essay = useStore.getState().current;
  if (!essay) throw new ToolError("ESSAY_CHANGED", "No essay is open.");
  return essay;
}

/** Open and resolved findings of the open essay, as the cards list them (not applicable ones are hidden). */
function findings(): FindingView[] {
  const essay = current();
  return deriveFindings(essay.content, essay.findings);
}

/** Computed references: source edits never certify old evidence or silently erase it. */
export function referenceWarnings(): JsonObject {
  const essay = current();
  const sources = new Map((essay.fuentes ?? []).map(source => [source.id, source]));
  const criteria = new Set((essay.rubrica?.criterios ?? []).map(criterion => criterion.id));
  const invalid: JsonObject[] = [];
  for (const annotation of findings()) {
    if (annotation.criterioId && !criteria.has(annotation.criterioId)) invalid.push({ annotationId: annotation.id, criterionId: annotation.criterioId, reason: "missing_criterion" });
    for (const evidence of annotation.evidence ?? []) {
      const source = sources.get(evidence.sourceId);
      if (!source) invalid.push({ annotationId: annotation.id, sourceId: evidence.sourceId, reason: "missing_source" });
      else if (source.contenido.slice(evidence.from, evidence.to) !== evidence.quote) invalid.push({ annotationId: annotation.id, sourceId: evidence.sourceId, reason: "changed_source" });
    }
  }
  return { invalidReferenceCount: invalid.length, invalidReferences: invalid.slice(0, 50), referencesTruncated: invalid.length > 50 };
}

export function readLibrary(name: string, args: JsonObject): JsonObject | Promise<JsonObject> {
  const essay = current();
  if (name === "list_annotations" || name === "get_annotation") {
    if (typeof args.pase === "string" && !/^(coherencia|estilo|argumento|apa|asistente|custom:.+)$/u.test(args.pase)) throw new ToolError("INVALID_ARGUMENTS", "pase must be coherencia, estilo, argumento, apa, asistente or custom:<agent id>.");
    if (typeof args.sage === "string" && !/^(em|sis|pra|cri|as|c_.+)$/u.test(args.sage)) throw new ToolError("INVALID_ARGUMENTS", "sage must be em, sis, pra, cri, as or c_<agent id>.");
    const all = findings();
    if (name === "get_annotation") {
      const found = all.find(item => item.id === args.id);
      if (!found) throw new ToolError("NOT_FOUND", "The annotation does not exist.");
      return { id: found.id, noteId: liveNoteId(essay.board, found.noteId) ?? null, ...textRange(JSON.stringify(found), args), ...referenceWarnings() };
    }
    const result = page(all.filter(item => matches(args.query, item.mensaje, item.quote) && (!args.pase || item.pase === args.pase) && (!args.sage || item.sage === args.sage) && (!args.criterioId || item.criterioId === args.criterioId) && (!args.severity || item.severidad === args.severity) && (!args.status || item.status === args.status)), args);
    return { ...result, items: result.items.map(item => ({ id: item.id, from: item.from, to: item.to, located: item.located, status: item.status, pase: item.pase, sage: item.sage, ...(item.agentName ? { agentName: item.agentName } : {}), severity: item.severidad, message: item.mensaje.slice(0, 512), quote: item.quote.slice(0, 512), criterioId: item.criterioId ?? null, reemplazo: item.reemplazo?.slice(0, 512) ?? null, noteId: liveNoteId(essay.board, item.noteId) ?? null })), ...referenceWarnings() };
  }
  if (name === "list_sources") {
    const result = page((essay.fuentes ?? []).filter(source => matches(args.query, source.nombre, source.cita) && (!args.origin || source.origen === args.origin)), args);
    return { ...result, items: result.items.map(source => sourceFields(source)), ...referenceWarnings() };
  }
  if (name === "get_source") {
    const source = essay.fuentes?.find(item => item.id === args.id);
    if (!source) throw new ToolError("NOT_FOUND", "The source does not exist.");
    return { ...sourceFields(source), ...textRange(source.contenido, args), ...referenceWarnings() };
  }
  if (name === "get_rubric") {
    const consigna = essay.rubrica?.consigna;
    const reading = useStore.getState().lecturaRubrica;
    return { ...page((essay.rubrica?.criterios ?? []).filter(criterion => matches(args.query, criterion.nombre, criterion.descripcion)), args),
      assignment: consigna ? { ...(consigna.archivoNombre ? { fileName: consigna.archivoNombre } : {}), addedAt: consigna.agregadoEn, ...textRange(consigna.texto, args) } : null,
      reading: reading ?? null, proposal: pendingProposal(essay.id), ...referenceWarnings() };
  }
  if (name === "list_versions") return listHistory(essay.id).then(items => page(items.filter(item => matches(args.query, item.title) && (!args.kind || item.kind === args.kind)), args));
  if (name === "get_version") return readSnapshot(essay.id, args.takenAt as string).then(snapshot => {
    const blocks: string[] = [];
    const walk = (node: { type?: string; text?: string; content?: unknown[] }): string => {
      if (node.text) return node.text;
      if (node.type === "hardBreak") return "\n";
      const children = (node.content ?? []).filter((child): child is typeof node => !!child && typeof child === "object");
      const text = children.map(walk).join("");
      if (["paragraph", "heading", "codeBlock"].includes(node.type ?? "")) blocks.push(text);
      return text;
    };
    walk(snapshot.essay.content);
    return { takenAt: snapshot.takenAt, kind: snapshot.kind, title: snapshot.essay.title, mode: snapshot.essay.mode, language: snapshot.essay.language ?? "es", ...textRange(blocks.join("\n\n"), args) };
  });
  throw new ToolError("UNKNOWN_TOOL", "Unknown library operation.");
}

export function validateLibraryEdit(name: string, args: JsonObject): void {
  const essay = current();
  if ((name === "edit_source" || name === "edit_rubric") && args.operation === "delete" && args.confirm !== true) throw new ToolError("CONFIRMATION_REQUIRED", "Deleting a saved item requires an explicit user request and confirm=true.");
  if (name === "import_source_file") return;
  if (name === "edit_source") {
    if (args.operation === "restore") {
      if (!removedSource(args.id, essay.id)) throw new ToolError("NOT_FOUND", "That source was not deleted with this tool in this essay, so there is nothing to restore.");
      if (essay.fuentes?.some(source => source.id === args.id)) throw new ToolError("INVALID_ARGUMENTS", "That source is already back in the library.");
      return;
    }
    if ((args.operation === "update" || args.operation === "delete") && !essay.fuentes?.some(source => source.id === args.id)) throw new ToolError("NOT_FOUND", "The source does not exist.");
    if (args.operation !== "delete" && args.operation !== "update" && (typeof args.name !== "string" || typeof args.content !== "string")) throw new ToolError("INVALID_ARGUMENTS", "A source needs a name and content.");
    if (args.operation === "import" && (typeof args.fileName !== "string" || !/^[^/\\\x00]+\.(txt|md)$/iu.test(args.fileName))) throw new ToolError("INVALID_ARGUMENTS", "Import accepts a TXT or Markdown filename, not a path.");
  } else if (name === "edit_rubric") {
    if ((args.operation === "update" || args.operation === "delete") && !essay.rubrica?.criterios.some(item => item.id === args.id)) throw new ToolError("NOT_FOUND", "The criterion does not exist.");
    if (args.operation === "create" && (typeof args.name !== "string" || typeof args.description !== "string" || typeof args.weight !== "number")) throw new ToolError("INVALID_ARGUMENTS", "A criterion needs a name, description and weight.");
  }
}

export function editLibrary(name: string, args: JsonObject): JsonObject {
  validateLibraryEdit(name, args);
  const state = useStore.getState();
  if (name === "import_source_file") return finishSourceUpload(args);
  if (name === "edit_source") {
    const id = args.id as string;
    const essay = current();
    if (args.operation === "delete") {
      const taken = state.removeFuente(id);
      if (taken) rememberRemoved(taken);
      return { id, deleted: true, restorable: !!taken, ...referenceWarnings() };
    }
    if (args.operation === "restore") {
      const taken = removedSource(id, essay.id)!;
      state.restoreFuente(taken);
      forgetRemoved(id);
      return { id, restored: true, ...referenceWarnings() };
    }
    if (args.operation === "update") {
      const source = essay.fuentes!.find(item => item.id === id)!;
      const patch: Partial<Omit<Fuente, "id">> = citationPatchFromArgs(source, args);
      if (args.name !== undefined) patch.nombre = args.name as string;
      if (args.content !== undefined) patch.contenido = args.content as string;
      // The reference follows authors and year while it is still the one the app built, as in the detail view.
      state.updateFuente(id, withReference(source, patch));
      return { id, ...referenceWarnings() };
    }
    // create and import: the Fuentes panel's own door (duplicates, limits, citation reading).
    const saved = saveSource({ text: args.content as string, nombre: args.name as string, ...(args.operation === "import" ? { archivoNombre: args.fileName as string } : {}), allowDuplicate: args.allowDuplicate === true, skipReading: args.readCitation === false }, args);
    return { ...saved, ...referenceWarnings() };
  }
  if (name === "edit_rubric") {
    let id = args.id as string;
    let criteria = [...(current().rubrica?.criterios ?? [])];
    if (args.operation === "delete") criteria = criteria.filter(item => item.id !== id);
    else if (args.operation === "update") criteria = criteria.map(item => item.id === id ? { ...item, ...(typeof args.name === "string" ? { nombre: args.name } : {}), ...(typeof args.description === "string" ? { descripcion: args.description } : {}), ...(typeof args.weight === "number" ? { peso: args.weight } : {}) } : item);
    else { id = crypto.randomUUID(); criteria.push({ id, nombre: args.name as string, descripcion: args.description as string, peso: args.weight as number } satisfies Criterio); }
    // The saved assignment stays, as in the panel.
    const consigna = current().rubrica?.consigna;
    state.updateRubrica({ criterios: criteria, ...(consigna ? { consigna } : {}) });
    return { id, ...referenceWarnings() };
  }
  if (name === "update_essay") {
    if (args.mode !== undefined) state.updateMode(args.mode as "academico" | "blog");
    if (args.language !== undefined) useStore.getState().updateLanguage(args.language as "es" | "en");
    if (args.reviewerProfile !== undefined) useStore.getState().updateReviewerProfile(args.reviewerProfile as string);
    return { changed: true };
  }
  throw new ToolError("UNKNOWN_TOOL", "Unknown library operation.");
}
