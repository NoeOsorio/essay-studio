# Series 004 to 008: the Stationery Desk redesign

Five specs, planned separately, delivered as one piece of work. This file is what holds them together. Each spec's plan stays the detail; where this file and a plan's Slice 0 list differ, this file wins.

## Delivery

**Branch**: `004-stationery-redesign`, one branch for all five.

**Order**:

| # | Spec | Why here |
|---|---|---|
| 1 | [004 Stationery shell](./plan.md) | Tokens, identity and primitives every other spec draws with |
| 2 | [005 Review and stamp](../005-review-stamp/plan.md) | Needs 004. Owns cancel, crash handling, leave hooks and the fingerprint that 006 and 007 consume. Repairs the live rubric bug first |
| 3 | [006 Questions on the board](../006-questions-on-board/plan.md) | Needs 004 and 005. Owns file drop and the wire limits that 008 consumes |
| 4 | [007 Essay library](../007-essay-library/plan.md) | Needs 004 and 005 |
| 5 | [008 Material panels](../008-material-panels/plan.md) | Needs all of the above |

## Shared pieces by owner

The owner builds it. Everyone else consumes it and does not build a second one.

| Owner | Piece | Used by |
|---|---|---|
| 004 | `src/lib/agent-identity.ts` | 005, 006, 007, 008 |
| 004 | `ui/Tooltip`, motion tokens | 005, 006, 007, 008 |
| 004 | `ui/Popover` (anchored) and `ui/Panel.tsx` (unanchored), both with `instant?` | 005, 006, 007, 008 |
| 004 | `useAnchor(name)` registry: `hazme`, `revisar`, `mas` | 005, 006, 008 |
| 004 | Store flag `overlayInstant` | 005, 006, 008 |
| 004 | `ui/StickyNote.tsx`, `tiltOf(id)`, `NOTE_WIDTH = 212` | note-shape, ghost notes, 006 tiles, 007 `FirstUse` and `Desk` |
| 004 | `markLanding(id)`, `peelNote(editor, id)` | 006 |
| 004 | Last-pointer-surface record in `src/lib/editor/history.ts` (`board` or `document`, followed by `body`) | 005 marks `Finding` actions as `document`, 006 marks overlays `data-board-surface` |
| 004 | `openSingleAgent` E2E helper | 006 |
| 004 | Stamp slot in the toolbar, window chrome | 005, 007 |
| 005 | Rubric payload repair (renderer sends `{ criterios }`, validator requires an array) | Every review with a rubric, 008 |
| 005 | `deriveFindings`, `openForScore`, `Finding`, `FindingEvidence` | 007, 008 |
| 005 | Presentational `Stamp({ result, size })` and connected `ScoreStamp` (only one with `scorebar` testids) | 007 uses `Stamp` |
| 005 | Fingerprint scope and `EvaluacionMeta.currentFingerprint` | 007 |
| 005 | `sage_cancel`, `cancelSidecarRequest`, aborted-run code in `runner.ts`, `SIDECAR_DOWN` in `runSidecarCommand`, `SidecarRequestError { code }`, `requestId` | 006 |
| 005 | `registerEssayLeaveHook`. The order of `closeEssay` is stated once, in 005's plan under Invariants | 006, 007 |
| 006 | `src/lib/fileDrop.ts`, `data-drop-zone`, `dragDropEnabled: false`, built-app Finder drop gate | 008 only marks its zones |
| 006 | `sidecar/src/review-contract.ts` as owner of every wire limit | 008 adds its own there; `materials/limits.ts` imports them and keeps product limits |
| 006 | Exhaustive request switch in `runner.ts`, `ReviewRequestError` codes | 008 adds `extract` as the fourth `case` |
| 006 | Concurrency cap of 9 | 008 raises it to 11 (review 4, questions 5, extract 2) |
| 007 | `ReviewInputs` and the library index. Windowing stays inside `Ledger` | Only 007 |
| 008 | `src/lib/materials/import` | Replaces the file handling in 006's `source.ts` |
| 008 | `ui/WindowedList.tsx`, `pdf_extract_text`, `MAX_INGEST_CHARS` | Only 008 |

One consequence to know: `MAX_INGEST_CHARS` (1,000,000) is larger than the wire limit `MAX_SOURCE_CHARS` (680,000). A source between the two can be saved and reviewed as a prefix, but Hazme preguntas shows its «too large» state for it.

## Slice 0: one Paper pass

One pass over everything below, approved by Noe before any renderer code in the series. Rust and sidecar work may run alongside it.

**Shared**

