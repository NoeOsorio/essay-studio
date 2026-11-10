// APA 7 strings composed by code from checked fields. The model never writes them.

import type { Fuente } from "@/lib/storage/types";

type CitedFields = Pick<Fuente, "nombre" | "autores" | "anio" | "publicacion" | "citaRevisadaEn" | "archivoNombre">;
type Author = NonNullable<Fuente["autores"]>[number];

/** "Robert C." gives "R. C."; "Jean-Paul" gives "J.-P."; an initial stays. */
function initials(nombres: string | undefined): string {
  if (!nombres) return "";
  return nombres
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.split("-").filter(Boolean).map((part) => `${part.charAt(0).toUpperCase()}.`).join("-"))
    .join(" ");
}

function referenceAuthor(a: Author): string {
  const i = initials(a.nombres);
  return i ? `${a.apellidos}, ${i}` : a.apellidos;
}

function referenceAuthors(autores: Author[]): string {
  const names = autores.map(referenceAuthor);
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]}, & ${names[1]}`;
  // APA 7 lists up to 20 authors; beyond that, the first 19, an ellipsis and the last.
  if (names.length > 20) return `${names.slice(0, 19).join(", ")}, . . . ${names[names.length - 1]}`;
  return `${names.slice(0, -1).join(", ")}, & ${names[names.length - 1]}`;
}

const year = (f: Pick<Fuente, "anio">) => f.anio ?? "s.f.";

/** In-text form: (Mayer, 1995), (Mayer & Davis, 1995), (Mayer et al., 1995), (Mayer, s.f.). */
export function shortCitation(f: CitedFields): string {
  const a = f.autores ?? [];
  let who: string;
  if (a.length === 0) who = f.nombre.trim() || "Sin título";
  else if (a.length === 1) who = a[0].apellidos;
  else if (a.length === 2) who = `${a[0].apellidos} & ${a[1].apellidos}`;
  else who = `${a[0].apellidos} et al.`;
  return `(${who}, ${year(f)})`;
}

/** Full reference. Without authors the title takes their place, as APA does. */
export function buildReference(f: CitedFields): string {
  const title = f.nombre.trim();
  const a = f.autores ?? [];
  const head = a.length > 0 ? `${referenceAuthors(a)} (${year(f)}).` : `${title ? `${title}.` : ""} (${year(f)}).`;
  const parts: string[] = [head.trim()];
  if (a.length > 0 && title) parts.push(`${title}.`);
  const p = f.publicacion;
  if (p?.revista) {
    let line = p.revista;
    if (p.volumen) line += `, ${p.volumen}`;
    if (p.numero) line += p.volumen ? `(${p.numero})` : `, (${p.numero})`;
    if (p.paginas) line += `, ${p.paginas.replace(/(\d)\s*-\s*(\d)/g, "$1–$2")}`;
    parts.push(`${line}.`);
  } else if (p?.editorial) {
    parts.push(`${p.editorial}.`);
  }
  if (p?.doi) parts.push(/^https?:/i.test(p.doi) ? p.doi : `https://doi.org/${p.doi.replace(/^doi:\s*/i, "")}`);
  return parts.join(" ");
}

/** The filename without its extension: a placeholder name, not something he typed. */
export function filenameStem(archivoNombre: string | undefined): string {
  if (!archivoNombre) return "";
  const dot = archivoNombre.lastIndexOf(".");
  return dot > 0 ? archivoNombre.slice(0, dot) : archivoNombre;
}

export type Missing = "autor" | "año" | "título";

/** What a reviewed source still lacks. Empty when the source was never read, so «older source» stays quiet. */
export function missingFields(f: CitedFields): Missing[] {
  if (!f.citaRevisadaEn) return [];
  const out: Missing[] = [];
  if (!f.autores || f.autores.length === 0) out.push("autor");
  if (!f.anio) out.push("año");
  const title = f.nombre.trim();
  if (!title || title === filenameStem(f.archivoNombre)) out.push("título");
  return out;
}
