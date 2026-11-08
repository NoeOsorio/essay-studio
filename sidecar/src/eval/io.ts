import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import type { BenchmarkCase, Corpus, CorpusManifest, CorpusSource } from "./schema.js";
export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
export const DEFAULT_CORPUS = resolve(REPO_ROOT, "benchmarks/reviewers/corpus");
export const DEFAULT_RUNS = resolve(REPO_ROOT, "benchmarks/reviewers/runs");
export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}.`);
  return value;
}
export function numberArg(name: string, fallback: number): number {
  const raw = arg(name); const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be positive.`);
  return value;
}
export async function readJson<T>(path: string): Promise<T> { return JSON.parse(await readFile(path, "utf8")) as T; }
export async function writePrivate(path: string, value: unknown): Promise<void> {
  const { dirname } = await import("node:path");
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", { mode: 0o600, flag: "wx" });
}
export async function loadCorpus(directory = arg("--corpus") ?? DEFAULT_CORPUS): Promise<Corpus> {
  const absolute = resolve(directory);
  const [sourceBytes, caseBytes, manifest] = await Promise.all([
    readFile(resolve(absolute, "sources.json"), "utf8"), readFile(resolve(absolute, "cases.json"), "utf8"),
    readJson<CorpusManifest>(resolve(absolute, "manifest.json")),
  ]);
  if (manifest.version !== 1 || manifest.files?.sourcesSha256 !== hash(sourceBytes) || manifest.files?.casesSha256 !== hash(caseBytes)) {
    throw new Error("Corpus manifest hash mismatch. Review changes and reseal the corpus before running.");
  }
  const sources: unknown = JSON.parse(sourceBytes), cases: unknown = JSON.parse(caseBytes);
  if (!Array.isArray(sources) || !Array.isArray(cases)) throw new Error("Corpus sources/cases must be arrays.");
  return { directory: absolute, manifest, sources: sources as CorpusSource[], cases: cases as BenchmarkCase[], corpusHash: hash(JSON.stringify(manifest)) };
}
export function cliError(error: unknown): void {
  // Do not echo provider errors or local draft/source content into logs.
  console.error(error instanceof Error ? error.message : "Benchmark operation failed.");
  process.exitCode = 1;
}
