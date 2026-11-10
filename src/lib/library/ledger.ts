// The ruled page's data (spec 007, R1.3 and R1.4): filtering, ordering, one
// flat list of fixed-height lines, windowing and the month index. Pure: rows
// and search hits in, items out. No React and no store.

import type { LibraryView } from "@/lib/store";
import type { SearchHit, Segment } from "@/lib/storage/types";
import type { LibraryRow } from "./rows";

/** Every line of the ruled page is exactly this tall. */
export const LINE_H = 36;

export type Tipo = LibraryView["tipo"];
export type Revision = LibraryView["revision"];
export type Orden = LibraryView["orden"];

export type LedgerItem =
  | { kind: "month"; key: string; monthKey: string; label: string }
  | { kind: "essay"; key: string; row: LibraryRow; titleSegments?: Segment[] }
  | { kind: "excerpt"; key: string; row: LibraryRow; segments: Segment[] };

export type LedgerQuery = {
  query: string;
  tipo: Tipo;
  revision: Revision;
  /** Already resolved: "relevantes" only while a query exists. */
  orden: Orden;
};

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
] as const;
export const MONTHS_SHORT = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
] as const;

export function parseMonthKey(key: string): { year: number; month: number } {
  return { year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) - 1 };
}

/** «Noviembre» for the current year, «Abril de 2025» for any other. */
export function monthLabel(key: string, currentYear: number): string {
  const { year, month } = parseMonthKey(key);
  return year === currentYear ? MONTHS[month] : `${MONTHS[month]} de ${year}`;
}

/** An essay with a score number has been reviewed; stale means edited since. */
export function revisionOf(row: LibraryRow): "sin-revisar" | "revisados" | "desactualizados" {
  const s = row.score;
  if (!s || s.overall === null) return "sin-revisar";
  return s.isStale ? "desactualizados" : "revisados";
}

export function matchesFilters(row: LibraryRow, tipo: Tipo, revision: Revision): boolean {
  if (tipo && row.entry.mode !== tipo) return false;
  if (revision && revisionOf(row) !== revision) return false;
  return true;
}

export function isDateOrder(orden: Orden): boolean {
  return orden === "recientes" || orden === "antiguos";
}

const titleCollator = new Intl.Collator("es", { sensitivity: "base", numeric: true });

function sortRows(rows: LibraryRow[], orden: Orden): LibraryRow[] {
  const out = rows.slice();
  switch (orden) {
    case "antiguos":
      out.sort((a, b) => a.effectiveMs - b.effectiveMs);
      break;
    case "titulo":
      out.sort((a, b) => titleCollator.compare(a.displayTitle, b.displayTitle));
      break;
    case "nota":
      out.sort((a, b) => {
        const x = a.score?.overall ?? -1;
        const y = b.score?.overall ?? -1;
        return y - x || b.effectiveMs - a.effectiveMs;
      });
      break;
    case "recientes":
    case "relevantes":
      out.sort((a, b) => b.effectiveMs - a.effectiveMs);
      break;
  }
  return out;
}

export type LedgerModel = {
  items: LedgerItem[];
  /** Index in `items` of each month heading, by month key, in list order. */
  months: { key: string; index: number }[];
  /** For every item, the index of the month heading it sits under; -1 for none. */
  monthOf: Int32Array;
  /** Essays that match filters and query, whether or not they appear as lines. */
  matchCount: number;
};

/**
 * The flat list. `deskIds` are left out unless `hideDesk` is false, which is
 * the default listing: a query, a filter or a non-default order hides the
 * desk cards and then every match is a line.
 */
