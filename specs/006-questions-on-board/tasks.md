---
description: "Task list for questions on the board"
---

# Tasks: Questions on the Board

**Input**: `specs/006-questions-on-board/` (plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md) and [series.md](../004-stationery-shell/series.md), which wins where it differs from a plan.

**Prerequisites**: Specs 004 and 005 delivered. **Slice 0 is the shared Paper pass in series.md, done elsewhere.** It is not repeated here.

**Tests**: No test-writing tasks. E2E work is only the listed stub, assertion and selector updates, and the rewrites the plan lists for features this spec removes.

## Conventions

- **Phases are the plan's slices.** `[USn]` links a task to its spec story. Protocol and foundation tasks that serve every story carry no label.
- **Gate tag on every task.** `Gate: Slice 0` means no start until Noe approved the Slice 0 pass. `No Paper gate` means non-visual and free to start once its dependencies are done (series.md, Coordinator rulings).
- **Paper file**: `01M6VXNCR0ZBA410S026XSG7JT`. Every visual task names its artboard. Read exact values with `get_jsx` and `get_computed_styles`, never from screenshots.
- **`[P]`** only where files are disjoint and no incomplete task is a dependency.
- **Do not rebuild shared pieces.** From 004: `Popover`, `Tooltip`, `identityOf`, `StickyNote`, `tiltOf`, `NOTE_WIDTH`, `markLanding`, `peelNote`, `overlayInstant`, last-pointer record. From 005: `sage_cancel`, `cancelSidecarRequest`, aborted-run code, `SIDECAR_DOWN`, `SidecarRequestError`, `registerEssayLeaveHook`.
- Every run sets `ESSAY_STUDIO_DATA_DIR` to a scratch directory; test material stays in the session scratchpad, never Downloads.
- **Decisions adopted** (series.md): discard stays offered until the next run starts or the essay closes; real model calls for verification are approved, about 18 per pass with a cap of 40 across all rounds.
- **Board rule** (series.md, Coordinator rulings): a run started with the board closed opens it. If the writer hides the board during a run, the next landing simply opens it again through the existing `ensureBoard`. Nothing touches how `BoardPane` unmounts.

---

## Phase 1: Slice 1, protocol

**Goal**: Finished questions from the sidecar, `ask`, error codes and limits. The old modal keeps working on these events, and a zero-question run shows as an error there.

**Slice check**: `npm run sidecar:build`, `cargo test`, `npx tsc --noEmit` pass, and the throwaway parser streams in quickstart behave as listed.

