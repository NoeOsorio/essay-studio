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
import { sentenceSpans } from "@/lib/editor/findCita";
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
  /**
   * Block start position and sentence index of the sentence where the mark
   * starts. Two findings with the same key point at the same sentence.
   * Absent when the finding is not located.
   */
  sentenceKey?: string;
};

/** One sentence as the writer sees it: every finding that points at it. Derived, never stored. */
export type SentenceCard = {
  /** The sentence key, or a closure key / the finding id for findings with no sentence. */
  key: string;
  /** The text under the marks, shown once. */
  quote: string;
  /** Every finding in the sentence, most severe first. Ids, score and closing read this. */
  findings: FindingView[];
  /**
   * What the writer sees: one per agent, its most severe finding (ties:
   * earliest generated). The agent's other findings in the sentence are in
   * `findings` and close or reopen with the card.
   */
  parts: FindingView[];
  /** Open if any finding is open; resolved when all are resolved. */
  status: "open" | "resolved";
  /** Highest severity among the open findings (all of them when none is open). */
  severidad: FindingRecord["severidad"];
  located: boolean;
};

type MarkInfo = {
  attrs: Record<string, unknown>;
  from: number;
  to: number;
  text: string;
  blocks: Set<number>;
  order: number;
  /** Block (with its text and start position) where the mark begins. */
  startBlock: number;
};

type BlockInfo = { start: number; text: string };

const LEAVES = new Set(["hardBreak", "horizontalRule", "image"]);
const TEXTBLOCKS = new Set(["paragraph", "heading", "codeBlock"]);

/** Walk the JSON like ProseMirror counts positions and gather each mark's extent. */
function collectMarks(content: unknown): {
  found: Map<string, MarkInfo>;
  blocks: Map<number, BlockInfo>;
} {
  const found = new Map<string, MarkInfo>();
  const blocks = new Map<number, BlockInfo>();
  let pos = 0;
  let block = 0;
  let order = 0;
  const walk = (node: JSONContent, isRoot: boolean): void => {
    if (node.type === "text") {
      const text = node.text ?? "";
      const start = pos;
      pos += text.length;
      const info = blocks.get(block);
      if (info) info.text += text;
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
            startBlock: block,
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
      if (node.type && LEAVES.has(node.type)) {
        pos += 1;
        // Same placeholder the editor uses, so offsets line up with `sentenceSpans`.
        const info = blocks.get(block);
        if (info) info.text += "\uFFFC";
      }
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
    if (isBlock) {
      block++;
      blocks.set(block, { start: pos, text: "" });
    }
    for (const child of children) walk(child, false);
    if (!isRoot) pos += 1;
  };
  walk(content as JSONContent, true);
  return { found, blocks };
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export function deriveFindings(
  content: JSONContent,
  records: SlimRecord[] | undefined,
): FindingView[] {
  const { found: marks, blocks } = collectMarks(content);
  const spansOf = new Map<number, { start: number; end: number }[]>();
  const sentenceKeyOf = (m: MarkInfo): string | undefined => {
    const b = blocks.get(m.startBlock);
    if (!b) return undefined;
    let spans = spansOf.get(m.startBlock);
    if (!spans) {
      spans = sentenceSpans(b.text);
      spansOf.set(m.startBlock, spans);
    }
    const offset = m.from - b.start;
    let idx = 0;
    for (let i = 0; i < spans.length; i++) {
      if (spans[i].start <= offset) idx = i;
      else break;
    }
    return `${b.start}:${idx}`;
  };
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
      sentenceKey: sentenceKeyOf(m),
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

const RANK: Record<FindingRecord["severidad"], number> = { alta: 3, media: 2, baja: 1 };

function mostSevere(views: FindingView[]): FindingView {
  return views.reduce((a, b) => (RANK[b.severidad] > RANK[a.severidad] ? b : a));
}

/**
 * Group the views into one card per sentence. Located findings that start
 * in the same sentence share a card; a finding that is not located stands
 * alone, except resolved ones closed together (same close time), which
 * return together so reopening brings the whole card back.
 */
export function groupBySentence(views: FindingView[]): SentenceCard[] {
  const order: string[] = [];
  const buckets = new Map<string, FindingView[]>();
  for (const v of views) {
    const key = v.sentenceKey
      ? `s:${v.sentenceKey}`
      : v.status === "resolved" && v.closedAt
        ? `r:${v.closedAt}`
        : `f:${v.id}`;
    const list = buckets.get(key);
    if (list) list.push(v);
    else {
      buckets.set(key, [v]);
      order.push(key);
    }
  }
  return order.map((key) => {
    const found = buckets.get(key)!;
    const sorted = found
      .map((v, i) => ({ v, i }))
      .sort((x, y) => RANK[y.v.severidad] - RANK[x.v.severidad] || x.i - y.i)
      .map((e) => e.v);
    const open = sorted.filter((v) => v.status === "open");
    // `sorted` is most severe first with ties in generation order, so the
    // first of each agent is its part. Ties without a date keep input order.
    const first = new Map<string, FindingView>();
    for (const v of sorted) {
      const best = first.get(v.sage);
      if (!best) first.set(v.sage, v);
      else if (
        RANK[v.severidad] === RANK[best.severidad] &&
        v.generadoEn &&
        best.generadoEn &&
        v.generadoEn < best.generadoEn
      )
        first.set(v.sage, v);
    }
    const parts = sorted.filter((v) => first.get(v.sage) === v);
    const quote = sorted.reduce(
      (best, v) => (v.quote.length > best.length ? v.quote : best),
      "",
    );
    return {
      key,
      quote,
      findings: sorted,
      parts,
      status: open.length > 0 ? "open" : "resolved",
      severidad: (open[0] ?? sorted[0]).severidad,
      located: sorted.some((v) => v.located),
    } satisfies SentenceCard;
  });
}

function toApplied(v: FindingView): AppliedAnotacion {
  return {
    id: v.id,
    sage: v.sage,
    pase: v.pase,
    severidad: v.severidad,
    mensaje: v.mensaje,
    reemplazo: v.reemplazo,
    criterioId: v.criterioId,
    evidence: v.evidence,
    provenance: v.provenance,
  };
}

/**
 * What the score reads: one problem location costs once. Each open card
 * contributes one entry per criterion present in it, at that criterion's
 * highest severity; a card with no criterion contributes one entry at its
 * highest severity. `computeBenchmark` receives this collapsed input.
 */
export function openForScore(views: FindingView[]): AppliedAnotacion[] {
  const out: AppliedAnotacion[] = [];
  for (const card of groupBySentence(views)) {
    const open = card.findings.filter((v) => v.status === "open");
    if (open.length === 0) continue;
    const byCriterio = new Map<string, FindingView[]>();
    for (const v of open) {
      if (!v.criterioId) continue;
      const list = byCriterio.get(v.criterioId) ?? [];
      list.push(v);
      byCriterio.set(v.criterioId, list);
    }
    if (byCriterio.size === 0) {
      out.push(toApplied(mostSevere(open)));
      continue;
    }
    for (const list of byCriterio.values()) out.push(toApplied(mostSevere(list)));
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
