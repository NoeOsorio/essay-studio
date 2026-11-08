/** Browser-safe production/benchmark contract. Source text is data, never instructions. */
export type Sage = "em" | "sis" | "pra" | "cri";
export type Pase = "coherencia" | "estilo" | "argumento" | "apa";
export type Language = "es" | "en";
export type Criterio = { id: string; nombre: string; peso: number; descripcion: string };
export type EvidenceSource = { id: string; contenido: string };
export type Fuente = EvidenceSource & { nombre: string; cita?: string; origen?: string; archivoNombre?: string };
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
export type ReviewRequest = InterrogationRequest | CritiqueRequest;

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

export function assertReviewRequest(value: unknown): asserts value is ReviewRequest {
  if (!value || typeof value !== "object") throw new Error("Invalid review request.");
  const r = value as Record<string, unknown>;
  if (typeof r.id !== "string" || !r.id || typeof r.text !== "string" || !["em", "sis", "pra", "cri"].includes(String(r.sage))
    || (r.type !== "interrogate" && r.type !== "critique") || (r.language !== undefined && r.language !== "es" && r.language !== "en")
    || (r.reviewerProfile !== undefined && typeof r.reviewerProfile !== "string")) throw new Error("Invalid review request fields.");
  if (r.type === "critique") {
    if (!["coherencia", "estilo", "argumento", "apa"].includes(String(r.pase))) throw new Error("Invalid review pass.");
    if (r.fuentes !== undefined) {
      if (!Array.isArray(r.fuentes)) throw new Error("Invalid sources.");
      const ids = new Set<string>();
      for (const item of r.fuentes) {
        if (!item || typeof item !== "object" || typeof item.id !== "string" || !item.id || typeof item.nombre !== "string" || typeof item.contenido !== "string" || ids.has(item.id)
          || (item.cita !== undefined && typeof item.cita !== "string")) throw new Error("Invalid or duplicate source identity.");
        ids.add(item.id);
      }
    }
    if (r.rubrica !== undefined && (!Array.isArray(r.rubrica) || r.rubrica.some((item) => !item || typeof item.id !== "string" || typeof item.nombre !== "string" || typeof item.descripcion !== "string" || typeof item.peso !== "number" || !Number.isFinite(item.peso)))) throw new Error("Invalid review rubric.");
  }
}