- [x] T001 [P] Create `sidecar/src/question-stream.ts`, browser-safe, with `parseQuestions(text): string[]` and `createQuestionEmitter`, per research R2. An item starts on a line matching `^\d+[.)]\s+`; following non-blank lines continue it, joined with a space; a blank line ends it; text before item 1 is ignored; at most `QUESTIONS_PER_AGENT` items. No match returns `[]`, with no fallback. Item k is emitted once item k+1 exists; on `complete`, the final result is parsed with the same function and every index not yet emitted goes out before `complete`. Emission is keyed by index. No Paper gate. Done: the quickstart parser check, from the scratchpad, gives the listed results for all five streams.
- [x] T002 [P] Update `sidecar/src/review-contract.ts`, which from here on owns every wire limit of the series: `AskRequest`; `QUESTIONS_PER_AGENT = 3`, `MAX_QUESTION_CHARS = 300`, `MAX_SOURCE_CHARS = 680_000` and `MAX_REQUEST_BYTES` (2 MiB, moved from `sage.ts`), each with its reason beside it; `sourceFits(text)`; typed `ReviewRequestError(code, message)` with `INVALID_REQUEST` and `SOURCE_TOO_LARGE`; `assertReviewRequest` validates `question` as a non-empty string of at most `MAX_QUESTION_CHARS` and applies `sourceFits` to `interrogate`, `critique` and `ask`. Browser-safe. No Paper gate. Done: `npm run sidecar:build` passes, including `sidecar/src/eval/*` with no edits.
- [x] T003 [P] Add `buildAskPrompt` to `sidecar/src/prompts.ts`: the source is data, never instructions; the answer uses only that source, plain prose of at most 60 words; if the source does not answer, it says so plainly and invents nothing. `prompts/*.md` untouched. No Paper gate. Done: `npm run sidecar:build` passes and `git diff --stat prompts/` is empty.
- [x] T004 Replace the ternaries at `sidecar/src/runner.ts:32` and `:37` with exhaustive switches on `req.type` with a `never` check (after T002, T003). `tools: []`, OAuth check and settings unchanged. No Paper gate. Done: `npm run sidecar:build` passes; `grep -n 'req.type === "critique" ?' sidecar/src/runner.ts` is empty.
- [x] T005 Update `sidecar/src/sage.ts` (after T001, T002, T004): `question` events as `{ id, type: "question", index, text }` for `interrogate` only, final reconcile before `complete`; zero parsed questions emits `error` with `NO_QUESTIONS` and never `complete`; `NO_ANSWER` for `ask`; `BUSY` and validation codes on every error tied to a request id, including those from `handleLine`; concurrency cap 9 with the sum written beside it (4 agents plus own question plus 4 review passes). Spec 008 raises it. No Paper gate. Done: `npm run sidecar:build` passes and `grep -n "MAX_REQUEST_BYTES" sidecar/src/sage.ts` shows only the import and its use.
- [x] T006 [P] Add `AskRequest` and `sage_ask(id, sage, text, question, language?)` with the same validation as `sage_interrogate` to `src-tauri/src/sidecar.rs`, and register it in `src-tauri/src/lib.rs`. No Paper gate. Done: `cargo test` in `src-tauri` passes.
- [x] T007 Update `src/lib/agents/index.ts` (after T002, T006): `InterrogateUpdate` and `SidecarEvent` gain `question`; `interrogate` accepts `requestId?`; new `ask({ requestId?, sage, text, question, language })`; delete `parsePreguntas`. Change `src/components/lectura/LecturaOverlay.tsx` to collect questions from `question` events and show a failed agent on `NO_QUESTIONS`. No Paper gate. Done: `grep -rn parsePreguntas src` is empty; the old modal still interrogates against the stub.
- [x] T008 Update the stub in `tests/e2e/setup.ts`: `sage_interrogate` also emits `question` events; `sage_ask` case with a canned answer, recorded in `__E2E_LAST_ASK__`; spec 005's `sage_cancel` case also ends held interrogations; `__E2E_INTERROGATE_BEHAVIOR__` per agent with `hold` (ends with `CANCELLED` on cancel) and `malformed` (emits `error` with `NO_QUESTIONS`). No Paper gate. Done: `npx playwright test sage` runs against the stub with the old modal.

---

## Phase 2: Slice 2, landing and run

**Goal**: The run leaves the component. Notes land live. This slice also makes every edit that Slices 3 and 4 would share, so those two can run in parallel.

**Slice check**: the old modal's Interrogar starts a run and closes; notes land live; MCP `get_board` shows existing nodes identical before and after.

