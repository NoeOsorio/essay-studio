---
description: "Task list for the rubric, sources and history panels"
---

# Tasks: Rubric, Sources and History Panels

**Input**: `specs/008-material-panels/` (plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md) and [series.md](../004-stationery-shell/series.md), which wins where it differs from a plan.

**Prerequisites**: Specs 004 to 007 delivered. **Slice 0 is the shared Paper pass in series.md, done elsewhere.** It is not repeated here.

**Tests**: No test-writing tasks. E2E work is only the listed stub, selector and assertion updates.

## Conventions

- **Phases are the plan's slices.** `[USn]` links a task to its spec story. Slice 1 is foundation and Slice 5 is cross-cutting.
- **Gate tag on every task.** `Gate: Slice 0` means no start until Noe approved the Slice 0 pass. `No Paper gate` means non-visual and free to start once its dependencies are done (series.md, Coordinator rulings).
- **Paper file**: `01M6VXNCR0ZBA410S026XSG7JT`. Every visual task names its artboard. Read exact values with `get_jsx` and `get_computed_styles`, never from screenshots.
- **`[P]`** only where files are disjoint and no incomplete task is a dependency.
- **Do not rebuild shared pieces.** From 004: `Panel`, `Popover`, `Tooltip`, `overlayInstant`, motion tokens. From 005: the rubric repair, `FindingEvidence`, the review surface. From 006: `fileDrop.ts` and the Finder drop gate (this spec only marks zones with `data-drop-zone`), `review-contract.ts` as owner of every wire limit, `ReviewRequestError`, the exhaustive request switch.
- **Decisions adopted** (series.md): PDFs are read with the Mac's PDFKit, no new dependency; links as sources stay out and R6.3's zone has no «o enlaces»; real model calls for verification are approved, about 16 plus a few reviews with a rubric.
- **Verification material** is gathered by the implementers: open-access papers and public course assignments, kept in the session scratchpad, never files from his computer. Every run sets `ESSAY_STUDIO_DATA_DIR` to a scratch directory.

---

## Phase 1: Slice 1, reading material

**Goal**: The two missing capabilities at their boundaries. Non-visual, so it may run alongside the Slice 0 pass, except T016.

**Slice check and gate**: a PDF yields text from the built `.app` launched with `open --env ESSAY_STUDIO_DATA_DIR=<scratch>` (series.md) (T015). If it fails, stop and rethink before building panels.

