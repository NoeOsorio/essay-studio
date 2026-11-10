import { useStore } from "@/lib/store";
import { listHistory, readSnapshot } from "@/lib/storage";
import type { Anotacion, Criterio, Fuente } from "@/lib/storage/types";
import { ToolError, type JsonObject } from "../../../shared/mcp";
import { matches, page, textRange } from "./collections";
import { getDocumentEditor } from "./document";

function current() {
  const essay = useStore.getState().current;
  if (!essay) throw new ToolError("ESSAY_CHANGED", "No essay is open.");
  return essay;
}

function annotations(): Anotacion[] {
  const found = new Map<string, Anotacion>();
  const walk = (node: { marks?: { type: string; attrs?: Record<string, unknown> }[]; content?: unknown[] }) => {
    for (const mark of node.marks ?? []) if (mark.type === "annotation" && typeof mark.attrs?.id === "string") {
      found.set(mark.attrs.id, mark.attrs as unknown as Anotacion);
    }
    for (const child of node.content ?? []) if (child && typeof child === "object") walk(child as typeof node);
  };
  walk(current().content);
  return [...found.values()];
}

/** Computed references: source edits never certify old evidence or silently erase it. */
export function referenceWarnings(): JsonObject {
  const essay = current();
  const sources = new Map((essay.fuentes ?? []).map(source => [source.id, source]));
  const criteria = new Set((essay.rubrica?.criterios ?? []).map(criterion => criterion.id));
  const invalid: JsonObject[] = [];
  for (const annotation of annotations()) {
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
    const marks = new Map<string, JsonObject>();
    getDocumentEditor(essay.id).state.doc.descendants((node, position) => {
      if (!node.isText) return;
      for (const mark of node.marks) if (mark.type.name === "annotation" && typeof mark.attrs.id === "string") {
        const previous = marks.get(mark.attrs.id);
        marks.set(mark.attrs.id, { ...mark.attrs, from: previous?.from ?? position, to: position + node.nodeSize, quote: `${previous?.quote ?? ""}${node.text ?? ""}` });
      }
    });
    if (name === "get_annotation") {
      const annotation = marks.get(args.id as string);
      if (!annotation) throw new ToolError("NOT_FOUND", "The annotation does not exist.");
      return { id: annotation.id, ...textRange(JSON.stringify(annotation), args), ...referenceWarnings() };
    }
    const result = page([...marks.values()].filter(annotation => matches(args.query, annotation.mensaje as string, annotation.quote as string) && (!args.pase || annotation.pase === args.pase) && (!args.sage || annotation.sage === args.sage) && (!args.severity || annotation.severidad === args.severity)), args);
    return { ...result, items: result.items.map(annotation => ({ id: annotation.id, from: annotation.from, to: annotation.to, pase: annotation.pase, sage: annotation.sage, severity: annotation.severidad, message: (annotation.mensaje as string ?? "").slice(0, 512), quote: (annotation.quote as string).slice(0, 512) })), ...referenceWarnings() };
  }
  if (name === "list_sources") {
    const result = page((essay.fuentes ?? []).filter(source => matches(args.query, source.nombre, source.cita) && (!args.origin || source.origen === args.origin)), args);
    return { ...result, items: result.items.map(source => ({ id: source.id, name: source.nombre, citation: source.cita, origin: source.origen, fileName: source.archivoNombre })), ...referenceWarnings() };
  }
  if (name === "get_source") {
    const source = essay.fuentes?.find(item => item.id === args.id);
    if (!source) throw new ToolError("NOT_FOUND", "The source does not exist.");
    return { id: source.id, name: source.nombre, citation: source.cita, origin: source.origen, fileName: source.archivoNombre, ...textRange(source.contenido, args), ...referenceWarnings() };
  }
  if (name === "get_rubric") {
    return { ...page((essay.rubrica?.criterios ?? []).filter(criterion => matches(args.query, criterion.nombre, criterion.descripcion)), args), ...referenceWarnings() };
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
  if (name === "edit_source") {
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
  if (name === "edit_source") {
    let id = args.id as string;
    if (args.operation === "delete") state.removeFuente(id);
    else if (args.operation === "update") {
      const patch: Partial<Omit<Fuente, "id">> = {};
      if (args.name !== undefined) patch.nombre = args.name as string;
      if (args.content !== undefined) patch.contenido = args.content as string;
      if (args.citation !== undefined) patch.cita = args.citation as string;
      state.updateFuente(id, patch);
    } else {
      id = crypto.randomUUID();
      state.addFuente({ id, nombre: args.name as string, contenido: args.content as string, ...(typeof args.citation === "string" ? { cita: args.citation } : {}), origen: args.operation === "import" ? "archivo" : "texto", ...(args.operation === "import" ? { archivoNombre: args.fileName as string } : {}), agregadoEn: new Date().toISOString() });
    }
    return { id, ...referenceWarnings() };
  }
  if (name === "edit_rubric") {
    let id = args.id as string;
    let criteria = [...(current().rubrica?.criterios ?? [])];
    if (args.operation === "delete") criteria = criteria.filter(item => item.id !== id);
    else if (args.operation === "update") criteria = criteria.map(item => item.id === id ? { ...item, ...(typeof args.name === "string" ? { nombre: args.name } : {}), ...(typeof args.description === "string" ? { descripcion: args.description } : {}), ...(typeof args.weight === "number" ? { peso: args.weight } : {}) } : item);
    else { id = crypto.randomUUID(); criteria.push({ id, nombre: args.name as string, descripcion: args.description as string, peso: args.weight as number } satisfies Criterio); }
    state.updateRubrica({ criterios: criteria });
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
