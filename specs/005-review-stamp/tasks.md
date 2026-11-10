---
description: "Task list for review, corrections and the score stamp"
---

# Tasks: Review, Corrections and Score Stamp

**Input**: `specs/005-review-stamp/` (plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md) and [series.md](../004-stationery-shell/series.md), which wins where it differs from a plan.

**Prerequisites**: Spec 004 delivered (`agent-identity`, `Tooltip`, `Popover`, `Panel`, `useAnchor`, `overlayInstant`, last-pointer record, stamp slot). **Slice 0 is the shared Paper pass in series.md, done elsewhere.** It is not repeated here.

**Tests**: No test-writing tasks. E2E work is only the assertion, selector and stub updates and the three retired tests the plan names.

## Conventions

- **Phases are the plan's slices.** `[USn]` links a task to its spec story. Foundation-style tasks that serve every story carry no label.
- **Gate tag on every task.** `Gate: Slice 0` means no start until Noe approved the Slice 0 pass. `No Paper gate` means non-visual and free to start once its dependencies are done (series.md, Coordinator rulings).
- **Paper file**: `01M6VXNCR0ZBA410S026XSG7JT`. Every visual task names its artboard. Read exact values with `get_jsx` and `get_computed_styles`, never from screenshots.
- **`[P]`** only where files are disjoint and no incomplete task is a dependency.
- **Do not rebuild shared pieces.** `Popover`, `Panel`, `useAnchor`, `Tooltip`, `identityOf`, `overlayInstant` and `setUndoSurface` come from spec 004. Everything this spec owns for later specs is listed under Dependencies.
- **Decisions adopted** (series.md): the reviewer selector leaves the interface, the persisted `reviewerProfile` and default stay, and an unknown saved profile falls back to the default; a sentence deleted by hand stays open as not located and still counts.
- Every run sets `ESSAY_STUDIO_DATA_DIR` to a scratch directory, because dev builds otherwise share the installed app's data. New test essays only, never one of Noe's. Restart `tauri:dev` after any Rust change.

---

## Phase 1: Slice 1, the finding is real

**Goal**: Rubric repair first, then the durable finding, the one card and the popover, on the old modal.

**Slice check**: on the old modal, click an underline, resolve, reopen, use, copy, ⌘Q, relaunch, and states are intact.

