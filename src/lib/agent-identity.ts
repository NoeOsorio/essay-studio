// The only definition of who the agents are. Any label map keyed by agent id
// elsewhere in the renderer is a defect. Colors live once, in globals.css;
// this file refers to them by CSS variable.

import type { ComponentType } from "react";
import {
  GlyphEvidencia,
  GlyphObjeciones,
  GlyphPractica,
  GlyphSistemas,
  GlyphTu,
} from "@/components/ui/icons";

export type AgentId = "em" | "sis" | "pra" | "cri";
export type AuthorId = AgentId | "tu";

export type Identity = {
  id: AuthorId;
  /** Visible name. */
  name: string;
  /** One sentence, used in tooltips. */
  lens: string;
  /** One sentence for the tooltip in the questions panel (Paper R3.5). */
  asks: string;
  /** What the status chip says while this agent works, rotated every 2 s (Paper R3.4). */
  voiceLines: readonly string[];
  Icon: ComponentType<{ size?: number }>;
  /** CSS var: note fill. */
  note: string;
  /** CSS var: header and icon on the note. */
  ink: string;
  /** CSS var: note body. */
  text: string;
  /** CSS var: dot. */
  dot: string;
  /** CSS var: underline; "tu" has none. */
  line: string;
  /** bg utility for icon chips. */
  chipClass: string;
};

const v = (name: string) => `var(--color-${name})`;

const TU: Identity = {
  id: "tu",
  name: "Tú",
  lens: "Lo que anotas tú, con título si quieres.",
  asks: "Lo que anotas tú, con título si quieres.",
  voiceLines: [],
  Icon: GlyphTu,
  note: v("tu-note"),
  ink: v("ink-1"),
  text: v("ink-1"),
  dot: "transparent",
  line: "transparent",
  chipClass: "bg-tu-note",
};

export const AGENTS: readonly Identity[] = [
  {
    id: "em",
    name: "Evidencia",
    lens: "Te pregunta qué se midió, con quién y cuánto.",
    asks: "Te pregunta qué se midió, con quién y cuánto.",
    voiceLines: ["Buscando qué se midió", "Contando los casos"],
    Icon: GlyphEvidencia,
    note: v("em-bg"),
    ink: v("em-ink"),
    text: v("em-text"),
    dot: v("em-dot"),
    line: v("em-line"),
    chipClass: "bg-em-bg",
  },
  {
    id: "sis",
    name: "Sistemas",
    lens: "Te pregunta cómo se conecta esto con lo demás.",
    asks: "Te pregunta cómo se conecta esto con lo demás.",
    voiceLines: ["Siguiendo el ciclo", "Uniendo los puntos"],
    Icon: GlyphSistemas,
    note: v("sis-bg"),
    ink: v("sis-ink"),
    text: v("sis-text"),
    dot: v("sis-dot"),
    line: v("sis-line"),
    chipClass: "bg-sis-bg",
  },
  {
    id: "pra",
    name: "Práctica",
    lens: "Te pregunta cómo se usaría esto en la vida real.",
    asks: "Te pregunta cómo se usaría esto en la vida real.",
    voiceLines: ["Bajándolo a tierra", "Pensando en tu lunes"],
    Icon: GlyphPractica,
    note: v("pra-bg"),
    ink: v("pra-ink"),
    text: v("pra-text"),
    dot: v("pra-dot"),
    line: v("pra-line"),
    chipClass: "bg-pra-bg",
  },
  {
    id: "cri",
    name: "Objeciones",
    lens: "Te pregunta qué podría estar mal.",
    asks: "Te pregunta qué podría estar mal.",
    voiceLines: ["Buscando el punto débil", "Leyendo como un escéptico"],
    Icon: GlyphObjeciones,
    note: v("cri-bg"),
    ink: v("cri-ink"),
    text: v("cri-text"),
    dot: v("cri-dot"),
    line: v("cri-line"),
    chipClass: "bg-cri-bg",
  },
];

export const NOTE_AUTHORS: readonly Identity[] = [TU, ...AGENTS];

/** Unknown or missing ids fall back to the writer. */
export function identityOf(id: unknown): Identity {
  return NOTE_AUTHORS.find((a) => a.id === id) ?? TU;
}
