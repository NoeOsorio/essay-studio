/** Pure production parser shared by desktop and offline benchmarks. */
import { verifyEvidence, type EvidenceSource, type ReviewEvidence } from "./review-contract.ts";

export type RawAnotacion = {
  cita: string;
  severidad: "alta" | "media" | "baja";
  mensaje: string;
  reemplazo?: string;
  criterioId?: string;
  evidence?: ReviewEvidence[];
};
export type ParseReport = {
  annotations: RawAnotacion[];
  rawLines: number;
  invalidLines: { line: number; reason: string }[];
  empty: boolean;
};
function isSeveridad(value: unknown): value is RawAnotacion["severidad"] {
  return value === "alta" || value === "media" || value === "baja";
}

const META_PREFIXES = [
  // Español
  "Reescribí:",
  "Reescribi:",
  "Reescribe:",
  "Reescríbelo:",
  "Reformulá:",
  "Reformula:",
  "Reformúlalo:",
  "Cambia a:",
  "Cambia por:",
  "Cambialo a:",
  "Cámbialo a:",
  "Cámbialo por:",
  "Mejor:",
  "Mejor así:",
  "Sugiero:",
  "Propongo:",
  "Versión nueva:",
  "Nueva versión:",
  "En su lugar:",
  // English
  "Rewrite:",
  "Reword:",
  "Change to:",
  "Change it to:",
  "Try:",
  "Better:",
  "Better as:",
  "Suggestion:",
  "Suggested:",
  "New version:",
  "Replace with:",
  "Instead:",
];

function stripMetaPrefix(text: string): string {
  let out = text.trim();
  // Strip in a loop in case the model stacked two prefixes
  // ("Reescribí: Mejor: …" → "…"). Cap at 4 iterations to avoid
  // pathological inputs eating CPU.
  for (let i = 0; i < 4; i++) {
    let changed = false;
    for (const prefix of META_PREFIXES) {
      if (out.toLowerCase().startsWith(prefix.toLowerCase())) {
        out = out.slice(prefix.length).trim();
        changed = true;
        break;
      }
    }
    if (!changed) break;
  }
  return out;
}


/** Tolerant production view; diagnostics remain available to the benchmark. */
export function parseAnotaciones(raw: string, sources: readonly EvidenceSource[] = []): RawAnotacion[] {
  return parseAnnotationsDetailed(raw, sources).annotations;
}

export function parseAnnotationsDetailed(raw: string, sources: readonly EvidenceSource[] = []): ParseReport {
  const report: ParseReport = { annotations: [], rawLines: 0, invalidLines: [], empty: false };
  const cleaned = raw.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  for (const [index, lineRaw] of cleaned.split("\n").entries()) {
    const line = lineRaw.trim();
    if (!line) continue;
    report.rawLines += 1;
    const invalid = (reason: string) => report.invalidLines.push({ line: index + 1, reason });
    if (!line.startsWith("{")) { invalid("non_json_line"); continue; }
    let parsed: unknown;
    try { parsed = JSON.parse(line); } catch { invalid("malformed_json"); continue; }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) { invalid("invalid_object"); continue; }
    const obj = parsed as Record<string, unknown>;
    if (obj.vacio === true) { report.empty = true; continue; }
    const { cita, severidad, mensaje, criterioId } = obj;
    if (typeof cita !== "string" || !cita.trim() || !isSeveridad(severidad) || typeof mensaje !== "string" || !mensaje.trim()) {
      invalid("invalid_annotation_fields"); continue;
    }
    const replacement = typeof obj.reemplazo === "string" ? obj.reemplazo : obj.sugerencia;
    const cleanedReplacement = typeof replacement === "string" && replacement.trim() ? stripMetaPrefix(replacement) : "";
    report.annotations.push({
      cita: cita.trim(), severidad, mensaje: mensaje.trim(),
      reemplazo: cleanedReplacement || undefined,
      criterioId: typeof criterioId === "string" && criterioId.trim() ? criterioId.trim() : undefined,
      ...(obj.evidence !== undefined ? { evidence: verifyEvidence(obj.evidence, sources) } : {}),
    });
  }
  if (report.empty && report.annotations.length) report.invalidLines.push({ line: 0, reason: "conflicting_empty_and_annotations" });
  if (!report.annotations.length && !report.empty && report.rawLines === 0) report.invalidLines.push({ line: 0, reason: "missing_output" });
  return report;
}