- [x] T001 Repair the live rubric bug: in `src/lib/agents/index.ts`, `critique()` sends `rubrica` as the `criterios` array; `assertReviewRequest` is unchanged. In `tests/e2e/setup.ts`, the `sage_critique` capture reads `rubrica` as an array. In `tests/e2e/rubrica.spec.ts`, `critiques[pase].rubrica` is asserted as an array. No Paper gate. Done: `npx tsc --noEmit` passes, `npx playwright test rubrica` passes, and T042's real review on an essay with a rubric completes with findings carrying their criterion.
- [x] T002 Add `findings: Option<serde_json::Value>` to `Essay` in `src-tauri/src/storage.rs`, with `findings: None` in the `sample_essay` literal (line 196), and `findings: None` in the literal in `src-tauri/src/history.rs` (line 268). Omitted when empty. No Paper gate. Done: `cargo test` in `src-tauri` passes.
- [x] T003 [P] In `src/lib/storage/types.ts` add `FindingStatus = "open" | "resolved" | "not_applicable"`, `FindingRecord` exactly as data-model.md (`id`, `sage`, `pase`, `severidad`, `cita`, `mensaje`, `reemplazo?`, `criterioId?`, `evidence?`, `provenance?`, `generadoEn`, `status`, `closedAt?`, `closedBy?: "check" | "replacement"`, `occurrence?`), `Essay.findings?`, `EvaluacionMeta.fingerprintsByPase?: Partial<Record<Pase, string>>`, `appliedFingerprints?: string[]`, `currentFingerprint?: string`, and add `findings` to the `EssayMeta` Omit list. No Paper gate. Done: `npx tsc --noEmit` passes.
- [x] T004 [P] Create `src/lib/review/fingerprint.ts`, pure: `extractPlainText` moved from `src/components/lectura/PlumaRojaOverlay.tsx` (which imports it from here), `reviewFingerprint` as a sync hash of `[extractPlainText(content), rubrica.criterios, fuentes.map({ id, nombre, cita, contenido })]`, each source's part cached in a `WeakMap` keyed on the `Fuente` object. Marks are not part of plain text. No Paper gate. Done: `grep -nE "from \"(react|zustand|@tauri)" src/lib/review/fingerprint.ts` is empty.
- [x] T005 Create `src/lib/review/findings.ts` (after T003), pure, per data-model.md and contracts/finding-and-stamp.md: `deriveFindings(content, records: SlimRecord[] | undefined): FindingView[]`, `openForScore(views)`, `reachableScore(args, addPases)` (calls `computeBenchmark` with that pass added; no arithmetic elsewhere), and the suppression check. Rule table: mark and no record is open and located, body from the mark; mark and any status is open and located (presence wins); no mark and open is open, not located; no mark and resolved is resolved; no mark and not_applicable is hidden and kept for suppression. Order: open located in document order, open not located by `generadoEn`, resolved by `closedAt` descending. `FindingView` adds `located`, `from`, `to`, `quote`, `spansBlocks`. `openForScore` reads only `id`, `sage`, `pase`, `severidad`, `criterioId`, `status`. No Paper gate. Done: `grep -nE "from \"(react|zustand|@tauri)" src/lib/review/findings.ts` is empty, and for an essay with no records the list equals `extractAnotacionesFromContent(content)`.
- [x] T006 Update `src/lib/benchmark/score.ts` (after T003): optional `contentFingerprint` argument and the new staleness branch per data-model.md (with `fingerprintsByPase` covering every pass in `pasadasCubiertas`, a pass with stored `R` is fresh when `R === F`, or when both are in `appliedFingerprints`; otherwise the existing timestamp comparison); `AppliedAnotacion` gains optional `evidence` and `provenance`. Penalties and arithmetic untouched; no store, React or Tauri imports. No Paper gate. Done: `npx playwright test score` passes with no edits to `tests/e2e/score.spec.ts`.
- [x] T007 Update `src/lib/store.ts` (after T004 to T006): `commitFindings`; `clearEvaluacion` also clears `findings`; legacy fingerprint backfill in `openEssay` (if meta has no fingerprints and timestamps say fresh, fill in memory, written only on the next real save); `flush()` sets `evaluacionMeta.currentFingerprint` only when `evaluacionMeta` exists, on the copy passed to `writeEssay` and never on `current`, so `get().current === cur` still holds and `updatedAt` never moves. No Paper gate. Done: open a pre-change test essay and close it with no edit: `updatedAt` equals a backup; `npx tsc --noEmit` passes.
- [x] T008 [P] Add `sentenceRange` next to `findCitaRange` in `src/lib/editor/findCita.ts` using `Intl.Segmenter`; `findCitaRange` API unchanged. No Paper gate. Done: `npx tsc --noEmit` passes and `git diff` leaves `findCitaRange` untouched.
- [x] T009 [P] In `src/components/editor/extensions/Annotation.ts`, wrap `applyAnnotationReemplazo` in `closeHistory` so it is one isolated history step, replace the two middle dots used as the `data-by` fallback, and update the header comment. Mark attributes unchanged. No Paper gate. Done: `grep -n $'\xc2\xb7' src/components/editor/extensions/Annotation.ts` is empty.
- [x] T010 Create `src/lib/review/actions.ts` (after T005, T007 to T009) per the contract: `resolveFinding(id)`, `reopenFinding(id)`, `markNotApplicable(id)`, `useReplacement(id): { ok: true } | { ok: false; reason: "spans_blocks" | "not_located" }`, `copyReplacement(id)` with `navigator.clipboard.writeText`, `revealFinding(id)`. Order inside each mutating action: `setUndoSurface("document")`, TipTap command through `getDocumentEditor(essayId)`, read `get().current` fresh, write the record, flush. An older finding with no record gets one at first closure, built from its view. Usar este texto links old and new fingerprint in `appliedFingerprints` only if fresh before. Uncheck re-adds the mark if `cita` is found, no history; otherwise open and not located. No Paper gate. Done: `npx tsc --noEmit` passes; exercised through T011.
- [x] T011 [US3] Create `src/components/review/Finding.tsx`, the only component that renders a finding (FR-005), with `surface: "popover" | "panel" | "criterion"` (layout only: panel shows the quote, popover and criterion do not). Agent via `identityOf`; «en <criterio>» with fallback to the pass label; importance Importante, Media, Menor with bars in ink, never red; explanation; proposed text with Copiar and Usar este texto; source; Ya lo resolví and No aplica, calling `actions.ts` directly. A check mark appears only as «this card is done» (FR-013). Not located shows the phrase and no selection behavior; `spansBlocks` shows the phrase in place of Usar este texto and Copiar stays. Testids `finding`, `finding-resolve`, `finding-not-applicable`, `finding-replacement`, `finding-use`, `finding-copy`, `finding-source`, `finding-not-located`. For the source until T038 lands, reuse `ReviewEvidenceDetails`. Gate: Slice 0. Paper R4.2, R2.2 and the Slice 0 not-located and across-paragraphs artboards: read exact values with `get_jsx` and `get_computed_styles`. Done: side by side with R4.2; every action works on a real underline in the running app.
- [x] T012 [US3] Rewrite `src/components/editor/AnnotationPopover.tsx` as a thin anchor that renders `Finding` (`surface="popover"`) in 004's `Popover`. Gate: Slice 0. Paper R2.2: read exact values with `get_jsx` and `get_computed_styles`. Done: clicking an underline opens the same card with the same actions.
- [x] T013 Feed `src/components/Scorebar.tsx` from `openForScore(deriveFindings(...))`, temporarily, until T034 deletes it. No Paper gate. Done: resolving a finding raises the number and does not mark the bar stale.
- [ ] T014 [P] [US3] Update `src/lib/mcp/document.ts`: `readDocument` adds `status: "open"` on each annotation and a `findings` list (open not located, resolved, not_applicable) with `id`, `sage`, `pase`, `severidad`, `cita`, `mensaje`, `status`, `located`. Update the `get_document` description in `shared/mcp.ts`. No new tool, no changed key. No Paper gate. Done: `get_document` with `includeAnnotations` from a connected client shows the states.

