# Research: Review, Corrections and Score Stamp

## Verified against the code

| Claim | Evidence |
|---|---|
| Mark attrs omit `cita` and `generadoEn` | `Annotation.ts:22-33` |
| Dismiss and apply delete the mark, no closed state exists | `removeAnnotationById`, `applyAnnotationReemplazo` |
| Re-review only adds | `EditorPane.tsx` `applyAnotaciones` |
| `pluma-roja:unresolved` has no listener | grep across `src` finds only the dispatch |
| Stale is `updatedAt > evaluadoEn`, bumped by board, title, mode, language, sources, rubric, interrogatorios, restore, marks | `score.ts`, every setter in `store.ts` |
| Drilldown only opens from rings, which need a rubric | `Scorebar.tsx` center column |
| `recordEvaluacion` replaces coverage | `store.ts` |
| Rust drops unknown essay fields | `storage.rs` explicit struct, no flatten; `history.rs:36` reuses it |
| E2E stub stores any shape, so it cannot detect that loss | `setup.ts` `essay_write` |
| ⌘Z reaches TipTap only with focus inside the editor | `editor/history.ts` |
| Sidecar supports cancel, but a canceled run can report `INCOMPLETE_REVIEW`: `session.close()` ends the iterator normally and the `!completed` throw wins. Fixed in Slice 2b | `sage.ts:34`, `runner.ts` `!completed` line |
| Every review of an essay with a rubric fails today: the renderer sends `{ criterios }`, the validator requires an array, and the E2E stub accepts both, which is why nothing caught it. Fixed in Slice 1 | `critique()` in `agents/index.ts`, `assertReviewRequest` in `review-contract.ts` |
| A sidecar crash mid-run hangs the renderer promise | `runSidecarCommand` listens only to `sage://event` |
| `applyAnnotationReemplazo` refuses multi-block | `crossesBlock` |
| Per-run timeout exists | `runner.ts:92`, 120 s |

## Decisions

### Finding state: record plus anchor
**Decision**: persisted record keyed by id, mark as anchor, presence of the mark wins.
**Why**: resolved, not applicable and not located findings have no mark, so state in mark attributes cannot represent them. The presence rule gives correct undo for free: ProseMirror restores the mark, and nothing in the store needs to know about history.
**Rejected**: status attribute on marks with hidden resolved underlines. It cannot hold not located findings, breaks as soon as text is deleted, and leaves invisible marks in the document that MCP and the score would need to filter. **Rejected**: findings as the only store with marks reduced to ids. Requires migrating every essay and changes the MCP shape.

### Unlocated findings count
**Decision**: they count while open.
**Why**: 10 means nothing left to fix (session 9). An open card beside a 10 contradicts it, and closing the card is one click. Older essays have no such findings, so `score.spec.ts` and existing numbers are unaffected.

### Staleness by fingerprint of what was read
**Decision**: per pass hash of plain text, the rubric's `criterios` and per source `{id, nombre, cita, contenido}`, captured at run start.
**Why**: FR-009 lists exactly those inputs, and capturing at start makes typing during a run correctly out of date. Hashing plain text, not TipTap JSON, is what stops marks from affecting it.
**Rejected**: excluding specific setters from bumping `updatedAt`. It needs an edit in every setter, drifts with each new one, still cannot tell a mark change from a text change inside `updateContent`.
Hash is a small sync string hash: no security role, and `crypto.subtle` is async inside a pure function called during render.

### Application with `addToHistory: false`
Marks do not change words, and Limpiar and re-review already reverse them. If it were undoable, ⌘Z right after a review would strip every underline instead of undoing the last keystroke, leaving records open with no marks. Known limit: undoing an old deletion after a re-review can restore a mark from the previous review; it appears as an open finding and the next review replaces it.

### Undo reaches the editor from the panel
`applyNativeHistory` falls to `document.execCommand` unless focus is in the editor, and a folding card drops focus to `body`. Spec 004's last-pointer record decides where `body` goes, and every `Finding` action marks it as `document`, which covers Usar este texto, Ya lo resolví and No aplica without stealing focus from the panel. Title and overlay inputs keep their native stack.

### Essay closed during a run
**Decision**: cancel, discard and show one line.
**How**: through `registerEssayLeaveHook`, which spec 006 reuses. Only one synchronous re-check remains before the transaction.
**Why**: the spec allows either. Keeping results means writing marks into an essay with no live editor, breaking «the live editor is authoritative». Cancel also stops spending credit.

### Evidence has three real states
`verifyEvidence` is literal: verified, invalid, missing_source. R6.5's «Dice lo mismo con otras palabras» has no data behind it, and showing it would be fabricated.

| State | Phrase | Icon |
|---|---|---|
| verified, relation supports or context | Coincide con tu fuente | none |
| verified, relation contradicts | Coincide con tu fuente, pero dice lo contrario | none |
| invalid | No aparece en la fuente | warning |
| missing_source | Ya no está en tus fuentes | warning |

«Coincide» states only literal presence, preserving the distinction from 2026-11-07. Evidence is re-verified against the live library at read time, as today. Provenance stays persisted and is never shown.

### Reachable score
«Puedes llegar a X» comes from calling `computeBenchmark` with that pass added to coverage. No arithmetic in the interface, and no guess about what the pass will find.

### Volver a revisar runs directly
Spec requires one step. It runs the default passes for the essay type. It never touches resolved or not applicable findings.

### Severity
`alta`, `media`, `baja` display as Importante, Media and Menor with the bars of R4.2, in ink. Never red.

### R4.1 options are filled toggles
R4.1's options are filled agent toggles like spec 006's tiles, not check boxes. Constitution IV: a check means only that a whole card is done. The R4.1 artboard changes in Slice 0.

### Card label
R4.2 shows «en <criterio>». With no rubric or no `criterioId`, it falls back to the pass label.

## Copy (final wording settled in slice 0)

Not located: «No encontré esta frase en el texto.» Across paragraphs: «Abarca varios párrafos. Cópialo y pégalo a mano.» One agent failed: «Citas APA no terminó.» with Reintentar. All failed: «No se pudo revisar. Tu revisión anterior sigue igual.» Out of date tooltip: «El texto cambió desde la revisión.» Discarded: «Cerraste el ensayo y la revisión se canceló.» Limpiar confirm: «¿Quitar todas las correcciones de este ensayo? También se borran las resueltas.»

## Simplest version considered

Keep the marks, add only a list of dismissed quotes to suppress re-review. It fixes FR-007 and nothing else: no Resueltas, no reopen, no not located cards, no persistence of resolved. It does not beat the record, which costs one optional field.