export function buildLedger(
  rows: readonly LibraryRow[],
  q: LedgerQuery,
  hits: readonly SearchHit[] | null,
  deskIds: ReadonlySet<string>,
  nowMs: number = Date.now(),
): LedgerModel {
  const searching = q.query.trim().length > 0;
  const hitById = new Map<string, SearchHit>();
  let pool: LibraryRow[];

  if (searching) {
    if (!hits) {
      pool = [];
    } else {
      const byId = new Map<string, LibraryRow>();
      for (const r of rows) byId.set(r.entry.id, r);
      pool = [];
      for (const h of hits) {
        const r = byId.get(h.id);
        if (r && matchesFilters(r, q.tipo, q.revision)) {
          pool.push(r);
          hitById.set(h.id, h);
        }
      }
    }
  } else {
    pool = rows.filter((r) => matchesFilters(r, q.tipo, q.revision));
  }

  const defaultListing = !searching && q.tipo === null && q.revision === null && q.orden === "recientes";
  if (defaultListing) pool = pool.filter((r) => !deskIds.has(r.entry.id));

  // Search results keep the index's relevance order unless another is chosen.
  const ordered = q.orden === "relevantes" && searching ? pool : sortRows(pool, q.orden);

  const withMonths = isDateOrder(q.orden);
  const currentYear = new Date(nowMs).getFullYear();
  const items: LedgerItem[] = [];
  const months: { key: string; index: number }[] = [];
  const monthOfList: number[] = [];
  let lastMonth = "";
  for (const row of ordered) {
    if (withMonths && row.monthKey !== lastMonth) {
      lastMonth = row.monthKey;
      months.push({ key: row.monthKey, index: items.length });
      items.push({
        kind: "month",
        key: `m${row.monthKey}`,
        monthKey: row.monthKey,
        label: monthLabel(row.monthKey, currentYear),
      });
      monthOfList.push(months.length - 1);
    }
    const hit = hitById.get(row.entry.id);
    items.push({
      kind: "essay",
      key: row.entry.id,
      row,
      titleSegments: hit && hit.rank === "title" ? hit.title : undefined,
    });
    monthOfList.push(months.length - 1);
    if (hit && hit.rank === "body" && hit.snippet && hit.snippet.length > 0) {
      items.push({ kind: "excerpt", key: `${row.entry.id}#x`, row, segments: hit.snippet });
      monthOfList.push(months.length - 1);
    }
  }
  return { items, months, monthOf: Int32Array.from(monthOfList), matchCount: pool.length };
}

/** Which items to mount for a scroll position (page-relative px). */
export function windowRange(
  scrollInPage: number,
  viewportH: number,
  total: number,
  overscan = 12,
): { start: number; end: number } {
  const first = Math.floor(Math.max(0, scrollInPage) / LINE_H);
  const last = Math.ceil((Math.max(0, scrollInPage) + viewportH) / LINE_H);
  return { start: Math.max(0, first - overscan), end: Math.min(total, last + overscan) };
}

/** Month heading under the first visible line, or null without month rows. */
export function currentMonth(model: LedgerModel, scrollInPage: number): number {
  if (model.months.length === 0 || model.items.length === 0) return -1;
  const i = Math.min(model.items.length - 1, Math.max(0, Math.floor(scrollInPage / LINE_H)));
  return model.monthOf[i];
}

/** Years with essays, newest first, each with the months that have any. */
export function monthIndex(months: readonly { key: string }[]): { year: number; months: Set<number> }[] {
  const byYear = new Map<number, Set<number>>();
  for (const m of months) {
    const { year, month } = parseMonthKey(m.key);
    let set = byYear.get(year);
    if (!set) {
      set = new Set();
      byYear.set(year, set);
    }
    set.add(month);
  }
  return Array.from(byYear.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([year, set]) => ({ year, months: set }));
}

/** The words of a query, for the empty-result wording. */
export function activeFilterLabel(tipo: Tipo, revision: Revision): string | null {
  const parts: string[] = [];
  if (tipo) parts.push(tipo === "academico" ? "Académico" : "Blog");
  if (revision) {
    parts.push(
      revision === "revisados" ? "Revisados" : revision === "desactualizados" ? "Desactualizados" : "Sin revisar",
    );
  }
  return parts.length > 0 ? parts.join(" y ") : null;
}