- [x] T009 [P] Add optional `runId?: string`, `fuenteId?: string` and `propia?: true` to `Interrogatorio` in `src/lib/storage/types.ts`. No Rust change. No Paper gate. Done: `npx tsc --noEmit` passes.
- [x] T010 [P] In `src/lib/mcp/board.ts`, export `boundsOf`, `common`, `overlaps`, `clearObstacles`, `Rect` and `ensureBoard` with no behavior change. No Paper gate. Done: MCP board tools behave as before; `git diff` shows only exports and the new function.
- [x] T011 [US2] Create `src/lib/questions/landing.ts` (after T010) per contracts/renderer-run.md and research R6, R7: `beginLanding(essayId, sages)` and each `land` resolve the editor with `ensureBoard(essayId)`, never holding it, so the run start opens a closed board and a landing reopens one the writer hid. Region fixed at run start: `anchorX` is the right edge of all content plus 56 (empty board: viewport left plus 56), one column per active agent in `ALL_SAGES` order, `NOTE_WIDTH + 28` apart. Inside one `editor.run(fn, { history: "ignore" })`: call `markLanding(id)`, create with `rotation: 0`, read real bounds, `clearObstacles` against every other shape read fresh, apply the offset. Never select, focus or change tool. Holes are never filled. Camera per R7, only while the writer has not moved it: `zoomToBounds` with `targetZoom` equal to the zoom at run start, 420 ms, coalesced, frame the run's notes alone if the union needs a zoom under 0.5, `immediate: true` under reduced motion. `markWriterMovedCamera()`. Detection by event bus and synchronous camera side effect per R7's table. No Paper gate. Done: on a board with notes and an arrow, every existing node's `x`, `y`, `rotation` and `text` are identical in `get_board` before and after a stub run.
- [x] T012 Add to `src/lib/store.ts`: `questionRun: QuestionRun | null`, written only by `run.ts`, shape per data-model.md; `replaceInterrogatoriosForRun(runId, entries)`, the only writer for run entries, through the debounced autosave; `lecturaSage: Sage | null`; `openLectura` is a no-op while a run is `running` or `stopping`. `lecturaMode` stays until T025. No Paper gate. Done: `npx tsc --noEmit` passes.
- [x] T013 Create `src/lib/questions/run.ts` (after T011, T012) per contracts/renderer-run.md: `startQuestionRun`, `stopQuestionRun` (synchronous up to writing the entries), `retryAgent`, `keepNote`, `discardNote`. Registers through `registerEssayLeaveHook`. 60 ms landing queue. State machine per data-model.md; `status: "stopping"` blocks a new run until every task reports a terminal event or `SIDECAR_DOWN` arrives. Failure mapping from codes only, per the data-model table; raw messages go to the log. A retry lands at most `QUESTIONS_PER_AGENT - landedCount`. Entries are always derived from the run's notes still on the board: after-create and after-delete `shape` handlers mark the run dirty, `registerOperationCompleteHandler` rebuilds, and handlers re-register when `BoardPane` remounts. `discardNote` sets `markHistoryStoppingPoint("discard-question")` and calls `peelNote`. Discard window opens at the first landing and closes when the next run starts or the essay is left. `shapeId` map, queue and cost stay module-private, never in `shape.meta`. No Paper gate. Done: stub run with `hold`, stop, then Preguntar again is available only after the terminal event; `interrogatorios` lists only notes still on the board.
- [x] T014 Create the empty mount points so Slices 3 and 4 touch no shared file: `src/components/questions/QuestionsPanel.tsx`, `SourcePicker.tsx`, `AgentTiles.tsx`, `QuestionRunPill.tsx`, `AgentRunChips.tsx`, `LandedNoteActions.tsx`, each returning null with its final props type, and `src/lib/fileDrop.ts` exporting a no-op `installFileDropGuard`. No Paper gate. Done: `npx tsc --noEmit` passes.
- [x] T015 Update `src/components/canvas/BoardPane.tsx` and `src/components/canvas/BoardToolbar.tsx` (after T011, T014): remove `materializePreguntas`, `buildNoteShape` and the `sage:materialize-preguntas` listener; mount `AgentRunChips` and `LandedNoteActions` outside `<Tldraw>`; `editor.registerExternalContentHandler("files", null)`; the fit control calls `markWriterMovedCamera`. Add `fuenteId` to the meta type in `src/components/canvas/note-shape.tsx`. No Paper gate. Done: `grep -rn "materialize-preguntas\|materializePreguntas" src` lists only the LecturaOverlay dispatch that T016 removes.
- [x] T016 Update `src/app/page.tsx` (after T013, T014): mount `QuestionsPanel` and `QuestionRunPill`; call `installFileDropGuard`. In `src/components/lectura/LecturaOverlay.tsx`, Interrogar starts a run and closes, with the save footer removed. Non-visual: layout of the new surfaces comes in Slices 3 and 4. No Paper gate. Done: hide the board during a stub run: the next landing opens it again and no note is lost; `git diff src/lib/store.ts` leaves `toggleBoard` untouched.
- [x] T017 [P] Add `asks` (one sentence) and `voiceLines` to `Identity` in `src/lib/agent-identity.ts` for each agent; rotation every 2 s is the consumer's. Copy from R3.4, R3.5 and the Slice 0 voice lines. Gate: Slice 0. Paper R3.4, R3.5 and the Slice 0 voice lines artboard: read exact text with `get_jsx`. Done: `npx tsc --noEmit` passes and every agent has at least two lines.
- [x] T018 [P] Add voice line fade, fold and reduced motion to `src/app/globals.css`. `land` and `peel` keyframes come from 004 and are not redefined. Gate: Slice 0. Paper R3.4 and R7.3: read exact values with `get_jsx` and `get_computed_styles`. Done: `grep -cE "@keyframes (land|peel)" src/app/globals.css` is unchanged from before this task.

