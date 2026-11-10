// The one place that turns a document and its records into the list of
// findings. Stamp, panel, card, suppression, MCP and the library list all
// read through here. Pure: no React, store or Tauri imports.
//
// Authority: the mark is the only authority for location and for being
// underlined; the record is the only authority for closure. Presence of
// the mark wins, which is what makes undo correct.

import type { JSONContent } from "@tiptap/core";
import type {
  FindingRecord,
  FindingStatus,
  Pase,
} from "@/lib/storage/types";
import {
  computeBenchmark,
  type AppliedAnotacion,
} from "@/lib/benchmark/score";

export type SlimRecord = Pick<
  FindingRecord,
  "id" | "sage" | "pase" | "severidad" | "criterioId" | "status"
> &
  Partial<FindingRecord>;

export type FindingView = {
  id: string;
  sage: FindingRecord["sage"];
  pase: Pase;
  severidad: FindingRecord["severidad"];
  /** Reviewer quote (record) or the text under the mark (older findings). */
  cita: string;
  mensaje: string;
  reemplazo?: string;
  criterioId?: string;
  evidence?: FindingRecord["evidence"];
  provenance?: FindingRecord["provenance"];
  generadoEn?: string;
  /** Never `not_applicable`: those are hidden from the list. */
  status: Exclude<FindingStatus, "not_applicable">;
  closedAt?: string;
  closedBy?: FindingRecord["closedBy"];
  occurrence?: number;
  /** True when a mark with this id is in the document. */
  located: boolean;
  from: number | null;
  to: number | null;
  /** Live text under the mark when located, else `cita`. */
  quote: string;
  /** The mark crosses a paragraph or heading boundary. */
  spansBlocks: boolean;
  /** A durable record exists for this finding. */
  hasRecord: boolean;
};

type MarkInfo = {
  attrs: Record<string, unknown>;
  from: number;
  to: number;
  text: string;
  blocks: Set<number>;
  order: number;
};

const LEAVES = new Set(["hardBreak", "horizontalRule", "image"]);
const TEXTBLOCKS = new Set(["paragraph", "heading", "codeBlock"]);

