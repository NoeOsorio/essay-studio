// Which sources go to a review. Pure. Essay plus sources must fit
// REVIEW_TEXT_BUDGET so the request stays under the line cap and the model's
// context. Cuts are always prefixes, so evidence offsets stay valid.

import type { Fuente } from "@/lib/storage/types";
import { canonical } from "../../../sidecar/src/extract-parser";
import { shortCitation } from "./apa";
import { REVIEW_TEXT_BUDGET } from "./limits";

/** Below this many characters left, a source is left out instead of cut. About 6 pages. */
export const MIN_PREFIX_CHARS = 20_000;

export type ReviewSources = {
  /** In the order they are sent. A cut one carries `recortada: true`. */
  sources: Fuente[];
  /** Left out entirely, in the order they were skipped. */
  omitted: Fuente[];
  /** The essay alone is over the budget: no request should be sent. */
  essayTooLong: boolean;
};

/** What the writer calls a source: its title, or its short citation while it has none. */
export function sourceLabel(f: Fuente): string {
  return f.nombre.trim() || shortCitation(f);
}

/** The essay names the source: one author's surname and the year both appear in it. */
function isCited(f: Fuente, essay: string): boolean {
  if (!f.anio || !f.autores?.length) return false;
  if (!essay.includes(f.anio)) return false;
  return f.autores.some((a) => {
    const surname = canonical(a.apellidos);
    return surname.length > 1 && essay.includes(surname);
  });
}

export function selectSourcesForReview(
  essayText: string,
  fuentes: readonly Fuente[],
  budget: number = REVIEW_TEXT_BUDGET,
): ReviewSources {
  let remaining = budget - essayText.length;
  if (remaining < 0) return { sources: [], omitted: [...fuentes], essayTooLong: true };

  const essay = canonical(essayText);
  const ranked = fuentes
    .map((f, index) => ({ f, index, cited: isCited(f, essay) }))
    .sort((a, b) => {
      if (a.cited !== b.cited) return a.cited ? -1 : 1;
      // Newest first; equal dates keep their library order.
      return b.f.agregadoEn.localeCompare(a.f.agregadoEn) || a.index - b.index;
    });

  const sources: Fuente[] = [];
  const omitted: Fuente[] = [];
  let filling = true;
  for (const { f } of ranked) {
    if (!filling) {
      omitted.push(f);
      continue;
    }
    const length = f.contenido.length;
    if (length <= remaining) {
      sources.push(f);
      remaining -= length;
      continue;
    }
    // The first that does not fit: a prefix when enough room is left, then the fill stops.
    filling = false;
    if (remaining >= MIN_PREFIX_CHARS) {
      sources.push({ ...f, contenido: f.contenido.slice(0, remaining), recortada: true });
      remaining = 0;
    } else {
      omitted.push(f);
    }
  }
  return { sources, omitted, essayTooLong: false };
}
