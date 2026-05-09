import type { JSONContent } from "@tiptap/core";

export type EssayMode = "academico" | "blog";

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
  mode: EssayMode;
  wordCount: number;
  /** ISO 8601 timestamp. */
  createdAt: string;
  /** ISO 8601 timestamp. */
  updatedAt: string;
};

export type EssayMeta = Omit<Essay, "content" | "board">;
