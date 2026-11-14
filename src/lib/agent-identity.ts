// The only definition of who the agents are. Any label map keyed by agent id
// elsewhere in the renderer is a defect. Colors live once, in globals.css;
// this file refers to them by CSS variable.

import type { ComponentType } from "react";
import type {
  AgentColorKey,
  AgentIconKey,
  CustomAgent,
  CustomAgentId,
} from "@/lib/storage/types";
import {
  GlyphChispa,
  GlyphCita,
  GlyphEvidencia,
  GlyphLibro,
  GlyphLista,
  GlyphOrtografia,
  GlyphPluma,
  GlyphObjeciones,
  GlyphPractica,
  GlyphSistemas,
  GlyphTu,
} from "@/components/ui/icons";

export type AgentId = "em" | "sis" | "pra" | "cri";
export type AuthorId = AgentId | "tu" | CustomAgentId;

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

/** What the screens say about one built-in agent in Ajustes. Fixed copy, never the prompt. */
export type AgentExample = {
  sentence: string;
  /** A substring of `sentence`, the words the agent underlines. */
  marked: string;
  comment: string;
  /** Only agents that paste text have one. */
  replacement?: string;
};
export type AgentCopy = {
  description: string;
  examples: readonly [AgentExample, AgentExample];
  whenItRuns: string;
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

export const AGENT_COPY: Record<AgentId, AgentCopy> = {
  em: {
    description:
      "Busca lo que afirmas sin respaldo. Te pide el dato, el estudio o la fuente que sostiene cada idea, y revisa que tus citas sigan el formato APA.",
    examples: [
      {
        sentence: "Todos sabemos que la transparencia mejora la confianza en los equipos.",
        marked: "Todos sabemos que la transparencia mejora la confianza",
        comment:
          "«Todos sabemos» no es evidencia. ¿Qué estudio lo muestra y en qué tipo de equipos?",
      },
      {
        sentence: "Los equipos que admiten errores aprenden más rápido (Edmondson 1999).",
        marked: "(Edmondson 1999)",
        comment: "Falta la coma entre el autor y el año.",
        replacement: "(Edmondson, 1999)",
      },
    ],
    whenItRuns: "Revisa tus ensayos académicos y te hace preguntas sobre tus fuentes.",
  },
  sis: {
    description:
      "Mira cómo se sostienen tus ideas entre sí. Marca saltos, contradicciones y conclusiones que no salen de lo anterior.",
    examples: [
      {
        sentence: "El liderazgo del director determina la cultura de toda la empresa.",
        marked: "determina la cultura de toda la empresa",
        comment:
          "Le atribuyes a una persona lo que también sostienen los incentivos y las reglas. ¿Qué más mantiene esa cultura?",
      },
      {
        sentence: "Las ventas cayeron este año. Por eso conviene contratar más gente.",
        marked: "Por eso conviene contratar más gente",
        comment: "La conclusión no sale de lo anterior. Falta explicar cómo contratar cambiaría las ventas.",
      },
    ],
    whenItRuns:
      "Revisa que tus ideas se conecten en cualquier ensayo y te hace preguntas sobre tus fuentes.",
  },
  pra: {
    description:
      "Cuida que el texto se lea claro y que se pueda usar. Marca la jerga vacía y las frases que no dicen nada concreto.",
    examples: [
      {
        sentence: "Es fundamental potenciar la sinergia del equipo.",
        marked: "potenciar la sinergia del equipo",
        comment: "Es una frase comodín. Di qué haría alguien el lunes por la mañana.",
      },
      {
        sentence: "Se observa que el equipo respondió de manera efectiva.",
        marked: "Se observa que",
        comment: "La voz pasiva esconde quién observó. Di quién lo vio y qué midió.",
      },
    ],
    whenItRuns:
      "Entra en tus posts de blog, revisa que se lean claros y te hace preguntas sobre tus fuentes.",
  },
  cri: {
    description:
      "Pone a prueba tus argumentos. Busca supuestos sin examinar y objeciones que todavía no respondes.",
    examples: [
      {
        sentence: "Cualquier empresa que escuche a sus empleados será más innovadora.",
        marked: "Cualquier empresa",
        comment: "Es una generalización fuerte. ¿Hay casos donde escuchar no cambió nada?",
      },
      {
        sentence: "Está claro que la transparencia siempre mejora la confianza.",
        marked: "siempre",
        comment: "Un solo contraejemplo lo tumba. ¿Cuándo la transparencia solo expone conflictos?",
      },
    ],
    whenItRuns:
      "Revisa tus argumentos en cualquier ensayo y te hace preguntas sobre tus fuentes.",
  },
};

/** Fill and ink pairs of the six colors a custom agent can have. */
export const AGENT_COLORS: Record<
  AgentColorKey,
  { fill: string; ink: string; dot: string; chipClass: string }
> = {
  rosa: { fill: "#FFC9D6", ink: "#8A2846", dot: "#E0567A", chipClass: "bg-[#FFC9D6]" },
  durazno: { fill: "#FFD3B5", ink: "#8A3D12", dot: "#E07A3A", chipClass: "bg-[#FFD3B5]" },
  lima: { fill: "#DDEFB0", ink: "#4A5E12", dot: "#7FA82A", chipClass: "bg-[#DDEFB0]" },
  cielo: { fill: "#C3E8F5", ink: "#11536B", dot: "#2E9AC4", chipClass: "bg-[#C3E8F5]" },
  arena: { fill: "#EADFC8", ink: "#5E4A22", dot: "#B0915A", chipClass: "bg-[#EADFC8]" },
  gris: { fill: "#E2E2DE", ink: "#45453F", dot: "#8A8A82", chipClass: "bg-[#E2E2DE]" },
};

export const AGENT_COLOR_KEYS: readonly AgentColorKey[] = [
  "rosa",
  "durazno",
  "lima",
  "cielo",
  "arena",
  "gris",
];

export const AGENT_ICONS: Record<AgentIconKey, ComponentType<{ size?: number }>> = {
  ortografia: GlyphOrtografia,
  pluma: GlyphPluma,
  libro: GlyphLibro,
  cita: GlyphCita,
  lista: GlyphLista,
  chispa: GlyphChispa,
};

export const AGENT_ICON_KEYS: readonly AgentIconKey[] = [
  "ortografia",
  "pluma",
  "libro",
  "cita",
  "lista",
  "chispa",
];

// The store pushes its loaded agents here, so this module never imports the
// store (the store imports files that import this one).
let loadedAgents: readonly CustomAgent[] = [];
export function setLoadedAgents(agents: readonly CustomAgent[]): void {
  loadedAgents = agents;
}

function customIdentity(
  id: CustomAgentId,
  name: string,
  color: AgentColorKey,
  icon: AgentIconKey,
): Identity {
  const c = AGENT_COLORS[color];
  return {
    id,
    name,
    lens: "Revisa tu ensayo con lo que le pediste.",
    asks: "Te pregunta lo que le pediste.",
    voiceLines: ["Leyendo con tu foco"],
    Icon: AGENT_ICONS[icon],
    note: c.fill,
    ink: c.ink,
    text: v("ink-1"),
    dot: c.dot,
    line: c.dot,
    chipClass: c.chipClass,
  };
}

const isColorKey = (k: unknown): k is AgentColorKey =>
  typeof k === "string" && k in AGENT_COLORS;

/** What a saved record remembers about the agent that wrote it. */
export type AgentRecordHint = { agentName?: string; agentColor?: AgentColorKey };

/**
 * Built-ins resolve as always. A custom id resolves from the loaded agents;
 * a deleted one falls back to the name and color saved on the record, then to
 * «Agente» in gris. Anything else falls back to the writer.
 */
export function identityOf(id: unknown, record?: AgentRecordHint): Identity {
  const builtin = NOTE_AUTHORS.find((a) => a.id === id);
  if (builtin) return builtin;
  if (typeof id === "string" && id.startsWith("c_")) {
    const known = loadedAgents.find((a) => a.id === id);
    if (known) return customIdentity(known.id, known.name, known.color, known.icon);
    return customIdentity(
      id as CustomAgentId,
      record?.agentName?.trim() || "Agente",
      isColorKey(record?.agentColor) ? record.agentColor : "gris",
      "chispa",
    );
  }
  return TU;
}
