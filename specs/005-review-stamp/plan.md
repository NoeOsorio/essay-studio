# Implementation Plan: Review, Corrections and Score Stamp

**Branch**: `004-stationery-redesign` (one branch for the series 004 to 008, see [series.md](../004-stationery-shell/series.md)) | **Date**: 2026-11-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-review-stamp/spec.md`

## Summary

Replace the review modal, the bottom score bar and its drilldown with the approved desk flow: a small panel hanging from Revisar ensayo, findings that land in the text on their own, a paper stamp in the toolbar, one Correcciones panel and one `Finding` card used everywhere. Finding state becomes durable through one new optional essay field, with the annotation mark staying as the anchor.

**Root cause.** A finding today exists only as a TipTap mark, so the app has no way to remember a finding that has no underline. Dismiss and apply delete the mark and with it the only trace (`Annotation.ts` `removeAnnotationById`, `applyAnnotationReemplazo`). That single fact produces every symptom Noe reported: dismissed findings return on the next review because nothing remembers them, re-review stacks duplicates because `EditorPane.tsx:228` only adds, citations the app cannot locate are thrown away because `pluma-roja:unresolved` (`EditorPane.tsx:364`) has no listener, and there is no such thing as Resueltas. Separately, «out of date» is computed from `updatedAt > evaluadoEn` (`score.ts:212`), and `updatedAt` is bumped by everything including resolving a finding and moving a sticky note, so the signal cannot mean «your text changed». The review itself lives in a component (`PlumaInner` state), so closing the modal kills it, which is why the flow had to be a blocking modal in the first place.

**Why this attacks it.** A persisted record gives a finding an existence independent of its underline; a fingerprint of the reviewed text gives staleness a definition tied to what the reviewers actually read; a run owned by a module instead of a component lets the review outlive any panel. The penalties and `computeBenchmark` arithmetic do not change.

**Smallest root fix.** One optional essay field (`findings`), optional meta fields (`fingerprintsByPase`, `currentFingerprint`), one Tauri command (`sage_cancel`), one pure module that derives the list. Existing marks keep every attribute and need no migration.

**Separate proposal, not in this plan.** Findings could become the only store, with marks reduced to an id. That removes the immutable copy of the finding body on the mark, but it requires migrating every saved essay and changing what MCP clients read. Cost is high and it fixes nothing Noe can see. Not recommended now.

## Technical Context

**Language/Version**: TypeScript 5 strict, React 19, Next 16 static export, Rust (Tauri 2.11), Node sidecar

**Primary Dependencies**: TipTap 3, ProseMirror history, Zustand 5, Tailwind 4. From spec 004: `src/lib/agent-identity.ts`, `Tooltip`, `Popover`, `Panel`, `overlayInstant`, motion tokens, toolbar slot

**Storage**: Essay JSON in app data (`storage.rs`, atomic write), `<id>.history.jsonl` snapshots (`history.rs`)

**Testing**: No new unit tests. Existing Playwright suite gets selector and assertion updates listed below. Verification is the running app

**Target Platform**: macOS desktop app, plus the live MCP surface

**Project Type**: Desktop app (Tauri + static renderer + Node sidecar)

**Performance Goals**: Resolve updates the stamp in the same frame. Deriving findings is linear in the document and memoized on `current.content` and `current.findings`

**Constraints**: Panel scrolls inside the window; entrance stagger applies only to the first screenful; Resueltas renders its rows only when opened; cards use `content-visibility: auto`. Designed for 1000 findings with no virtualization library

**Scale/Scope**: Today 3 to 12 findings per pass; 40+ must stay usable

## Constitution Check

| Principle | Pre-design | Post-design |
|---|---|---|
| I. Work never lost | Pass. Marks never change words; Usar este texto is one native undo step | Pass. Record and marks persist in one atomic essay write; Rust field added so saves, snapshots and restore keep it; run results re-check the essay id at the mutation boundary |
| II. Reuse | Pass. TipTap marks, JSON storage, `findCitaRange`, `getDocumentEditor`, `computeBenchmark` reused. No `any` | Pass. One derive function feeds stamp, panel, card and MCP |
| III. Boundaries in code | Pass. No new tool surface | Pass. `sage_cancel` only writes a cancel for an id; MCP change is read-only |
| IV. Stationery Desk | Conditional: states not drawn need Paper first | Pass after slice 0. Review is never red; no dotted surface; `#B42318` only for system errors; no pass or benchmark wording |
| V. Done means usable | Pass. Noe approves this plan before code | Pass. Verification below runs in the desktop app with independent reviewers |