**Checkpoint**: Run the slice check, including ⌘Q and relaunch, which the stub cannot catch.

---

## Phase 2: Slice 2a, the stamp and the panel

**Goal**: New files only, under `src/components/review`, reading from the derive function. Runs in parallel with Slice 2b, except that T017 and T018 wait for T023 and T024.

- [x] T015 [P] [US4] Create `src/components/review/Stamp.tsx`, presentational: `Stamp({ result, size })` with `size` `toolbar` or `card`. `computeBenchmark` result in, stamp out, `10` with no decimal, otherwise one decimal. Reads no store and carries no `scorebar` testid. Spec 007 uses it. Gate: Slice 0. Paper R5.1 and the Slice 0 stamp states: read exact values with `get_jsx` and `get_computed_styles`. Done: `grep -nE "store|scorebar" src/components/review/Stamp.tsx` is empty.
- [x] T016 [P] [US2] Create `src/components/review/CorrectionsPanel.tsx` on 004's `Popover` anchored on the stamp and persistent (Paper R4.2 hangs over the board; the text stays editable): R4.2 list in essay order using `Finding` (`surface="panel"`), narrowing by criterion per R5.4 (same panel with a filter), Resueltas collapsed at the bottom with rows rendered only when opened (`corrections-resolved`), selecting a card calls `revealFinding`. Solid sheet, no dotted surface. Scrolls inside the window; `content-visibility: auto` on cards; stagger only for the first screenful, so 1000 findings stay usable. Gate: Slice 0. Paper R4.2, R4.4, R5.4 and the Slice 0 Resueltas row: read exact values with `get_jsx` and `get_computed_styles`. Done: side by side with R4.2 and R4.4; count equals what the review returned.
- [x] T017 [US4] Create `src/components/review/ScoreStamp.tsx` (after T015, T023): takes no props, reads the open essay, renders `Stamp` plus the contract's states: none (never reviewed, no findings, no run: nothing), score, out of date (`isStale`), running (run active for this essay, also on a first review), no number (findings exist, `overall` null). Opens `ReportCard`; while running opens `ReviewPanel`. The only component with testids `scorebar`, `scorebar-overall`, `scorebar-stale`. Gate: Slice 0. Paper R5.1 and the Slice 0 stamp artboards: read exact values with `get_jsx` and `get_computed_styles`. Done: `grep -rln "scorebar" src/components/review` lists only `ScoreStamp.tsx` and `ReportCard.tsx` (the latter for `scorebar-criterio-<id>` rows only).
- [x] T018 [US4] Create `src/components/review/ReportCard.tsx` (after T015, T016, T024) on 004's `Popover` anchored on the stamp (Paper R5.1): R5.1 with one row per criterion (`scorebar-criterio-<id>`) opening the filtered Correcciones, Todas las correcciones (`stamp-all-corrections`), no empty rows with no rubric, Volver a revisar one step away. A check not run is an invitation stating the score he could reach from `reachableScore`, never a penalty sentence. No pass, benchmark or evaluation wording. Gate: Slice 0. Paper R5.1: read exact values with `get_jsx` and `get_computed_styles`. Done: side by side with R5.1; with no rubric, score and corrections show with no empty criterion rows.

