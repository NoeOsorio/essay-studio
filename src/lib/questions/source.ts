// What the Hazme preguntas panel does with sources: search, naming and the
// size check. Files and pasted text are saved by `src/lib/materials/import`
// (PDF, .txt and .md), the same path the Fuentes panel uses.
//
// Search (research R13): a lowercase, accent-free key per source built from
// `nombre` and `cita`, memoized per `fuentes` array, so filtering 1000 sources
// is one `includes` per source. Recent first by `agregadoEn`.

import type { RejectReason } from "@/lib/materials/import";
import type { Fuente } from "@/lib/storage/types";
import { sourceFits } from "../../../sidecar/src/review-contract";

export { sourceFits };

/** The short line the drop zone shows when a file is refused, per reason (same copy as the Fuentes panel). */
export const REJECTION_LINES: Record<RejectReason, string> = {
  unsupported: "No puedo leer este formato",
  no_text: "Este PDF no tiene texto",
  unreadable: "No pude abrir este PDF",
  locked: "Este PDF tiene contraseña",
  too_large: "Pesa más de 50 MB",
  text_limit: "Es demasiado largo",
  essay_limit: "Ya no caben más fuentes",
};

/** Shown under the selected row when a saved source cannot be sent whole. */
export const TOO_LARGE_LINE = "Es muy larga para hacerle preguntas. Pega solo una parte.";

/** Lowercase, without accents, one space between words. */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

type Indexed = { fuente: Fuente; key: string };
const indexes = new WeakMap<readonly Fuente[], Indexed[]>();

function indexOf(fuentes: readonly Fuente[]): Indexed[] {
  const known = indexes.get(fuentes);
  if (known) return known;
  const built = [...fuentes]
    .sort((a, b) => (a.agregadoEn < b.agregadoEn ? 1 : a.agregadoEn > b.agregadoEn ? -1 : 0))
    .map((fuente) => ({ fuente, key: fold(`${sourceLabel(fuente)} ${fuente.cita ?? ""}`) }));
  indexes.set(fuentes, built);
  return built;
}

/** Sources whose name or reference holds every word of the query, recent first. */
export function searchSources(fuentes: readonly Fuente[], query: string): Fuente[] {
  const all = indexOf(fuentes);
  const words = fold(query).split(" ").filter(Boolean);
  if (words.length === 0) return all.map((i) => i.fuente);
  return all.filter((i) => words.every((w) => i.key.includes(w))).map((i) => i.fuente);
}

const MAX_NAME_CHARS = 48;

/** Name of a source made from pasted text: its first line, cut at a word. */
export function pasteName(text: string): string {
  const line = text.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  if (line.length === 0) return "Texto pegado";
  if (line.length <= MAX_NAME_CHARS) return line;
  const cut = line.slice(0, MAX_NAME_CHARS);
  const at = cut.lastIndexOf(" ");
  return `${(at > 16 ? cut.slice(0, at) : cut).trimEnd()}…`;
}

/** What the picker and the run call a source. A pasted text has no name until its citation is read. */
export function sourceLabel(f: Pick<Fuente, "nombre" | "contenido">): string {
  return f.nombre.trim() || pasteName(f.contenido);
}
