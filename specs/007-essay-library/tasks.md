---
description: "Task list for the essay library at scale"
---

# Tasks: Essay Library at Scale

**Input**: `specs/007-essay-library/` (plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md) and [series.md](../004-stationery-shell/series.md), which wins where it differs from a plan.

**Prerequisites**: Specs 004 and 005 delivered. **Slice 0 is the shared Paper pass in series.md, done elsewhere.** It is not repeated here.

**Tests**: No test-writing tasks. E2E work is only the stub additions and selector updates the plan lists. Existing Rust suites stay green.

## Conventions

- **Phases are the plan's slices.** `[USn]` links a task to its spec story. Index and data-flow tasks serve US5 and every other story.
- **Gate tag on every task.** `Gate: Slice 0` means no start until Noe approved the Slice 0 pass. `No Paper gate` means non-visual and free to start once its dependencies are done (series.md, Coordinator rulings).
- **Paper file**: `01M6VXNCR0ZBA410S026XSG7JT`, page 01. Every visual task names its artboard. Read exact values with `get_jsx` and `get_computed_styles`, never from screenshots.
- **`[P]`** only where files are disjoint and no incomplete task is a dependency.
- **Do not rebuild shared pieces.** From 004: `identityOf`, `Tooltip`, `Popover`, motion tokens, `StickyNote`, `tiltOf`, window chrome. From 005: `Stamp`, `deriveFindings`, `openForScore`, `currentFingerprint`. Windowing stays inside `Ledger.tsx`; spec 008 builds its own.
- **Decision adopted** (series.md): Borrar is a hover «…» at the end of each card and line, plus right click, opening a small menu with Borrar and today's confirmation.
- **Never against his data.** Everything runs with `ESSAY_STUDIO_DATA_DIR` on generated data. None of his essays are used, not even a copy. Timing is judged only on a release build. No model calls in this spec.

---

## Phase 1: Slice 1, the index

**Goal**: A derived file, reconciled on every read, off the main thread. Works with the old screen. May run in parallel with the Slice 0 pass.

**Slice check**: the timing table and the «index never lies» table in quickstart.md.

