import type { StepMap } from "@tiptap/pm/transform";

/**
 * The app revision is `epoch:essayId:N`. N counts every store change, so it
 * moves while the writer types. Tools that address things by id do not need it
 * to match; edits by document position are mapped through the document steps
 * recorded here instead.
 */
const MAX_ENTRIES = 2000;

type Entry = { seen: number; map: StepMap };

let epoch = "";
let counter = 0;
let log: Entry[] = [];
// Revisions at or below this lost entries to the ring and cannot be mapped.
let droppedSeen = -1;
// Positions read before the live editor was registered refer to another document.
let documentBarrier = 0;

export function startRevisionLog(): void { epoch = crypto.randomUUID(); counter = 0; log = []; droppedSeen = -1; documentBarrier = 0; }
export function bumpRevision(): void { counter += 1; }
export function revisionCounter(): number { return counter; }
export function revisionEpoch(): string { return epoch; }

/** A new editor instance: older positions mean nothing in it. */
export function markDocumentBarrier(): void { documentBarrier = counter; log = []; droppedSeen = -1; }

/** Called from the editor's transaction event, before the store bump it causes. */
export function recordDocumentTransaction(maps: readonly StepMap[]): void {
  for (const map of maps) {
    let changes = false;
    map.forEach(() => { changes = true; });
    if (!changes) continue;
    log.push({ seen: counter, map });
    if (log.length > MAX_ENTRIES) { const dropped = log.shift()!; droppedSeen = Math.max(droppedSeen, dropped.seen); }
  }
}

export function parseRevision(revision: unknown): { epoch: string; essayId: string; n: number } | null {
  if (typeof revision !== "string") return null;
  const first = revision.indexOf(":"); const last = revision.lastIndexOf(":");
  if (first < 0 || last <= first) return null;
  const n = Number(revision.slice(last + 1));
  if (!Number.isInteger(n) || n < 0) return null;
  return { epoch: revision.slice(0, first), essayId: revision.slice(first + 1, last), n };
}

export type MappedRange =
  | { kind: "ok"; from: number; to: number; moved: boolean }
  | { kind: "stale" }
  | { kind: "changed"; from: number; to: number };

/**
 * Carry a range read at `revision` through every document step recorded since.
 * A step that deleted, edited or typed inside or at the edges of the range (or
 * replaced text across the point of an insertion) is a real overlap; anything else shifts the positions.
 */
export function mapRangeSince(revision: unknown, essayId: string, from: number, to: number): MappedRange {
  const parsed = parseRevision(revision);
  if (!parsed || parsed.epoch !== epoch || parsed.essayId !== essayId || parsed.n > counter || parsed.n < documentBarrier || parsed.n <= droppedSeen) return { kind: "stale" };
  const point = from === to;
  let start = from; let end = to; let conflict = false;
  let wideStart = from; let wideEnd = to;
  for (const entry of log) {
    if (entry.seen < parsed.n) continue;
    const [s, e] = [start, end];
    entry.map.forEach((oldStart, oldEnd) => {
      // A range counts as touched when a step reaches its edges too (typing at its end); a bare insertion point only when a step replaces text across it.
      if (point ? oldStart < s && oldEnd > s : oldStart <= e && oldEnd >= s) conflict = true;
    });
    start = entry.map.map(start, 1); end = point ? start : entry.map.map(end, -1);
    if (end < start) end = start;
    wideStart = entry.map.map(wideStart, -1); wideEnd = entry.map.map(wideEnd, 1);
  }
  if (conflict) return { kind: "changed", from: wideStart, to: wideEnd };
  return { kind: "ok", from: start, to: end, moved: start !== from || end !== to };
}
