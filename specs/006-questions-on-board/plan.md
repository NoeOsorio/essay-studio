# Implementation Plan: Questions on the Board

**Branch**: `004-stationery-redesign` (one branch for the series 004 to 008, see [series.md](../004-stationery-shell/series.md)) | **Date**: 2026-11-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-questions-on-board/spec.md`

## Summary

Replace the Interrogar modal with the R3.1 panel. Questions land on the board one at a time as agents produce them, never touching existing notes, with a stoppable run, keep or discard on each new note, and the writer's own question answered from the source.

**Root cause.** Interrogation is built as a modal transaction. The run lives in the modal's component state, the protocol only gives a full result, the raw output can pass through as a question when parsing fails, a sidecar crash leaves a request pending forever, and notes appear in one batch on save, placed without regard to the camera. Every complaint in the spec comes from that shape: nobody can watch the agents on the board, a board can receive notes off-screen, and selection happens in a checkbox footer. This plan attacks the shape: the run moves out of the component into a store slice and a module, the sidecar emits finished questions, and landing goes through the live editor.

**Smallest root fix.** One new event (`question`), one new request (`ask`), one run module, one landing module that reuses the MCP geometry helpers, and the R3.x surfaces. No persisted format changes beyond optional fields.

**Separate proposal, not in this plan.** A single run manager shared by Revisar ensayo and Hazme preguntas, with one cancel and progress model. It would remove some duplication with spec 005, at the cost of reworking a surface that was just rebuilt. Worth doing only if a third kind of run appears.

## Technical Context

**Language/Version**: TypeScript 5 strict, Rust stable, Node 22 sidecar

**Primary Dependencies**: Tauri 2.11, Next 16 static export, React 19, Zustand 5, tldraw 5.0.0, TipTap 3, Agent SDK 0.2.x. No new dependencies.

**Storage**: JSON essay files through Rust. Optional additive fields only. See [data-model.md](./data-model.md).

**Testing**: Existing Playwright E2E with assertion and selector updates only. Stub changes in `tests/e2e/setup.ts`. No new unit tests. Done is the real desktop app, per [quickstart.md](./quickstart.md).

**Target Platform**: macOS desktop app

**Project Type**: Desktop app with a Node sidecar

**Performance Goals**: Search narrows at once for 1000 sources. A landing is O(shapes on the page).

**Constraints**: Depends on specs 004 and 005 (see `contracts/renderer-run.md`). 2 MiB IPC cap, 680,000 character source cap, 9 concurrent requests, motion per R3.4 and R7.3, reduced motion honored.

**Scale/Scope**: 1000 sources, boards with 1000 or more shapes, up to 13 notes per run.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Pre-design | Post-design |
|---|---|---|
| I. Work never lost | Pass | Landings only add shapes. Existing shapes are read, never written. Board saves go through the existing `persistBoardSnapshot` and autosave. Discard is undoable. Stop and leaving the essay write the entries first |
| II. Reuse first | Pass | tldraw history and camera, MCP geometry helpers, `ensureBoard`, existing JSON storage. No new dependency. OAuth sidecar kept |
| III. Boundaries in code | Pass | `assertReviewRequest` enforces the source and question limits. Rust validates agent and language. `tools: []` stays. A request cannot read files. Own-question answers get only the selected source text |
| IV. Stationery Desk | Pass, with slice 0 | R3.1 to R3.5 are followed. States Paper does not draw go through slice 0 first. Red is only for system errors, not used for agent failures unless slice 0 says so |
| V. Done means usable | Pass | Plan needs Noe's approval. Verified in the real app, graded independently |

Internal ids (`em`, `sis`, `pra`, `cri`, `tu`, kinds) are unchanged. The own-question note uses the existing `pregunta` kind.

## Project Structure

### Documentation (this feature)

```text
specs/006-questions-on-board/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── sidecar-protocol.md
│   └── renderer-run.md
└── tasks.md             # /speckit-tasks, not created here
```

### Source Code (repository root)

```text
sidecar/src/                 question-stream.ts (new), review-contract, prompts, runner, sage
src-tauri/                   src/sidecar.rs, src/lib.rs, tauri.conf.json
src/lib/questions/           run.ts, landing.ts, source.ts (all new)
src/components/questions/    panel, picker, tiles, pill, chips, note actions (all new)
tests/e2e/                   setup.ts and the specs listed below
```

**Structure Decision**: Existing layout. Run logic gets its own folder, since it is shared by the panel, the pill, the chips and the store.

## Files touched

### Rust

| File | Change |
|---|---|
| `src-tauri/src/sidecar.rs` | `AskRequest`, `sage_ask`. `sage_cancel` comes from spec 005 |
| `src-tauri/src/lib.rs` | Register `sage_ask` |
| `src-tauri/src/storage.rs`, `history.rs` | None. New fields sit inside opaque values (research R11) |
| `src-tauri/tauri.conf.json` | `dragDropEnabled: false` on the window, after confirming in the dev build (research R8). 008 relies on this and does not repeat it |

### Sidecar

| File | Change |
|---|---|
| `sidecar/src/question-stream.ts` (new) | `parseQuestions`, `createQuestionEmitter`. Browser-safe |
| `sidecar/src/review-contract.ts` | `AskRequest`, the wire limits (this file owns every one, for the whole series), `sourceFits`, `ReviewRequestError` with codes, assertion additions |
| `sidecar/src/prompts.ts` | `buildAskPrompt` |
| `sidecar/src/runner.ts` | Exhaustive switches at lines 32 and 37. The aborted-run code comes from spec 005 |
| `sidecar/src/sage.ts` | `question` emission and final reconcile, `NO_QUESTIONS` and `NO_ANSWER`, `BUSY` and validation codes, cap of 9, imports the byte limit |
| `sidecar/src/eval/*` | No edits expected. Must still compile |

### Shared

| File | Change |
|---|---|
| `shared/mcp.ts`, `mcp/` | None. No tool changes |

### Renderer

| File | Change |
|---|---|
| `src/lib/agents/index.ts` | `question` event, `requestId` on `interrogate`, `ask`. Delete `parsePreguntas`. `SidecarRequestError` and `SIDECAR_DOWN` in `runSidecarCommand` come from spec 005 |
| `src/lib/questions/run.ts` (new) | Run lifecycle, `stopping`, 60 ms landing queue, retry, stop, keep, discard, entries derived from the board |
| `src/lib/questions/landing.ts` (new) | Anchor, columns, measured placement, camera, writer-moved detection |
| `src/lib/questions/source.ts` (new) | Search index, paste naming, accepted files, size check. Spec 008 replaces its file handling with `src/lib/materials/import` |
| `src/lib/fileDrop.ts` (new) | Capture-phase window guard that cancels every file drop outside an element marked `data-drop-zone` (research R8). Spec 008 only marks its zones |
| `src/lib/storage/types.ts` | Optional `Interrogatorio` fields |
| `src/lib/store.ts` | `questionRun`, `replaceInterrogatoriosForRun`. The run registers through spec 005's `registerEssayLeaveHook`. `lecturaSage` nullable, `lecturaMode` and `setLecturaMode` removed |
| `src/lib/mcp/board.ts` | Export geometry helpers. No behavior change |
| `src/lib/menu/bridge.ts` | Pass `{ instant: true }` to `openLectura`, which sets spec 004's `overlayInstant` |
| `src/lib/editor/history.ts` | Only if needed. The overlays below carry `data-board-surface`, so 004's last-pointer record should already send ⌘Z to the board after a discard. Checked in quickstart |
| `src/lib/agent-identity.ts` (from 004) | Add `asks` and `voiceLines` |
| `src/components/questions/QuestionsPanel.tsx` (new) | R3.1 and R3.3, with `data-testid="lectura-overlay"` |
| `src/components/questions/SourcePicker.tsx` (new) | Search, list, drop zone |
| `src/components/questions/AgentTiles.tsx` (new) | Note-shaped toggles with tooltips, drawn with spec 004's `StickyNote` |
| `src/components/questions/QuestionRunPill.tsx` (new) | Status and stop. Marked `data-board-surface` |
| `src/components/questions/AgentRunChips.tsx` (new) | Per-agent status over each column. Marked `data-board-surface` |
| `src/components/questions/LandedNoteActions.tsx` (new) | Keep or discard on hover, outside `<Tldraw>` like `NoteBar`. Marked `data-board-surface` |
| `src/components/lectura/LecturaOverlay.tsx` | Deleted |
| `src/components/canvas/BoardPane.tsx` | Remove `materializePreguntas`, `buildNoteShape` and the listener. Mount chips and actions. `files` handler null |
| `src/components/canvas/BoardToolbar.tsx` | Fit control calls `markWriterMovedCamera` |
| `src/components/canvas/note-shape.tsx` | `fuenteId` on the meta type. Entry motion comes from spec 004's `markLanding` |
| `src/components/editor/SelectionMenu.tsx` | Selector and wording only if 004 left them unchanged |
| `src/app/page.tsx` | Swap the overlay, mount the pill, install the `fileDrop` guard. |
| `src/app/globals.css` | Voice line fade, fold, reduced motion. `land` and `peel` keyframes come from 004 |

### E2E

No new tests. Most changes are assertion or selector updates. **Accepted exception**: tests of features this spec removes (mode tabs, per-question checkboxes, Guardar seleccionadas, source textarea) cannot survive as selector changes. Each is rewritten to the behavior that replaced it, or removed, and each is listed below with its reason.

`tests/e2e/setup.ts` stub changes: `sage_interrogate` also emits `question` events; `sage_ask` case with a canned answer, recorded in `__E2E_LAST_ASK__`; spec 005's `sage_cancel` case also ends held interrogations; `__E2E_INTERROGATE_BEHAVIOR__` per agent with `hold` (ends with `CANCELLED` on cancel) and `malformed` (emits `error` with `NO_QUESTIONS`), following 005's `__E2E_CRITIQUE_BEHAVIOR__`.

Testids kept on the new UI: `lectura-overlay`, `lectura-sage-selector`, `lectura-sage-toggle-*` with `data-active`, `lectura-interrogar` on Preguntar, `lectura-fuente-chips` and `lectura-fuente-chip` on picker rows, `sage-selection-menu`.

| Spec | Test | Update |
|---|---|---|
| `sage.spec.ts` | Opens the overlay | Heading becomes "Los agentes te preguntan" |
| | Auto-shows the board | Same heading |
| | Council, 9 notes on save | Pick a source and press Preguntar. Expect 9 notes and 3 entries, with no save step |
| | Unchecking questions | Discard one note through the hover actions. Expect 2 questions kept for that agent |
| `setup.ts` | `openSingleAgent(page, name)`, the helper from 004 | Mode tabs no longer exist: the helper now opens Hazme preguntas and leaves only that agent's tile on |
| | Council avatar opens single | 004 removes the avatars and repoints this test to `openSingleAgent`. Here it asserts only that agent is on |
| | Mode and sage tabs | Mode tabs no longer exist. Becomes: toggling tiles changes `data-active` |
| | Upload a .txt | Expect a selected row, not a textarea value |
| | Bubble shows | Selector update only, if 004 changed the label |
| | Bubble opens prefilled | Expect the selection row and only that agent on |
| | Esc or click outside | Same assertions on the new heading |
| `selectors.spec.ts` | Lectura defaults, toggle and run, disabled state | Open by Hazme preguntas. Run needs a source. Count notes rather than checkboxes |
| `fuentes.spec.ts` | Chips picker | Rows select rather than filling a textarea |
| | Upload in Lectura | Row selected and saved, `fuentes` assertion unchanged |
| | 3 questions per agent | Count notes |
| `language.spec.ts` | Interrogate forwards language | Open by Hazme preguntas, pick a source, wait on notes |
| `menu.spec.ts` | Opens Lectura | No change, testid kept |
| `sidecar-banner.spec.ts` | Comment mention | No change |

### Docs

`CLAUDE.md` session entry. `README.md`: the Interrogar row (line 32) and its shortcut row become Hazme preguntas, describing notes landing on the board.

## Invariants

| Must not break | How it is kept |
|---|---|
| Saved essays open unchanged | Only optional fields. No schema change in Rust. Old `Interrogatorio` entries are untouched |
| Persisted ids stay | Sages, kinds and mark attributes unchanged. Own-question notes use `pregunta` |
| Testids where possible | Kept on the new UI, listed above |
| Existing board content never moves (FR-005) | Landing only creates. Region fixed at run start, right of all content. Obstacles re-read at each landing. Holes never filled. Verified with MCP `get_board` before and after |
| Live editor authoritative | Notes come only from the live editor. `replaceInterrogatoriosForRun` touches only `interrogatorios` |
| Autosave | Landings reach the existing `registerBoard` operation handler, then `persistBoardSnapshot` and autosave |
| Essay history | Snapshots contain notes as before. Restore stops the run first, through the leave hook. No top-level field is added, so Rust's explicit `Essay` struct and `history.rs` need no change |
| Undo | Landings use `history: "ignore"`, so they cannot displace the writer's undo or clear redo. Discard is recorded with its own mark. Native Undo keeps routing through `applyBoardHistory` |
| Selection, focus and editing | `land` does not select, focus or change tool or editing state |
| MCP keeps working | No tool changes. A landing replaces `current` through `updateBoard`, which bumps the revision (`registry.ts:18`), so an in-flight MCP write gets `STALE_REVISION` and re-reads, and later landings avoid what it wrote |
| Review not affected by a run (spec assumption) | Spec 005 replaces the `updatedAt` comparison with a fingerprint of text, rubric and sources, so notes and interrogation entries do not count. A source added from this panel does mark it out of date, which is 005 FR-009 |
| No request hangs | `runSidecarCommand` (from spec 005) rejects on `sage://status` down. `stopping` ends on terminal events or on that rejection |
| Fence and auth | `tools: []`, OAuth check and settings stay unchanged. `ask` runs through the same `runReview` |
| No raw output on a note | `parseQuestions` is the only source. No match is a failure |
| No vendor name on screen | Failures are mapped from codes. Raw messages go only to the log |

## Channels

- **Mac desktop app**: everything in this plan.
- **MCP surface**: no new tools and no contract change. `get_board` shows landed notes with their `meta`, including `fuenteId` and `title`. The agents themselves are not an MCP capability today, so nothing is added there.

## Safety

- **Data writes**: only to the open essay, through existing paths. Dropped files become sources, as uploads do today. Pasted text is saved as a source.
- **New permissions**: none. `sage_ask` is a command on the existing sidecar channel. `dragDropEnabled: false` reduces native handling and adds no file access; `fileDrop.ts` contains it.
- **Cost**: each agent and each own question is one model request on Noe's plan usage. Stop now ends requests early, and closing an essay stops them. Retry is always an explicit press. Real-case verification needs model calls: see D2.

## New dependencies

None.

## Verification

Full procedure in [quickstart.md](./quickstart.md):

- **Real cases**: SC-006 and the edge cases, 14 scenarios in the real Tauri window at 1440 by 900 on a new test essay built from an open-access paper (series.md: never files from his computer), driven by computer use against `npm run tauri:dev`. Each with a screenshot compared with R3.1 to R3.5.
- **Mechanical**: lint, `tsc`, sidecar build, `cargo test`, E2E, greps for the middle dot, tiny text, `uppercase`, vendor names and removed symbols.
- **SC-002**: MCP `get_board` before and after every run.
- **Parser**: throwaway token streams from the scratchpad, not committed.
- **Bundle**: `npm run tauri:build:full`, confirm the sidecar starts from the built `.app`, since the module list changed. Installing it needs Noe's go-ahead.
- **Drop gate**: from the built `.app` launched with `open --env ESSAY_STUDIO_DATA_DIR=<scratch>` (series.md), a real file drop reaches a marked zone and a drop anywhere else does nothing. Spec 008 depends on this gate.
- **Independent reviewers** score the real screens, minimum 4 of 5.

If any of these cannot be seen working, the report says so: «no lo he visto funcionar».

## Delivery slices

Each slice works end to end and leaves the app usable.

0. **Design in Paper first.** One Paper pass for the whole series; the deduplicated list in [series.md](../004-stationery-shell/series.md) wins over this one. States R3.x does not draw: agent failed with retry; source too large; unsupported file on the zone; empty library and no search match; selection as a source row; pending own question on the chip; the board after stop. Also the missing voice lines (Práctica, and a second line for Evidencia and Sistemas). Noe approves before any UI code. Slice 1 (protocol) and the non-visual parts of slice 2 (run, landing, store) do not depend on it, per series.md, Coordinator rulings.
1. **Protocol.** Sidecar parser, `question` event, `ask`, error codes, limits; `sage_ask`; TS wrappers; stub. The old modal keeps working by collecting `question` events, because `parsePreguntas` is deleted here, and a zero-question run now shows as an error there.
2. **Landing and run.** `run.ts`, `landing.ts`, store slice, registration through the leave hook, entries, discard window. Also every edit that slices 3 and 4 would share: `BoardPane.tsx` (including the board's `files` handler) and `page.tsx` mount points with empty components and a no-op `fileDrop` guard, `agent-identity.ts` additions, `globals.css`. The old modal's Interrogar starts a run and closes, and the save footer is gone. Notes land live.
3. **Panel.** R3.1: picker at 1000 items, drop zone, agent tiles and tooltips, disabled states, selection and agent entry. `src/lib/fileDrop.ts` filled in, `data-drop-zone`, `dragDropEnabled`. Modal deleted and `lecturaMode` removed. E2E updated. Gate: the built-app Finder drop check under Verification.
4. **Watching and keeping.** Pill, stop, chips with voice lines and retry, keep or discard, peel.
5. **Own question.** R3.3 input, `ask`, titled note, answering agent rule.
6. **Motion and finish.** R3.4 timings, note entry, fold, 60 ms pacing, reduced motion, copy pass, greps, full real-case round, independent review.

## Execution

Implemented by Sonnet subagents following `tasks.md`. Opus reviews every diff against this plan and the quality bar before the next slice.

- Parallel: in slice 1, the sidecar (`sidecar/src`) and Rust (`src-tauri`) run at once against `contracts/sidecar-protocol.md`, then the TS wrappers and stub.
- Parallel: slices 3 and 4 after slice 2, which already made every shared edit. Slice 3 touches `QuestionsPanel`, `SourcePicker`, `AgentTiles`, `source.ts`, `fileDrop.ts`, `tauri.conf.json`. Slice 4 touches `QuestionRunPill`, `AgentRunChips`, `LandedNoteActions`. E2E updates belong to slice 3, and the `sage.spec.ts` update waits for slice 4's `LandedNoteActions`, because its discard assertion uses them.
- Sequential: 0, 2, 5 and 6.

Series order: starts after 004 and 005 are in. Reuses 005's `sage_cancel`, `cancelSidecarRequest`, aborted-run code, `SIDECAR_DOWN`, `SidecarRequestError` and `registerEssayLeaveHook`. Any drift from the assumptions in `contracts/renderer-run.md` returns to this plan before code.

## Decisions adopted (2026-11-08, see series.md, Decisions taken)

**D1. How long can a landed note be discarded from its hover controls?** Adopted: until the next run starts or the essay closes, with the record of questions kept in step during that time. After that, a note is simply a note, deletable like any other, and the record of questions no longer changes. The alternative, offering it only during the run, is simpler but cuts off the moment when he actually reads them.

**D2. Real model calls for verification.** Adopted: yes. One full pass of the real cases is about 18 requests on the plan's usage, with runs shared between cases (see quickstart), and a limit of 40 across all rounds, which allows one repeat after fixes. No other way shows the streaming rule, cancel and honest "the source does not say" answers working for real. Without it, the report has to say those parts were not seen working.

## Complexity Tracking

No constitution violations to justify.
