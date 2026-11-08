import { stat, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { arg, DEFAULT_RUNS, REPO_ROOT, hash, writePrivate, cliError } from "./io.js";
import type { CorpusSource } from "./schema.js";
async function main() {
  const input = arg("--input"), family = arg("--family");
  if (!input || !family) throw new Error("Explicit --input <essay/source-library.json> and --family <document-family> are required. No folders are scanned.");
  const path = resolve(input), metadata = await stat(path);
  // A bounded local import avoids accidentally loading an entire personal archive.
  if (!metadata.isFile() || metadata.size > 16 * 1024 * 1024) throw new Error("Import requires a regular JSON file of at most 16 MiB; split a larger library explicitly.");
  const value: unknown = JSON.parse(await readFile(path, "utf8"));
  const raw = Array.isArray(value) ? value : value && typeof value === "object" && "fuentes" in value ? value.fuentes : null;
  if (!Array.isArray(raw)) throw new Error("Expected a fuentes array or an essay JSON with fuentes. No source was imported.");
  const sources: CorpusSource[] = [], seen = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || typeof entry.id !== "string" || typeof entry.nombre !== "string" || typeof entry.contenido !== "string" || seen.has(entry.id)) throw new Error("Invalid or duplicate library source. No source was imported.");
    seen.add(entry.id);
    sources.push({ id: entry.id, familyId: family, title: entry.nombre, kind: "permitted-excerpt", privacy: "private", content: entry.contenido,
      contentSha256: hash(entry.contenido), attribution: "Private user-selected source. Bibliographic identity and reuse permissions require independent review.",
      permittedUse: "Local evaluation only; redistribution not authorized by import.",
      // Local path is provenance for this private copy, never sent to a model.
      url: `local-import:${hash(path)}`, capturedAt: new Date().toISOString(), printedPagesVerified: false,
      locator: { section: "Imported text; printed pagination not established", paragraph: 1 } });
  }
  const out = resolve(arg("--out") ?? resolve(REPO_ROOT, "benchmarks/reviewers/local", `sources-${Date.now()}.json`));
  if (out.startsWith(DEFAULT_RUNS + "/")) throw new Error("Put source imports in local/, not a completed run directory.");
  await writePrivate(out, sources);
  console.log(JSON.stringify({ importedSources: sources.length, outputPath: out, modelCalls: 0, sealedCorpusChanged: false, note: "Curate cases/provenance and reseal a separate private corpus before evaluating. Nothing was sent to a model." }));
}
main().catch(cliError);
