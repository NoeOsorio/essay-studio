# Research: Essay Library at Scale

All numbers were measured on 2026-11-08 on Noe's Mac with a generated fixture in a scratch directory. Nothing in the repo was changed.

## Fixture

1000 essay files written the same way `write_in` writes them (pretty JSON). Each has TipTap content of 250 to 4,550 words, annotation marks with their real attributes (0 to 30 on the 60% that are reviewed), a tldraw-shaped board with 0 to 40 notes, and sources on about a third.

- Normal fixture: 70 MB, 72 KB average, 225 KB largest. Noe's real files today run from 300 B to 113 KB.
- Heavy fixture: 389 MB, same essays with sources about ten times larger. This approximates what spec 008 (PDF text in sources) will produce.

## Measurements (Rust release build, warm file cache)

| Operation | Normal | Heavy |
|---|---|---|
| Today's `list_in`, full parse of every essay | 141 to 151 ms | 409 ms |
| Full index build (parse without board or sources, text, slim marks) | 135 ms | 398 ms |
| Stat walk over 1000 files | 3.2 ms | 3.1 ms |
| Load persisted entries (1.8 MB) | 6.5 ms | 6.3 ms |
| Load persisted body text (22.6 MB) | 22 ms | not re-run, text is the same |
| Write entries and text, atomic | 5 + 28 ms | not re-run |
| Fold all body text for search | 115 ms | not re-run |
| Reconcile (stat and compare) | 2.9 ms | not re-run |
| Re-derive the largest single essay | 0.5 ms | not re-run |
| Search, including first-hit offset walk: «confianza» in 1000 essays | 4.5 ms | not re-run |
| Search «a» / no match / two tokens | 0.2 / 3.7 / 2.6 ms | not re-run |

Renderer side (Node 22):

| Operation | Result |
|---|---|
| `JSON.parse` of 1000 entries (1.75 MB) | 5.9 ms |
| `computeBenchmark` for 622 reviewed essays through the real `score.ts` | 2 to 6 ms |

Rendering 1000 rows with React 19 production (rows with an SVG icon, title, numbers and a rotated stamp), in a real WKWebView driven from a Swift harness, since the Playwright install has no WebKit:

| | Plain DOM | Windowed |
|---|---|---|
| Mount | 106 ms | 17 ms |
| Filter to half | 44 ms | 16 ms |
| Remove filter | 54 ms | 17 ms |
| Scroll frame p50 / p95 / max | 15 / 17 / 36 ms | 16 / 18 / 19 ms |
| DOM nodes | 8,710 | 340 |

Limits of these numbers: the file cache was warm (a cold read needs `purge`, which needs admin rights, so quickstart measures it after a reboot); release builds only (a `tauri:dev` debug build is several times slower for serde work, so SC-001 and SC-002 are judged on a release build); the search harness did not build the final emphasis segments; the rendering test rows are simpler than the real ones, so the real plain-DOM cost would be higher, not lower.

## Decision 1: a persisted cache file, not an in-memory scan only and not SQLite

**The simplest alternative was measured first.** Today's scan costs 150 ms on normal files, on the main thread, twice at boot and again on every close. That is a freeze, but not a catastrophe. An in-memory index rebuilt at each launch off the main thread would be 135 ms normal and 398 ms heavy, warm, and it still reads every byte of every essay on each launch, which FR-005 forbids and which grows with spec 008.

A persisted file costs about 29 ms to load no matter how large sources or boards get. The extra code over the in-memory version is one load and one atomic save. It is worth it.

**SQLite (rusqlite with FTS5) rejected.** It is a new native dependency, and search over the whole corpus already takes under 5 ms with plain substring matching. Nothing in the measurements asks for it. The repo's CLAUDE.md foresees SQLite when volume demands it; volume at 1000 essays does not. See Proposals in plan.md.

## Decision 2: the index holds the score's inputs, never the score

The brief's example was the renderer writing a derived summary beside each save. Rejected because that summary cannot exist for:

- essays never opened since the upgrade,
- the first build,
- a rebuild after the index is lost,
- a file changed or restored outside the renderer.

Covering those means either reading every full essay into the renderer (breaks FR-005) or a second scorer in Rust (breaks FR-008). It would also make every stored score wrong the day spec 005 or anyone else changes the penalties.

