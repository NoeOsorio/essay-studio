import type { JSONContent } from "@tiptap/core";

export type EssayMode = "academico" | "blog";

/** Language the user is writing the essay in. Drives what language the
 *  council uses for questions, anotaciones and sugerencias. The persona
 *  prompts stay in Spanish (they're voice/character, not output); the
 *  model translates the disposition into the target language. */
export type EssayLanguage = "es" | "en";

export type Sage = "em" | "sis" | "pra" | "cri";

/** One round of "interrogación inicial" by a sage. */
export type Interrogatorio = {
  sage: Sage;
  /** The questions the sage produced, in order. */
  preguntas: string[];
  /** ISO 8601 timestamp. */
  generadoEn: string;
  /** Best-effort cost in USD (when reported by the SDK). */
  costoUsd?: number;
};

/**
 * Pluma Roja passes. Three default + APA (academico only).
 *  - coherencia : structure, levels of analysis, loops (SI)
 *  - estilo     : voice, register, precision (EM / PR by mode)
 *  - argumento  : steelman, assumptions, rhetoric (CR)
 *  - apa        : APA citations + references format (EM, academico only)
 */
export type Pase = "coherencia" | "estilo" | "argumento" | "apa";

export type Severidad = "alta" | "media" | "baja";

/**
 * One row of the user's rubric. Professors typically supply 3-8 of
 * these. Sages receive the rubric in their critique prompt and can
 * attribute each anotación to a specific criterio via `criterioId`.
 */
export type Criterio = {
  /** Stable UUID — referenced from anotaciones.criterioId. */
  id: string;
  nombre: string;
  /** 1-5; higher = more weight. Used by Benchmark scoring later. */
  peso: number;
  /** Free-text description: what good looks like for this criterion. */
  descripcion: string;
};

export type Rubrica = {
  criterios: Criterio[];
};

/**
 * A source the user has saved on this essay so they don't have to
 * paste it into Lectura every time. Pluma Roja injects all of them
 * automatically into the critique prompt so the sage can reason with
 * the bibliography in hand.
 *
 * Origin: typed text or a .txt/.md file the user uploaded. `cita`
 * (optional) is the formal reference (APA-style); the APA pase uses it
 * to cross-check the document against the saved references.
 */
export type Fuente = {
  /** Stable UUID. */
  id: string;
  nombre: string;
  /** APA-style reference, optional. Surfaced to the council too. */
  cita?: string;
  contenido: string;
  /** How the source was added — useful for UI hints. */
  origen: "texto" | "archivo";
  /** Original filename when `origen === "archivo"`. */
  archivoNombre?: string;
  /** ISO 8601 timestamp. */
  agregadoEn: string;
};

/**
 * Snapshot of the last time the user ran Evaluar (Pluma Roja) on this
 * essay. Lives on the essay so the Benchmark can distinguish:
 *   - "never evaluated"          → empty state, "—"
 *   - "evaluated, clean, full"   → 10/10 deserved
 *   - "evaluated, clean, partial" → capped by coverage
 *   - "evaluated, with issues"    → real score
 *   - "stale" (essay edited since) → warning indicator
 *
 * `evaluadoEn` is sync'd to `essay.updatedAt` at the moment of apply,
 * so any subsequent edit makes `updatedAt > evaluadoEn` and surfaces
 * the stale flag without false positives from the apply itself.
 */
export type EvaluacionMeta = {
  /** ISO 8601 timestamp; matches essay.updatedAt at moment of apply. */
  evaluadoEn: string;
  /** Which pasadas were active in the run that produced this meta. */
  pasadasCubiertas: Pase[];
};

/**
 * A single inline critique produced by a sage during a Pluma Roja pass.
 * The actual highlight is stored as a TipTap `annotation` mark on the
 * essay content (so it travels with the doc and re-renders for free).
 * This shape is what travels in-memory while the modal is open and is
 * passed through the dispatched apply event.
 */
export type Anotacion = {
  /** UUID for this anotación; matches the mark's `id` attr in the doc. */
  id: string;
  sage: Sage;
  pase: Pase;
  severidad: Severidad;
  /** The exact span the sage quoted (used to anchor in the doc). */
  cita: string;
  mensaje: string;
  sugerencia?: string;
  /** Optional id of the rubric criterio this annotation maps to. */
  criterioId?: string;
  /** ISO 8601 timestamp. */
  generadoEn: string;
};

/**
 * tldraw store snapshot. We store it as opaque JSON — the tldraw API
 * gives us back exactly the shape it expects in `loadSnapshot`. We
 * don't introspect it from the Rust side either.
 */
export type BoardSnapshot = unknown;

export type Essay = {
  id: string;
  title: string;
  /** TipTap JSON document. */
  content: JSONContent;
  /** Optional tldraw snapshot for the canvas pane. */
  board?: BoardSnapshot | null;
  /** Cumulative sage interrogations against this essay's text. */
  interrogatorios?: Interrogatorio[];
  /** Optional rubric — criterios that the council uses while critiquing. */
  rubrica?: Rubrica;
  /** Library of sources for this essay. Pluma Roja injects them
   *  automatically; Lectura lets you pick one as the interrogation
   *  text without re-uploading. */
  fuentes?: Fuente[];
  /** Snapshot of the last Evaluar run (timestamp + pasadas covered).
   *  Drives the Benchmark's empty / partial / stale states. */
  evaluacionMeta?: EvaluacionMeta;
  /** Language the essay is being written in. Optional for backward
   *  compatibility — when absent, defaults to "es". */
  language?: EssayLanguage;
  mode: EssayMode;
  wordCount: number;
  /** ISO 8601 timestamp. */
  createdAt: string;
  /** ISO 8601 timestamp. */
  updatedAt: string;
};

export type EssayMeta = Omit<
  Essay,
  | "content"
  | "board"
  | "interrogatorios"
  | "rubrica"
  | "fuentes"
  | "evaluacionMeta"
>;