---

## Phase 3: Slice 2b, the run

**Goal**: A review that outlives any panel. Owns Rust, `sidecar/src/runner.ts`, `agents/index.ts`, `store.ts`, `src/lib/review/run.ts`.

**Slice check**: start a review, close the panel, keep typing; words untouched; cancel leaves nothing applied.

- [x] T019 [P] Add `sage_cancel(id)` to `src-tauri/src/sidecar.rs`, shaped like `sage_ping`, serializing `{ "id": id, "type": "cancel" }` with serde, returning the id, with the existing error when the sidecar is not running. Register it in `src-tauri/src/lib.rs`. No Paper gate. Done: `cargo test` in `src-tauri` passes.
- [x] T020 [P] In `sidecar/src/runner.ts`, at the `!completed` line choose the code from `config.signal?.aborted` (`CANCELLED`) and `timedOut` (`TIMEOUT`) before falling back to `INCOMPLETE_REVIEW`. No Paper gate. Done: `npm run sidecar:build` passes and `grep -n "CANCELLED" sidecar/src/runner.ts` shows the branch.
- [x] T021 Update `src/lib/agents/index.ts` (after T001): `critique` accepts `requestId?`; `cancelSidecarRequest(id)`; `SidecarEvent` error carries `code?: string`; `class SidecarRequestError extends Error { code?: string }` is the rejection type; `runSidecarCommand` also listens to `sage://status` and on `down` rejects with `SIDECAR_DOWN` and removes both listeners. Spec 006 consumes this and adds none of its own. No Paper gate. Done: `npx tsc --noEmit` passes; with `hold` in the stub (T035), a `sage://status` down ends the run instead of hanging.
- [x] T022 [P] Add the `applyReview` command to `src/components/editor/extensions/Annotation.ts`: one transaction with `addToHistory: false` that removes given marks and adds new ones. No Paper gate. Done: after a review, ⌘Z undoes the last keystroke and does not strip underlines.
- [x] T023 Add to `src/lib/store.ts`: session-only slice `review: { essayId, restoreNonce, fingerprint, passes: Record<Pase, { status, progress, requestId }> } | null` and `reviewOutcome`; `commitReview` replacing `recordEvaluacion`, with coverage as previous union this run's clean passes minus any pass that returned invalid lines, `fingerprintsByPase` overwritten only for passes in this run, `appliedFingerprints` cleared when all covered passes share one fingerprint; `registerEssayLeaveHook` called first in `closeEssay`, `openEssay`, `newEssay` and `restoreVersion`. In `closeEssay` the hooks run first, before the flush. This spec adds only the hooks; spec 007 moves the list load ahead of the view switch. No Paper gate. Done: `npx tsc --noEmit` passes; `grep -n registerEssayLeaveHook src/lib/store.ts` shows the export and four call sites.
- [x] T024 Create `src/lib/review/run.ts` with the final signatures of `startReview(pases: Pase[]): void` and `cancelReview(): void`, so T018 can import them while T025 fills in the bodies. No Paper gate. Done: `npx tsc --noEmit` passes on an import of both.
- [x] T025 [US1] Implement `src/lib/review/run.ts` (after T021 to T024): `startReview(pases)`, `cancelReview()`; sends each pass with its `requestId`; progress from real events (start is a small step, each returned line moves asymptotically toward 90 percent, completion is 100); cancels through `registerEssayLeaveHook` and raises the discard notice; a `SIDECAR_DOWN` rejection ends as all failed, with no status listener of its own. Application follows data-model.md, Applying a review, steps 1 to 6, on the live document, waits for `compositionend` when `editor.view.composing` is true, and keeps one synchronous re-check of `essayId` and `restoreNonce` right before the transaction. All failed or canceled: nothing changes. Volver a revisar uses the default passes for the essay type. No Paper gate. Done: stub paths `fail` one, `fail` all, `hold` then cancel, `hold` then close, `unlocated` behave as the plan's stub path says.
- [ ] T026 [US1] Create `src/components/review/ReviewPanel.tsx` on 004's `Popover` anchored with `useAnchor("revisar")`: R4.1 options as filled agent toggles like spec 006's tiles, not check boxes, with `identityOf` icons; Citas APA only for academic essays; running state with one line per agent and Cancelar; error line for one agent and for all with Reintentar. Testids `pluma-overlay`, `pluma-start`, `pluma-pase-toggle-*` (`data-active`). Reads `overlayInstant` as `instant`. The reviewer selector is not in the interface. Gate: Slice 0. Paper R4.1 and the Slice 0 running, failure line and toggles artboards: read exact values with `get_jsx` and `get_computed_styles`. Done: side by side with R4.1; the board does not change while the panel is open.
- [ ] T027 [P] [US1] Create `src/components/review/ReviewNotice.tsx`: one line when a run is discarded on close. Copy final from Slice 0. Gate: Slice 0. Paper Slice 0 discard notice artboard: read exact values with `get_jsx` and `get_computed_styles`. Done: with `hold` then closing the essay, the line appears and the other essay is untouched.

