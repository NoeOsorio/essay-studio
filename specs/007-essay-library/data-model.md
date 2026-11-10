# Data Model: Essay Library at Scale

No field of a saved essay changes. No migration exists. Everything here is derived and can be deleted at any time.

## On disk: library index

Path: `$APP_DATA/library/index.v1.json` (`ESSAY_STUDIO_DATA_DIR` is honored through `app_data_dir`). It is outside `essays/`. Written atomically with tmp then rename, as `write_in` does.

| Field | Meaning |
|---|---|
| `version` | `INDEX_VERSION`. A mismatch is treated as a missing file. |
| `records` | Map from file stem to `IndexRecord`. |

**IndexRecord**

| Field | Meaning |
|---|---|
| `mtimeNs`, `size` | The essay file's stat, taken before reading it. Both must match or the record is re-derived. |
| `entry` | `LibraryEntry`, below. |
| `text` | Plain text of the essay body. Crosses IPC never. |

## LibraryEntry (sent to the renderer)

| Field | Source |
|---|---|
| `id`, `title`, `mode`, `wordCount`, `createdAt`, `updatedAt` | The essay, same values as `EssayMeta`. |
| `excerpt` | Opening of the text: the first non-heading blocks, cut at a word boundary at or before 320 characters, enough for the three lines of the featured sheet in R1.1. Empty when there is no text. |
| `fileModifiedMs` | The file's modification time, for the rule on future or missing dates. |
| `review` | `ReviewInputs` when the essay has `evaluacionMeta`, a finding or an annotation mark; absent otherwise. |

**ReviewInputs** (contract in contracts/score-inputs.md)

| Field | Source |
|---|---|
| `marks` | Each `annotation` mark, with `type` and `attrs` minus the deny-listed large fields. |
| `findings` | Slim copy of `essay.findings`: `id`, `sage`, `pase`, `severidad`, `criterioId`, `status`. Absent when the essay has none. |
| `evaluacionMeta` | The essay's value without `reviewerRuns`, `currentFingerprint` included. Absent when the essay has none. |
| `rubrica` | `{ criterios }` only (3 to 8 short items), so 008's `consigna` never enters the index; or absent. |

## Parse rule

A file is an essay exactly when it parses with the required fields of `Essay` and the same optional field types (`language`, `reviewerProfile`). The board and other large fields are skipped by serde, which still validates their JSON. So a file that would fail to open does not appear.

## Reconcile (the only way the index changes)

Runs under one mutex at the start of `library_list`, `library_search` and `essay_list`, and in the background after `essay_delete`.

| Situation | Effect |
|---|---|
| Index file missing, unreadable, wrong version | Start empty and build everything. |
| Stem new, or stat differs | Read and re-derive. |
| Stem gone from `essays/` | Drop the record. |
| Parse fails (damaged file) | Drop the record if there was one. **Never write, rename or delete the essay file.** Log the count only, never content. |
| Anything changed | Save the index atomically. |
| Save fails | Log it, keep serving from memory. |

## In memory (Rust)

`LibraryState`: `Mutex<{ index, folded }>`. `folded` maps stem to folded title and text; filled in the background after the first list load, then only for changed essays. The 115 ms fold runs on a copy outside the lock and the result is swapped in, so `library_list` never waits behind it.

## Renderer

**LibraryRow** (derived in `src/lib/library/rows.ts`, never stored)

| Field | Rule |
|---|---|
| `entry` | The entry. |
| `displayTitle` | Trimmed title, or «Sin título». |
| `minutes` | `null` at 0 words, else `max(1, round(words / 230))`. |
| `score` | `computeBenchmark` output when `review` exists, else `null`. The stamp mirrors 005's state table: nothing only for 005's «none» state (no `review`), and the no-number variant through `Stamp` at card size when findings or marks exist and `overall` is `null`. |
| `effectiveMs` | `updatedAt` if valid and not in the future, else `fileModifiedMs`. |
| `monthKey` | Year and month of `effectiveMs`, local time. |

**LedgerItem**: `month` or `essay` or `excerpt`, each exactly 36 px.

**Store additions**

| Field | Values |
|---|---|
| `list` | `LibraryEntry[]` (was `EssayMeta[]`). |
| `listStatus` | `"loading"`, `"ready"`, `"error"`. First use shows only on `ready` with an empty list. |
| `library` | `{ query, tipo, revision, orden, scrollTop }`, kept for the session so going into an essay and back keeps the search and the place. Not persisted. |

**Filter values**: `tipo`: `academico`, `blog` or none. `revision`: `revisados`, `sin-revisar`, `desactualizados` or none. `orden`: `recientes` (default), `antiguos`, `nota`, `titulo`, and `relevantes` as the default while a query exists.

**Layout rule**: with 11 essays or fewer in the library, R1.1. With more, R1.3. A query, a filter or a non-default order hides the desk cards so the ruled page shows everything matching; otherwise the essays shown as cards are left out of the ruled page. Month rows exist only for date orders.