/** Walk the JSON like ProseMirror counts positions and gather each mark's extent. */
function collectMarks(content: unknown): Map<string, MarkInfo> {
  const found = new Map<string, MarkInfo>();
  let pos = 0;
  let block = 0;
  let order = 0;
  const walk = (node: JSONContent, isRoot: boolean): void => {
    if (node.type === "text") {
      const text = node.text ?? "";
      const start = pos;
      pos += text.length;
      for (const m of node.marks ?? []) {
        if (m.type !== "annotation") continue;
        const attrs = (m.attrs ?? {}) as Record<string, unknown>;
        const id = typeof attrs.id === "string" ? attrs.id : null;
        if (!id) continue;
        const hit = found.get(id);
        if (!hit) {
          found.set(id, {
            attrs,
            from: start,
            to: pos,
            text,
            blocks: new Set([block]),
            order: order++,
          });
        } else {
          hit.to = Math.max(hit.to, pos);
          hit.text += hit.blocks.has(block) ? text : `\n${text}`;
          hit.blocks.add(block);
        }
      }
      return;
    }
    const children = node.content;
    if (!Array.isArray(children)) {
      if (isRoot) return;
      // Leaves count 1; an empty container (a blank paragraph) is open plus close.
      if (node.type && LEAVES.has(node.type)) pos += 1;
      else {
        pos += 2;
        if (node.type && TEXTBLOCKS.has(node.type)) block++;
      }
      return;
    }
    const isBlock =
      (node.type !== undefined && TEXTBLOCKS.has(node.type)) ||
      children.some((c) => c.type === "text");
    if (!isRoot) pos += 1;
    if (isBlock) block++;
    for (const child of children) walk(child, false);
    if (!isRoot) pos += 1;
  };
  walk(content as JSONContent, true);
  return found;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export function deriveFindings(
  content: JSONContent,
  records: SlimRecord[] | undefined,
): FindingView[] {
  const marks = collectMarks(content);
  const byId = new Map<string, SlimRecord>();
  for (const r of records ?? []) byId.set(r.id, r);

  const views: FindingView[] = [];

  for (const [id, m] of marks) {
    const rec = byId.get(id);
    const a = m.attrs;
    views.push({
      id,
      sage: (rec?.sage ?? a.sage) as FindingView["sage"],
      pase: (rec?.pase ?? a.pase) as Pase,
      severidad: (rec?.severidad ?? a.severidad) as FindingView["severidad"],
      cita: rec?.cita ?? m.text,
      mensaje: rec?.mensaje ?? str(a.mensaje) ?? "",
      reemplazo: rec?.reemplazo ?? str(a.reemplazo) ?? str(a.sugerencia),
      criterioId: rec?.criterioId ?? str(a.criterioId),
      evidence: rec?.evidence ?? (Array.isArray(a.evidence) ? (a.evidence as FindingView["evidence"]) : undefined),
      provenance: rec?.provenance ?? (a.provenance && typeof a.provenance === "object" ? (a.provenance as FindingView["provenance"]) : undefined),
      generadoEn: rec?.generadoEn,
      // Presence wins: a mark in the document is always open.
      status: "open",
      occurrence: rec?.occurrence,
      located: true,
      from: m.from,
      to: m.to,
      quote: m.text,
      spansBlocks: m.blocks.size > 1,
      hasRecord: !!rec,
    });
  }

  const located = views.slice().sort((x, y) => (x.from ?? 0) - (y.from ?? 0));
  const orderOf = new Map<string, number>();
  for (const [id, m] of marks) orderOf.set(id, m.order);
  // Document order is by position; `order` only breaks ties.
  located.sort(
    (x, y) =>
      (x.from ?? 0) - (y.from ?? 0) || (orderOf.get(x.id) ?? 0) - (orderOf.get(y.id) ?? 0),
  );

  const notLocated: FindingView[] = [];
  const resolved: FindingView[] = [];
  for (const r of records ?? []) {
    if (marks.has(r.id)) continue;
    if (r.status === "not_applicable") continue;
    const view: FindingView = {
      id: r.id,
      sage: r.sage,
      pase: r.pase,
      severidad: r.severidad,
      cita: r.cita ?? "",
      mensaje: r.mensaje ?? "",
      reemplazo: r.reemplazo,
      criterioId: r.criterioId,
      evidence: r.evidence,
      provenance: r.provenance,
      generadoEn: r.generadoEn,
      status: r.status === "resolved" ? "resolved" : "open",
      closedAt: r.closedAt,
      closedBy: r.closedBy,
      occurrence: r.occurrence,
      located: false,
      from: null,
      to: null,
      quote: r.cita ?? "",
      spansBlocks: false,
      hasRecord: true,
    };
    (view.status === "open" ? notLocated : resolved).push(view);
  }
  notLocated.sort((x, y) => (x.generadoEn ?? "").localeCompare(y.generadoEn ?? ""));
  resolved.sort((x, y) => (y.closedAt ?? "").localeCompare(x.closedAt ?? ""));

  return [...located, ...notLocated, ...resolved];
}

/** Every open finding, located or not, in the shape the score reads. */
export function openForScore(views: FindingView[]): AppliedAnotacion[] {
  const out: AppliedAnotacion[] = [];
  for (const v of views) {
    if (v.status !== "open") continue;
    out.push({
      id: v.id,
      sage: v.sage,
      pase: v.pase,
      severidad: v.severidad,
      mensaje: v.mensaje,
      reemplazo: v.reemplazo,
      criterioId: v.criterioId,
      evidence: v.evidence,
      provenance: v.provenance,
    });
  }
  return out;
}

type BenchmarkArgs = Parameters<typeof computeBenchmark>[0];

/** The overall score he would have with `addPases` also checked and nothing else changed. */
export function reachableScore(
  args: BenchmarkArgs,
  addPases: Pase[],
): number | null {
  const base = args.evaluacionMeta;
  const covered = new Set<Pase>([...(base?.pasadasCubiertas ?? []), ...addPases]);
  return computeBenchmark({
    ...args,
    evaluacionMeta: {
      ...(base ?? { evaluadoEn: "" }),
      pasadasCubiertas: [...covered],
    },
  }).overall;
}

/** Normalize like `findCitaRange` does, for comparing two quotes. */
export function normalizeCita(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * A new finding is suppressed when a closed (resolved or not applicable)
 * finding of the same pass still applies: its quote is found at its
 * occurrence and the new range lies in the same sentence. A new finding
 * with no location is suppressed on equal normalized quote.
 */
export function isSuppressed(
  candidate: { pase: Pase; cita: string; range: { from: number; to: number } | null },
  closed: SlimRecord[],
  resolveSentence: (record: SlimRecord) => { from: number; to: number } | null,
): boolean {
  for (const r of closed) {
    if (r.status === "open" || r.pase !== candidate.pase) continue;
    if (!candidate.range) {
      if (normalizeCita(r.cita ?? "") === normalizeCita(candidate.cita)) return true;
      continue;
    }
    const sentence = resolveSentence(r);
    if (
      sentence &&
      candidate.range.from < sentence.to &&
      candidate.range.to > sentence.from
    ) {
      return true;
    }
  }
  return false;
}
