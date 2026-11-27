import { addSource, confirmRubricProposal, importAssignment, readAssignment, readMaterialFile, retrySourceReading, type MaterialRead, type RejectReason, type RubricImportOutcome } from "@/lib/materials/import";
import { MAX_PDF_BYTES } from "@/lib/materials/limits";
import { useStore, type RemovedFuente } from "@/lib/store";
import type { Fuente } from "@/lib/storage/types";
import type { ProposedCriterio } from "../../../sidecar/src/extract-parser";
import { ToolError, type JsonObject } from "../../../shared/mcp";
import { decode } from "./board-assets";

/** Longest wait for a model reading; the bridge gives up on a request after 30 seconds. */
const READ_TIMEOUT_MS = 25_000;
/** Text files are tiny next to a PDF; this is far above the 1,000,000 characters a source may hold. */
const MAX_TEXT_FILE_BYTES = 4 * 1024 * 1024;

const REJECTION: Record<RejectReason, string> = {
  unsupported: "Only PDF, TXT and Markdown files can be read.",
  no_text: "The PDF has no text (it looks scanned). Paste the text instead.",
  locked: "The PDF needs a password. Remove it and send the file again.",
  too_large: "The file is larger than 50 MB.",
  text_limit: "The text is too long for one source (about 350 pages).",
  essay_limit: "The essay's sources together would pass the limit. Remove one first.",
  unreadable: "The PDF could not be opened; it may be damaged.",
};
export const rejection = (reason: RejectReason): ToolError => new ToolError("MATERIAL_REJECTED", REJECTION[reason]);

// ---------- Describing a source ----------

/** A source's citation fields, with the same shape on every read. */
export function sourceFields(source: Fuente): JsonObject {
  const p = source.publicacion;
  const reading = useStore.getState().lecturas[source.id];
  return {
    id: source.id, name: source.nombre, citation: source.cita, origin: source.origen, fileName: source.archivoNombre,
    authors: (source.autores ?? []).map(author => ({ lastName: author.apellidos, ...(author.nombres ? { firstNames: author.nombres } : {}) })),
    year: source.anio ?? null,
    publication: p ? { journal: p.revista, volume: p.volumen, issue: p.numero, pages: p.paginas, publisher: p.editorial, doi: p.doi } : null,
    citationReadAt: source.citaRevisadaEn ?? null,
    reading: reading ?? null,
  };
}

const clean = (value: unknown): string | undefined => typeof value === "string" && value.trim() ? value.trim() : undefined;

/** The citation fields of an edit as a patch, normalized as the detail view of a source does. */
export function citationPatchFromArgs(source: Pick<Fuente, "publicacion">, args: JsonObject): Partial<Omit<Fuente, "id">> {
  const patch: Partial<Omit<Fuente, "id">> = {};
  if (args.citation !== undefined) patch.cita = clean(args.citation);
  if (Array.isArray(args.authors)) {
    const autores = (args.authors as JsonObject[]).map(author => ({ apellidos: clean(author.lastName) ?? "", ...(clean(author.firstNames) ? { nombres: clean(author.firstNames) } : {}) })).filter(author => author.apellidos);
    patch.autores = autores.length ? autores : undefined;
  }
  // Four digits only, as the year field of the detail view.
  if (typeof args.year === "string") patch.anio = args.year.replace(/\D/g, "").slice(0, 4) || undefined;
  if (args.publication && typeof args.publication === "object") {
    const given = args.publication as JsonObject;
    const keys = { journal: "revista", volume: "volumen", issue: "numero", pages: "paginas", publisher: "editorial", doi: "doi" } as const;
    const next: NonNullable<Fuente["publicacion"]> = { ...(source.publicacion ?? {}) };
    for (const [key, field] of Object.entries(keys)) {
      if (given[key] === undefined) continue;
      const value = clean(given[key]);
      if (value) next[field] = value; else delete next[field];
    }
    patch.publicacion = Object.keys(next).length ? next : undefined;
  }
  return patch;
}

// ---------- Undo of a removed source ----------

const removed = new Map<string, RemovedFuente>();
export function rememberRemoved(entry: RemovedFuente): void {
  removed.set(entry.fuente.id, entry);
  if (removed.size > 20) removed.delete(removed.keys().next().value as string);
}
export function removedSource(id: unknown, essayId: string): RemovedFuente | undefined {
  const entry = typeof id === "string" ? removed.get(id) : undefined;
  return entry && entry.essayId === essayId ? entry : undefined;
}
export function forgetRemoved(id: string): void { removed.delete(id); }

// ---------- Files in chunks ----------

type Upload = { essayId: string; purpose: "source" | "assignment"; fileName: string; total: number; received: number; chunks: Uint8Array<ArrayBuffer>[]; prepared?: Extract<MaterialRead, { ok: true }> };
const uploads = new Map<string, Upload>();

/** A session that ends takes its half-sent files with it. */
export function resetMaterialUploads(): void { uploads.clear(); }