- [x] T001 [US5] Create `src-tauri/src/library.rs` with `IndexRecord { mtimeNs, size, entry, text }`, `LibraryEntry` and `ReviewInputs` exactly as data-model.md, and `EssayLite`, which parses the required fields of `Essay` and the same optional field types while serde skips the board and other large fields. Extraction: plain text only from `text` of `type: "text"` nodes in `content`; excerpt from the first non-heading blocks, cut at a word boundary at or before 320 characters; marks copied with attrs minus the deny-list `mensaje`, `reemplazo`, `sugerencia`, `evidence`, `provenance`; slim `findings` with `id`, `sage`, `pase`, `severidad`, `criterioId`, `status`; `evaluacionMeta` without `reviewerRuns`, with `currentFingerprint`; `rubrica` as `{ criterios }` only. `review` absent unless the essay has `evaluacionMeta`, a finding or an annotation mark. No Paper gate. Done: `cargo build` in `src-tauri` passes; `grep -n "computeBenchmark\|penalty" src-tauri/src/library.rs` is empty.
- [x] T002 [US5] Add to `src-tauri/src/library.rs` (after T001): `INDEX_VERSION`, load and atomic tmp-and-rename save at `$APP_DATA/library/index.v1.json`, and `reconcile` per data-model.md's table: missing, unreadable or wrong version starts empty; stem new or stat differs re-derives, with the stat taken before the read; stem gone drops the record; parse failure drops the record and never writes, renames or deletes the essay file, logging the count only; anything changed saves; a failed save logs and keeps serving from memory. No Paper gate. Done: `node scripts/library-fixture.mjs check <dir>` passes after each row of quickstart's table that needs no UI.
- [x] T003 [US4] Add to `src-tauri/src/library.rs` (after T001): folding (lowercase, accents removed, one character to one character, «ñ» kept), filled in the background after the first list load outside the lock, then only for changed essays; search per contracts/library-commands.md: every query word present in title or body as a substring, `rank` title or body, title before body then newest first, all matches returned, a query with no words returns no hits; `snippet` starts at the beginning of the sentence holding the first match if within 60 characters, otherwise a word boundary after a leading «…», about 120 characters, ending with «…» when text continues; `Segment { text, hit }`. Bodies never cross IPC. No Paper gate. Done: `cargo test` in `src-tauri` passes; a word only inside a board note returns no hit on the fixture.
- [ ] T004 [US5] Add `LibraryState` (`Mutex<{ index, folded }>`), async commands `library_list` and `library_search` with IO and parsing inside `tauri::async_runtime::spawn_blocking`, reconcile first, in `src-tauri/src/library.rs`, and register module, state and commands in `src-tauri/src/lib.rs`. No path arguments, no new permission. No Paper gate. Done: `cargo test` passes and a release-build call answers in about 30 ms at 1000 essays.
- [ ] T005 [US5] Update `src-tauri/src/storage.rs` (after T004): `essay_list` becomes async and answers from the index with exactly the same six fields; `essay_delete` starts a background reconcile after removing files; `list_in` becomes a scan through the library module with a throwaway index so existing Rust tests keep exercising the real path; `write_in`, `read_in`, `delete_in` unchanged. No Paper gate. Done: `cargo test` passes; MCP `list_essays` returns six fields per essay.
- [ ] T006 [P] Add `view:search` under Vista with accelerator ⌘K to `src-tauri/src/menu.rs`. It is a no-op until T025. No Paper gate. Done: after restart, the menu item appears and pressing it breaks nothing.
- [x] T007 [P] Create `scripts/library-fixture.mjs`, dev only, not bundled: `generate <dir> <n>` writes the shape in research.md and refuses the real app data directory; `check <dir>` compares the index to the files and prints ids and field names only, never text. No Paper gate. Done: `generate` against the real data directory exits with an error; `generate` then `check` on a scratch directory passes.

---

## Phase 2: Slice 2, data flow

**Goal**: The renderer on the index. Old screen still works.

- [x] T008 [P] [US5] In `src/lib/storage/types.ts` add `LibraryEntry`, `ReviewInputs`, `SearchHit`, `Segment` per the contracts; `EssayMeta` stays. In `src/lib/storage/index.ts` add `loadLibrary()` and `searchLibrary(query)`. No Paper gate. Done: `npx tsc --noEmit` passes.
- [x] T009 [US5] Update `src/lib/store.ts` (after T008): `list: LibraryEntry[]`; `listStatus: "loading" | "ready" | "error"`; `library: { query, tipo, revision, orden, scrollTop }` kept for the session and not persisted; `loadList` uses `loadLibrary` and never reports empty on failure, keeping any list it had; `closeEssay` loads the list before switching view, per the order stated in 005's plan; remove `essayToMeta`, `upsertMeta` and the list updates in `newEssay` and `flush`. No Paper gate. Done: `grep -rn "essayToMeta\|upsertMeta" src` is empty; closing an essay shows no frame of old data.
- [x] T010 [US1] Create `src/lib/library/rows.ts` (after T008): `toRow` per data-model.md: `displayTitle` trimmed or «Sin título»; `minutes` `null` at 0 words, else `max(1, round(words / 230))`; `score` from one `computeBenchmark` call per contracts/score-inputs.md, fed by `openForScore(deriveFindings({ content: [{ marks: review.marks }] }, review.findings))` and `contentFingerprint: review.evaluacionMeta.currentFingerprint`; `effectiveMs` is `updatedAt` if valid and not in the future, else `fileModifiedMs`; `monthKey` in local time. Numbers with `Intl.NumberFormat("es", { useGrouping: "always" })`. No Paper gate. Done: `npx tsc --noEmit` passes; `grep -n "PENALTY" src/lib/library/rows.ts` is empty.
- [x] T011 Remove the second boot load from `src/components/EssayList.tsx:16`, so `loadList` in `src/app/page.tsx` is the only one. Add `library_list` and `library_search` (same shapes, simple matcher) to the stub in `tests/e2e/setup.ts` and set reduced motion in `installTauriStub`, so a moving note never covers a button. No Paper gate. Done: `npm run test:e2e` passes on the old screen.