- Failure line with Reintentar: one agent, all agents, agent failed on the board, AI unavailable.
- Running and stop control: panel running with Cancelar, stamp running (including the first review), question pill, the board after stop.
- Out-of-date stamp at toolbar and card size; stamp with no number.
- Drop zone rejections: unsupported, scan or no text, password, too large, text limit.
- Search with no match in the source picker and the sources panel; empty sources; empty history.
- Save icon: saving, unsaved, error with retry, tooltip with word count.

**004**

- Sidecar-down banner.
- MCP row in Más, and MCP placement on the list.
- Práctica underline color (`#8FB1F0`).
- Slash row Párrafo.
- Note with very long title and text.
- Objeciones ghost copy.
- Voice lines missing for Práctica and second lines for Evidencia and Sistemas.

**005**

- Not-located card.
- Phrase for a replacement across paragraphs.
- Notice when a run is discarded on close.
- Resueltas row after Usar este texto.
- Quiet line when sources were left out of a review.
- R4.1 options as filled toggles.

**006**

- Selection as source row.
- Pending own question on the chip.

**007**

- Delete control on cards and lines.
- Nuevo ensayo menu open.
- Revisión and order menus open.
- Month jump with empty months.
- Layouts from 2 to 12 essays.
- Untitled or empty card.
- Library first building and load failed.
- List window chrome.

**008**

- Rubric reading state, if R6.6 is not enough.
- Proposal confirmation over an existing rubric.
- No criteria found.
- «Leí solo el inicio» for long assignments.
- Source row menu.
- Open source view.
- Duplicate offer.
- Source removed with undo.
- R6.3 zone copy without «o enlaces».

## Decisions already made

- Series branch: `004-stationery-redesign`.
- R4.1's options are filled agent toggles like spec 006's tiles, not check boxes. Constitution IV: a check means only that a whole card is done.
- Links as sources stay out. R6.3's zone has no «o enlaces».

## Open decisions (Noe only)

| Decision | Recommendation |
|---|---|
| Caret in a new note | In the body, with the title one click or arrow up away |
| Hazme preguntas shortcut | ⌘⇧P; italic keeps ⌘I |
| Reviewer model selector | Leaves the interface; the persisted default stays |
| Underlined sentence deleted by hand | Stays open as not located and still counts |
| Discard window on landed notes | Until the next run or until the essay closes |
| Borrar in the list | Hover «…» plus right click, with today's confirmation |
| PDF reading | The Mac's PDFKit, no new dependency |
| Real model calls for verification | Yes, with caps: about 8 for 005; 18 with a cap of 40 for 006; 16 plus a few reviews for 008 |

## Verification material

Gathered by the implementers: see Decisions taken below.

## Coordinator rulings

- The Paper gate covers visible surfaces only. Non-visual work that does not depend on Slice 0 (the rubric payload fix, TS wrappers and stubs, store and row logic) may proceed once the plans are approved.
- A run started with the board closed opens it. If the writer hides the board during a run, the next landing simply opens it again, through the existing `ensureBoard`. Simplest thing, rare case.
- **No file or essay of Noe's is used for testing, not even a copy.** Every dev or built run in 004 to 008 sets `ESSAY_STUDIO_DATA_DIR` to a scratch directory, also for a Finder-style launch: `open --env ESSAY_STUDIO_DATA_DIR=<scratch> "<built .app>"`. Test material stays in the session scratchpad, never in Downloads. Essays are new test essays or generated libraries. «An essay saved before this change» means a test essay written in that directory by a build from before the series, or as JSON in the old format.
- `MAX_INGEST_CHARS` above `MAX_SOURCE_CHARS` is accepted: an oversized source is stored and reviewed by prefix, and Hazme preguntas says it is too long for it, with no run started.
- Stale stamp: a click opens the report card, as the 005 contract says, not a new review. Any edit makes the stamp stale, so a click that re-reviews would cut off the corrections and spend calls by accident. Revisar ensayo sits next to it. The caption on the Slice 0 state artboard is read that way.
- Report card and Correcciones are `Popover`s anchored on the stamp (R5.1, R4.2), not centered `Panel`s. Correcciones stays open on outside clicks so the text behind stays editable; Esc and its close button dismiss it.

## Decisions taken (2026-11-08)

Noe asked not to be handed these. The recommendations listed under open decisions are adopted as the plan; he can reverse any of them when he sees the result. Verification material is gathered by the implementers: open-access papers and public course assignments, never files from his computer. Nothing is required from him except approving the plans, which includes the capped real model runs.