function upload(args: JsonObject, purpose: Upload["purpose"]): Upload {
  const entry = uploads.get(args.uploadId as string);
  if (!entry || entry.essayId !== args.essayId || entry.purpose !== purpose) throw new ToolError("UPLOAD_NOT_FOUND", "The upload expired or belongs to another essay or tool.");
  return entry;
}

/** begin, append and cancel: bytes only, nothing is saved yet. */
export function uploadStep(purpose: Upload["purpose"], args: JsonObject): JsonObject {
  if (args.operation === "begin") {
    const fileName = args.fileName, total = args.totalBytes;
    if (typeof fileName !== "string" || !fileName || /[\u0000/\\]/u.test(fileName)) throw new ToolError("INVALID_UPLOAD", "Provide a filename without a path.");
    const pdf = /\.pdf$/iu.test(fileName);
    if (!pdf && !/\.(txt|md|markdown)$/iu.test(fileName)) throw rejection("unsupported");
    if (typeof total !== "number" || !Number.isSafeInteger(total) || total < 1) throw new ToolError("INVALID_UPLOAD", "Declare totalBytes.");
    if (total > (pdf ? MAX_PDF_BYTES : MAX_TEXT_FILE_BYTES)) throw rejection(pdf ? "too_large" : "text_limit");
    if ([...uploads.values()].reduce((sum, item) => sum + item.total, 0) + total > MAX_PDF_BYTES) throw new ToolError("UPLOAD_CAPACITY", "Finish or cancel pending uploads before starting another file.");
    const uploadId = crypto.randomUUID();
    uploads.set(uploadId, { essayId: args.essayId as string, purpose, fileName, total, received: 0, chunks: [] });
    return { uploadId, receivedBytes: 0, totalBytes: total };
  }
  const entry = upload(args, purpose);
  if (args.operation === "cancel") { uploads.delete(args.uploadId as string); return { cancelled: true }; }
  if (args.operation !== "append") throw new ToolError("INVALID_ARGUMENTS", "Choose begin, append, finish or cancel.");
  if (entry.prepared) throw new ToolError("UPLOAD_NOT_WRITABLE", "This upload is already finished.");
  const bytes = decode(args.data);
  if (args.offset !== entry.received || entry.received + bytes.length > entry.total) throw new ToolError("INVALID_UPLOAD_OFFSET", "Append chunks at the returned decoded-byte offset without exceeding totalBytes.");
  entry.chunks.push(bytes); entry.received += bytes.length;
  return { uploadId: args.uploadId, receivedBytes: entry.received, totalBytes: entry.total };
}

/** finish, first half: read the text of the bytes (a PDF through the Mac's own engine). Saves nothing. */
export async function prepareUpload(purpose: Upload["purpose"], args: JsonObject): Promise<void> {
  const entry = upload(args, purpose);
  if (entry.received !== entry.total) throw new ToolError("INCOMPLETE_UPLOAD", "Send every byte before finishing the upload.");
  if (entry.prepared) return;
  const pdf = /\.pdf$/iu.test(entry.fileName);
  const file = new File(entry.chunks, entry.fileName, { type: pdf ? "application/pdf" : "text/plain" });
  const read = await readMaterialFile(file);
  if (!read.ok) { uploads.delete(args.uploadId as string); throw rejection(read.reason); }
  entry.prepared = read;
}

function takePrepared(purpose: Upload["purpose"], args: JsonObject): Extract<MaterialRead, { ok: true }> {
  const entry = upload(args, purpose);
  if (!entry.prepared) throw new ToolError("UPLOAD_NOT_READY", "The upload must be prepared before it is committed.");
  uploads.delete(args.uploadId as string);
  return entry.prepared;
}

// ---------- Sources ----------

/** The save of a source through the same door as the Fuentes panel. Synchronous; the reading goes on after. */
export function saveSource(input: { text: string; nombre?: string; archivoNombre?: string; allowDuplicate?: boolean; skipReading?: boolean }, extra: JsonObject): JsonObject {
  const outcome = addSource({ text: input.text, nombre: input.nombre, archivoNombre: input.archivoNombre, allowDuplicate: input.allowDuplicate, skipReading: input.skipReading });
  if (outcome.kind === "duplicate") throw new ToolError("DUPLICATE_SOURCE", `A source with this exact text is already saved (existingId: ${outcome.existingId}). Send allowDuplicate=true to add it anyway.`);
  if (outcome.kind === "rejected") throw rejection(outcome.reason);
  if (outcome.kind === "no_essay") throw new ToolError("ESSAY_CHANGED", "No essay is open.");
  const state = useStore.getState();
  const source = state.current?.fuentes?.find(item => item.id === outcome.sourceId);
  if (source) {
    const patch = citationPatchFromArgs(source, extra);
    if (Object.keys(patch).length) state.updateFuente(source.id, patch);
  }
  return { id: outcome.sourceId, readingCitation: !input.skipReading };
}

