// Bringing material in: a dropped file or pasted text becomes a saved source (or the saved
// assignment of the rubric) FIRST, and only then does the AI read it to propose citation
// fields or criteria. Every proposal is checked against the text by `extract-parser`, and is
// applied only to fields still empty when it arrives. Reading state lives in the store and
// is never persisted.

import { extract } from "@/lib/agents";
import { useStore } from "@/lib/store";
import type { Criterio, Fuente, Rubrica } from "@/lib/storage/types";
import {
  parseCitation,
  parseRubric,
  canonical,
  type CitationFields,
  type ProposedCriterio,
} from "../../../sidecar/src/extract-parser";
import { buildReference, filenameStem } from "./apa";
import {
  ASSIGNMENT_MAX_CHARS,
  CITATION_PREFIX_CHARS,
  EXTRACT_CONCURRENCY,
  MAX_ESSAY_SOURCE_CHARS,
  MAX_INGEST_CHARS,
} from "./limits";
import { readPdf } from "./pdf";

// --------- Reading a file ---------

export type RejectReason =
  | "unsupported" // not a PDF, .txt or .md
  | "no_text" // a scan, or only page numbers
  | "locked" // needs a password
  | "too_large" // over MAX_PDF_BYTES
  | "text_limit" // more text than a source may hold
  | "essay_limit" // the essay's sources together would pass MAX_ESSAY_SOURCE_CHARS
  | "unreadable";

export type MaterialRead =
  | { ok: true; text: string; archivoNombre: string; fromPdf: boolean }
  | { ok: false; reason: RejectReason };

const isPdfName = (file: File) => /\.pdf$/i.test(file.name) || file.type === "application/pdf";
const isPlainName = (file: File) => /\.(txt|md|markdown)$/i.test(file.name) || file.type === "text/plain" || file.type === "text/markdown";

/** PDF text is normalized once; .txt and .md stay byte-exact. */
export async function readMaterialFile(file: File): Promise<MaterialRead> {
  if (isPdfName(file)) {
    const read = await readPdf(await file.arrayBuffer());
    if (read.status === "ok") return { ok: true, text: read.text, archivoNombre: file.name, fromPdf: true };
    return { ok: false, reason: read.status };
  }
  if (isPlainName(file)) {
    const text = await file.text();
    if (text.length > MAX_INGEST_CHARS) return { ok: false, reason: "text_limit" };
    return { ok: true, text, archivoNombre: file.name, fromPdf: false };
  }
  return { ok: false, reason: "unsupported" };
}

// --------- Queue ---------

let running = 0;
const waiting: (() => void)[] = [];

/** At most EXTRACT_CONCURRENCY readings at once (part of the sidecar's cap). */
async function queued<T>(job: () => Promise<T>): Promise<T> {
  if (running >= EXTRACT_CONCURRENCY) await new Promise<void>((resolve) => waiting.push(resolve));
  running += 1;
  try {
    return await job();
  } finally {
    running -= 1;
    waiting.shift()?.();
  }
}

// --------- Duplicates ---------

const canonicalOf = new WeakMap<Fuente, string>();
function canonicalContent(source: Fuente): string {
  let value = canonicalOf.get(source);
  if (value === undefined) {
    value = canonical(source.contenido);
    canonicalOf.set(source, value);
  }
  return value;
}

/** An existing source whose canonical text equals this one's, if any. */
export function findDuplicate(sources: readonly Fuente[], text: string): Fuente | undefined {
  const target = canonical(text);
  return sources.find((source) => canonicalContent(source) === target);
}

// --------- Sources ---------

export type AddSourceInput = {
  /** Text, already read. */
  text: string;
  /** Defaults to the filename stem for a file and to empty for pasted text. */
  nombre?: string;
  archivoNombre?: string;
  /** Add even though an identical source exists (after the writer chose to). */
  allowDuplicate?: boolean;
};

export type AddSourceOutcome =
  | { kind: "added"; sourceId: string }
  | { kind: "duplicate"; existingId: string }
  | { kind: "rejected"; reason: RejectReason }
  | { kind: "no_essay" };

/**
 * Saves the source, then asks the AI to read its citation in the background. The material is
 * in the essay before any AI call, so a failure never loses it. Resolves as soon as the source
 * is saved; `lecturas[sourceId]` tells the reading state.
 */