**Checkpoint**: Slices 3 and 4 may run in parallel.

---

## Phase 3: Slice 3, panel

**Goal**: R3.1, modal deleted, drop zone, E2E updated. Touches `QuestionsPanel`, `SourcePicker`, `AgentTiles`, `source.ts`, `fileDrop.ts`, `tauri.conf.json`, and the listed spec files.

**Slice check**: side by side with R3.1; the built-app Finder drop gate.

- [x] T019 [P] [US1] Create `src/lib/questions/source.ts` per research R13: search over a precomputed lowercase, accent-free `nombre` plus `cita`, memoized per `fuentes` array; recent first by `agregadoEn`; paste naming; accepted files `.txt` and `.md`; `sourceFits` from `review-contract.ts`. No Paper gate. Done: `npx tsc --noEmit` passes; in the panel, narrowing 1000 sources shows no input lag.
- [ ] T020 [P] [US1] Set `dragDropEnabled: false` on the window in `src-tauri/tauri.conf.json`, after confirming the behavior in the dev build, and implement `src/lib/fileDrop.ts`: a capture-phase window guard that cancels every file drop outside an element marked `data-drop-zone`. Spec 008 only marks its zones. No Paper gate. Done: after restart, a file dropped on the editor or board does nothing and no asset reaches the essay JSON.
- [x] T021 [US1] Build `src/components/questions/SourcePicker.tsx`: search with `useDeferredValue`, all matches rendered in a scroll area with `content-visibility: auto` and an intrinsic row size, no row cap; drop zone with `data-drop-zone` and the rejection lines; selection as a transient source row, never saved; testids `lectura-fuente-chips` and `lectura-fuente-chip`. Gate: Slice 0. Paper R3.1 and the Slice 0 drop rejection, no-match, empty sources and selection row artboards: read exact values with `get_jsx` and `get_computed_styles`. Done: side by side with R3.1; a dropped `.txt` is saved and selected; a `.png` shows the short line.
- [x] T022 [P] [US1] Build `src/components/questions/AgentTiles.tsx` on 004's `StickyNote`: filled toggles with `ui/Tooltip` showing `asks`, defaults from `defaultSagesForMode`, testids `lectura-sage-selector`, `lectura-sage-toggle-*` (`data-active`). Gate: Slice 0. Paper R3.1 and R3.5: read exact values with `get_jsx` and `get_computed_styles`. Done: side by side with R3.1; academic opens with Práctica off, blog with Evidencia off.
- [x] T023 [US1] Build `src/components/questions/QuestionsPanel.tsx` on 004's `Popover` anchored with `useAnchor("hazme")`, with `instant` from `overlayInstant`, heading «Los agentes te preguntan», testid `lectura-overlay`, Preguntar with testid `lectura-interrogar` disabled with no extra text when there is no source or no agent on, the too-large message with no run started, `data-board-surface` on the root. Selection entry and agent entry preselect per FR-011. Gate: Slice 0. Paper R3.1: read exact values with `get_jsx` and `get_computed_styles`. Done: side by side with R3.1.
- [x] T024 [US1] Update `src/components/editor/SelectionMenu.tsx`, only if 004 left selector or wording unchanged. Update `src/lib/menu/bridge.ts` to call `openLectura(undefined, undefined, { instant: true })`. `openLectura` signature becomes `openLectura(sage?, prefill?, opts?: { instant?: boolean })`, where `sage` means «only this agent on». No Paper gate. Done: native menu opens the panel with no animation; selecting text and an agent preselects both.
- [x] T025 Remove `lecturaMode` and `setLecturaMode` from `src/lib/store.ts`, and delete `src/components/lectura/LecturaOverlay.tsx` (after T021 to T024). No Paper gate. Done: `grep -rnE "LecturaOverlay|lecturaMode|Guardar seleccionadas" src` is empty and `npm run build` passes.
- [x] T026 Update `openSingleAgent(page, name)` in `tests/e2e/setup.ts` so it opens Hazme preguntas and leaves only that agent's tile on. No Paper gate. Done: `npx tsc --noEmit` passes.
- [x] T027 Update `tests/e2e/sage.spec.ts` per the plan's table, after T031 because the discard assertion uses the hover actions: heading «Los agentes te preguntan»; council becomes source plus Preguntar with 9 notes and 3 entries and no save step; unchecking becomes discarding one note through hover actions, 2 kept for that agent; avatar test asserts only that agent is on; mode tabs become tile toggling on `data-active`; upload expects a selected row; bubble opens prefilled with the selection row and only that agent on; Esc and click outside on the new heading. No Paper gate. Done: `npx playwright test sage` passes.
- [x] T028 [P] Update `tests/e2e/selectors.spec.ts` (open by Hazme preguntas, run needs a source, count notes), `fuentes.spec.ts` (rows select, upload saved and selected, count notes), `language.spec.ts` (open by Hazme preguntas, pick a source, wait on notes). `menu.spec.ts` and `sidecar-banner.spec.ts` need no change. No Paper gate. Done: `npm run test:e2e` passes.

