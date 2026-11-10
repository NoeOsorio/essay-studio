# Implementation Plan: Rubric, Sources and History Panels

**Branch**: `004-stationery-redesign` (one branch for the series 004 to 008, see [series.md](../004-stationery-shell/series.md); delivered after 004 to 007) | **Date**: 2026-11-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-material-panels/spec.md`

## Summary

Rúbrica, Fuentes and Historial become quiet panels opened from Más (R6.1 to R6.4, R6.6). A dropped PDF or pasted assignment fills itself in: text is extracted on the Mac with the system's own PDF engine, a new sidecar `extract` request proposes criteria or citation fields, and code checks every field against the source before anything is shown. No new dependency is needed on the recommended route.

### Root cause

The panels are tedious because the app has no way to read material and no way to ask the AI for anything except a persona's interrogation or critique. So every field is a form field, and a form per item is what produces «un cuadro, dentro de otro cuadro». Files stop at `.txt`/`.md` because no PDF path exists, and citation data is typed by hand because no structured request exists. This plan adds those two missing capabilities at their proper boundaries (text extraction in Rust, structured extraction in the sidecar) and then lets the panels be simple lists, because the fields no longer need a form. Reading the path also exposed that PDFs make existing limits reachable (research R6), which is fixed here because the feature does not work without it. It also found a live bug that makes every review with a rubric fail (research R7), which is repaired earlier, in 005 Slice 1.

### Smallest root fix

Two capabilities, one request type, three panels, additive optional fields. The storage format, the store's overlay model and the history engine stay as they are.

### Separate proposal, not in this plan

Store source bodies outside the essay JSON, content-addressed (`<id>.sources/<sha256>.txt`), with snapshots holding only hashes, and let a review retrieve relevant passages instead of sending whole sources. That removes the snapshot and autosave cost in data-model.md and lifts the per-essay text limit. It touches storage, history, restore, MCP and review, roughly the size of this whole spec, with migration risk to saved essays. Worth doing only if Noe actually reaches the limits.

## Technical Context

**Language/Version**: TypeScript 5 strict, Rust 2021, Node 20+ sidecar, JavaScript for Automation for one fixed script

**Primary Dependencies**: existing only: Tauri 2.11, Next 16, React 19, TipTap 3, Agent SDK 0.2.141. macOS PDFKit via `/usr/bin/osascript`. Uses the series pieces from spec 004 (`Panel`, `Popover`, `Tooltip`, `overlayInstant`, motion tokens)

**Storage**: essay JSON through existing Rust commands, additive fields only

**Testing**: real desktop app, plus existing Playwright specs with selector and stub updates. No new tests

**Target Platform**: macOS desktop

**Project Type**: desktop app with Rust backend and Node sidecar

**Performance Goals**: search narrows within one frame at 1000 sources; 250-page PDF text in about 1 s; panels open under 320 ms

**Constraints**: 2 MiB sidecar line, 16 MiB MCP response, 11 concurrent sidecar runs (raised here from 006's 9), OAuth only, no tools for the model

**Scale/Scope**: 1000 sources and 1000 versions in the lists, with text limits stated in data-model.md

## Constitution Check

*Pre-design and post-design results are the same; design added no violations.*

| Principle | Pre | Post | How |
|---|---|---|---|
| I. Work is never lost | Pass | Pass | Material saved before AI runs. AI fills only empty fields. Confirmed rubric replacement saves a version first. Restore keeps its safety version. Preview never touches `current`. Source removal offers undo |
| II. Reuse | Pass | Pass | Existing JSON storage, runner, event bridge, history engine, store openers, 004 panel primitive. Read-only TipTap for preview. No parallel system |
| III. Boundaries in code | Pass | Pass | No path from the renderer ever. Fixed script, absolute binary. Every field validated in code. Limits enforced in Rust and `assertReviewRequest`. Model has no tools |
| IV. Stationery desk | Pass with slice 0 | Pass with slice 0 | States Paper does not draw are designed first. No numbering, counters, X rows, accent bars, word counts. 12 px floor |
| V. Done means Noe can use it | Pass | Pass | Quickstart in the real app, independent reviewers, Noe approves this plan first |

## Project Structure

### Documentation (this feature)

```text
specs/008-material-panels/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── pdf-text-command.md
│   └── sidecar-extract.md
└── tasks.md             # next phase
```

### Source Code (repository root)

```text
src-tauri/src/pdf_text.rs, pdf_extract.js   (new)
sidecar/src/extract-prompts.ts, extract-parser.ts   (new)
src/lib/materials/   (new: limits, pdf, normalize, apa, import, review-budget)
src/components/panels/   (new: RubricPanel, SourcesPanel, HistoryPanel, HistoryPreview)
```

**Structure Decision**: the existing Tauri, sidecar and renderer layout. The three modal files under `src/components/lectura/` are replaced and deleted.

## Invariants

| Must not break | How it is kept |
|---|---|
| Saved essays open unchanged | All new fields optional; Rust keeps them opaque; panels handle absence. Opened and verified with a pre-change test essay |
| Persisted ids and values | `Criterio`, `Fuente`, snapshot kinds, `em/sis/pra/cri/tu`, pase values, note kinds, mark attributes untouched. `critique`'s contract array form is what the sidecar has always accepted |
| Testids | Kept on equivalent elements: `rubrica-overlay`, `fuentes-overlay`, `history-overlay`, `criterio-*`, `fuente-*`, `fuentes-file-input`, `history-preview-text`, `history-snapshot-now` |
| Store and menu surface | `overlay` values and `openRubrica/openFuentes/openHistory` stay, so the bridge, 005's stamp surfaces and Más keep working. An optional `{ instant: true }` argument is read strictly, because a surface can pass an opener directly as a click handler |
| Live editor is authoritative | Preview is a separate read-only surface over the sheet. EditorPane stays mounted and registered for MCP. Restore keeps going through `restoreVersion` |
| Autosave and history | Panels use the existing store actions and flush on close. Extraction writes through `updateFuente`, so it follows the same save path. Reading state is never persisted |
| Live document tools (MCP) | No new tool. Read-only preview instance is never registered with `getDocumentEditor`. `get_document` gains optional fields, and the essay text limit keeps it under its 16 MiB cap |
| Undo | Panels are outside TipTap and tldraw history, as today. Preview does not touch either. Rubric replacement recoverable from Historial; source removal has its own undo |
| Reviews keep working | `REVIEW_TEXT_BUDGET` guarantees a request under the IPC cap, applied inside `critique()`. Evidence offsets stay valid because cuts are prefixes |
| Drops stay harmless | 006's guard in `src/lib/fileDrop.ts` cancels file drops outside marked zones; this spec only marks its zones with `data-drop-zone`; board and sheet behave as today |
| Prompt injection | Same data fence as `renderFuentes`; no tools; every value validated; nothing from a document can trigger an action |

## Files by layer

### Rust

| File | Change |
|---|---|
| `src-tauri/src/pdf_text.rs` (new) | `pdf_extract_text`, per contract |
| `src-tauri/src/pdf_extract.js` (new) | The fixed PDFKit script, embedded by `include_str!` |
| `src-tauri/src/sidecar.rs` | `ExtractRequest`, `sage_extract` with task validation |
| `src-tauri/src/lib.rs` | Module and two commands registered |

`storage.rs`, `history.rs`, `menu.rs` unchanged. App commands need no new capability entry.

### Sidecar

| File | Change |
|---|---|
| `sidecar/src/review-contract.ts` | `ExtractRequest` in the union. `assertReviewRequest` split by type, `sage` required for interrogate, critique and `ask`, failures raised as 006's `ReviewRequestError` codes. `CITATION_PREFIX_CHARS`, `ASSIGNMENT_MAX_CHARS` and `REVIEW_TEXT_BUDGET` added beside 006's wire limits. `Fuente.recortada?` |
| `sidecar/src/runner.ts` | `extract` is a fourth `case` of 006's exhaustive switch in `prepareReview`: fixed system prompt, no `loadSagePrompt`, empty `sourceHashes` |
| `sidecar/src/extract-prompts.ts` (new) | The two fixed prompts with the data fence |
| `sidecar/src/extract-parser.ts` (new) | Pure validation, per contract |
| `sidecar/src/prompts.ts` | `renderFuentes` passes `recortada`. Remove the middle dot in `renderRubrica`. This changes `promptHash`; earlier benchmark baselines are no longer comparable by hash, which only matters if that pilot resumes |
| `sidecar/src/model-profiles.ts` | Remove the middle dot from labels |
| `sidecar/src/eval/*` | Only if widening the union breaks `.sage` access at compile time: narrow to critique |

`sidecar/src/sage.ts`: raise `MAX_CONCURRENT_REVIEWS` from 006's 9 to 11 (review 4, questions 5, extract 2) and update the sum comment beside it.

### Shared

`shared/mcp.ts` unchanged.

### Renderer

| File | Change |
|---|---|
| `src/lib/storage/types.ts` | Optional fields, `Rubrica.consigna` |
| `src/lib/agents/index.ts` | Add `extract()`. Apply the budget in `critique()` only, returning omissions |
| `src/lib/materials/limits.ts` (new) | Product limits only, each with its reason. Wire limits are imported from `sidecar/src/review-contract.ts` |
| `src/lib/materials/pdf.ts` (new) | Calls the command, normalizes, applies the no-text and size rules |
| `src/lib/materials/normalize.ts` (new) | Ingest normalization |
| `src/lib/materials/apa.ts` (new) | Short citation, full reference, what is missing |
| `src/lib/materials/import.ts` (new) | Queue at concurrency 2, duplicates, apply rules from data-model. Replaces the file handling in 006's `source.ts` |
| `src/lib/materials/review-budget.ts` (new) | Source fitting |
| `src/lib/store.ts` | `lecturas`, confirmed rubric replacement, `reviewOutcome.fuentesOmitidas`. `overlayInstant` comes from 004. `updateRubrica` keeps `consigna`. `removeFuente` undo. Essay id guard on applied results |
| `src/lib/menu/bridge.ts` | Passes `{ instant: true }` for the three panels, since a menu shortcut must not animate |
| `src/app/page.tsx` | Swap the three overlays for the panels |
| `src/components/panels/RubricPanel.tsx` (new) | R6.1 and R6.2, plus reading, proposal-confirm and no-criteria states, on 004's `Panel`. The zone carries `data-drop-zone`. Name and description editable in place, 5 dots as a radio group, row menu |
| `src/components/panels/SourcesPanel.tsx` (new) | R6.3, on 004's `Panel`. The zone carries `data-drop-zone`. Fixed-height windowed list and search over title, authors and reference. Row hover copy, one menu. Open view is the editable fields plus extracted text, in the app; no PDF bytes are stored, so «abrir» means this view |
| `src/components/panels/HistoryPanel.tsx` (new) | R6.4. Windowed times list, «La guardaste tú» for `manual`, `data-kind` on each row, «Guardar esta versión» |
| `src/components/panels/HistoryPreview.tsx` (new), `src/components/editor/EditorPane.tsx` | Read-only TipTap over the sheet with the same extensions, floating bar with one primary action. Flush before showing. Replaces the flat text from session 12 because R6.4 draws the real sheet |
| `src/components/lectura/{Rubrica,Fuentes,History}Overlay.tsx` | Deleted |
| 006's `SourcePicker` and `src/lib/questions/source.ts` | Upload goes through `materials/import`, removing the «PDF / Word soon» alert. The picker's zone already carries `data-drop-zone` |
| 005's `FindingEvidence` | A removed source shows 005's «Ya no está en tus fuentes», never a raw id. Accent bar and small text fixed if 005 left them |
| The review surface from 005 | One quiet line when sources were left out |
| `src/app/globals.css` | R6.6 keyframes through the motion tokens from 004, under reduced motion |
| `src/components/ui/WindowedList.tsx` (new) | Built here for the sources and versions lists. 007's windowing stays inside `Ledger` unless 007 reuses it |
| Repo-wide sweep | Whatever remains for the four series rules, last slice |

### E2E (selectors, assertions and stubs only; no new tests)

| File | Update |
|---|---|
| `tests/e2e/setup.ts` | Stubs for `pdf_extract_text` and `sage_extract` |
| `fuentes.spec.ts` (7) | Add flow goes through paste and the open view, where `fuente-nombre`, `fuente-cita`, `fuente-contenido` still live. Close selector follows the panel primitive. Counter assertions removed. `fuente-remove` goes through the row menu. The Lectura tests follow 006's picker |
| `rubrica.spec.ts` (7) | «Prefiero escribir» precedes `rubrica-add`. Weight changes from `selectOption("5")` to clicking the fifth dot, an interaction change, not only a selector. Remove counter assertion. Removal through the row menu |
| `history.spec.ts` (5) | `toContainText("manual")` becomes «La guardaste tú». «al cerrar» becomes `data-kind="close"`. Restore is one action, so `history-restore-ask` then confirm becomes one click on `history-restore-confirm` |
| `sage.spec.ts`, `selectors.spec.ts`, `menu.spec.ts` | Only where they open these panels |

### Docs

`README.md` (PDF support, what leaves the Mac), `CLAUDE.md` session notes, `specs/008-material-panels/` tasks.

## Channels

Only two exist.

- **Mac desktop app**: everything above.
- **MCP**: no new tools, none removed. `get_document` returns the new optional source and rubric fields when asked. Writes to sources and rubric are not offered today, and that stays.

## Safety

- **Data writes**: only the current essay's JSON through existing commands. A temp PDF in the app cache, mode 0600, deleted after reading, leftovers swept.
- **New permissions**: none. No plugin, no capability change. Runs one system binary with a fixed script.
- **What leaves the Mac**: PDF text extraction is local. For a source, the first 12,000 characters go to the model; for an assignment, up to 80,000; full source text goes in reviews, as today.
- **Costs**: no new key and no extra spend beyond the monthly credit. Each dropped source or assignment is one model call. **Approving this plan also approves real model runs for verification**, about 16 calls plus a few reviews with a rubric. The earlier 2026-11-07 approval was explicitly for implementation without model runs, so it does not cover this.
- **Destructive actions**: replacing a rubric requires confirmation and saves a version first. Removing a source has undo. Restore keeps its safety version.

## New dependencies

None on the recommended route. pdf.js was the rejected alternative, see Decisions adopted.

## Delivery slices

Each works end to end before the next.

**Slice 0, design in Paper first.** Noe approves before code. One Paper pass for the whole series; the deduplicated list in [series.md](../004-stationery-shell/series.md) wins over this one. Not drawn today: rubric reading state in the panel if R6.6 is not enough, proposal confirmation over an existing rubric, no criteria found, source row menu, open source view, search with no results, scan or no text, password-protected, too large, text limit reached, duplicate offer, AI unavailable with retry, source removed with undo, review line for left-out sources, «Leí solo el inicio» for long assignments, empty history. R6.3's drop zone copy loses «o enlaces».

**Slice 1, reading material.** `pdf_extract_text`, normalization, limits, store foundation (`lecturas`, types), and `sage_extract` with its parser and stubs. **Gate**: a PDF yields text from the built `.app` launched with `open --env ESSAY_STUDIO_DATA_DIR=<scratch>` (series.md). The drop gate itself belongs to 006 Slice 3. If this fails, stop and rethink before building panels.

**Slice 2, rubric panel.** R6.1, R6.2, R6.6, every state from slice 0.

**Slice 3, sources panel.** R6.3, queue, apply rules, `WindowedList`, search, review budget.

**Slice 4, history panel.** R6.4, preview on the sheet.

**Slice 5, close.** Panels confirmed from Más (each was swapped into `page.tsx` when its slice merged), modals deleted, repo-wide sweep, quickstart in the real app, independent reviewers, evidence to Noe.

## Verification end to end

Full list in [quickstart.md](./quickstart.md).

- **Real cases, in the desktop app**: a public assignment pasted and as PDF, an open-access paper, a class note, restoring a version, a real review with a rubric.
- **Screens**: each compared side by side with R6.1, R6.2, R6.3, R6.4 and R6.6, at 1440 by 900.
- **How**: `npm run tauri:dev` driven by hand and through computer use for the drop gate, since Playwright cannot prove native file drops. Final pass on the built `.app` from Finder.
- **SC-002 and SC-003**: 5 public course assignments and 10 open-access papers, gathered by the implementers (series.md), scored by hand against the originals.
- **Scale**: 1000 generated sources and versions.
- **Mechanical**: existing E2E, Rust tests, lint, typecheck, build, and the greps in quickstart. By the end of this spec the whole repo passes the four series rules.
- **Not yet seen working**: the PDF route inside the bundled app, real model extraction quality, the token estimate behind the review budget. Research ran PDFKit from a terminal on real files; no model call has been made.

## Execution

Implemented by Sonnet subagents following `tasks.md`, with Opus reviewing every diff against this plan and constitution.

- Slice 1 is non-visual and may run alongside slice 0 (series.md, Coordinator rulings), except the R6.6 keyframes, which wait for it. Slice 1 owns `store.ts`, `types.ts` and the shared `materials/` modules, so later slices do not edit them except by request to the reviewer.
- Slices 2, 3 and 4 run in parallel on disjoint files (one panel component each, plus `materials/review-budget.ts` and `WindowedList.tsx` for slice 3 and `EditorPane.tsx` for slice 4). `WindowedList.tsx` is built first in slice 3, then used by slice 4. The reviewer applies the single-line swaps in `page.tsx` when merging, and E2E updates go per spec file with each slice.
- Slice 5 is one owner for the whole result.

## Decisions adopted (2026-11-08, see series.md, Decisions taken)

1. **How to read PDFs.** Adopted: **the Mac's own PDF engine, with no new dependency**. It handled the book and both real articles, and read article pages in a better order than the alternative. The alternative, `pdfjs-dist` (Apache-2.0, well maintained), adds 40 MB to the app and has to work around the 2 MiB message limit by giving the sidecar file access, which the constitution forbids. The repo rule says to ask before adding one; this decision adds none.

**Decided: links as sources stay out.** Fetching pages adds network access and new ways to fail, and dropping the PDF already covers the need. R6.3's zone reads «Suelta PDFs o archivos», «o pega el texto», and the Paper artboard is updated in slice 0.

## Complexity Tracking

No constitution violations to justify.