No violations, so Complexity Tracking is empty.

## Invariants and how each is kept

| Invariant | How it is kept |
|---|---|
| Saved essays open unchanged | `findings` and `fingerprintsByPase` are optional. Absent means every mark is an open finding, synthesized at read time. Nothing is rewritten on open |
| Persisted ids stay | `em`, `sis`, `pra`, `cri`, pase values, mark attribute names and `data-*` attributes untouched. No new mark attribute. Menu ids `sabios:evaluar` and `sabios:limpiar` stay |
| Live editor is authoritative | Presence rule: a mark with the id means the finding is open and located, whatever the record says. Application goes through `getDocumentEditor(essayId)` and locates quotes against the live text |
| Autosave and history | Finding actions run the TipTap command first, then read `get().current` fresh and write the record (the session 17 ordering bug), then flush. Content and record reach disk in one atomic write. `Snapshot.essay` is the Rust `Essay` struct, so the new field must be added there or snapshots silently lose it |
| Scoring unchanged | `PENALTY`, `PENALTY_PER_MISSING_PASADA` and the arithmetic are untouched. The 16 tests in `score.spec.ts` keep passing with the timestamp fallback. Only the caller's input list is defined, in data-model.md |
| Undo | Usar este texto stays one history step, isolated with `closeHistory`. Undo brings the mark back and the presence rule reopens the card with no coupling to the store. Each `Finding` action marks 004's last-pointer record as `document`, so ⌘Z reaches the editor after a card folds and focus drops to `body` |
| Review never moves undo | Applying a review is one transaction with `addToHistory: false`. ⌘Z after a review keeps undoing typing rather than stripping underlines |
| MCP keeps working | `annotations` keeps its shape and gains `status`; `findings` is additive. Revision handling unchanged: any `current` change bumps it as today |
| IME | Application waits for `compositionend` when `editor.view.composing` is true |
| Never applied to another essay | Run stores `essayId` and `restoreNonce`. `run.ts` cancels through `registerEssayLeaveHook`, and application keeps only one synchronous re-check of both right before the transaction |
| Order of `closeEssay` (stated here once for the series) | Leave hooks, flush (the existing close snapshot is part of this step), load list, switch view. This spec adds the hooks. Spec 007 moves the list load ahead of the view switch |
| List and editor stamps agree | `flush()` writes `evaluacionMeta.currentFingerprint` on the copy it saves (data-model.md). Spec 007 copies it and runs the same `computeBenchmark` |

## Root design decisions (detail in research.md and data-model.md)

1. **Record plus anchor.** New field `essay.findings`. The mark says where and whether underlined; the record says what the review said and whether it was closed.
2. **Which findings count.** Open findings only: located marks plus open records with no mark. Resolved and not applicable never count. For an essay with no records the input equals today's marks, so numbers are identical.
3. **Staleness.** Per pass fingerprint of plain text, the rubric's `criterios` and per source `{id, nombre, cita, contenido}`, captured when the run starts. Marks do not enter the hash, so resolving cannot make it stale. Usar este texto links old and new fingerprints so applying a suggestion, and undoing it, stays fresh.
4. **Coverage merges.** `recordEvaluacion` replaced by a merge, otherwise R5.1 «Revisar citas» would drop coverage to one pass and lower the score.
5. **Run outlives the panel.** `src/lib/review/run.ts` owns promises; the store holds view state.
6. **Cancel lands here, not in 006.** FR-014 requires it now. This spec adds `sage_cancel`, the renderer helper, error code passthrough, the aborted-run code in `runner.ts`, `SidecarRequestError`, `SIDECAR_DOWN` and `registerEssayLeaveHook`. Spec 006 reuses them and must not add its own.

## Files touched

### Rust
- `src-tauri/src/storage.rs`: add `findings: Option<serde_json::Value>` to `Essay`; add `findings: None` to the `sample_essay` literal (line 196). Compile fix, not a new test.
- `src-tauri/src/history.rs`: `findings: None` in the literal at line 268.
- `src-tauri/src/sidecar.rs`: new `sage_cancel(id)`, shaped like `sage_ping`, serializing with serde rather than string formatting.
- `src-tauri/src/lib.rs`: register `sage_cancel`.
- `src-tauri/src/menu.rs`: remove `view:show-benchmark` item and its header comment line.