---

## Phase 4: Slice 4, watching and keeping

**Goal**: Pill, stop, chips with voice lines and retry, keep or discard, peel. Touches only the three components below.

- [x] T029 [P] [US2] Build `src/components/questions/QuestionRunPill.tsx`: status and stop calling `stopQuestionRun`, `data-board-surface`. Gate: Slice 0. Paper R3.2 and the Slice 0 question pill and board-after-stop artboards: read exact values with `get_jsx` and `get_computed_styles`. Done: pressing stop ends remaining agents; no note lands afterwards and nothing shows as failed.
- [x] T030 [P] [US2] Build `src/components/questions/AgentRunChips.tsx`: one chip over each column, voice line rotating every 2 s while thinking, an icon when done with no word like «listo», short failure line with Reintentar calling `retryAgent`; no rotation under reduced motion; `data-board-surface`; color only for the agent, red only if Slice 0 says so. Gate: Slice 0. Paper R3.2, R3.4 and the Slice 0 failure line artboard: read exact values with `get_jsx` and `get_computed_styles`. Done: side by side with R3.2; `malformed` in the stub shows the line and no raw output.
- [x] T031 [P] [US3] Build `src/components/questions/LandedNoteActions.tsx`, outside `<Tldraw>` like `NoteBar`, `data-board-surface`: keep or discard on hover of a note in the discard window, calling `keepNote` and `discardNote`. Gate: Slice 0. Paper R3.2 and R1.5: read exact values with `get_jsx` and `get_computed_styles`. Done: discard peels; wait for another landing, ⌘Z with the board focused brings back the discarded note and no other; reopening keeps it gone after a second discard.

---

## Phase 5: Slice 5, own question

- [x] T032 [US4] Add the R3.3 input to `src/components/questions/QuestionsPanel.tsx`, limited to `MAX_QUESTION_CHARS`, with the pending question on the chip. Extend `src/lib/questions/run.ts` with the `own` task: `ask` on the selected source only, answered by Evidencia or the first active agent if Evidencia is off, landing with `title` set to the question and `kind: "pregunta"`, one entry with `preguntas: [question]`, `propia: true`. Gate: Slice 0. Paper R3.3 and the Slice 0 pending own question artboard: read exact values with `get_jsx` and `get_computed_styles`. Done: the note lands titled with his question beside any agent questions; `__E2E_LAST_ASK__` carries only the selected source.

---

## Phase 6: Slice 6, motion and finish