- [x] T001 [P] Create `src-tauri/src/pdf_text.rs` and `src-tauri/src/pdf_extract.js` per contracts/pdf-text-command.md: raw body only, no path parameter; reject over `MAX_PDF_BYTES` (50 MiB) before writing; `%PDF-` header within the first 1024 bytes; temp file at `<app cache>/pdf-import/<uuid>.pdf`, created exclusively with mode 0600, deleted on every exit path, leftovers older than one hour removed on each call; run `/usr/bin/osascript -l JavaScript - <temp path>` with the script from `include_str!` on stdin, `kill_on_drop`, 60 s timeout, stdout bound 16 MiB, stderr discarded; responses `ok`, `no_text`, `locked`, `unreadable`, `too_large`; `pageCount` parsed with tolerance because JXA can return a string; never logs names or text; non-macOS returns `unreadable`. Register in `src-tauri/src/lib.rs`. No Paper gate. Done: `cargo test` in `src-tauri` passes; from `tauri:dev`, a real paper returns one string per page.
- [x] T002 Add `ExtractRequest` and `sage_extract(id, task, text, reviewerProfile?)` with task validation to `src-tauri/src/sidecar.rs`, and register it in `src-tauri/src/lib.rs` (after T001). No Paper gate. Done: `cargo test` passes.
- [x] T003 [P] Update `sidecar/src/review-contract.ts`: `ExtractRequest` in the union; `assertReviewRequest` split by type with `sage` required for interrogate, critique and `ask`, failures raised as 006's `ReviewRequestError` codes; add `CITATION_PREFIX_CHARS = 12_000`, `ASSIGNMENT_MAX_CHARS = 80_000`, `REVIEW_TEXT_BUDGET = 400_000` beside 006's limits, each with its reason; `Fuente.recortada?`. No Paper gate. Done: `npm run sidecar:build` passes; if widening the union breaks `.sage` access in `sidecar/src/eval/*`, narrow to critique there.
- [x] T004 [P] Create `sidecar/src/extract-prompts.ts`: one fixed system prompt per task, no persona, text delivered with the same fence as `renderFuentes`, labeled untrusted data, instructions inside it ignored, JSON between explicit markers, output one JSON object. No Paper gate. Done: `npm run sidecar:build` passes.
- [x] T005 [P] Create `sidecar/src/extract-parser.ts`, pure and browser-safe, per contracts/sidecar-extract.md. Canonical form: NFKC, case fold, all whitespace collapsed to one space. Citation: drop any field that does not appear; each of `apellidos` and each `nombres` token must appear; `anio` must match `^(1[5-9]|20)\d\d$` and appear; known keys only. Rubric: a criterion is kept only if `cita` appears; a weight counts only if `peso_declarado` appears and `peso_valor` is a positive finite number; stated values scale against the largest to 1 to 5, rounded, minimum 1; without a stated weight, 3; zero survivors equals `sin_criterios`. Malformed output is a failure, never partially applied. No Paper gate. Done: a throwaway script in the scratchpad confirms a fabricated year is dropped and an invented criterion is removed.
- [x] T006 Add `extract` as the fourth `case` of 006's exhaustive switch in `sidecar/src/runner.ts`: fixed system prompt, no `loadSagePrompt`, empty `sourceHashes`. Raise `MAX_CONCURRENT_REVIEWS` to 11 in `sidecar/src/sage.ts` and update the sum comment (review 4, questions 5, extract 2) (after T003, T004). No Paper gate. Done: `npm run sidecar:build` passes.
- [x] T007 In `sidecar/src/prompts.ts`, `renderFuentes` passes `recortada` and the middle dot in `renderRubrica` is removed (this changes `promptHash`; earlier baselines stop being comparable by hash). Remove the middle dot from labels in `sidecar/src/model-profiles.ts` (after T003). No Paper gate. Done: `LC_ALL=C grep -n $'\xC2\xB7' sidecar/src/prompts.ts sidecar/src/model-profiles.ts` is empty.
- [x] T008 [P] In `src/lib/storage/types.ts` add `Rubrica.consigna?: { texto: string; archivoNombre?: string; agregadoEn: string }`, and on `Fuente`: `autores?: { apellidos: string; nombres?: string }[]`, `anio?: string`, `publicacion?: { revista?, volumen?, numero?, paginas?, editorial?, doi? }` all strings, `citaRevisadaEn?` ISO 8601, `recortada?`. No Rust change. No Paper gate. Done: `npx tsc --noEmit` passes.
- [x] T009 [P] Create `src/lib/materials/limits.ts` (product limits only, each with its reason: `MAX_PDF_BYTES`, `PDF_TIMEOUT_MS = 60_000`, `MIN_CHARS_PER_PAGE = 20`, `MAX_INGEST_CHARS = 1_000_000`, `MAX_ESSAY_SOURCE_CHARS = 5_000_000`, `EXTRACT_CONCURRENCY = 2`; wire limits imported from `review-contract.ts`), `normalize.ts` (PDF text only, once: NFKC, remove NUL, CRLF to LF, join `letter-\nletter` when both are lowercase, collapse runs of spaces and tabs; pages join with a blank line) and `pdf.ts` (calls the command with `new Uint8Array(bytes)`, normalizes, applies no-text and size rules). No Paper gate. Done: `npx tsc --noEmit` passes; `grep -n "680_000\|2 \* 1024" src/lib/materials/limits.ts` is empty.
- [x] T010 [P] Create `src/lib/materials/apa.ts`: short citation with et al. at 3 or more authors, full reference with `&` before the last author, `s.f.` when there is no year, initials from `nombres`, what is missing (autor, año, título, only when `citaRevisadaEn` is set). No Paper gate. Done: a throwaway script confirms `(Mayer et al., 1995)` for three authors.
- [x] T011 Add `extract({ task, text })` to `src/lib/agents/index.ts`, reusing `runSidecarCommand` (after T002, T003). No Paper gate. Done: `npx tsc --noEmit` passes.
- [x] T012 Update `src/lib/store.ts`: `lecturas: Record<sourceId, "leyendo" | "fallo">` plus one rubric entry, never persisted; confirmed rubric replacement that saves a `before-restore` version first; `updateRubrica` keeps the field when `consigna` exists; `removeFuente` undo; essay id guard on applied results; `reviewOutcome` gains optional `fuentesOmitidas` for T025. The `{ instant: true }` handling comes from 004 and is not rebuilt here. No Paper gate. Done: `npx tsc --noEmit` passes.
- [x] T013 Create `src/lib/materials/import.ts` (after T005, T009 to T012): queue at `EXTRACT_CONCURRENCY`; duplicate offer when the canonical text of a new source equals an existing source's; material saved before AI runs; apply rules from data-model.md: the same essay is still open and the source exists; only empty fields are filled; `nombre` counts as empty when blank or equal to the filename stem of `archivoNombre`; `cita` is rebuilt only while empty or equal to what the builder produced from the previous fields; a rubric proposal applies directly only if the rubric still has no criteria. Reading state never persisted. No Paper gate. Done: with the stub, editing a field during reading keeps the edit.
- [x] T014 Add stubs to `tests/e2e/setup.ts`: `pdf_extract_text` (decodes bytes as text; `%PDF-scan` returns `no_text`, `%PDF-locked` returns `locked`; otherwise the body after the header is one page) and `sage_extract` (citation returns only fields implied by markers, including one fabricated year to exercise the validator, otherwise `{}`; rubric returns criteria quoted from the text). No Paper gate. Done: `npx tsc --noEmit` passes.
- [ ] T015 Gate check: run `npm run tauri:build:full`, launch the built `.app` with `open --env ESSAY_STUDIO_DATA_DIR=<scratch> "<built .app>"`, and confirm a real open-access PDF yields text through `pdf_extract_text` (Finder-launched apps have a different environment). The drop gate belongs to 006. No Paper gate. Done: result reported; on failure stop and return to the plan.
- [x] T016 Add R6.6 keyframes through 004's motion tokens, under reduced motion, to `src/app/globals.css`, before Slices 2 to 4, which do not touch that file. Gate: Slice 0. Paper R6.6 and R7.3: read exact values with `get_jsx` and `get_computed_styles`. Done: `grep -nE "@keyframes" -A12 src/app/globals.css | grep -c box-shadow` returns 0.

