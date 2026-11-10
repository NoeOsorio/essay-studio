// Reads one PDF through the Mac's own PDF engine (the Rust command `pdf_extract_text`).
// The bytes go as a raw body; there is no path parameter and no file access for the renderer.

import { invoke } from "@tauri-apps/api/core";
import { MAX_INGEST_CHARS, MAX_PDF_BYTES, MIN_CHARS_PER_PAGE } from "./limits";
import { normalizePdfPages } from "./normalize";

type PdfTextResult =
  | { status: "ok"; pages: number; text: string[] }
  | { status: "no_text"; pages: number }
  | { status: "locked" }
  | { status: "unreadable" }
  | { status: "too_large" };

export type PdfReadResult =
  | { status: "ok"; text: string; pages: number }
  /** A scan, or a file whose text is only page numbers. */
  | { status: "no_text" }
  | { status: "locked" }
  | { status: "unreadable" }
  | { status: "too_large" }
  /** More text than a source may hold (MAX_INGEST_CHARS). */
  | { status: "text_limit" };

const nonSpace = (value: string) => value.replace(/\s/g, "").length;

export async function readPdf(bytes: ArrayBuffer | Uint8Array): Promise<PdfReadResult> {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (data.byteLength > MAX_PDF_BYTES) return { status: "too_large" };
  let raw: PdfTextResult;
  try {
    raw = await invoke<PdfTextResult>("pdf_extract_text", new Uint8Array(data));
  } catch {
    return { status: "unreadable" };
  }
  if (raw.status !== "ok") return raw.status === "no_text" ? { status: "no_text" } : { status: raw.status };
  const pages = Math.max(1, raw.pages);
  const chars = raw.text.reduce((sum, page) => sum + nonSpace(page), 0);
  if (chars / pages < MIN_CHARS_PER_PAGE) return { status: "no_text" };
  const text = normalizePdfPages(raw.text);
  if (text.length > MAX_INGEST_CHARS) return { status: "text_limit" };
  return { status: "ok", text, pages };
}