---

## Phase 3: Slice 3, R1.1 and R1.2

**Goal**: A few essays work completely. Owns `Library`, `LibraryBar`, `FirstUse`, `Desk`, `EssayRowMenu`, `Topbar`, `page.tsx`, `globals.css`, E2E selector updates. Runs in parallel with Slice 4 once T012 is done.

- [x] T012 Create `src/components/library/Ledger.tsx` returning null with its final props type, and add every ruled, cream and grid paper surface and the first-use keyframes (on 004's motion tokens) to `src/app/globals.css`. This slice owns that file; Slice 4 requests additions from it. Gate: Slice 0. Paper R1.1, R1.2 and R1.3: read exact values with `get_jsx` and `get_computed_styles`. Done: `npx tsc --noEmit` passes.
- [x] T013 [US1] Create `src/components/library/LibraryBar.tsx`: `data-tauri-drag-region` and the traffic-light inset; search box with `ui/Tooltip` Buscar ⌘K, clear and Esc; Nuevo ensayo split button with its type menu on 004's `Popover`, tooltip ⌘N, testids `library-new-academico` and `library-new-blog`. Update `src/components/Topbar.tsx` so the `view === "list"` branch returns null. Gate: Slice 0. Paper R1.1 and the Slice 0 Nuevo ensayo menu and list window chrome artboards: read exact values with `get_jsx` and `get_computed_styles`. Done: side by side with R1.1; `grep -n $'\xc2\xb7' src/components/Topbar.tsx` is empty; the window drags from the bar.
- [x] T014 [US1] Create `src/components/library/EssayRowMenu.tsx`, shared by `Desk` and `Ledger`: a hover «…» plus right click, opening 004's `Popover` with Borrar and today's confirmation. Designed so more items can be added. Gate: Slice 0. Paper Slice 0 delete control artboard: read exact values with `get_jsx` and `get_computed_styles`. Done: deleting from a card shows today's confirmation and the essay leaves the list.
- [x] T015 [US1] Create `src/components/library/Desk.tsx`: featured sheet with title, three-line excerpt, type, words, minutes and Seguir escribiendo; paper cards with variant and tilt from `tiltOf(id)`; notes on 004's `StickyNote`; 005's `Stamp` at card size only when `row.score` applies, no «sin revisar» text; `EssayRowMenu`. Layout rule: 11 essays or fewer is R1.1. Gate: Slice 0. Paper R1.1 and the Slice 0 layouts from 2 to 12, untitled card and out-of-date card stamp artboards: read exact values with `get_jsx` and `get_computed_styles`. Done: side by side with R1.1 at 5 essays; a reviewed card shows the same number as the editor stamp.
- [x] T016 [US2] Create `src/components/library/FirstUse.tsx`: R1.2 sheet, two big choices, typed title and notes per storyboard, notes on 004's `StickyNote` and `identityOf` with no new color map; timers cleared on unmount, paused while the document is hidden; reduced motion leaves title and notes still. No counter, eyebrow or paragraph. Gate: Slice 0. Paper R1.2 and its storyboard, R1.5: read exact values with `get_jsx` and `get_computed_styles`. Done: each storyboard frame compared; a choice opens that type; with Reduce motion on, nothing moves.
- [x] T017 [US1] Create `src/components/library/Library.tsx` with testid `library`, choosing first use only on `listStatus === "ready"` with an empty list, R1.1 at 12 or fewer, R1.3 above, the first-building and load-failed states, refreshing on window focus. Update `src/app/page.tsx` to render `Library` and keep `loadList` as the only boot load. Move the list view of 004's split in `src/components/McpConnection.tsx` to the place designed in Slice 0. Delete `src/components/EssayList.tsx`. Gate: Slice 0. Paper R1.1 and the Slice 0 first-building, load-failed and MCP placement artboards: read exact values with `get_jsx` and `get_computed_styles`. Done: with essays and a slow boot, first use never flashes; `grep -rn EssayList src` is empty.
- [x] T018 Update E2E selectors only, re-grepping line numbers because 004 to 006 edit these specs first: `tests/e2e/setup.ts` (403, 404 to `library-new-academico`, `library-new-blog`); `flow.spec.ts` (17, 29, 57, 81, 101, 140, 177 to those testids, 154 and 182 to testid `library`); `menu.spec.ts` (72); `sidecar-banner.spec.ts` (21, 60). Re-run `flow.spec.ts:122,157`, `history.spec.ts:181`, `language.spec.ts:120` to confirm. No Paper gate. Done: `npm run test:e2e` passes.

---

## Phase 4: Slice 4, R1.3

**Goal**: 1000 essays browsable. Owns `Ledger`, `LedgerFilters`, `MonthJump`, `src/lib/library/ledger.ts`. Runs in parallel with Slice 3 after T012.

- [x] T019 [US3] Create `src/lib/library/ledger.ts`: filtering by `tipo` (`academico`, `blog` or none) and `revision` (`revisados`, `sin-revisar`, `desactualizados` or none); order `recientes` (default), `antiguos`, `nota`, `titulo`, and `relevantes` while a query exists; flat `LedgerItem` list of `month`, `essay` or `excerpt`, each exactly 36 px; windowing math; month index. A query, filter or non-default order hides the desk cards; otherwise essays shown as cards are left out. Month rows only for date orders. No Paper gate. Done: `npx tsc --noEmit` passes; at 1000 fixture essays, no essay appears twice between cards and lines.
- [ ] T020 [US3] Build `src/components/library/Ledger.tsx` (after T019): ruled page with windowed 36 px rows, the windowing inside this file and no library; columns 34, 918, 120, 72, 64 px; «13 min»; long titles truncated with a full tooltip; one month heading driven by scroll position, current year as the month alone, other years as «Abril de 2025»; `EssayRowMenu`; `scrollTop` restored from `library`. Gate: Slice 0. Paper R1.3 top and mid-scroll: read exact values with `get_jsx` and `get_computed_styles`. Done: side by side with R1.3; scroll end to end at 1000 with no blank gaps and about 16 ms per frame on a release build.
- [ ] T021 [P] [US3] Create `src/components/library/LedgerFilters.tsx`: Tipo, Revisión and order on 004's `Popover`; «Más relevantes» replaces the order label while searching. Gate: Slice 0. Paper R1.3 and the Slice 0 Revisión and order menu artboards: read exact values with `get_jsx` and `get_computed_styles`. Done: a filter change paints in one or two frames.
- [x] T022 [P] [US3] Create `src/components/library/MonthJump.tsx`: year and month grid on 004's `Popover`, jumping to any month and year that has essays. Gate: Slice 0. Paper Slice 0 month jump artboard: read exact values with `get_jsx` and `get_computed_styles`. Done: the month jump lands on the right line at 1000 essays.

---

## Phase 5: Slice 5, R1.4

- [ ] T023 [US4] Wire search in `src/components/library/Library.tsx` and `Ledger.tsx`: results as he types, dropping any response older than the latest query; matching words emphasized from `Segment`, excerpt lines as their own 36 px items; the desk hidden while searching. Gate: Slice 0. Paper R1.4 results: read exact values with `get_jsx` and `get_computed_styles`. Done: a word found only inside a body shows with the excerpt; under 200 ms from keystroke to paint on a release build at 1000.
- [x] T024 [P] [US4] Create `src/components/library/NoResults.tsx`: «Nada con «x» en Blog» with Quitar filtro, wording built from what is active. Gate: Slice 0. Paper R1.4 none: read exact values with `get_jsx` and `get_computed_styles`. Done: side by side with R1.4 none.
- [x] T025 [P] [US4] Add the `view:search` case to `src/lib/menu/bridge.ts`, acting only while the list shows. Re-check that nothing else binds ⌘K after 004 to 006. No Paper gate. Done: ⌘K focuses search on the list and does nothing with the editor or board focused.

---

## Phase 6: Slice 6, proof

Run by agents that did not build it.

- [ ] T026 Run the mechanical checks in quickstart.md, `npm run lint`, `npm run build`, `npm run test:e2e`, `cargo test`, and the hash of every file in the fixture's `essays/` before and after a run with no edits. No Paper gate. Done: all pass, hashes identical.
- [ ] T027 Build a release app (`npm run sidecar:build`, then `npm run tauri:build`), launch it with `ESSAY_STUDIO_DATA_DIR` on the fixture, and measure SC-001 and SC-002 warm, on first build and after a reboot for a cold cache, with temporary logs removed afterward. Run the «index never lies» table including `kill -9` 20 times, and the FR-008 stamp comparison. No Paper gate. Done: the timing and reliability tables are filled in; any cold-cache step not run is stated.
- [ ] T028 Run the five real cases on the release build, re-run after every slice from 3 on, all on generated libraries through `ESSAY_STUDIO_DATA_DIR` (5 essays, 13 essays, 1000 essays, empty), and compare R1.1, R1.2 and each storyboard frame, R1.3, the month jump, each filter menu, R1.4 and the Slice 0 states. Time reaching an essay by name, under 10 s (SC-003). Run the MCP and ⌘K checks. Gate: Slice 0. Done: screenshots per case; anything not seen working stated as «no lo he visto funcionar».
- [ ] T029 Independent reviewers score against R1.1 to R1.4: usefulness, how fast it scans, reliability of what the list claims, design, UX, minimum 4 of 5 (SC-005). Gate: Slice 0. Done: scores and link reported.
- [ ] T030 [P] Add session notes to `CLAUDE.md`: index, reconcile rule, score inputs rule. No Paper gate. Done: the entry names the two steps from contracts/score-inputs.md.

---

## Dependencies and execution order

| Slice | Depends on | Runs |
|---|---|---|
| 0 Paper pass (elsewhere) | Noe's approval | Gates every `Gate: Slice 0` task |
| 1 index | Spec 005's `findings` field in Rust | Parallel with Slice 0 |
| 2 data flow | Slice 1 | After Slice 1. No Paper gate |
| 3 R1.1 and R1.2 | Slice 2, Slice 0 | Parallel with Slice 4 after T012 |
| 4 R1.3 | Slice 2, Slice 0, T012, T014 | Parallel with Slice 3 |
| 5 R1.4 | Slices 3 and 4 | Sequential |
| 6 proof | All | Last |

**Rule for every later change** (contracts/score-inputs.md): a change to what the score reads updates `ReviewInputs` and bumps `INDEX_VERSION` in that same change. Spec 008 keeps `consigna` out of the index.

## Parallel example, Slice 4

```text
T021 src/components/library/LedgerFilters.tsx
T022 src/components/library/MonthJump.tsx
```

## Implementation strategy

Sonnet subagents implement, one per task or per group on the same files. Opus reviews every diff before the next slice. Slice 1 and 2 ship real value on the old screen: the window stops freezing on every list load.

## Requirement coverage

| Requirement | Tasks |
|---|---|
| FR-001 | T015, T017, T020 |
| FR-002 | T010 |
| FR-003 | T020 |
| FR-004 | T004, T020, T027 |
| FR-005 | T001, T004 |
| FR-006 | T001, T003 |
| FR-007 | T019, T021 |
| FR-008 | T010, T015, T027 |
| FR-009 | T002, T005 |
| FR-010 | T016 |
| FR-011 | T012, T016 |
| FR-012 | T026 |