### Sidecar
- `sidecar/src/runner.ts`: at the `!completed` line, choose the code from `config.signal?.aborted` (`CANCELLED`) and `timedOut` (`TIMEOUT`) before falling back to `INCOMPLETE_REVIEW`. `session.close()` ends the iterator normally, so today a canceled run can report `INCOMPLETE_REVIEW`. `sage.ts:34` already handles `cancel`.

### Shared
- `shared/mcp.ts`: `get_document` description states that `includeAnnotations` also returns finding states.

### Renderer, new
- `src/lib/review/findings.ts`: pure. `deriveFindings`, `openForScore`, `reachableScore`, suppression check.
- `src/lib/review/fingerprint.ts`: pure. `extractPlainText` (moved from the overlay), `reviewFingerprint`, sync string hash.
- `src/lib/review/actions.ts`: `resolveFinding`, `reopenFinding`, `markNotApplicable`, `useReplacement`, `copyReplacement`, `revealFinding`. Each mutating action first marks 004's last-pointer record as `document`.
- `src/lib/review/run.ts`: `startReview`, `cancelReview`, application of results, cancel through `registerEssayLeaveHook`. A sidecar crash arrives as a `SIDECAR_DOWN` rejection of `critique`, so `run.ts` has no status listener of its own.
- `src/components/review/Finding.tsx`: the single card (FR-005), reused by spec 007.
- `src/components/review/FindingEvidence.tsx`: R6.5, replaces `ReviewEvidenceDetails`.
- `src/components/review/Stamp.tsx`: presentational `Stamp({ result, size })`, reused by spec 007. Reads no store and carries no `scorebar` testid.
- `src/components/review/ScoreStamp.tsx`: connected stamp, R5.1 states, reads the open essay, opens the report. The only component with the `scorebar*` testids.
- `src/components/review/ReportCard.tsx`: R5.1 panel, criterion rows, Todas las correcciones, the invitation row.
- `src/components/review/CorrectionsPanel.tsx`: R4.2, R4.4, R5.4 (same panel with a criterion filter).
- `src/components/review/ReviewPanel.tsx`: R4.1 and the running state, on 004's `Popover` anchored with `useAnchor("revisar")`. Options are filled toggles like spec 006's tiles, not check boxes (constitution IV: a check means only a whole card is done).
- `src/components/review/ReviewNotice.tsx`: one line notice when a run is discarded.

### Renderer, changed
- `src/lib/storage/types.ts`: `FindingRecord`, `Essay.findings`, `EvaluacionMeta.fingerprintsByPase`, `appliedFingerprints` and `currentFingerprint`, `EssayMeta` Omit list.
- `src/lib/store.ts`: `commitFindings`, `commitReview` (replaces `recordEvaluacion`), review run view slice, `clearEvaluacion` also clears `findings`, legacy fingerprint backfill in `openEssay`, `registerEssayLeaveHook` called first in `closeEssay`, `openEssay`, `newEssay` and `restoreVersion`, `currentFingerprint` in `flush()`. Remove `scorebarDismissed`, `dismissScorebar`, `showScorebar`, overlay value `pluma`, `updateReviewerProfile` (see Decisions adopted). Rename `openPlumaRoja` to `openReview`.
- `src/lib/benchmark/score.ts`: optional `contentFingerprint` argument and new staleness branch; `AppliedAnotacion` gains optional `evidence` and `provenance`, set only when present. Stays free of store, React and Tauri imports.
- `src/lib/agents/index.ts`: `critique` sends `rubrica` as the `criterios` array (research, live bug) and accepts `requestId?`; `cancelSidecarRequest(id)`; `SidecarEvent` error carries `code`; `class SidecarRequestError extends Error { code?: string }` is the rejection type; `runSidecarCommand` also listens to `sage://status` and on `down` rejects with `SIDECAR_DOWN` and removes both listeners.
- `src/lib/editor/findCita.ts`: unchanged API; a `sentenceRange` helper added next to it.
- `src/lib/mcp/document.ts`: `readDocument` adds `status` and `findings`.
- `src/lib/menu/bridge.ts`: `sabios:evaluar` opens the panel without animation through 004's `overlayInstant`; `view:show-benchmark` removed; confirm copy for `sabios:limpiar`.
- `src/lib/features.ts`: drop `benchmark` and `plumaRoja`.
- `src/components/editor/extensions/Annotation.ts`: new `applyReview` command; `closeHistory` in `applyAnnotationReemplazo`; replace the two middle dots used as the `data-by` fallback; update header comment.
- `src/components/editor/EditorPane.tsx`: remove all `pluma-roja:*` listeners and `applyAnotaciones`; keep `editor:clear-annotations`.
- `src/components/editor/AnnotationPopover.tsx`: becomes a thin anchor that renders `Finding` in the 004 `Popover` (R2.2).
- `src/components/Topbar.tsx`: mount `ScoreStamp` in the 004 slot; Revisar ensayo opens the panel.
- `src/app/page.tsx`: remove `Scorebar` and `PlumaRojaOverlay`; mount `ReviewPanel`, `ReviewNotice`.
- `src/app/globals.css`: underline draw, stamp arrival, card fold, reduced motion. The flash is already ink from spec 004.

