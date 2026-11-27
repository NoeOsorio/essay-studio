// The reference section of a note: `meta.reference`. With a sourceId the full
// reference follows the essay's source; `apa` stays as a snapshot so the note
// still works if the source is deleted. Pure functions, no canvas imports.

import { buildReference, shortCitation } from "@/lib/materials/apa";
import type { Fuente } from "@/lib/storage/types";

export type NoteReference = {
  sourceId?: string;
  /** Full APA reference. A snapshot when linked, the text itself when pasted. */
  apa?: string;
  /** In-text citation, with parentheses. Built when missing. */
  inText?: string;
  /** Where in the work: «p. 12». */
  locator?: string;
};

export type ResolvedReference = {
  apa: string;
  inText: string;
  /** The quiet line on the board: «Harney y Alkhalaf, 2021, p. 12». */
  label: string;
  /** The live source, when the reference is linked and the source still exists. */
  source: Fuente | null;
};

const clean = (v: unknown): string | undefined => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined);

/** Reads and normalizes `meta.reference`; null when the note has none. */
export function referenceOf(meta: unknown): NoteReference | null {
  const raw = (meta as { reference?: unknown } | null | undefined)?.reference;
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const ref: NoteReference = {
    sourceId: clean(r.sourceId),
    apa: clean(r.apa),
    inText: clean(r.inText),
    locator: clean(r.locator),
  };
  if (!ref.sourceId && !ref.apa) return null;
  return Object.fromEntries(Object.entries(ref).filter(([, v]) => v !== undefined)) as NoteReference;
}

/** Number of lines the reference line adds to a note: none, or one. */
export function hasReference(meta: unknown): boolean {
  return referenceOf(meta) !== null;
}

const INITIALS = /^(?:[A-ZÁÉÍÓÚÑ]\.\s?(?:-?[A-ZÁÉÍÓÚÑ]\.\s?)*)$/;

/** Surnames and year read out of a pasted reference: «Harney, S., & Alkhalaf, A. (2021).» */
function partsFromApa(apa: string): { who: string; year: string } | null {
  const m = /^(.*?)\s*\((\d{4}[a-z]?|s\.\s?f\.)(?:,[^)]*)?\)/.exec(apa);
  if (!m) return null;
  const surnames = m[1]
    .split(/\s*,\s*&\s*|\s*&\s*|\s*,\s*/)
    .map((p) => p.trim())
    .filter((p) => p !== "" && !INITIALS.test(p) && p !== ". . .");
  if (surnames.length === 0) return null;
  const who = surnames.length === 1 ? surnames[0] : surnames.length === 2 ? `${surnames[0]} y ${surnames[1]}` : `${surnames[0]} et al.`;
  return { who, year: m[2] };
}

const unwrap = (inText: string) => inText.replace(/^\(/, "").replace(/\)$/, "").replace(/\s&\s/g, " y ");

function withLocator(base: string, locator: string | undefined): string {
  if (!locator || base.toLowerCase().includes(locator.toLowerCase())) return base;
  return `${base}, ${locator}`;
}

export function resolveReference(ref: NoteReference, fuentes: Fuente[] | undefined): ResolvedReference {
  const source = ref.sourceId ? (fuentes ?? []).find((f) => f.id === ref.sourceId) ?? null : null;
  const apa = source ? source.cita?.trim() || buildReference(source) : ref.apa ?? "";
  let base: string;
  if (ref.inText) base = unwrap(ref.inText);
  else if (source) base = unwrap(shortCitation(source));
  else {
    const parts = partsFromApa(apa);
    base = parts ? `${parts.who}, ${parts.year}` : apa;
  }
  const label = withLocator(base, ref.locator);
  const wrapped = ref.inText ?? (source ? shortCitation(source) : null);
  const inText = wrapped
    ? `(${withLocator(wrapped.replace(/^\(/, "").replace(/\)$/, ""), ref.locator)})`
    : `(${label})`;
  return { apa, inText, label, source };
}

/** What a source writes into a note when it is picked. */
export function referenceFromSource(source: Fuente, locator?: string): NoteReference {
  return {
    sourceId: source.id,
    apa: source.cita?.trim() || buildReference(source),
    ...(locator?.trim() ? { locator: locator.trim() } : {}),
  };
}

/**
 * The meta of a note with its reference set, or removed when `next` is null.
 * tldraw merges meta and rejects undefined, so removal replaces the whole meta.
 */
export function metaWithReference<T extends object>(meta: T, next: NoteReference | null): T {
  const { reference: _old, ...rest } = meta as T & { reference?: unknown };
  void _old;
  return (next ? { ...rest, reference: next } : rest) as unknown as T;
}
