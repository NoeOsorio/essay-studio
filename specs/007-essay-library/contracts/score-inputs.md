# Contract: What the Index Carries for the Score

FR-008 requires one computation. `computeBenchmark` in `src/lib/benchmark/score.ts` is that computation, in the editor and in the list. Rust copies inputs and never calculates.

## The rule for every other spec

If a change alters what the score or the out-of-date state reads, then **in that same change**:

1. add the new input to `ReviewInputs` in `src-tauri/src/library.rs` and to its TypeScript type, and
2. bump `INDEX_VERSION`, which forces one rebuild at next launch.

A new small attribute on the annotation mark needs only step 2, since marks pass through a deny-list. Deny-listed: `mensaje`, `reemplazo`, `sugerencia`, `evidence`, `provenance`.

Changing penalties, weights or rounding needs neither step, because the index stores no scores.

## What feeds the score today

| Argument of `computeBenchmark` | From `LibraryEntry` |
|---|---|
| `anotaciones` | `openForScore(deriveFindings({ content: [{ marks: review.marks }] }, review.findings))` |
| `rubrica` | `review.rubrica`, which copies `{ criterios }` only, so the real `Rubrica` type holds with no cast |
| `evaluacionMeta` | `review.evaluacionMeta` |
| `essayMode` | `mode` |
| `essayUpdatedAt` | `updatedAt` |
| `contentFingerprint` | `review.evaluacionMeta.currentFingerprint` |

## The out-of-date state

Spec 005 defines it. `evaluacionMeta.currentFingerprint` is computed by the renderer and written in `flush()` at save time (005 data-model.md). Rust copies it and never hashes or normalizes text, since that would be a second implementation of the rule and would break FR-008.

When `currentFingerprint` is absent, `computeBenchmark` falls back to the timestamp rule, which is what the editor's in-memory backfill also answers for an older essay before its first save. The two surfaces agree in both cases.

The stamp in the list is 005's presentational `Stamp`, given `score`.