### Renderer, deleted
`src/components/Scorebar.tsx`, `src/components/BenchmarkDrilldown.tsx` and `src/components/lectura/PlumaRojaOverlay.tsx` in Slice 3; `src/components/ReviewEvidenceDetails.tsx` in Slice 4, when `FindingEvidence` replaces it inside `Finding`.

### E2E (assertion and selector updates only, except the retirements named)
Testids kept: `topbar-pluma-roja` (Revisar button, or whatever 004 names it), `pluma-overlay`, `pluma-start`, `pluma-pase-toggle-*` with `data-active`, `scorebar` (stamp root), `scorebar-overall` (stamp number), `scorebar-stale` (out-of-date state), all three on the connected `ScoreStamp` only, never on `Stamp`; `scorebar-criterio-<id>` (report row). New: `finding`, `finding-resolve`, `finding-not-applicable`, `finding-replacement`, `finding-use`, `finding-copy`, `finding-source`, `finding-not-located`, `stamp-all-corrections`, `corrections-resolved`.

| File | Change |
|---|---|
| `tests/e2e/setup.ts` | Add `sage_cancel`. `__E2E_CRITIQUE_BEHAVIOR__` per pase: `fail`, `hold` (ends with `CANCELLED` on cancel), `unlocated` (one item whose quote is not in the text). `EssayLike` and `EssayDump` gain `findings`. The `sage_critique` capture reads `rubrica` as an array |
| `score.spec.ts` | None. Must stay green untouched |
| `benchmark.spec.ts` | Remove `pluma-anotacion` wait and `pluma-apply` click, wait on `.anno`. Rings read through the stamp and report card. `drilldown-*` becomes `finding-*`, Descartar becomes `finding-not-applicable`. No-rubric test asserts score and corrections with no criterion rows |
| `apply-suggestion.spec.ts` | `popover-reemplazo` and `drilldown-reemplazo` become `finding-replacement`; button text Usar este texto; parser test unchanged |
| `pluma-roja.spec.ts` | Panel options replace pase columns; 9 cards in Correcciones; popover test uses `finding-not-applicable`. **Retired**: «unchecking anotaciones excludes them from apply», since FR-002 removes the apply step |
| `rubrica.spec.ts` | Remove apply step and `pluma-rubrica-indicator`; criterion chip assertion becomes «en <criterio>» on the card; `critiques[pase].rubrica` is asserted as an array, which is what the validator accepts |
| `selectors.spec.ts` | Pase assertions stay; empty hint assertion removed; run assertions use `dumpCritiques` and `.anno` |
| `menu.spec.ts` | Remove apply step. **Retired**: «Scorebar dismiss + show-benchmark» and «recordEvaluacion vuelve a mostrar el Scorebar», since FR-011 removes the bar, its dismiss and the menu item |
| `fuentes.spec.ts` | Remove `pluma-fuentes-indicator` assertion and apply step; forwarding assertion kept |
| `language.spec.ts` | Remove apply step |
| `flow.spec.ts` | Adjust any Scorebar reference; viewport regression stays |

### Docs
`CLAUDE.md` session notes at the end of delivery. Spec 006 consumes `sage_cancel`, the aborted-run code, `SIDECAR_DOWN`, `SidecarRequestError` and `registerEssayLeaveHook` from here.

## Channels