**Checkpoint**: Opus reviews 2a and 2b before Slice 3.

---

## Phase 4: Slice 3, wiring and removal

**Goal**: From here the old bar no longer exists. A single agent, so `Topbar`, `menu.rs` and `bridge.ts` have one owner. Tasks are sequential.

**Slice check**: quickstart steps 1 to 6.

- [ ] T028 [US4] Update `src/components/Topbar.tsx`: mount `ScoreStamp` in the `data-slot="stamp"` element and make Revisar ensayo open the panel. Gate: Slice 0. Paper R4.1 and R5.1: read exact values with `get_jsx` and `get_computed_styles`. Done: `topbar-pluma-roja` opens the panel from the button; the stamp sits between Hazme preguntas and Revisar ensayo.
- [x] T029 [US4] Update `src/app/page.tsx`: remove `Scorebar` and `PlumaRojaOverlay`, mount `ReviewPanel` and `ReviewNotice`. No Paper gate. Done: sheet gains the old bar's height with no bottom strip (SC-002).
- [x] T030 Update `src/lib/menu/bridge.ts`: `sabios:evaluar` opens the panel with `{ instant: true }`, `view:show-benchmark` removed, confirm copy for `sabios:limpiar`. Remove the `view:show-benchmark` item and its header comment in `src-tauri/src/menu.rs`. No Paper gate. Done: `grep -rn "show-benchmark" src src-tauri/src` is empty and `cargo test` in `src-tauri` passes.
- [x] T031 Drop `benchmark` and `plumaRoja` from `src/lib/features.ts` and their reads. No Paper gate. Done: `grep -rnE "FEATURES\.(benchmark|plumaRoja)" src` is empty.
- [x] T032 Clean `src/components/editor/EditorPane.tsx`: remove all `pluma-roja:*` listeners and `applyAnotaciones`; keep `editor:clear-annotations`. No Paper gate. Done: `grep -n "pluma-roja:" src/components/editor/EditorPane.tsx` is empty.
- [x] T033 Update `src/lib/store.ts`: remove `scorebarDismissed`, `dismissScorebar`, `showScorebar`, overlay value `pluma` and `updateReviewerProfile`; rename `openPlumaRoja` to `openReview` at every call site. The persisted `reviewerProfile` and default stay. An unknown saved profile falls back to the default. No Paper gate. Done: `grep -rnE "scorebarDismissed|openPlumaRoja|updateReviewerProfile" src` is empty.
- [x] T034 Delete `src/components/Scorebar.tsx`, `src/components/BenchmarkDrilldown.tsx` and `src/components/lectura/PlumaRojaOverlay.tsx`. `ReviewEvidenceDetails.tsx` stays until T038. No Paper gate. Done: `grep -rnE "BenchmarkDrilldown|pluma-roja:|Scorebar\b" src` is empty and `npm run build` passes.
- [x] T035 Update the stub in `tests/e2e/setup.ts`: add `sage_cancel`; `__E2E_CRITIQUE_BEHAVIOR__` per pase with `fail`, `hold` (ends with `CANCELLED` on cancel) and `unlocated` (one item whose quote is not in the text); `EssayLike` and `EssayDump` gain `findings`. No Paper gate. Done: `npx tsc --noEmit` passes.
- [x] T036 Update E2E selectors and assertions per the plan's table: `benchmark.spec.ts` (remove `pluma-anotacion` wait and `pluma-apply`, wait on `.anno`, rings through stamp and report card, `drilldown-*` to `finding-*`, Descartar to `finding-not-applicable`, no-rubric test asserts score and corrections with no criterion rows); `apply-suggestion.spec.ts` (`finding-replacement`, Usar este texto); `pluma-roja.spec.ts` (panel options, 9 cards, `finding-not-applicable`); `rubrica.spec.ts` (remove apply step and `pluma-rubrica-indicator`, criterion chip as «en <criterio>»); `selectors.spec.ts` (remove empty hint, runs via `dumpCritiques` and `.anno`); `menu.spec.ts`, `language.spec.ts` (remove apply step); `fuentes.spec.ts` (remove `pluma-fuentes-indicator` and apply step, keep forwarding); `flow.spec.ts` (Scorebar references). `tests/e2e/score.spec.ts` stays untouched. No Paper gate. Done: T037 and `npm run test:e2e` passes.
- [x] T037 Retire exactly three tests named by the plan: «unchecking anotaciones excludes them from apply» in `tests/e2e/pluma-roja.spec.ts`, and «Scorebar dismiss + show-benchmark» and «recordEvaluacion vuelve a mostrar el Scorebar» in `tests/e2e/menu.spec.ts`. No Paper gate. Done: `grep -nE "unchecking anotaciones|show-benchmark|vuelve a mostrar" tests/e2e/*.spec.ts` is empty.