**Checkpoint**: Slices 2, 3 and 4 may run in parallel on disjoint files. No panel task edits `src/lib/store.ts`, `types.ts` or `materials/` except by request to the reviewer.

---

## Phase 2: Slice 2, rubric panel

- [x] T017 [P] [US1] Create `src/components/panels/RubricPanel.tsx` on 004's `Panel`, testid `rubrica-overlay`: empty state with paste and a zone marked `data-drop-zone`, reading state per R6.6, ready list with name and description editable in place, 5 dots as a radio group, row menu for removal, «Prefiero escribir» before `rubrica-add`, proposal confirmation over an existing rubric, no criteria found, «Leí solo el inicio» past `ASSIGNMENT_MAX_CHARS`, AI unavailable with retry and the material kept. Testids `criterio-*` kept. Numbers, counters and rows of X buttons are absent. Gate: Slice 0. Paper R6.1, R6.2, R6.6 and the Slice 0 reading, proposal, no-criteria, long assignment and failure line artboards: read exact values with `get_jsx` and `get_computed_styles`. Done: a pasted public assignment gives criteria in one action, side by side with R6.2; a changed criterion stays.
- [x] T018 [US1] After T017, the reviewer swaps the Rúbrica overlay for `RubricPanel` in `src/app/page.tsx`, one line. No Paper gate. Done: Más, Rúbrica opens the panel.
- [x] T019 [US1] Update `tests/e2e/rubrica.spec.ts`: «Prefiero escribir» precedes `rubrica-add`; weight changes from `selectOption("5")` to clicking the fifth dot; remove the counter assertion; removal through the row menu. No Paper gate. Done: `npx playwright test rubrica` passes.

---

## Phase 3: Slice 3, sources panel

