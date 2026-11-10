# Research: Rubric, Sources and History Panels

Date: 2026-11-08. All measurements ran in a scratch directory outside the repo. Nothing was installed.

## R1. Getting text out of a PDF on the Mac

**Decision (adopted, see plan and series.md)**: macOS PDFKit, driven from Rust by running the system `/usr/bin/osascript -l JavaScript` with a fixed script on stdin and a temp file path as its only argument.

**Samples**

| File | What it is | Pages | PDFKit chars | PDFKit time |
|---|---|---|---|---|
| Book, *Activismo mediático híbrido* | Real, Spanish, 1.7 MB | 247 | 710,627 | about 1 s |
| Featherstone 2020, *Theory, Culture & Society* | Real SAGE journal article | 17 | 49,013 | under 1 s |
| Matus Pérez 2020, *Signos* | Real Spanish journal article | 8 | 22,801 | under 1 s |
| Generated two columns, header, DOI | Known ground truth | 1 | 6,563 | under 1 s |
| Generated image-only page | Stands in for a scan | 1 | 0 | under 1 s |

**Comparison on the same files**

| | PDFKit via osascript | pdf.js (`pdfjs-dist` 5.6.205 already on this Mac, legacy build) |
|---|---|---|
| Two-column order | Correct, 1 column switch in 84 markers | Correct, 1 switch |
| Featherstone first page | Header first, then section, title, author: correct | Starts with a stray `https://doi.org /`, title after the journal block |
| Scan | Empty strings per page | Empty |
| Speed on the book | About 1 s | 655 ms |
| Spacing | Clean | Extra spaces around italic runs (`the   Theory, Culture &`) |
| New dependency | None | Yes |
| Size | 0 | 40 MB unpacked in the package, 16 MB in `legacy/build` alone; all of it enters the bundle through the `../sidecar/node_modules/**/*` resource glob |
| Native parts | None | Optional `@napi-rs/canvas` |
| License and upkeep | Part of macOS | Apache-2.0, Mozilla, published 2026-11-01 (6.5.438). 6.x needs Node 22.13 or later; the app's stated floor is Node 20, so it would pin 5.x |

**Why pdf.js loses on a hard constraint, not taste.** The sidecar reads JSON lines capped at 2 MiB (`sidecar/src/sage.ts:9`). The 1.7 MB book is about 2.3 MB as base64, over the cap. The way around it is handing the sidecar a file path, which is file access in a process that runs the model, and constitution III forbids that.

**Alternatives also rejected**
- `pdf-parse` 2.4.5: wraps pdf.js and requires `@napi-rs/canvas`, a native build. Last published 2025-10.
- `unpdf` 2.1.0: MIT, 3.2 MB, but requires Node 24.
- `objc2-pdf-kit` Rust crate: same engine, adds crates and compile time for what a system binary already does.
- A compiled Swift helper: adds a build step, an `externalBin` and signing.
- `pdftotext`: Homebrew only, not on other Macs.

**Reading quality found on real articles, which drives normalization**
- Titles span lines (`Whither Globalization?\nAn Interview with\nRoland Robertson`), so field checks must ignore line breaks.
- 77 end-of-line hyphens in 17 pages and 65 in 8 pages; 18 ligature characters in Featherstone. Normalize once at ingest (see data-model).
- No NUL, carriage return or replacement characters in either article.
- Title, authors, year, journal, volume, pages and DOI all appear within the first page of both articles.
- **The year trap**: *Signos* prints 2020 in its running header and 2019 in its "Cómo citar" line and receipt dates. Code can prove a year is in the document; it cannot prove it is the right one. This is why the check runs only on the leading 12,000 characters (references with dozens of years stay out) and why every filled field stays editable.
- JXA returns `pageCount` as a string in some runs. The Rust side parses it with `Number`-style tolerance and never trusts its type.

**Not established**: the route has not been run from inside the bundled `.app`. Slice 1 gates on that. The real cases use open-access papers gathered by the implementers (series.md).

## R2. How bytes reach Rust

**Decision**: the renderer sends raw bytes; Rust never receives a path from the renderer.

Tauri 2.11.1 accepts a binary invoke body: `InvokeArgs` includes `Uint8Array` in `@tauri-apps/api/core.d.ts`, `InvokeBody::Raw(Vec<u8>)` in `tauri-2.11.1/src/ipc/mod.rs`, and `tauri::ipc::Request` is a command argument. So no base64. A command taking a path would be an arbitrary read primitive, and constitution III rules it out, including paths from Tauri's own drag events.

## R3. Dropping files on a panel

**Decision**: spec 006 owns this. Its Slice 3 creates `src/lib/fileDrop.ts`, sets `dragDropEnabled: false` and takes the built-app Finder gate. This spec only marks its zones with `data-drop-zone`.

Why the guard must cancel every file drop outside a marked zone, in capture phase: with the native handler off, a file dropped anywhere else would navigate the webview to `file://`, destroying the session, and tldraw's `onDrop` (`useCanvasEvents.ts:140`) would embed images into the board snapshot. `<input type="file">` keeps working for "Elegir archivo".

## R4. Extraction needs its own path through the sidecar

`prepareReview` (`runner.ts:33`) picks between two prompt builders, always calls `loadSagePrompt(req.sage)`, and reads `req.fuentes` for hashes. `assertReviewRequest` requires a sage. Extraction has no persona, so it gets a fixed system prompt, a fourth `case` of 006's exhaustive switch, and a validator split by type that requires `sage` for interrogate, critique and `ask`. Everything else in `runReview` (OAuth fence, no tools, `maxTurns: 1`, 120 s) is reused unchanged.

Concurrency: a review uses up to 4 and a question run up to 5. The renderer queues extraction at 2 at a time, so ten dropped PDFs do not get `BUSY`, and the sidecar cap rises to 11 so all three can run together.

## R5. Validating what the model returns

**Decision**: code checks every field against the source text; code, not the model, composes the APA string and maps weights.

The check is a substring test on a canonical form (NFKC, case folded, all whitespace collapsed) of the same leading text the model saw. `verifyEvidence` was considered. It requires the model to report exact UTF-16 offsets, which adds a failure mode and proves nothing more than "this literal text is in the document", and it breaks on titles that span lines. Same guarantee, fewer ways to fail.

## R6. Size limits are real, and PDFs make them reachable

- A single book is 710,627 characters. `critique` sends every source in full to each pass.
- The sidecar line cap is 2 MiB, so two books plus an essay fail every review with a raw sidecar error. Even under the cap, 710k characters is close to a 200k-token context on its own.
- MCP `get_document` with `includeSources` has a 16 MiB response cap (`mcp/src/client.ts:10`).
- Every autosave rewrites the whole essay JSON and every history snapshot embeds all source text.

Limits and their derivation are in data-model.md.

## R7. A live bug found while reading this path

`critique()` in `src/lib/agents/index.ts` sends `rubrica: { criterios: [...] }`. `assertReviewRequest` requires an array. Run against the built sidecar: the object form is rejected with "Invalid review rubric.", the array form is accepted. So **today every review of an essay with a rubric fails in the real app**. The E2E stub accepts the object and `rubrica.spec.ts` asserts on it, which is why nothing caught it. `prompts.ts` already expects an array. The fix, the stub and the assertion moved to 005 Slice 1, so this spec only checks that it still holds.

## R8. Links as sources

**Decision**: out for now. Fetching pages adds a network surface from the app, redirect and paywall failure modes, HTML extraction, and untrusted page content with no gain over dropping the PDF. R6.3's drop zone then reads «Suelta PDFs o archivos», with «o pega el texto» below it.
