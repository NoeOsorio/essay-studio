# Implementation Plan: Essay Library at Scale

**Branch**: `004-stationery-redesign` (one branch for the series 004 to 008, see [series.md](../004-stationery-shell/series.md); spec label `007-essay-library`) | **Date**: 2026-11-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/007-essay-library/spec.md`. Visual source: Paper file `01M6VXNCR0ZBA410S026XSG7JT`, page 01, R1.1, R1.2 with its storyboard, R1.3 (top and mid-scroll), R1.4 (results and none), R1.5, and the growth note.

**Depends on**: 004 (`agent-identity.ts`, Tooltip, Popover, motion tokens, note peel, deterministic tilt, Geist, window chrome) and 005 (`Stamp`, `deriveFindings`, `openForScore`, and `evaluacionMeta.currentFingerprint`), see [contracts/score-inputs.md](./contracts/score-inputs.md).

## Summary

Replace the essay list with the approved stationery desk and notebook, built for 1000 essays. A small Rust cache file holds, per essay, what the list shows and the plain text it searches. It is checked against the real files on every read, so it cannot drift. Scores stay computed by the one TypeScript function, which the index only feeds.

### Root cause

The list is a six-field projection made by parsing every full essay, board and sources included, on the main thread (`storage.rs:86-113`, sync command at `:164`). It runs twice at boot (`page.tsx:38`, `EssayList.tsx:16`) and again on every close (`store.ts:342`). Measured with 1000 essays: 150 ms each time on normal files and 409 ms on files the size spec 008 will produce, during which the window is frozen. Nothing in that projection carries an excerpt, review state or searchable text, and the only place those exist is inside the full essay, so the screens in R1.1 to R1.4 cannot be built on it. The score exists only as a TypeScript function of the document.

This plan attacks that directly: a derived record per essay, read in about 30 ms regardless of essay size, off the main thread, plus windowed rendering because plain DOM on WebKit measured a 36 ms worst frame and 44 to 54 ms filter updates.

### Smallest root fix

- One new Rust module, one derived file, two new commands, no new dependency.
- The save path is not touched at all. The index is reconciled against the files on each read (3 ms).
- The index carries the score's inputs, and the existing `computeBenchmark` turns them into the number.
- The full comparison with simpler options is in [research.md](./research.md), including the in-memory-only version that was measured first.

### Separate proposals (not in this plan)

| Proposal | Why separate |
|---|---|
| SQLite with FTS5 | Worth it for ranked full-text search or far beyond 1000 essays. Nothing measured asks for it today, and it is a new native dependency. |
| Move `essay_read` and `essay_write` off the main thread | Same class of problem at a much smaller size per call. It touches the save queue's ordering, so it deserves its own check. |
| A visible notice for damaged essays | Today they are silently absent and the spec keeps that. A notice would be new design. |
| MCP `search_essays` tool | Useful for agents. Needs its own tool description and output limits. |

## Technical Context

**Language/Version**: Rust 1.95 (Tauri 2.11), TypeScript 5 strict, React 19, Next 16 static export.

**Primary Dependencies**: Existing only: serde, serde_json, tauri, zustand. No new dependency.

**Storage**: Essay JSON files stay the only source of truth. New derived cache at `$APP_DATA/library/index.v1.json`, see [data-model.md](./data-model.md).

**Testing**: No new unit tests. Existing Playwright and Rust suites stay green with the selector updates listed below. Done is judged in the real release app per [quickstart.md](./quickstart.md).

**Target Platform**: macOS desktop (WKWebView).

**Project Type**: Desktop app.

**Performance Goals**: SC-001 list usable under 1 s, SC-002 first results under 200 ms, at 1000 essays on a release build.

**Constraints**: Offline. Main thread never parses essays for the list. Essays are never written by the index.

**Scale/Scope**: 1000 essays designed for and measured; about 45 MB of Rust memory at that size (text plus folded text).

## Constitution Check

*Gate before research, re-checked after design.*

| Principle | Pre-design | Post-design |
|---|---|---|
| I. Work never lost | Pass: the index is derived | Pass: `write_in`, `delete_in` and essay JSON are unchanged, the index never writes to `essays/`, a damaged file is left byte for byte |
| II. Reuse before building | Pass: JSON storage, no new system | Pass: `computeBenchmark` and `extractAnotacionesFromContent` reused unchanged, 004 primitives and 005 stamp reused, no library added |
| III. Boundaries in code | Pass | Pass: commands take no paths, MCP surface unchanged, `list_essays` output unchanged |
| IV. Stationery desk | Pending: undrawn states | Pass after slice 0: Paper first, 36 px ledger from R1.3, shortcuts in tooltips and native menu only, loop only on first use, 12 px floor |
| V. Done means Noe can use it | Pass | Pass: release app on generated libraries, independent reviewers, plan approval before code |

The rule "every list is designed for 1000 items" is what this spec exists to meet.

## Invariants

| Invariant | How it is kept |
|---|---|
| Saved essays open unchanged | No field of `Essay` changes, `essay_read` untouched, no migration |
| Persisted ids and mark attributes stay | Only read; the index copies marks as they are |
| Live editor is authoritative | The list is only shown with no essay open; `closeEssay` flushes first and reads the list after |
| Autosave and history | `flush`, `snapshotNow`, `restoreVersion` keep their logic; the only removal is the `list` update inside `flush` and `newEssay` |
| MCP keeps working | `essay_list` keeps its six fields; no tool changes; `registry.ts` untouched |
| Undo | The list has no editing. Delete keeps today's confirmation |
| The index cannot lie | Every read reconciles by stat. No second write path exists to fall out of step |
| A crash cannot corrupt | Atomic tmp and rename; a bad or missing index is rebuilt |
| One score | Rust carries inputs only; contract in [contracts/score-inputs.md](./contracts/score-inputs.md) |
| Search covers only title and writing | The extractor reads only `text` of text nodes in `content`; board, sources and mark attributes are never visited |
| First use only when truly empty | `listStatus`; a load failure or a slow boot cannot show it |
| Deleted text does not linger | `essay_delete` triggers a reconcile, as it already removes the history file |

## Every File Touched

### Rust

| File | Change |
|---|---|
| `src-tauri/src/library.rs` (new) | Entry and record types, `EssayLite` parse including slim `findings`, text, excerpt and mark extraction, `INDEX_VERSION`, load and atomic save, `reconcile`, folding, search with segments, `LibraryState`, commands `library_list`, `library_search` |
| `src-tauri/src/storage.rs` | `essay_list` becomes async and answers from the index with the same six fields. `essay_delete` starts a background reconcile. `list_in` becomes a scan through the library module with a throwaway index, so existing Rust tests keep exercising the real path. `write_in`, `read_in`, `delete_in` unchanged |
| `src-tauri/src/lib.rs` | Register the module, `LibraryState`, two commands |
| `src-tauri/src/menu.rs` | `view:search` under Vista, ⌘K |

### Sidecar

None.

### Shared

None. `shared/mcp.ts` unchanged.

### Renderer

| File | Change |
|---|---|
| `src/lib/storage/types.ts` | `LibraryEntry`, `ReviewInputs`, `SearchHit`, `Segment`. `EssayMeta` stays |
| `src/lib/storage/index.ts` | `loadLibrary()`, `searchLibrary()` |
| `src/lib/store.ts` | `list` holds entries; `listStatus`; `library` view state; `loadList` uses the new command and never reports empty on failure; `closeEssay` loads the list before switching view, so no frame shows old data (the full order is stated once, in 005's plan under Invariants); remove `essayToMeta`, `upsertMeta` and the list updates in `newEssay` and `flush` |
| `src/lib/library/rows.ts` (new) | `toRow`: display title, minutes, one `computeBenchmark` call fed by `openForScore(deriveFindings(...))` with `contentFingerprint: review.evaluacionMeta.currentFingerprint`, effective date, month key. Number formatting with `useGrouping: "always"` |
| `src/lib/library/ledger.ts` (new) | Filtering, ordering, flat 36 px item list, windowing math, month index for jump and for the sticky label |
| `src/components/library/Library.tsx` (new) | Screen: chooses first use, R1.1, R1.3 or search; refreshes on window focus |
| `src/components/library/LibraryBar.tsx` (new) | `data-tauri-drag-region` and the traffic-light inset, since `Topbar` no longer renders here. Search box (tooltip Buscar ⌘K, clear, Esc), Nuevo ensayo split button with its type menu (tooltip ⌘N) |
| `src/components/McpConnection.tsx` | The list view of 004's split moves to the place designed in slice 0 (bar or desk) |
| `src/components/library/FirstUse.tsx` (new) | R1.2 sheet, two big choices, typed title and notes per storyboard, notes drawn with 004's `StickyNote` and `agent-identity.ts` (no new color map), reduced motion, timers cleared on unmount, paused while the document is hidden |
| `src/components/library/Desk.tsx` (new) | Featured sheet and paper cards, notes on 004's `StickyNote`, paper variant and tilt from `tiltOf(id)`, tooltips from 004's `Tooltip`, 005's `Stamp` at card size, Seguir escribiendo |
| `src/components/library/Ledger.tsx` (new) | Ruled page, windowed rows (the windowing stays inside this file; spec 008 builds its own `ui/WindowedList.tsx`), excerpt lines, emphasis segments, one month heading driven by scroll position |
| `src/components/library/EssayRowMenu.tsx` (new) | Hover «…» plus right click, on 004's Popover, with Borrar and today's confirmation. Shared by `Desk` and `Ledger`, so slice 3 builds it before slice 4 uses it |
| `src/components/library/LedgerFilters.tsx` (new) | Tipo, Revisión, order, on 004's Popover |
| `src/components/library/MonthJump.tsx` (new) | Year and month grid on 004's Popover |
| `src/components/library/NoResults.tsx` (new) | «Nada con «x» en Blog» with Quitar filtro, wording built from what is active |
| `src/components/EssayList.tsx` | Deleted, replaced by `Library.tsx` |
| `src/components/Topbar.tsx` | The `view === "list"` branch returns null; the list has its own bar per R1.1. This removes its old copy with the middle dot |
| `src/app/page.tsx` | Render `Library`; `loadList` stays here as the only boot load |
| `src/lib/menu/bridge.ts` | `view:search` case, only while the list shows |
| `src/app/globals.css` | Ruled, cream and grid paper surfaces, first-use keyframes on 004's motion tokens |

### E2E

No new specs. `tests/e2e/setup.ts` stub changes: add `library_list` and `library_search` (same shapes, simple matcher), and set reduced motion in `installTauriStub` so a moving note never covers a button.

| File | Selector updates |
|---|---|
| `tests/e2e/setup.ts` | Lines 403 and 404 use testids `library-new-academico` and `library-new-blog` |
| `tests/e2e/flow.spec.ts` | Lines 17, 29, 57, 81, 101, 140, 177 use those testids. Lines 154 and 182 use testid `library` instead of the old heading |
| `tests/e2e/menu.spec.ts` | Line 72 uses testid `library` |
| `tests/e2e/sidecar-banner.spec.ts` | Lines 21, 60 use the testid |
| `tests/e2e/flow.spec.ts` 122 and 157, `history.spec.ts` 181, `language.spec.ts` 120 | No change expected: card titles remain headings. Re-run to confirm |

`getByText(/^ensayos$/)` in flow and history belongs to 004's top bar and is whatever 004 left. Re-grep line numbers at implementation, since 004 to 006 edit these specs first.

### Docs and tools

| File | Change |
|---|---|
| `scripts/library-fixture.mjs` (new, dev only, not bundled) | `generate` a fixture of the shape in research.md, refusing the real app data directory; `check` the index against the files, printing ids and field names only |
| `CLAUDE.md` (repo) | Session notes: index, reconcile rule, score inputs rule |

## Channels

| Channel | Change |
|---|---|
| Mac desktop app | Everything above |
| MCP | No new tools, same output. `list_essays` becomes faster and stops freezing the window |

## Safety

- **Data writes**: one new derived file in app data. Essays are read only by the index.
- **First launch after updating**: builds the index once, off the main thread.
- **Privacy**: the index holds a plain copy of essay text in the same private directory as the essays. Logs carry counts only.
- **Permissions**: none added. Commands take no paths.
- **Money**: no model calls anywhere in this spec, in use or in verification.

## New Dependencies

None.

## Verification End to End

Full steps in [quickstart.md](./quickstart.md).

**Acceptance bar, read the way Noe reads the screen.** A good library shows his latest essay first and ready to continue, reads like stationery as in R1.1, opens with no wait, and finds any essay by a remembered word. It must not contain a counter, an eyebrow, «sin revisar», a printed shortcut, a repeated essay, a stamp that differs from the editor, or the first-use screen for anyone who has essays.

**How the app is exercised.** The real release build launched with `ESSAY_STUDIO_DATA_DIR` on disposable data and driven with computer use, because timing on a debug build or in Playwright says nothing about what he will feel. Playwright stays a regression net.

**Screens compared with Paper.** R1.1 with 5 essays, R1.2 and each storyboard frame, R1.3 top and mid-scroll with 1000, the month jump, each filter menu, R1.4 results and none, plus the slice 0 states.

**Real cases, on generated libraries only.** Open a library of a few essays, continue the latest one, find one by a word from its body, browse 1000 generated, and first use on an empty directory. All five re-run after every slice from 3 on; a fix for one must not break another.

**Reliability.** Forced quit during save 20 times, restore, index deleted, index truncated, wrong version, essay file removed by hand, essay file corrupted with its bytes compared afterward, stamp equal to the editor on reviewed, stale and partial essays.

**Mechanical.** U+00B7 grep over `src`, `src-tauri/src`, `sidecar/src` for the surfaces of this spec, no `uppercase`, no text under 12 px, no em-dash in visible strings, `essayToMeta` and `upsertMeta` gone, no vendor name in new strings, and lint, build, `npm run test:e2e` and `cargo test` green.

## Delivery Slices

Each one works end to end, in this order.

**Slice 0: design in Paper first (constitution IV).** One Paper pass for the whole series; the deduplicated list in [series.md](../004-stationery-shell/series.md) wins over this one. New R artboards, approved by Noe before renderer code:

1. Delete control on cards and ledger lines (decision below), row and card hover.
2. Nuevo ensayo menu open.
3. Revisión and order menus open: Revisados, Sin revisar, Desactualizados; Más recientes, Más antiguos, Mejor nota, Título.
4. Month jump with months that have no essays.
5. Layouts from 2 to 12 essays.
6. A card for an untitled or empty essay.
7. The library while first building, and when it cannot load.
8. The out-of-date stamp on a card, if 005's slice 0 did not already cover that size.
9. List window chrome, and where the MCP connection sits on the list (004 leaves the strip here until this spec).

**Slice 1: the index.** Rust module, commands, `essay_list` from the index, delete reconcile, fixture script. Works with the old screen. Verified: timing table, the index-never-lies table.

**Slice 2: data flow.** Store, types, rows, one boot load, no first-use flash, E2E stub. Old screen still works.

**Slice 3: R1.1 and R1.2.** Library shell, bar, desk, first use, delete, E2E selector updates. A few essays work completely.

**Slice 4: R1.3.** Ledger, windowing, filters, month jump, threshold. 1000 essays browsable.

**Slice 5: R1.4.** Search wiring, ⌘K, emphasis, excerpts, no results.

**Slice 6: proof.** Full quickstart on the release build, generated-library cases, independent reviewers against R1.1 to R1.4 (usefulness, how fast it scans, reliability of what the list claims, design, UX), with a minimum of 4 of 5 per SC-005. Results and the link go to Noe with scores, or the words «no lo he visto funcionar» for anything not seen.

## Execution

Implemented by Sonnet subagents following the approved tasks. Opus reviews each diff against this plan before the next slice starts.

| Group | Runs | Files |
|---|---|---|
| A | Parallel with slice 0 | Slice 1: `src-tauri/**`, `scripts/` |
| B | After A | Slice 2: `src/lib/store.ts`, `src/lib/storage/**`, `src/lib/library/rows.ts`, `tests/e2e/setup.ts` |
| C, D | Parallel after B and slice 0 | C is slice 3: `Library`, `LibraryBar`, `FirstUse`, `Desk`, `EssayRowMenu`, an empty `Ledger` for `Library` to mount, `Topbar`, `page.tsx`, E2E selector updates. D is slice 4: `Ledger`, `LedgerFilters`, `MonthJump`, `src/lib/library/ledger.ts` |
| E | After C and D | Slice 5: `NoResults`, `bridge.ts`, search wiring in `Library` and `Ledger` |
| F | Last | Slice 6, by agents that did not build it |

`globals.css` is shared by C and D, so C owns it and D requests additions.

## Decision adopted (2026-11-08, see series.md, Decisions taken)

**Where does Borrar live?** No R screen draws it, and your earlier critique called a hover-only × a hidden action. Adopted: a «…» at the end of each card and line on hover, plus right click, opening a small menu with Borrar and today's confirmation. It is one more quiet element per row, and it has room for Renombrar or Duplicar later if you want them. The alternative is keeping the × on hover, which is simpler and is what you criticized.

## Project Structure

### Documentation (this feature)

```text
specs/007-essay-library/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── library-commands.md
│   └── score-inputs.md
└── tasks.md             # next phase, not created here
```

### Source Code (repository root)

```text
src-tauri/src/library.rs          # new
src/lib/library/                  # new: rows, ledger
src/components/library/           # new: the screens
scripts/library-fixture.mjs       # new, dev only
```

**Structure Decision**: Existing single-repo layout. The index is its own Rust module beside `storage.rs` because it has one job and one mutex.

## Complexity Tracking

No constitution violations.