- [x] T020 [P] [US2] Create `src/components/ui/WindowedList.tsx`: fixed row height, windowed, no library; built first in this slice and used by T029. Non-visual. No Paper gate. Done: `npx tsc --noEmit` passes.
- [x] T021 [P] [US2] Create `src/lib/materials/review-budget.ts`, pure, and apply it inside `critique()` only in `src/lib/agents/index.ts`, returning omissions: sources whose surname and year appear in the essay go first, then newest first; each sent whole while it fits `REVIEW_TEXT_BUDGET`; the first that does not fit is a prefix if at least 20,000 characters remain, flagged `recortada: true`, then the fill stops; if the essay alone exceeds the budget, a clear message and no request. No Paper gate. Done: with two 700,000 character sources in the stub, the captured request stays under 2 MiB and evidence offsets are unchanged.
- [x] T022 [US2] Create `src/components/panels/SourcesPanel.tsx` on 004's `Panel`, testid `fuentes-overlay` (after T020): zone marked `data-drop-zone` with the copy «Suelta PDFs o archivos», «o pega el texto», `fuentes-file-input` kept; search over title, authors and reference narrowing within one frame; `WindowedList` for 1000 sources; «Leyendo» row, then title and its short citation from `apa.ts`; rejections for scan or no text, password, too large and text limit; «Falta el año» from what is missing; removed source with undo. Gate: Slice 0. Paper R6.3 and the Slice 0 drop rejection, search no match, empty sources and undo artboards: read exact values with `get_jsx` and `get_computed_styles`. Done: side by side with R6.3; a scan shows the short message and saves nothing broken; 1000 generated sources scroll and narrow at once.
- [x] T023 [US2] Add to `src/components/panels/SourcesPanel.tsx`: row hover copies the citation; one menu with copy full reference, open and remove (`fuente-remove`); duplicate offer; the open source view with `fuente-nombre`, `fuente-cita`, `fuente-contenido` and the extracted text, editable, in the app (no PDF bytes are stored, so «abrir» means this view). Gate: Slice 0. Paper R6.3 and the Slice 0 row menu, open source and duplicate artboards: read exact values with `get_jsx` and `get_computed_styles`. Done: the same PDF dropped twice offers the existing source; a filled field he edited is never overwritten.
- [ ] T024 [US2] Route uploads through `materials/import` in 006's `src/lib/questions/source.ts` and `src/components/questions/SourcePicker.tsx`, removing the «PDF / Word soon» alert. No second drop guard. Gate: Slice 0. Paper R3.1: read exact values with `get_jsx` and `get_computed_styles`. Done: a PDF dropped on the picker is saved and selected; `grep -rn "próximamente" src/components/questions` is empty.
- [ ] T025 [US2] Show one quiet line when sources were left out, passing `critique()`'s omissions through `reviewOutcome` in `src/lib/review/run.ts` to `src/components/review/ReviewPanel.tsx`. In `src/components/review/FindingEvidence.tsx`, a removed source shows «Ya no está en tus fuentes», never a raw id; fix any accent bar or small text 005 left. Gate: Slice 0. Paper R6.5 and the Slice 0 sources left out artboard: read exact values with `get_jsx` and `get_computed_styles`. Done: a review with two books shows the line; removing a cited source keeps the correction with its source shown as removed.
- [x] T026 [US2] After T022, the reviewer swaps the Fuentes overlay for `SourcesPanel` in `src/app/page.tsx`. No Paper gate. Done: Más, Fuentes opens the panel.
- [x] T027 [US2] Update `tests/e2e/fuentes.spec.ts`: add flow through paste and the open view; close selector follows the panel primitive; counter assertions removed; `fuente-remove` through the row menu; the Lectura tests follow 006's picker. No Paper gate. Done: `npx playwright test fuentes` passes.

---

## Phase 4: Slice 4, history panel

- [ ] T028 [P] [US3] Create `src/components/panels/HistoryPreview.tsx`: read-only TipTap over the sheet with the same extensions, never registered with `getDocumentEditor`, floating bar with one primary action Restaurar through `restoreVersion`, `history-preview-text`, `history-restore-confirm`. Mount it in `src/components/editor/EditorPane.tsx`, which stays mounted. Flush before showing. Gate: Slice 0. Paper R6.4: read exact values with `get_jsx` and `get_computed_styles`. Done: a live MCP edit during preview leaves the preview unaffected, and undo still works after returning to the current version.
- [x] T029 [US3] Create `src/components/panels/HistoryPanel.tsx` on 004's `Panel` with `WindowedList` (after T020), testid `history-overlay`: times list, the selected row marked by its surface alone, «La guardaste tú» for `manual` only, `data-kind` on each row, «Guardar esta versión» (`history-snapshot-now`), empty history. Gate: Slice 0. Paper R6.4 and the Slice 0 empty history artboard: read exact values with `get_jsx` and `get_computed_styles`. Done: side by side with R6.4; 1000 versions scroll.
- [x] T030 [US3] After T028 and T029, the reviewer swaps the Historial overlay for `HistoryPanel` in `src/app/page.tsx`. No Paper gate. Done: ⌘⇧H opens the panel.
- [x] T031 [US3] Update `tests/e2e/history.spec.ts`: `toContainText("manual")` becomes «La guardaste tú»; «al cerrar» becomes `data-kind="close"`; restore is one click on `history-restore-confirm`. No Paper gate. Done: `npx playwright test history` passes.

---

## Phase 5: Slice 5, close

One owner for the whole result.