- [ ] T033 [US2] Apply R3.4 timings across `src/lib/questions/run.ts` and the question components: note entry through 004's `markLanding`, fold of the panel into the pill, 60 ms pacing, reduced motion with notes in place, no looping lines, no camera pan. Gate: Slice 0. Paper R3.4 and R7.3: read exact values with `get_jsx` and `get_computed_styles`. Done: side by side with the R3.4 storyboard; quickstart case 10 passes.
- [x] T034 Run the mechanical checks in quickstart.md, including every `absent` grep. Update `README.md` (Interrogar row at line 32 and its shortcut row become Hazme preguntas) and add the session entry to `CLAUDE.md`. No Paper gate. Done: every `absent` prints ok; lint, `tsc`, sidecar build, `cargo test` and E2E pass.
- [ ] T035 Run real cases Runs A to F and the no-model cases in the Tauri window at 1440 by 900 on a new test essay built by the implementers from an open-access paper, within the approved cap (about 18 requests per pass, 40 across all rounds), with MCP `get_board` before and after each run (SC-002). Confirm that ⌘Z routes through 004's last-pointer record after a discard; change `src/lib/editor/history.ts` only if it does not. Gate: Slice 0. Done: a screenshot per case compared with R3.1 to R3.5, requests counted; anything not seen working stated as «no lo he visto funcionar».
- [ ] T036 Build with `npm run tauri:build:full`, launch it with `open --env ESSAY_STUDIO_DATA_DIR=<scratch> "<built .app>"`, confirm the sidecar starts, and run the Finder drop gate, dragging from a Finder window showing the scratchpad: a real file drop reaches a marked zone, and a drop anywhere else does nothing. Do not install it; installing needs Noe's go-ahead. No Paper gate. Done: both results reported; spec 008 depends on this gate.
- [ ] T037 Independent reviewers who did not build it score the real screens against R3.1 to R3.5 on usefulness, UX, how fast it scans, design and filler, minimum 4 of 5 (SC-005). A first-time reader says who asks whom from the button and panel alone (SC-003). Gate: Slice 0. Done: scores and screenshots reported.

---

## Dependencies and execution order

| Slice | Depends on | Runs |
|---|---|---|
| 0 Paper pass (elsewhere) | Noe's approval | Gates every `Gate: Slice 0` task |
| 1 protocol | Specs 004 and 005 | First. Sidecar and Rust in parallel, then T007, T008. No Paper gate |
| 2 landing and run | Slice 1 | Sequential. Only T017, T018 are gated |
| 3 panel | Slice 2, Slice 0 | Parallel with Slice 4, except T027, which waits for T031 |
| 4 watching and keeping | Slice 2, Slice 0 | Parallel with Slice 3 |
| 5 own question | Slice 3 | Sequential |
| 6 motion and finish | All | Last |

**Owned here for later specs** (series.md): `fileDrop.ts`, `data-drop-zone`, `dragDropEnabled: false` T020, Finder gate T036; `review-contract.ts` wire limits T002; exhaustive switch T004 and `ReviewRequestError` T002; concurrency cap of 9 T005.

## Parallel example, Slice 1

```text
T001 sidecar/src/question-stream.ts
T002 sidecar/src/review-contract.ts
T003 sidecar/src/prompts.ts
T006 src-tauri/src/sidecar.rs, lib.rs
```

## Implementation strategy

Sonnet subagents implement, one per task or per group on the same files. Opus reviews every diff before the next slice. The first useful stop is the end of Slice 2: notes land live on the board from the old modal.

## Requirement coverage

| Requirement | Tasks |
|---|---|
| FR-001 | T023, T025 |
| FR-002 | T022 |
| FR-003 | T019, T021 |
| FR-004 | T001, T005, T013 |
| FR-005 | T011, T035 |
| FR-006 | T011, T015 |
| FR-007 | T017, T030 |
| FR-008 | T013, T029 |
| FR-009 | T013, T031 |
| FR-010 | T009, T012, T013 |
| FR-011 | T023, T024 |
| FR-012 | T003, T032 |
| FR-013 | T018, T033 |
| FR-014 | T034 |
