import type { Fuente } from "@/lib/storage/types";
import { canonical } from "../../../sidecar/src/extract-parser";

const haystacks = new WeakMap<Fuente, string>();
/** Title, authors and reference, folded once per source object. */
export function haystack(f: Fuente): string {
  let value = haystacks.get(f);
  if (value === undefined) {
    const authors = (f.autores ?? []).map((a) => `${a.nombres ?? ""} ${a.apellidos}`).join(" ");
    value = canonical(`${f.nombre} ${authors} ${f.cita ?? ""} ${f.archivoNombre ?? ""}`);
    haystacks.set(f, value);
  }
  return value;
}

export { canonical };