export function finishSourceUpload(args: JsonObject): JsonObject {
  const read = takePrepared("source", args);
  return saveSource({ text: read.text, nombre: clean(args.name), archivoNombre: read.archivoNombre, allowDuplicate: args.allowDuplicate === true, skipReading: args.readCitation === false }, args);
}

/** Run or retry the AI reading of a source. Waits up to 25 seconds. */
export async function readSourceCitation(args: JsonObject): Promise<JsonObject> {
  const essay = useStore.getState().current;
  const source = essay?.fuentes?.find(item => item.id === args.id);
  if (!essay || !source) throw new ToolError("NOT_FOUND", "The source does not exist.");
  if (args.userRequested !== true) throw new ToolError("EXPLICIT_REQUEST_REQUIRED", "Reading a citation uses a model and requires an explicit user request (userRequested=true).");
  if (useStore.getState().lecturas[source.id] !== "leyendo") {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finished = retrySourceReading(source.id).then(() => true);
    await Promise.race([finished, new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), READ_TIMEOUT_MS); })]);
    clearTimeout(timer);
  }
  const state = useStore.getState();
  const latest = state.current?.fuentes?.find(item => item.id === source.id) ?? source;
  const status = state.lecturas[source.id] === "leyendo" ? "reading" : state.lecturas[source.id] === "fallo" ? "failed" : "read";
  return { status, source: sourceFields(latest) };
}

// ---------- Assignment and rubric proposals ----------

type Proposal = { id: string; criterios: ProposedCriterio[]; soloInicio: boolean };
const proposals = new Map<string, Proposal>();

export function pendingProposal(essayId: string): JsonObject | null {
  const found = proposals.get(essayId);
  return found ? { proposalId: found.id, onlyStart: found.soloInicio, criteria: found.criterios.map(c => ({ name: c.nombre, description: c.descripcion, weight: c.peso })) } : null;
}

const criteriaOf = () => (useStore.getState().current?.rubrica?.criterios ?? []).map(c => ({ id: c.id, name: c.nombre, description: c.descripcion, weight: c.peso }));

export async function importAssignmentTool(args: JsonObject): Promise<JsonObject> {
  const essayId = args.essayId as string;
  const operation = args.operation as string;
  if (operation === "begin" || operation === "append" || operation === "cancel") return uploadStep("assignment", args);
  if (args.userRequested !== true) throw new ToolError("EXPLICIT_REQUEST_REQUIRED", "Reading an assignment uses a model and requires an explicit user request (userRequested=true).");
  proposals.delete(essayId);
  let job: Promise<RubricImportOutcome>;
  if (operation === "text") {
    if (typeof args.text !== "string" || !args.text.trim()) throw new ToolError("INVALID_ARGUMENTS", "Send the assignment text.");
    job = importAssignment({ text: args.text });
  } else if (operation === "finish") {
    const read = takePrepared("assignment", args);
    job = importAssignment({ text: read.text, archivoNombre: read.archivoNombre });
  } else if (operation === "retry") {
    if (!useStore.getState().current?.rubrica?.consigna) throw new ToolError("NOT_FOUND", "No assignment is saved to read again.");
    job = readAssignment(essayId);
  } else throw new ToolError("INVALID_ARGUMENTS", "Choose text, begin, append, finish, cancel or retry.");
  // The proposal is kept even when the wait below gives up, so a later get_rubric still shows it.
  const settled = job.then(outcome => {
    if (outcome.kind === "proposal") proposals.set(essayId, { id: crypto.randomUUID(), criterios: outcome.criterios, soloInicio: outcome.soloInicio });
    return outcome;
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const outcome = await Promise.race([settled, new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), READ_TIMEOUT_MS); })]);
  clearTimeout(timer);
  if (!outcome) return { status: "reading", assignmentSaved: true };
  switch (outcome.kind) {
    case "applied": return { status: "applied", onlyStart: outcome.soloInicio, criteria: criteriaOf() };
    case "proposal": return { status: "proposal", currentCriteriaCount: criteriaOf().length, ...pendingProposal(essayId) };
    case "none": return { status: "no_criteria", onlyStart: outcome.soloInicio };
    case "failed": return { status: "failed", assignmentSaved: true };
    case "dropped": return { status: "dropped", assignmentSaved: true };
    case "rejected": throw rejection(outcome.reason);
    default: throw new ToolError("ESSAY_CHANGED", "No essay is open.");
  }
}

/** Replace the rubric with the proposal, as «Usar estos» does: a version is saved first and the assignment stays. */
export async function confirmProposalTool(args: JsonObject): Promise<JsonObject> {
  const essayId = args.essayId as string;
  const found = proposals.get(essayId);
  if (!found || found.id !== args.proposalId) throw new ToolError("NOT_FOUND", "No such proposal is waiting. Run import_assignment again or read get_rubric.");
  const ok = await confirmRubricProposal(essayId, found.criterios);
  if (!ok) throw new ToolError("ESSAY_CHANGED", "The essay changed before the rubric could be replaced. Nothing was replaced.");
  proposals.delete(essayId);
  return { replaced: true, criteria: criteriaOf() };
}
