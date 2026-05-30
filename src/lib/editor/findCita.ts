// Resolve a literal quote (`cita`) coming from a Pluma Roja sage to a
// `{from, to}` range in a TipTap / ProseMirror document.
//
// Strategy: walk text nodes left-to-right, build a normalized "flat"
// string with a parallel array that maps each char back to its PM
// position. Then do a normalized indexOf and translate.
//
// "Normalized" = whitespace collapsed to single spaces. This makes the
// match resilient to model output that uses extra spaces, NBSPs, or
// soft line wraps that don't exist in the source.

import type { Editor } from "@tiptap/core";

type FlatChar = {
  /** PM position of this character. */
  pos: number;
};

type Flat = {
  text: string; // normalized text
  map: FlatChar[]; // text[i] came from doc pos map[i].pos (start of the char)
};

function isWS(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === " ";
}

/** Build a normalized flat string with a position map for the doc. */
function flatten(editor: Editor): Flat {
  const text: string[] = [];
  const map: FlatChar[] = [];
  let prevWasSpace = true; // collapses leading whitespace too

  editor.state.doc.descendants((node, pos) => {
    if (node.isText) {
      const raw = node.text ?? "";
      for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (isWS(ch)) {
          if (!prevWasSpace) {
            text.push(" ");
            map.push({ pos: pos + i });
            prevWasSpace = true;
          }
        } else {
          text.push(ch);
          map.push({ pos: pos + i });
          prevWasSpace = false;
        }
      }
      return false; // don't descend into text
    }
    // For block nodes, inject a single space at the boundary so that
    // adjacent paragraphs don't run their text together but a span
    // that crosses paragraphs still indexes cleanly.
    if (node.isBlock && !prevWasSpace) {
      text.push(" ");
      map.push({ pos });
      prevWasSpace = true;
    }
    return true;
  });

  return { text: text.join(""), map };
}

/** Same whitespace-collapse on the query side. */
function normalizeQuery(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Find the first occurrence of `cita` in the editor and return its PM
 * positions, or `null` if not found. `skip` lets the caller advance
 * past already-claimed matches when two anotaciones share the same
 * cita.
 */
export function findCitaRange(
  editor: Editor,
  cita: string,
  skip = 0,
): { from: number; to: number } | null {
  const flat = flatten(editor);
  const query = normalizeQuery(cita);
  if (query.length === 0) return null;

  let from = 0;
  let found = -1;
  for (let n = 0; n <= skip; n++) {
    found = flat.text.indexOf(query, from);
    if (found < 0) return null;
    from = found + 1;
  }
  if (found < 0) return null;

  const startChar = flat.map[found];
  const endChar = flat.map[found + query.length - 1];
  if (!startChar || !endChar) return null;
  // `endChar.pos` is the start of the last matched char; add 1 to get
  // its end. PM positions are exclusive on the right of a text range.
  return { from: startChar.pos, to: endChar.pos + 1 };
}
