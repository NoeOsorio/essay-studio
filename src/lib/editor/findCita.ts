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

/**
 * The sentences of one text block as `{start, end}` offsets into `text`,
 * trailing whitespace trimmed so adjacent sentences never touch. The one
 * segmentation shared by suppression (`sentenceRange`) and by the grouping
 * of findings, so both agree on what a sentence is.
 */
export function sentenceSpans(text: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  if (text.length === 0) return out;
  const segmenter = new Intl.Segmenter(undefined, { granularity: "sentence" });
  for (const seg of segmenter.segment(text)) {
    const trimmed = seg.segment.replace(/\s+$/, "");
    out.push({ start: seg.index, end: seg.index + trimmed.length });
  }
  return out;
}

/**
 * The sentence that contains document position `pos`, as a PM range,
 * limited to its textblock (a sentence never crosses a paragraph).
 * Used to decide whether a new finding lands on a sentence the author
 * already closed. `null` when `pos` is not inside a textblock.
 */
export function sentenceRange(
  editor: Editor,
  pos: number,
): { from: number; to: number } | null {
  const doc = editor.state.doc;
  if (pos < 0 || pos > doc.content.size) return null;
  const $pos = doc.resolve(pos);
  const block = $pos.parent;
  if (!block.isTextblock) return null;
  const start = $pos.start();
  // One char per position: text is itself, any inline leaf is a single placeholder.
  const text = block.textBetween(0, block.content.size, undefined, "￼");
  if (text.length === 0) return null;
  const offset = Math.min(Math.max(pos - start, 0), text.length - 1);
  // Segments tile the text, so the sentence is the last span starting at or before the offset.
  const spans = sentenceSpans(text);
  let hit: { start: number; end: number } | null = null;
  for (const sp of spans) {
    if (sp.start <= offset) hit = sp;
    else break;
  }
  return hit ? { from: start + hit.start, to: start + hit.end } : null;
}