- [x] T032 Confirm `src/lib/menu/bridge.ts` passes `{ instant: true }` for the three panels, and delete `src/components/lectura/RubricaOverlay.tsx`, `FuentesOverlay.tsx` and `HistoryOverlay.tsx`. No Paper gate. Done: `grep -rnE "RubricaOverlay|FuentesOverlay|HistoryOverlay" src` is empty; ⌘⇧R, ⌘⇧F and ⌘⇧H open with no animation, from Más they animate per R7.3.
- [x] T033 Update `tests/e2e/sage.spec.ts`, `selectors.spec.ts`, `menu.spec.ts` only where they open these panels. No Paper gate. Done: `npm run test:e2e` passes.
- [x] T034 Run the repo-wide sweep for the four series rules and fix what remains: the commands under Mechanical in quickstart.md, `cargo test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`. No Paper gate. Done: the whole repo passes every grep.
- [x] T035 Update `README.md` (PDF support, what leaves the Mac) and add session notes to `CLAUDE.md`. No Paper gate. Done: `README.md` states that text extraction is local and names no vendor in the interface description.
- [ ] T036 Gather 5 public course assignments and 10 open-access papers. Run the real cases, failure and edge cases, drop safety, history, keyboard, scale and MCP sections of quickstart.md in the desktop app, within the approved cap (about 16 calls plus a few reviews with a rubric). Score SC-002 and SC-003 by hand against the originals: at least 90% of criteria, zero invented fields. Check the token estimate behind `REVIEW_TEXT_BUDGET`. Gate: Slice 0. Done: scores, screenshots compared with R6.1 to R6.4 and R6.6, calls counted; anything not seen working stated as «no lo he visto funcionar».
- [ ] T037 From the built `.app` (`npm run tauri:build:full`) launched with `open --env ESSAY_STUDIO_DATA_DIR=<scratch> "<built .app>"`: drop a test PDF from a Finder window showing the scratchpad and see text extracted; open a test essay saved before this change. Do not install. No Paper gate. Done: both results reported.
- [ ] T038 Independent reviewers, one lens each: fidelity to R6.1 to R6.4 and R6.6 (at least 4 of 5, no structural difference), usefulness, reliability of citation data against the PDFs, scan speed. Gate: Slice 0. Done: scores and links reported.

---

## Dependencies and execution order

| Slice | Depends on | Runs |
|---|---|---|
| 0 Paper pass (elsewhere) | Noe's approval | Gates every `Gate: Slice 0` task |
| 1 reading material | Specs 004 to 007 | Alongside Slice 0, except T016. T015 is a stop gate |
| 2 rubric panel | Slice 1, Slice 0 | Parallel with 3 and 4 |
| 3 sources panel | Slice 1, Slice 0 | Parallel with 2 and 4 |
| 4 history panel | Slice 1, Slice 0, T020 | Parallel with 2 and 3 |
| 5 close | All | One owner, last |

**Shared files in the parallel slices**: `src/app/page.tsx` line swaps (T018, T026, T030) are applied by the reviewer when merging. `src/components/editor/EditorPane.tsx` is Slice 4 only. E2E updates go per spec file with each slice.

**Owned here** (series.md): `src/lib/materials/import` T013, replacing the file handling in 006's `source.ts` T024; `ui/WindowedList.tsx` T020; `pdf_extract_text` T001; `MAX_INGEST_CHARS` T009; `extract` as fourth case T006; concurrency cap to 11 T006. A source between `MAX_SOURCE_CHARS` and `MAX_INGEST_CHARS` is stored and reviewed by prefix; Hazme preguntas shows its «too large» state with no run started.

## Parallel example, Slice 1

```text
T001 src-tauri/src/pdf_text.rs, pdf_extract.js
T003 sidecar/src/review-contract.ts
T004 sidecar/src/extract-prompts.ts
T005 sidecar/src/extract-parser.ts
T008 src/lib/storage/types.ts
T009 src/lib/materials/limits.ts, normalize.ts, pdf.ts
T010 src/lib/materials/apa.ts
```

## Implementation strategy

Sonnet subagents implement, with Opus reviewing every diff. T015 decides whether the rest proceeds. The first useful stop after it is Slice 2: a rubric from a pasted assignment in one action.

## Requirement coverage

| Requirement | Tasks |
|---|---|
| FR-001 | T017, T018, T022, T026, T029, T030, T032 |
| FR-002 | T004, T005, T017 |
| FR-003 | T005, T010, T022 |
| FR-004 | T001, T009, T015 |
| FR-005 | T013, T017, T023 |
| FR-006 | T004, T005 |
| FR-007 | T008, T037 |
| FR-008 | T020, T022 |
| FR-009 | T006, T011 |
| FR-010 | T016 |
| FR-011 | T034 |
