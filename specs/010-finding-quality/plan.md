# Implementation Plan: Finding Quality

**Branch**: `004-stationery-redesign` | **Date**: 2026-11-10 | **Spec**: [spec.md](spec.md)

## Summary

The score and the list both count findings, while the writer thinks in problems located in sentences. Four passes read the same essay independently, so one weak sentence earns two or three cards and two or three penalties. The root fix is to make the sentence the unit of what is shown and scored, derived on read, without touching persisted findings. Separately, ready-to-paste text is only safe when the fix is local wording or format: coherence and argument fixes need new ideas by nature, so those passes stop offering it, and code guards what remains.

## Root cause

`deriveFindings` (src/lib/review/findings.ts) returns one view per finding and `openForScore` feeds each open finding to `computeBenchmark` (src/lib/benchmark/score.ts), which subtracts per finding. Nothing knows that two findings point at the same sentence. The sentence unit already exists: `sentenceRange` in src/lib/editor/findCita.ts segments a text block with `Intl.Segmenter`, and `isSuppressed` uses it to keep closed findings from reappearing. The list and the score never use it.

For replacements, the prompt asks every pass for an optional `reemplazo`. For coherence and argument a correct fix changes the reasoning, so any paste-ready text must invent content; prompt rules reduced it but real runs still show it (independent grade 3 of 5).

## Technical Context

**Language/Version**: TypeScript 5 strict, React 19, Next 16 static export, Tauri 2, Node sidecar
**Primary Dependencies**: TipTap 3, Zustand 5; no new dependency
**Storage**: essay JSON with `findings` records; unchanged
**Testing**: no new unit tests; existing E2E stays green; `tests/e2e/score.spec.ts` is not edited
**Target Platform**: macOS desktop app
**Constraints**: saved essays and findings keep working with no migration; real model calls only on test essays, about 8

## Constitution Check

- I Reliable work: no persisted data changes; grouping and score are derived. Pass.
- II Agents serve the writer: fewer, truer cards; no invented text pasted. Pass.
- III Evidence before done: real runs on test essays plus an independent grade. Pass.
- IV Stationery desk: the grouped card is designed in Paper first (Slice 0) and follows the copy rules. Pass, gated on Slice 0.
- V Simplicity: one shared segmentation function, no new storage. Pass.

## Design

1. **One segmentation.** Extract a pure `sentenceSpans(text)` from `sentenceRange`; both `sentenceRange` and the derive step use it, so suppression and grouping agree on what a sentence is.
2. **Sentence key on each view.** While `deriveFindings` walks the document it knows each mark's block and offset; it adds `sentenceKey` (block start plus sentence index) to located views. Not-located findings have no key and stay alone.
3. **Groups.** `groupBySentence(views)` returns cards: key, sentence text, findings ordered by severity, status open if any finding is open, resolved if all are resolved.
4. **Score.** `openForScore` collapses each open group to one entry at the highest severity for the overall score, and one entry per criterion present in the group at that criterion's highest severity. `computeBenchmark` and its tests stay as they are, because they receive the collapsed input.
5. **Actions.** Resolve, not applicable and reopen take a card and apply to every finding in it, as one undo step.
6. **UI.** Correcciones, the criterion view and the popover on an underline show one card per sentence: the quote once, then each agent's chip and diagnosis, with Usar este texto only on parts that have a replacement. Exact look from the Slice 0 Paper state.
7. **Replacements.** `run.ts` drops `reemplazo` for `coherencia` and `argumento`; matches the first letter's case to the quote; the existing guard also drops a replacement that carries a capitalized name or a number absent from essay and sources. `prompts.ts` stops asking those two passes for `reemplazo`, keeps it for estilo and apa, and states the no-memory rule as: never say a fact is false or give the right value unless the essay or the sources show it; say it cannot be verified with the sources.

## Files

- src/lib/editor/findCita.ts: `sentenceSpans`, used by `sentenceRange`.
- src/lib/review/findings.ts: `sentenceKey` on views, `groupBySentence`, `openForScore` collapse.
- src/lib/review/actions.ts: card-level resolve, not applicable, reopen.
- src/components/review/Finding.tsx, CorrectionsPanel.tsx, src/components/editor/AnnotationPopover.tsx: grouped card.
- src/lib/review/run.ts: replacement rules.
- sidecar/src/prompts.ts: pass instructions and no-memory rule.
- tests/e2e: selectors only where a test counts cards for one sentence.

## Slices

0. Paper: grouped card in Correcciones, in the criterion view and in the underline popover, next to R4.2 (67J-0) and R2.2 (57T-0). Approved before code.
1. Derive and score (findings.ts, findCita.ts). Check: a stub review with three passes on one sentence shows one entry for the score and the right number.
2. Actions and UI (actions.ts, components). Check against Paper Slice 0.
3. Replacements and prompts (run.ts, prompts.ts). Check: about 8 real calls on test essays.
4. Verify: lint, tsc, build, full E2E, QA build, independent reviewer usefulness at least 4.

## Execution

Sonnet subagents implement each slice; Slice 1 and Slice 3 have disjoint files and run in parallel, Slice 2 follows Slice 1. Opus reviews each diff.

## Bigger redesign, not in this plan

A single reviewer pass that reads the whole essay once and returns problems per sentence would avoid duplicates at the source and cost fewer calls, but it changes the pass model and the score's coverage rule. Separate proposal if wanted.
