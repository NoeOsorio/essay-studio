import { matchesFilters, revisionOf, sortRows, type Orden } from "@/lib/library/ledger";
import { toRow } from "@/lib/library/rows";
import { loadLibrary, searchLibrary } from "@/lib/storage";
import { type JsonObject } from "../../../shared/mcp";
import { page } from "./collections";

const STATE_TO_REVISION = { revisado: "revisados", sin_revisar: "sin-revisar", desactualizado: "desactualizados" } as const;
const REVISION_TO_STATE = { revisados: "revisado", "sin-revisar": "sin_revisar", desactualizados: "desactualizado" } as const;

/**
 * The library as the writer sees it: the same index, search, review filter, order and score as the
 * ledger, so a client finds an essay the way the library screen does. No essay contents beyond a
 * snippet around a body match.
 */
export async function listEssaysTool(args: JsonObject): Promise<JsonObject> {
  const query = typeof args.query === "string" ? args.query.trim() : "";
  const [entries, hits] = await Promise.all([loadLibrary(), query ? searchLibrary(query) : Promise.resolve(null)]);
  const nowMs = Date.now();
  const hitById = new Map((hits ?? []).map(hit => [hit.id, hit]));
  const order = new Map((hits ?? []).map((hit, index) => [hit.id, index]));
  let rows = entries.map(entry => toRow(entry, nowMs));
  if (query) rows = rows.filter(row => hitById.has(row.entry.id));
  const wanted = args.reviewState as keyof typeof STATE_TO_REVISION | undefined;
  rows = rows.filter(row => matchesFilters(row, (args.mode as "academico" | "blog" | undefined) ?? null, wanted ? STATE_TO_REVISION[wanted] : null)
    && (!args.language || (row.entry.language ?? "es") === args.language));
  const sort = (args.sort as Orden | undefined) ?? (query ? "relevantes" : "recientes");
  rows = sort === "relevantes" && query
    ? rows.sort((a, b) => (order.get(a.entry.id) ?? 0) - (order.get(b.entry.id) ?? 0))
    : sortRows(rows, sort === "relevantes" ? "recientes" : sort);
  const result = page(rows, args);
  const items = result.items.map(row => {
    const hit = hitById.get(row.entry.id);
    const overall = row.score?.overall ?? null;
    return {
      id: row.entry.id, title: row.entry.title, mode: row.entry.mode, language: row.entry.language ?? "es",
      wordCount: row.entry.wordCount, createdAt: row.entry.createdAt, updatedAt: row.entry.updatedAt,
      score: overall === null ? null : Math.round(overall * 10) / 10,
      reviewState: REVISION_TO_STATE[revisionOf(row)],
      ...(hit ? { matchedIn: hit.rank, ...(hit.snippet?.length ? { snippet: hit.snippet.map(segment => segment.text).join("") } : {}) } : {}),
    };
  });
  return { ...result, items, essays: items };
}
