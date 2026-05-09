import type { JSONContent } from "@tiptap/core";

export type EssayMode = "academico" | "blog";

export type Essay = {
  id: string;
  title: string;
  /** TipTap JSON document. */
  content: JSONContent;
  mode: EssayMode;
  wordCount: number;
  /** ISO 8601 timestamp. */
  createdAt: string;
  /** ISO 8601 timestamp. */
  updatedAt: string;
};

export type EssayMeta = Omit<Essay, "content">;