export function addSource(input: AddSourceInput): AddSourceOutcome {
  const state = useStore.getState();
  const essay = state.current;
  if (!essay) return { kind: "no_essay" };
  const { text } = input;
  if (text.length > MAX_INGEST_CHARS) return { kind: "rejected", reason: "text_limit" };
  const existing = essay.fuentes ?? [];
  if (existing.reduce((sum, f) => sum + f.contenido.length, 0) + text.length > MAX_ESSAY_SOURCE_CHARS) {
    return { kind: "rejected", reason: "essay_limit" };
  }
  if (!input.allowDuplicate) {
    const duplicate = findDuplicate(existing, text);
    if (duplicate) return { kind: "duplicate", existingId: duplicate.id };
  }
  const source: Fuente = {
    id: crypto.randomUUID(),
    nombre: input.nombre ?? filenameStem(input.archivoNombre),
    contenido: text,
    origen: input.archivoNombre ? "archivo" : "texto",
    ...(input.archivoNombre ? { archivoNombre: input.archivoNombre } : {}),
    agregadoEn: new Date().toISOString(),
  };
  state.addFuente(source);
  void readCitation(essay.id, source.id);
  return { kind: "added", sourceId: source.id };
}

/** A dropped or chosen file becomes a source. */
export async function importSourceFile(file: File, opts: { allowDuplicate?: boolean } = {}): Promise<AddSourceOutcome> {
  const read = await readMaterialFile(file);
  if (!read.ok) return { kind: "rejected", reason: read.reason };
  return addSource({ text: read.text, archivoNombre: read.archivoNombre, allowDuplicate: opts.allowDuplicate });
}

/** Rules for applying a citation to a source as it is now. Exported so the order of rules is one place. */
export function citationPatch(current: Fuente, found: CitationFields): Partial<Omit<Fuente, "id">> {
  const patch: Partial<Omit<Fuente, "id">> = {};
  // The filename stem is a placeholder, not a value he set.
  const nameIsEmpty = !current.nombre.trim() || current.nombre === filenameStem(current.archivoNombre);
  if (found.titulo && nameIsEmpty) patch.nombre = found.titulo;
  if (found.autores?.length && !current.autores?.length) patch.autores = found.autores;
  if (found.anio && !current.anio) patch.anio = found.anio;
  const publicacion = { ...(current.publicacion ?? {}) };
  let publicacionChanged = false;
  for (const key of ["revista", "volumen", "numero", "paginas", "editorial", "doi"] as const) {
    if (found[key] && !publicacion[key]) { publicacion[key] = found[key]; publicacionChanged = true; }
  }
  if (publicacionChanged) patch.publicacion = publicacion;

  // The reference is rebuilt only while it is empty or still what the builder produced from the
  // previous fields. Once he edits it, it is his.
  const next = { ...current, ...patch };
  const untouched = !current.cita || current.cita === buildReference(current);
  const hasCitationData = !!(next.autores?.length || next.anio);
  if (untouched && hasCitationData) patch.cita = buildReference(next);

  // Marks the source as read, so "read and something is missing" differs from "never read".
  patch.citaRevisadaEn = new Date().toISOString();
  return patch;
}

async function readCitation(essayId: string, sourceId: string): Promise<void> {
  const store = useStore.getState();
  const source = store.current?.fuentes?.find((f) => f.id === sourceId);
  if (!source || store.current?.id !== essayId) return;
  store.setLectura(sourceId, "leyendo");
  const sent = source.contenido.slice(0, CITATION_PREFIX_CHARS);
  try {
    const { result } = await queued(() => extract({ task: "citation", text: sent }));
    const parsed = parseCitation(result, sent);
    if (!parsed.ok) throw new Error("unusable output");
    useStore.getState().patchFuenteIf(essayId, sourceId, (current) => citationPatch(current, parsed.value));
    useStore.getState().setLectura(sourceId, null);
  } catch {
    // The source stays saved; only the reading failed. The panel offers Reintentar.
    if (useStore.getState().current?.id === essayId) useStore.getState().setLectura(sourceId, "fallo");
  }
}

/** Reintentar after a failed reading. */
export function retrySourceReading(sourceId: string): void {
  const essayId = useStore.getState().current?.id;
  if (essayId) void readCitation(essayId, sourceId);
}

// --------- Rubric ---------