- **Mac desktop app**: everything above.
- **MCP**: read-only addition. `get_document` with `includeAnnotations` returns `status: "open"` on each annotation and a `findings` list for those with no mark. No new mutating tool. An MCP text edit that deletes a marked range turns that finding into open and not located, like a human edit, and makes the stamp out of date because the text changed.

## Safety

- **Data writes**: only the optional fields above, through the existing atomic write. No migration, no rewrite on open. The legacy fingerprint backfill stays in memory until the next real save.
- **Permissions**: none new. `sage_cancel` is a command on the existing sidecar channel. Copiar uses `navigator.clipboard.writeText`, checked in the real build first; if WebKit refuses it, the clipboard plugin would be a new dependency and goes back to Noe.
- **Cost**: reviews draw on the plan's monthly credit as today, with no API key. Volver a revisar is one click by design. Verification spends credit only in the SC-007 step: about two reviews of four passes (about 8 calls), one of them on an essay with a rubric. Everything else uses the stub. Approved with the plans (series.md, Decisions taken), capped at those calls.
- **Destructive**: Limpiar revisión now also clears resolved and not-applicable records. It keeps its confirmation, and the copy says so.
- **Real essays**: dev builds would share the app data directory with the installed app, so every run sets `ESSAY_STUDIO_DATA_DIR` to a scratch directory and uses new test essays. None of Noe's essays are used.

## New dependencies

None. Motion is CSS; sentence boundaries use `Intl.Segmenter`, available in WebKit.

## Verification end to end

**Acceptance bar.** A good result: one action to review, findings underlined with no apply step, the board untouched, every finding listed, closing and reopening preserves states, the number moves on resolve and never goes out of date from it. Must not contain: a modal, red on review, a dotted panel surface, pass, benchmark or evaluation wording, a model or vendor name, a check mark that is not «this card is done».

**Stub path, free** (`npm run test:e2e`, plus `cargo test`, `npm run lint`, `tsc`, `npm run build`):
- Fail one pase: one line, retry offered, check counts as not run, prior findings of that pase kept.
- Fail all: stamp unchanged.
- `hold` then Cancelar: nothing applied, previous review intact.
- `hold` then close the essay: notice appears, the other essay untouched.
- `unlocated`: card listed with the not-located phrase.
- `hold` then `sage://status` down: the run ends with the all-failed line and does not hang.

**Desktop app** (`npm run tauri:dev`, then a build with `npm run tauri:build:full`), new essay with real text:
1. Rust persistence, which the stub cannot catch: resolve, not applicable, ⌘Q, relaunch, states intact. Then save a version, change, restore, states follow.
2. Usar este texto, then ⌘Z from the native menu accelerator with focus on the panel: text and underline return, card reopens.
3. Copiar in the packaged build.
4. Multi-paragraph quote: phrase shown, Usar este texto refused, Copiar works.
5. Type during a run; words untouched, findings land; a composing IME is not interrupted.
6. Move a note, change the title: stamp stays fresh. Edit text, rubric, sources: stamp goes out of date.
7. Open a test essay saved before this change: underlines listed as open, same number as before.
8. MCP `get_document` with `includeAnnotations` shows the states.

**Real cases (SC-007), within the approved cap, on a new test academic essay**: review it; resolve, reopen and undo a correction; use a proposed text; dismiss one and review again.

**Independent reviewers**: one lens each (structure against R4.1, R4.2, R4.4, R5.1, R5.4, R2.2, R6.5; copy; motion against R4.3 and R7.3; reliability). Minimum 4 of 5. Builder does not grade.

**Mechanical greps** on `src/components/review` and `src/lib/review`: no middle dot character; no `uppercase`; no `text-[9`, `text-[10`, `text-[11`; no em-dash in visible strings; no `Benchmark|Evaluar|Pluma|pasada|Empirista|Sistémico|Práctico|Crítico|sabio` outside imports of the scoring module; no `Claude|Opus|Sonnet|modelo|Anthropic`. Whole repo: `grep -rn "scorebarDismissed\|BenchmarkDrilldown\|pluma-roja:" src` empty.

## Delivery slices

**Slice 0, design in Paper first (constitution IV).** One Paper pass for the whole series; the deduplicated list in [series.md](../004-stationery-shell/series.md) wins over this one. New artboards next to the R screens, approved by Noe before their code:
stamp out of date; stamp running, including the first review when there is no number yet; stamp with no number (older essays with underlines and no review record); the panel running with one line per agent and Cancelar; the panel error line for one agent and for all; the not-located card; the phrase for a replacement across paragraphs; the notice when a run is discarded on close; the Resueltas row after Usar este texto; R4.1 options as filled toggles. Visible surfaces do not start until that pass is approved; non-visual work (rubric repair, TS wrappers, store and row logic) may proceed per series.md, Coordinator rulings.

