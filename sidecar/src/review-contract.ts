/** Browser-safe production/benchmark contract. Source text is data, never instructions. */
export type Sage = "em" | "sis" | "pra" | "cri";
export type Pase = "coherencia" | "estilo" | "argumento" | "apa";
export type Language = "es" | "en";
export type Criterio = { id: string; nombre: string; peso: number; descripcion: string };
export type EvidenceSource = { id: string; contenido: string };
/** `recortada`: only a prefix of the source was sent, so evidence offsets stay valid but the end is unseen. */
export type Fuente = EvidenceSource & { nombre: string; cita?: string; origen?: string; archivoNombre?: string; recortada?: boolean };
export type EvidenceRelation = "supports" | "contradicts" | "context";
export type ReviewEvidence = {
  sourceId: string; quote: string; from: number; to: number;
  relation: EvidenceRelation; locator?: string;
  verification: "verified" | "invalid" | "missing_source"; reason?: string;
};
export type ReviewProvenance = {
  profileId: string; requestedModel?: string; resolvedModel?: string;
  sdkVersion: string; promptHash: string; sourceHashes: { sourceId: string; sha256: string }[];
  startedAt: string; tools: string[]; settingSources: string[];
  modelUsage?: unknown; cliVersion?: string; authMode?: string;
};
export type InterrogationRequest = { id: string; type: "interrogate"; sage: Sage; text: string; language?: Language; reviewerProfile?: string };
export type CritiqueRequest = { id: string; type: "critique"; sage: Sage; pase: Pase; text: string; language?: Language; rubrica?: Criterio[]; fuentes?: Fuente[]; reviewerProfile?: string };
export type AskRequest = { id: string; type: "ask"; sage: Sage; text: string; question: string; language?: Language; reviewerProfile?: string };
/** Reads material (a citation from a source, criteria from an assignment). No persona, no `sage`. */
export type ExtractTask = "citation" | "rubric";
export type ExtractRequest = { id: string; type: "extract"; task: ExtractTask; text: string; reviewerProfile?: string };
export type ReviewRequest = InterrogationRequest | CritiqueRequest | AskRequest | ExtractRequest;

// Wire limits of the whole series. Every one lives here, with its reason.
/** Matches the prompt contract: each agent asks exactly three questions. */
export const QUESTIONS_PER_AGENT = 3;
/** The bold note title must fit a note 212 units wide; personas ask under 30 words (about 200 characters). */
export const MAX_QUESTION_CHARS = 300;
/** A 200,000 token context at a conservative 3.5 characters per token (700,000), less about 5,000 tokens (17,500 characters) for the persona prompt and the output. */
export const MAX_SOURCE_CHARS = 680_000;
/** Bounds IPC memory per request line: a source at the limit plus its envelope fits well under 2 MiB. */
export const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
export const sourceFits = (text: string): boolean => text.length <= MAX_SOURCE_CHARS && new TextEncoder().encode(text).length <= MAX_REQUEST_BYTES - 4096;

/** Metadata sits on page one in every real sample; stopping early keeps reference lists out of the year check. About 4 pages. */
export const CITATION_PREFIX_CHARS = 12_000;
/** About 27 pages, more than any assignment. Longer text uses its beginning and says so. */
export const ASSIGNMENT_MAX_CHARS = 80_000;
/** Essay plus sources in one review: at most 1.2 MB of UTF-8, safely under the 2 MiB line cap by construction. About 115k tokens at an assumed 3.5 characters per token, leaving room for instructions and output in a 200k context (an estimate, checked in the real cases). */
export const REVIEW_TEXT_BUDGET = 400_000;

/** Typed request failure; `code` reaches the renderer unchanged. */
export class ReviewRequestError extends Error {
  constructor(public code: "INVALID_REQUEST" | "SOURCE_TOO_LARGE", message: string) { super(message); this.name = "ReviewRequestError"; }
}