export type RubricImportOutcome =
  | { kind: "applied"; count: number; soloInicio: boolean }
  /** The rubric already has criteria: nothing changed, the panel asks before replacing. */
  | { kind: "proposal"; criterios: ProposedCriterio[]; soloInicio: boolean }
  | { kind: "none"; soloInicio: boolean }
  | { kind: "failed" }
  /** The essay changed while reading; the result was dropped. */
  | { kind: "dropped" }
  | { kind: "no_essay" }
  | { kind: "rejected"; reason: RejectReason };

function newCriterios(proposed: readonly ProposedCriterio[]): Criterio[] {
  return proposed.map((c) => ({ id: crypto.randomUUID(), nombre: c.nombre, peso: c.peso, descripcion: c.descripcion }));
}

/** A rubric holding the proposal, keeping the saved assignment. */
export function rubricFromProposal(proposed: readonly ProposedCriterio[], consigna: Rubrica["consigna"]): Rubrica {
  return { criterios: newCriterios(proposed), ...(consigna ? { consigna } : {}) };
}

/**
 * Saves the assignment first (so a failed reading loses nothing and Reintentar needs no new
 * drop), then reads it. Only the first ASSIGNMENT_MAX_CHARS go to the AI; `soloInicio` says so.
 */
export async function importAssignment(input: { text: string; archivoNombre?: string }): Promise<RubricImportOutcome> {
  const essay = useStore.getState().current;
  if (!essay) return { kind: "no_essay" };
  if (input.text.length > MAX_INGEST_CHARS) return { kind: "rejected", reason: "text_limit" };
  const consigna: NonNullable<Rubrica["consigna"]> = {
    texto: input.text,
    ...(input.archivoNombre ? { archivoNombre: input.archivoNombre } : {}),
    agregadoEn: new Date().toISOString(),
  };
  useStore.getState().patchRubricaIf(essay.id, (current) => ({ criterios: current?.criterios ?? [], consigna }));
  return readAssignment(essay.id);
}

/** A dropped or chosen file becomes the assignment. */
export async function importAssignmentFile(file: File): Promise<RubricImportOutcome> {
  const read = await readMaterialFile(file);
  if (!read.ok) return { kind: "rejected", reason: read.reason };
  return importAssignment({ text: read.text, archivoNombre: read.archivoNombre });
}

/** Reads the assignment already saved in the rubric. Also the Reintentar after a failure. */
export async function readAssignment(essayId: string): Promise<RubricImportOutcome> {
  const store = useStore.getState();
  const consigna = store.current?.rubrica?.consigna;
  if (store.current?.id !== essayId) return { kind: "no_essay" };
  if (!consigna) return { kind: "none", soloInicio: false };
  const sent = consigna.texto.slice(0, ASSIGNMENT_MAX_CHARS);
  const soloInicio = consigna.texto.length > ASSIGNMENT_MAX_CHARS;
  store.setLecturaRubrica("leyendo");
  try {
    const { result } = await queued(() => extract({ task: "rubric", text: sent }));
    const parsed = parseRubric(result, sent);
    if (!parsed.ok) throw new Error("unusable output");
    const { criterios, sinCriterios } = parsed.value;
    useStore.getState().setLecturaRubrica(null);
    if (sinCriterios) return { kind: "none", soloInicio };
    // A proposal applies directly only if the rubric still has no criteria when the result arrives.
    let hadCriteria = false;
    const applied = useStore.getState().patchRubricaIf(essayId, (current) => {
      if (current?.criterios.length) { hadCriteria = true; return null; }
      return rubricFromProposal(criterios, current?.consigna);
    });
    if (applied) return { kind: "applied", count: criterios.length, soloInicio };
    return hadCriteria ? { kind: "proposal", criterios, soloInicio } : { kind: "dropped" };
  } catch {
    if (useStore.getState().current?.id === essayId) useStore.getState().setLecturaRubrica("fallo");
    return { kind: "failed" };
  }
}

/** The writer confirmed replacing the rubric with a proposal. Saves a version first. */
export async function confirmRubricProposal(essayId: string, proposed: readonly ProposedCriterio[]): Promise<boolean> {
  const consigna = useStore.getState().current?.rubrica?.consigna;
  return useStore.getState().replaceRubrica(essayId, rubricFromProposal(proposed, consigna));
}
