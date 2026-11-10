# Data model: Review, Corrections and Score Stamp

All additions are optional. An essay saved before this change is valid as is.

## `Essay.findings?: FindingRecord[]`

Rust stores it as opaque `Option<serde_json::Value>` on `Essay`, which also covers snapshots. Omitted when empty.

```ts
type FindingStatus = "open" | "resolved" | "not_applicable";

type FindingRecord = {
  // Written once when the review lands. Never edited.
  id: string;            // same id as the mark
  sage: Sage;
  pase: Pase;
  severidad: Severidad;
  cita: string;          // quote from the reviewer, or text under the mark for older findings
  mensaje: string;
  reemplazo?: string;
  criterioId?: string;
  evidence?: ReviewEvidence[];
  provenance?: ReviewProvenance;
  generadoEn: string;
  // Changes over the life of the finding.
  status: FindingStatus;
  closedAt?: string;     // ISO, when resolved or not applicable
  closedBy?: "check" | "replacement";
  occurrence?: number;   // which occurrence of cita, so repeated quotes re-anchor correctly
};
```

Marks keep exactly today's attributes. `cita` and `generadoEn` stay out of the mark.

**Authority.** The mark is the only authority for location and for being underlined. The record is the only authority for closure. The body is immutable and copied, so the copy cannot drift.

## Deriving the list

`deriveFindings(content, records): FindingView[]` is pure and is the only reader. Stamp, panel, card, suppression, MCP and the library list all use it. The list passes slim records and a document holding only marks (spec 007); `openForScore` reads only `id`, `sage`, `pase`, `severidad`, `criterioId` and `status`.

| Mark with this id | Record | Result |
|---|---|---|
| yes | none | Open, located. Older essay. Body from mark, `cita` from the text under the mark |
| yes | any status | **Open, located. Presence wins.** This is what makes ⌘Z correct |
| no | open | Open, not located (never found, or its text was deleted) |
| no | resolved | Resolved |
| no | not_applicable | Hidden from the list, kept for suppression |

`FindingView` adds `located`, `from`, `to`, `quote` (live text under the mark when located, else `cita`) and `spansBlocks`.

Order: open located in document order, then open not located by `generadoEn`, then resolved by `closedAt` descending.

## What counts in the score

`openForScore(views)` returns every view with status open, located or not, mapped to `AppliedAnotacion`. Resolved and not applicable never count. `computeBenchmark` penalties and arithmetic are unchanged.

For an essay with no records this list equals `extractAnotacionesFromContent(content)`, so existing numbers do not move. The one new input is a finding the review returned that has no underline: previously dropped, now visible and counted, because an open card next to a 10 would break what 10 means. It can always be closed.

## `EvaluacionMeta` additions

```ts
fingerprintsByPase?: Partial<Record<Pase, string>>;  // what each pass actually read
appliedFingerprints?: string[];                      // fingerprints linked by Usar este texto
currentFingerprint?: string;                         // the essay as last saved; read by the library list (spec 007)
```

Fingerprint = sync hash of `[extractPlainText(content), rubrica.criterios, fuentes.map({ id, nombre, cita, contenido })]`, captured when the run starts. Marks are not part of plain text. The source fields are exactly what `renderFuentes` sends to the reviewers (`prompts.ts:87`), and of the rubric only `criterios`, so spec 008's `consigna`, `autores`, `anio` and `citaRevisadaEn` do not mark a review out of date. Each source's part of the hash is cached in a `WeakMap` keyed on the `Fuente` object, so neither a render nor a save re-hashes text that did not change.

**`currentFingerprint`.** The same fingerprint, of the essay as saved. It is set in `flush()` (`store.ts:726`, right before `writeEssay`), only when `evaluacionMeta` exists, on the copy passed to `writeEssay` and never on `current`, so `flush`'s `get().current === cur` check still holds and `updatedAt` never moves. `flush()` is the only autosave write; `newEssay`'s write (`store.ts:259`) has no meta. It exists so the library list (spec 007) reaches the editor's out-of-date answer without the text: Rust only copies it. When it is absent the timestamp rule applies, on both surfaces.

**Staleness.** With `fingerprintsByPase` covering every pass in `pasadasCubiertas` and a current fingerprint `F`, a pass with stored `R` is fresh when `R === F`, or when both `R` and `F` are in `appliedFingerprints`. The review is out of date when any covered pass is not fresh. Otherwise the existing timestamp comparison applies, which is what `score.spec.ts` exercises.

**Usar este texto.** If fresh before the replacement, both the old and the new fingerprint go into `appliedFingerprints`. If already out of date, nothing is linked and it stays out of date. Undo returns to a linked fingerprint and stays fresh.

**Older evaluations.** On open, if the meta has no fingerprints and the timestamps say fresh, fingerprints are filled in memory, written only on the next real save. Without this, the first resolve on an existing essay would show out of date. If timestamps already say stale, it stays so until the next review.

**Coverage.** `pasadasCubiertas` becomes previous union this run's clean passes, minus any pass that returned invalid lines. `fingerprintsByPase` is overwritten only for passes in this run. A partial run over changed text therefore stays out of date, with no special case. `appliedFingerprints` is cleared when all covered passes share one fingerprint.

## Applying a review

Runs when every pass has settled, on the live document, in one transaction with `addToHistory: false`.

1. Classify each pass: clean, partial (returned lines with invalid ones), failed. All failed or canceled: stop, nothing changes.
2. From `deriveFindings`, take open findings of clean and partial passes. Remove their marks and delete their records. Findings of failed passes, resolved and not applicable are kept.
3. For each new finding, locate with `findCitaRange(editor, cita, skip)`, falling back to `skip = 0` when a repeated quote runs out of occurrences.
4. Suppress when a closed finding of the same pase still applies: its `cita` is found at its `occurrence`, and the new range intersects the sentence containing it. A not located new finding is suppressed on equal normalized `cita`. Resolved findings use the same rule, which is the «no duplicates» edge case; a sentence he changed no longer matches, so a real new problem still appears.
5. Add marks and write an open record for every survivor, located or not.
6. Commit meta, then flush.

Known limit: a reworded fragment in a different sentence can slip past suppression.

## Transitions

| Action | Document | Record |
|---|---|---|
| Ya lo resolví | Remove mark, in history | `resolved`, `closedBy: check` |
| Uncheck | Re-add mark if `cita` is found, no history | `open`; not located when text is gone |
| No aplica | Remove mark, in history | `not_applicable` |
| Usar este texto | Replace text, one isolated history step | `resolved`, `closedBy: replacement` |
| ⌘Z after any of the above | Mark returns | Unchanged; presence rule shows it open |
| Delete underlined text | Mark gone | Stays `open`, shows not located |
| Limpiar revisión | All marks removed | `findings` cleared, meta cleared |
| Restore version | Whole essay replaced | Comes from the snapshot |

An older finding with no record gets one at its first closure, built from its view. That is the only migration, and it is lazy.

## Review run (session only, never persisted)

Store slice: `review: { essayId, restoreNonce, fingerprint, passes: Record<Pase, { status, progress, requestId }> } | null`, and `reviewOutcome` for the error line.

Progress: started is a small step, each returned line moves asymptotically toward 90 percent, completion is 100. These are real events; no timer fakes it.
