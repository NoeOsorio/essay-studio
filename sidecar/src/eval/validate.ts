import { pathToFileURL } from "node:url";
import { hash, loadCorpus, cliError } from "./io.js";
import type { Corpus } from "./schema.js";
export function validateCorpus(corpus: Corpus): { cases: number; sources: number; draftAnswerKeys: number; splits: Record<string, number>; qualityMeasured: false } {
  const { sources, cases, manifest } = corpus;
  if (manifest.cases !== cases.length || manifest.sources !== sources.length) throw new Error("Manifest counts do not match corpus.");
  const sourceIds = new Set<string>(), caseIds = new Set<string>();
  const families = new Map<string, string>();
  for (const source of sources) {
    if (!source || typeof source.id !== "string" || !source.id || sourceIds.has(source.id)) throw new Error("Invalid or duplicate source ID.");
    sourceIds.add(source.id);
    if (typeof source.content !== "string" || source.contentSha256 !== hash(source.content)) throw new Error(`Source content hash mismatch: ${source.id}.`);
    if (!source.familyId || !source.attribution || !source.permittedUse || !source.capturedAt || !source.locator?.section || !Number.isInteger(source.locator.paragraph)) throw new Error(`Source provenance incomplete: ${source.id}.`);
    if (!["synthetic", "permitted-excerpt"].includes(source.kind)) throw new Error(`Source kind invalid: ${source.id}.`);
    if (source.privacy !== "public" && source.privacy !== "private") throw new Error(`Source privacy must be explicit: ${source.id}.`);
    if (source.kind === "permitted-excerpt" && !source.url) throw new Error(`Source URL required: ${source.id}.`);
    if (source.printedPagesVerified !== false) throw new Error("This pilot only admits unpaginated text fixtures; verified page fixtures need an explicit schema extension.");
  }
  const splits: Record<string, number> = {};
  const drafts = new Set<string>();
  for (const item of cases) {
    if (!item || !item.id || caseIds.has(item.id)) throw new Error("Invalid or duplicate case ID.");
    caseIds.add(item.id);
    if (drafts.has(item.draft)) throw new Error(`Duplicate draft fixture: ${item.id}.`);
    drafts.add(item.draft);
    if (!Array.isArray(item.sourceIds) || new Set(item.sourceIds).size !== item.sourceIds.length || typeof item.draft !== "string" || !item.draft) throw new Error(`Invalid case payload: ${item.id}.`);
    if (!["development", "holdout"].includes(item.split) || !["draft", "reviewed", "adjudicated"].includes(item.answerKeyStatus)) throw new Error(`Invalid case status: ${item.id}.`);
    if (!item.answerKeyProvenance?.author || !item.answerKeyProvenance.method || (item.answerKeyStatus === "adjudicated" && !item.answerKeyProvenance.humanAdjudicator)) throw new Error(`Answer-key provenance incomplete: ${item.id}.`);
    if (!["evidence", "citation", "apa", "calibration", "voice", "injection"].includes(item.family) || !["es", "en"].includes(item.language) || !["em", "sis", "pra", "cri"].includes(item.sage) || !["coherencia", "estilo", "argumento", "apa"].includes(item.pase)) throw new Error(`Invalid routing: ${item.id}.`);
    splits[item.split] = (splits[item.split] ?? 0) + 1;
    for (const id of item.sourceIds) {
      const source = sources.find((s) => s.id === id);
      if (!source) throw new Error(`Unknown source in ${item.id}.`);
      const prior = families.get(source.familyId);
      if (prior && prior !== item.split) throw new Error(`Source-family leakage: ${source.familyId}.`);
      families.set(source.familyId, item.split);
    }
    if (!Array.isArray(item.expectedFindings) || !Array.isArray(item.forbiddenCorrections) || !item.expectedBehavior || !Array.isArray(item.ruleReferences)) throw new Error(`Incomplete answer key: ${item.id}.`);
    const findingIds = new Set<string>();
    for (const finding of item.expectedFindings) {
      if (!finding.id || findingIds.has(finding.id)) throw new Error(`Duplicate expected finding: ${item.id}.`);
      findingIds.add(finding.id);
      if (!Number.isInteger(finding.essayFrom) || !Number.isInteger(finding.essayTo) || finding.essayFrom < 0 || finding.essayTo <= finding.essayFrom || item.draft.slice(finding.essayFrom, finding.essayTo) !== finding.essayQuote) throw new Error(`Invalid essay anchor: ${item.id}.`);
      if (!finding.diagnosis || !["alta", "media", "baja"].includes(finding.severity) || !Array.isArray(finding.evidence)) throw new Error(`Invalid finding: ${item.id}.`);
      for (const evidence of finding.evidence) {
        const source = sources.find((s) => s.id === evidence.sourceId);
        if (!source || !item.sourceIds.includes(source.id) || !Number.isInteger(evidence.from) || !Number.isInteger(evidence.to) || evidence.from < 0 || evidence.to <= evidence.from || source.content.slice(evidence.from, evidence.to) !== evidence.quote) throw new Error(`Invalid evidence span: ${item.id}.`);
      }
    }
  }
  return { cases: cases.length, sources: sources.length, draftAnswerKeys: cases.filter((c) => c.answerKeyStatus === "draft").length, splits, qualityMeasured: false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadCorpus().then((corpus) => console.log(JSON.stringify(validateCorpus(corpus), null, 2))).catch(cliError);
}
