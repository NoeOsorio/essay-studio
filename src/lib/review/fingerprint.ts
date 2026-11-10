// What a review read: the essay text, the rubric criteria and the sources.
// Pure and synchronous. Marks are not part of plain text, so underlining
// or closing a finding never changes the fingerprint.

import type { Fuente, Rubrica } from "@/lib/storage/types";

const BLOCK_NODES = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "bulletList",
  "orderedList",
  "listItem",
  "codeBlock",
  "horizontalRule",
]);

/** Flatten a TipTap JSON document down to plain text for the reviewers. */
export function extractPlainText(content: unknown): string {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const n = node as { type?: string; text?: string; content?: unknown[] };
    if (typeof n.text === "string") out.push(n.text);
    if (Array.isArray(n.content)) {
      for (const child of n.content) walk(child);
      // Block boundary: keep paragraphs separated in the text the reviewers get.
      if (n.type && BLOCK_NODES.has(n.type)) out.push("\n");
    }
  };
  walk(content);
  return out.join("").replace(/\n{3,}/g, "\n\n").trim();
}

/** 53-bit string hash (cyrb53). Not cryptographic; only compares two states. */
function hash(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// A source's part is cached on the object, so neither a render nor a save
// re-hashes text that did not change.
const sourceParts = new WeakMap<Fuente, string>();

function sourcePart(f: Fuente): string {
  const hit = sourceParts.get(f);
  if (hit !== undefined) return hit;
  const part = hash(JSON.stringify([f.id, f.nombre, f.cita ?? null, f.contenido]));
  sourceParts.set(f, part);
  return part;
}

/** Sync hash of [plain text, rubric criteria, sources as the reviewers receive them]. */
export function reviewFingerprint(args: {
  content: unknown;
  rubrica?: Rubrica;
  fuentes?: Fuente[];
}): string {
  const text = hash(extractPlainText(args.content));
  const criterios = hash(JSON.stringify(args.rubrica?.criterios ?? []));
  const sources = (args.fuentes ?? []).map(sourcePart).join(",");
  return hash(`${text}|${criterios}|${sources}`);
}