/** Verify only literal provenance. A verified span does not establish semantic support. */
export function verifyEvidence(value: unknown, sources: readonly EvidenceSource[] = []): ReviewEvidence[] {
  if (value === undefined) return [];
  const items = Array.isArray(value) ? value : [value];
  const byId = new Map(sources.map((source) => [source.id, source]));
  const duplicated = new Set(sources.filter((source, i) => sources.findIndex((other) => other.id === source.id) !== i).map((source) => source.id));
  return items.map((item): ReviewEvidence => {
    const raw = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const sourceId = typeof raw.sourceId === "string" ? raw.sourceId : "";
    const quote = typeof raw.quote === "string" ? raw.quote : "";
    const from = typeof raw.from === "number" ? raw.from : -1;
    const to = typeof raw.to === "number" ? raw.to : -1;
    const relation = raw.relation === "supports" || raw.relation === "contradicts" || raw.relation === "context" ? raw.relation : "context";
    const result: ReviewEvidence = { sourceId, quote, from, to, relation,
      ...(typeof raw.locator === "string" ? { locator: raw.locator } : {}), verification: "invalid" };
    const source = byId.get(sourceId);
    if (!source) return { ...result, verification: "missing_source", reason: "Source ID is not in the supplied library." };
    if (duplicated.has(sourceId)) return { ...result, reason: "Source ID is ambiguous." };
    if (raw.relation !== "supports" && raw.relation !== "contradicts" && raw.relation !== "context") return { ...result, reason: "Unknown evidence relation." };
    if (!quote || !Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to <= from || to > source.contenido.length || source.contenido.slice(from, to) !== quote) {
      return { ...result, reason: "Quote does not match the source at the supplied UTF-16 range." };
    }
    return { ...result, verification: "verified" };
  });
}

const SAGES = ["em", "sis", "pra", "cri"];
const invalid = (message: string) => new ReviewRequestError("INVALID_REQUEST", message);

function assertCommon(r: Record<string, unknown>): void {
  if (typeof r.id !== "string" || !r.id || typeof r.text !== "string"
    || (r.language !== undefined && r.language !== "es" && r.language !== "en")
    || (r.reviewerProfile !== undefined && typeof r.reviewerProfile !== "string")) throw invalid("Invalid review request fields.");
}
function assertSage(r: Record<string, unknown>): void {
  if (!SAGES.includes(String(r.sage))) throw invalid("Invalid review request fields.");
}

function assertCritique(r: Record<string, unknown>): void {
  if (!["coherencia", "estilo", "argumento", "apa"].includes(String(r.pase))) throw invalid("Invalid review pass.");
  if (r.fuentes !== undefined) {
    if (!Array.isArray(r.fuentes)) throw invalid("Invalid sources.");
    const ids = new Set<string>();
    for (const item of r.fuentes) {
      if (!item || typeof item !== "object" || typeof item.id !== "string" || !item.id || typeof item.nombre !== "string" || typeof item.contenido !== "string" || ids.has(item.id)
        || (item.cita !== undefined && typeof item.cita !== "string")
        || (item.recortada !== undefined && typeof item.recortada !== "boolean")) throw invalid("Invalid or duplicate source identity.");
      ids.add(item.id);
    }
  }
  if (r.rubrica !== undefined && (!Array.isArray(r.rubrica) || r.rubrica.some((item) => !item || typeof item.id !== "string" || typeof item.nombre !== "string" || typeof item.descripcion !== "string" || typeof item.peso !== "number" || !Number.isFinite(item.peso)))) throw invalid("Invalid review rubric.");
}

function assertExtract(r: Record<string, unknown>): void {
  if (r.task !== "citation" && r.task !== "rubric") throw invalid("Invalid extract task.");
  const limit = r.task === "citation" ? CITATION_PREFIX_CHARS : ASSIGNMENT_MAX_CHARS;
  if ((r.text as string).length > limit) throw new ReviewRequestError("SOURCE_TOO_LARGE", "The text is too large for this extraction.");
}

export function assertReviewRequest(value: unknown): asserts value is ReviewRequest {
  if (!value || typeof value !== "object") throw invalid("Invalid review request.");
  const r = value as Record<string, unknown>;
  assertCommon(r);
  if (!sourceFits(r.text as string)) throw new ReviewRequestError("SOURCE_TOO_LARGE", "The source text is too large to send.");
  switch (r.type) {
    case "interrogate": assertSage(r); return;
    case "ask":
      assertSage(r);
      if (typeof r.question !== "string" || !r.question.trim() || r.question.length > MAX_QUESTION_CHARS) throw invalid("Invalid question.");
      return;
    case "critique": assertSage(r); assertCritique(r); return;
    case "extract": assertExtract(r); return;
    default: throw invalid("Invalid review request fields.");
  }
}