Instead Rust copies only what the score reads: the annotation marks' small attributes, slim finding records, `evaluacionMeta` (with `currentFingerprint`), and the rubric's `criterios`. The renderer runs the one real `computeBenchmark` on them. Cost: 2 to 6 ms for all reviewed essays. Rust never knows what a penalty is. The list and the editor cannot disagree, because they run the same function on the same fields.

Marks are copied with a deny-list (drop only `mensaje`, `reemplazo`, `sugerencia`, `evidence`, `provenance`) so a small attribute added later reaches the scorer without a Rust change. The marks are wrapped back into a document shape so `extractAnotacionesFromContent` stays the only reader of mark attributes. See contracts/score-inputs.md for what any later change must do.

## Decision 3: the save path never touches the index

The index is reconciled against the files on every read: stat all files (3 ms), re-derive only those whose size or modification time differ, drop those gone, save if anything changed.

`write_in` and `delete_in` stay as they are. There is no window between "essay saved" and "index updated" for a crash to fall into, which is what makes SC-004 true by construction instead of by careful ordering. The stat is taken before the read, so a save racing a reconcile can only cause one harmless extra re-derive at the next read.

## Decision 4: one index file

One file with entries and text, rewritten only when something changed. Two files would load 22 ms faster at boot but need a cross-check for a crash between the two writes. At 33 ms off the main thread, the rewrite does not matter.

The file lives in `$APP_DATA/library/`, outside `essays/`, so it can never be mistaken for an essay.

## Decision 5: search in Rust over text held in memory

Bodies never cross IPC. Rust matches and returns ids with ready-made emphasis segments, so the renderer has no folding code of its own and there is one definition of a match.

- **Matching**: every word of the query must appear in the title or the body, as a substring, so results work while typing.
- **Folding**: lowercase and strip accents, one character to one character, so «hermeneutica» finds «hermenéutica». «ñ» stays distinct, since «año» and «ano» are different words.
- **Scope**: only `text` of `type: "text"` nodes in `content`. Mark attributes, the board, sources and interrogations are structurally unreachable, which is what FR-006 and User Story 4 scenario 4 need.
- **Cost of folding**: 115 ms once, done in the background after the first list load and outside the state lock, then per changed essay only. Memory is about 45 MB at 1000 essays (text plus folded text).

## Decision 6: windowing without a library

WKWebView plain DOM passes at 1000 but with a 36 ms worst frame and 44 to 54 ms filter updates, on rows simpler than the real ones. Windowing gives 16 to 19 ms everywhere for about 40 lines of code. It needs no library because every item is one fixed height of 36 px from R1.3, so offsets are a multiplication. A search excerpt is its own 36 px item.

Consequences that the plan handles: one month heading element driven by scroll position instead of CSS sticky headings, and the page offset above the ruled page has to be accounted for.

`content-visibility: auto` was not measured, and was not needed once windowing passed.

## Decision 7: `essay_list` keeps its shape

`list_essays` (MCP) returns `listEssays()` as is. Adding excerpts and marks to it would put about 1.8 MB into an agent's context at 1000 essays. So `essay_list` keeps its six fields and the renderer gets a separate `library_list`. `essay_list` is served from the index and moves off the main thread, so an agent's call no longer freezes the window.

## Facts read from Paper

- Reading time is rounded, not rounded up: 740 words is 3 min, 2,140 is 9, 3,410 is 15. Ceiling would give 4, 10 and 15.
- Numbers need a thousands point: «2.140». `toLocaleString("es")` gives «2140»; `Intl.NumberFormat("es", { useGrouping: "always" })` gives «2.140» in WKWebView (verified) and leaves «980» alone.
- Ledger rows and month rows are 36 px, columns 34, 918, 120, 72, 64 px.
- Filters at top right: Tipo, Revisión, order. «Más relevantes» replaces the order label while searching.
- Months in R1.3: the current year shows the month alone, other years show «Abril de 2025».
- Search hides the desk cards (R1.4).

## Not drawn in Paper

Delete control, Nuevo ensayo menu open, Revisión and order menus, months with no essays in the jump menu, layouts from 2 to 12 essays, cards for an untitled or empty essay, row hover, the first-build and load-failed states. These go to slice 0 of the plan.

## A bug the new screen would have exposed

`loadList` sets `list: []` on failure and before it first resolves. The empty list is exactly what will trigger the first-use animation, so anyone with 1000 essays would see «first use» during boot or after an IO error. `listStatus` in the data model removes that.