---

## Phase 5: Slice 4, evidence and motion

- [x] T038 [US5] Create `src/components/review/FindingEvidence.tsx` per R6.5 and the three real states in research.md: verified with supports or context «Coincide con tu fuente», no icon; verified with contradicts «Coincide con tu fuente, pero dice lo contrario», no icon; invalid «No aparece en la fuente», warning; missing_source «Ya no está en tus fuentes», warning. Never a check mark, never a model name. Replace `ReviewEvidenceDetails` in `Finding.tsx` and delete `src/components/ReviewEvidenceDetails.tsx`. Gate: Slice 0. Paper R6.5: read exact values with `get_jsx` and `get_computed_styles`. Done: `grep -rn ReviewEvidenceDetails src` is empty and `grep -rnE "Claude|Opus|Sonnet|Anthropic|modelo" src/components/review` is empty.
- [ ] T039 [US1] Add R4.3 motion to `src/app/globals.css` and the owning review components: underline draw, stamp arrival, card fold, R5.4 dimming of other underlines (spec 004 already moved `anno-flash` to ink; confirm it, do not re-add it); transform, opacity and clip-path only, entering under 320 ms, `prefers-reduced-motion` next to each animation. Gate: Slice 0. Paper R4.3, R5.4, R7.3: read exact values with `get_jsx` and `get_computed_styles`. Done: side by side with the R4.3 storyboard; Reduce motion on leaves fades only.

