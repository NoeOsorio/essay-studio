import type { JSONContent } from "@tiptap/core";

export type EssayMode = "academico" | "blog";

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
  mode: EssayMode;
  wordCount: number;
  /** ISO 8601 timestamp. */
  createdAt: string;
  /** ISO 8601 timestamp. */
  updatedAt: string;
};

export type EssayMeta = Omit<Essay, "content" | "board" | "interrogatorios">;
