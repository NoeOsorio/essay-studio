// Defaults for sage / pasada selection per essay mode.
//
// Each sage carries a different lens; not every lens earns its keep
// in every register. Academic prose lives on evidence + structure +
// counter-argument (EM/SI/CR). Blog prose lives on systems + applied
// utility + counter-argument (SI/PR/CR). The Empirista is brilliant
// for academic but pedantic for blog; the Práctico is the inverse.
//
// These are *defaults* — the modal lets the user override with
// checkboxes. Persistence: none — defaults reapply each open.

import type { EssayMode, Pase, Sage } from "@/lib/storage/types";

/** Which sages auto-activate for council-mode interrogation. */
export function defaultSagesForMode(mode: EssayMode): Sage[] {
  return mode === "blog"
    ? ["sis", "pra", "cri"]
    : ["em", "sis", "cri"];
}

/** Which pasadas auto-activate for Evaluar. APA only applies academic. */
export function defaultPasesForMode(mode: EssayMode): Pase[] {
  return mode === "blog"
    ? ["coherencia", "estilo", "argumento"]
    : ["coherencia", "estilo", "argumento", "apa"];
}

/** Ordered list of all sages for stable UI rendering. */
export const ALL_SAGES: Sage[] = ["em", "sis", "pra", "cri"];

/** Ordered list of all pasadas; APA last so the optional one sits at the edge. */
export const ALL_PASES: Pase[] = ["coherencia", "estilo", "argumento", "apa"];
