// Product limits for reading material. Wire limits (what one request may carry) live in
// sidecar/src/review-contract.ts, which owns every one in the series; they are re-exported
// here so callers of this folder have one place to look.

export { CITATION_PREFIX_CHARS, ASSIGNMENT_MAX_CHARS, REVIEW_TEXT_BUDGET, MAX_SOURCE_CHARS } from "../../../sidecar/src/review-contract";

/** Ceiling for one PDF: it sits in webview and Rust memory during import. Text-bearing papers are far smaller; beyond this it is nearly always scans. Also enforced in Rust. */
export const MAX_PDF_BYTES = 50 * 1024 * 1024;

/** Protects against a hostile or broken file. 247 pages took about 1 s. The Rust side enforces the same bound. */
export const PDF_TIMEOUT_MS = 60_000;

/** Average non-space characters per page below which a PDF has no usable text (a scan with only page numbers). */
export const MIN_CHARS_PER_PAGE = 20;

/** About 350 pages at the measured 2,900 characters per page. Larger than the wire limit for one source: a source between the two is saved and reviewed as a prefix. */
export const MAX_INGEST_CHARS = 1_000_000;

/** Keeps get_document with sources under the 16 MiB MCP cap at the 3-byte UTF-8 worst case, and bounds the whole-file autosave. */
export const MAX_ESSAY_SOURCE_CHARS = 5_000_000;

/** Part of the sidecar's cap of 11 at once: review 4, questions 5, extract 2. */
export const EXTRACT_CONCURRENCY = 2;