---

## Phase 6: Slice 5, verification and docs

- [ ] T040 Run `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run test:e2e`, `cargo test` in `src-tauri`, and every mechanical grep in quickstart.md, including the plan's stub path list. No Paper gate. Done: all pass, greps empty, `score.spec.ts` unedited.
- [ ] T041 Walk quickstart steps 1 to 14 in the desktop app on a new essay, then repeat Copiar and the multi-paragraph case in a build from `npm run tauri:build:full`. If WebKit refuses `navigator.clipboard.writeText`, stop and report it, because the clipboard plugin is a new dependency. Gate: Slice 0. Done: screenshots of each step; anything not seen working stated as «no lo he visto funcionar».
- [ ] T042 Real reviews (SC-007), within the cap Noe approved with the plans: about 8 calls, two reviews of four passes, one on an essay with a rubric, on new test essays built by the implementers, in the scratch directory. Gate: Slice 0. Done: the rubric review completes and findings carry their criterion; calls counted in the report.
- [ ] T043 Independent reviewers who did not build it score against R4.1, R4.2, R4.4, R5.1, R5.4, R2.2, R6.5, one lens each: structure, copy, motion against R4.3 and R7.3, reliability. Minimum 4 of 5. Gate: Slice 0. Done: scores and screenshots reported.
- [x] T044 [P] Add the session notes to `CLAUDE.md`. No Paper gate. Done: the entry names what 006 and 007 consume.

---

## Dependencies and execution order

| Slice | Depends on | Runs |
|---|---|---|
| 0 Paper pass (elsewhere) | Noe's approval | Gates every `Gate: Slice 0` task |
| 1 the finding is real | Spec 004 | First. T001 to T010, T013, T014 are non-visual and may start before Slice 0 once 004's pieces they import exist |
| 2a stamp and panel | Slice 1 | Parallel with 2b, disjoint files. T017 waits for T023, T018 waits for T024 |
| 2b run | Slice 1 | Parallel with 2a |
| 3 wiring and removal | 2a and 2b | One agent, sequential |
| 4 evidence and motion | Slice 3 | Sequential |
| 5 verification | All | Last |

**Owned here for later specs** (series.md): rubric repair T001; `deriveFindings`, `openForScore` T005; `Finding` T011; `FindingEvidence` T038; `Stamp` T015 and `ScoreStamp` T017; fingerprint scope and `currentFingerprint` T004, T007; `sage_cancel` T019, aborted-run code T020, `cancelSidecarRequest`, `SIDECAR_DOWN`, `SidecarRequestError`, `requestId` T021; `registerEssayLeaveHook` and the order of `closeEssay` T023.

## Parallel example, Slice 2b

```text
T019 src-tauri/src/sidecar.rs, lib.rs
T020 sidecar/src/runner.ts
T022 src/components/editor/extensions/Annotation.ts
```

## Implementation strategy

Sonnet subagents implement, one per task or per group on the same files. Opus reviews every diff before the next slice. Slice 1 is the first useful stop: durable findings on the old modal, including the rubric repair that stops every review with a rubric from failing today.

## Requirement coverage

| Requirement | Tasks |
|---|---|
| FR-001 | T026, T028 |
| FR-002 | T022, T025 |
| FR-003 | T017, T018, T016 |
| FR-004 | T005, T016 |
| FR-005 | T011, T012 |
| FR-006 | T002, T003, T010 |
| FR-007 | T005, T025 |
| FR-008 | T006, T010 |
| FR-009 | T004, T006 |
| FR-010 | T006, T040 |
| FR-011 | T029, T034 |
| FR-012 | T011, T038 |
| FR-013 | T011, T026 |
| FR-014 | T019 to T021, T025, T026 |
| FR-015 | T039 |
| FR-016 | T040 |
| FR-017 | T005, T041 |
| FR-018 | T014 |