**Slice 1, the finding is real.** Starts with the live rubric bug (moved here from spec 008): the renderer sends `{ criterios }` while `assertReviewRequest` requires an array, so today every review of an essay with a rubric fails. Fix in `critique()`, the stub capture and the `rubrica.spec.ts` assertion, verified with the real review on an essay with a rubric in SC-007. Then Rust field, types, `findings.ts`, `fingerprint.ts`, `actions.ts`, `Finding`, popover per R2.2, `score.ts` staleness, `store.ts` finding actions, `currentFingerprint` in `flush()`, MCP, Scorebar fed by `openForScore` temporarily. Works end to end on the old modal: click an underline, resolve, reopen, use, copy, relaunch.

**Slice 2a, the stamp and the panel.** `Stamp`, `ScoreStamp`, `ReportCard`, `CorrectionsPanel`, new files only, reading from the derive function.

**Slice 2b, the run.** `sage_cancel` in Rust, the `!completed` code choice in `runner.ts`, `agents/index.ts` (`requestId`, `SidecarRequestError { code }`, `SIDECAR_DOWN` in `runSidecarCommand`), `run.ts` with no Down handling of its own, `registerEssayLeaveHook`, `Annotation.applyReview`, `ReviewPanel`, `ReviewNotice`, store run slice.

**Slice 3, wiring and removal.** `Topbar`, `page.tsx`, `bridge.ts`, `menu.rs`, `features.ts`, `EditorPane` cleanup, delete the three old files, E2E updates. From here the old bar no longer exists.

**Slice 4, evidence and motion.** `FindingEvidence` (R6.5), R4.3 motion, R5.4 dimming of other underlines, reduced motion.

**Slice 5, verification and docs.** Everything under Verification, CLAUDE.md notes.

## Execution

Implemented by Sonnet subagents following approved tasks. Slices 0 and 1 run first, in order. **2a and 2b run in parallel**, except that `ScoreStamp` waits for 2b's store run slice and `ReportCard` for the `run.ts` signatures: 2a writes only new files under `src/components/review`, 2b owns Rust, `sidecar/src/runner.ts`, `agents/index.ts`, `store.ts` and `src/lib/review/run.ts`. Slice 3 is a single agent, so `Topbar`, `menu.rs` and `bridge.ts` have one owner. Slices 4 and 5 follow. Opus reviews every diff before the next slice starts. The final output is searched for the middle dot character, including subagent text.

## Decisions adopted (2026-11-08, see series.md, Decisions taken)

1. **Reviewer model selector.** Today the review modal shows a Revisor dropdown and a line naming the model. **Adopted: remove it from the interface, keep the persisted `reviewerProfile` and the default.** It is not something a writer should think about, candidates are unmeasured, and it breaks the no-vendor rule. An unknown saved profile falls back to the default rather than blocking the review, since nothing could fix it from the interface. If Noe wants it kept, it needs a Paper design inside Más.
2. **Deleting an underlined sentence.** If he selects a marked sentence and rewrites it by hand, today the finding disappears and the number rises. **Adopted: keep it open and not located, still counting, with Ya lo resolví one click away**, because «no correction is ever silently lost» and the stamp is already out of date at that moment. The alternative is to move it to Resueltas automatically, which rewards rewriting but files as solved something nobody checked.

## Project Structure

### Documentation (this feature)

```text
specs/005-review-stamp/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── finding-and-stamp.md
│   └── mcp-and-tauri.md
└── tasks.md             # /speckit-tasks, not created here
```

### Source Code (repository root)

```text
src/lib/review/          # findings, fingerprint, actions, run
src/components/review/   # Finding, FindingEvidence, Stamp, ScoreStamp, ReportCard, CorrectionsPanel, ReviewPanel, ReviewNotice
src-tauri/src/           # storage, history, sidecar, lib, menu
tests/e2e/               # selector and assertion updates, stub additions
```

**Structure Decision**: Existing single desktop project. Review logic gets its own folder because stamp, panel, card, MCP and spec 007 all read it.

## Complexity Tracking

No violations.
