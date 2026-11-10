# Quickstart: verify Review, Corrections and Score Stamp

## Free checks

```bash
npm run lint && npx tsc --noEmit && npm run build
npm run test:e2e
(cd src-tauri && cargo test)
```

`tests/e2e/score.spec.ts` must pass with no edits.

## Desktop app

```bash
npm run sidecar:build && ESSAY_STUDIO_DATA_DIR=<scratch> npm run tauri:dev
```

Set `ESSAY_STUDIO_DATA_DIR` to a scratch directory, because dev builds otherwise share the installed app's data. New test essays only. Restart `tauri:dev` after Rust changes.

1. Press Revisar ensayo. The panel hangs from the button; the board does not change. Compare with R4.1.
2. Run it, close the panel, keep typing. Words are untouched, underlines land, the stamp arrives (R4.3).
3. Open the stamp (R5.1), then Todas las correcciones (R4.2). Count equals what the review returned.
4. Select a card: the text scrolls and marks the sentence.
5. Ya lo resolví: card folds into Resueltas, underline leaves, number rises, no out-of-date state (R4.4).
6. Uncheck it: back with its underline.
7. Usar este texto, then ⌘Z with focus still on the panel: text and underline return.
8. No aplica, then Volver a revisar: it does not return, and nothing is duplicated.
9. ⌘Q, relaunch, reopen: Resueltas intact. This is the check the stub cannot do.
10. Move a note and change the title: still fresh. Edit a word, or the rubric, or a source: out of date.
11. Click an underline: same card (R2.2). Open its source: R6.5, with no model name.
12. Start a review and press Cancelar: nothing changes.
13. Start a review and close the essay: the notice appears; other essays are untouched.
14. Open a test essay from before this change: underlines appear as open with the same number.

Failure paths use the stub's `__E2E_CRITIQUE_BEHAVIOR__` through Playwright (`tests/e2e/setup.ts`): `fail`, `hold`, `unlocated`.

## Real reviews (SC-007)

Spends plan credit, about two reviews of four passes. Approved with the plans (series.md), within that cap. One of them runs on an essay with a rubric, to prove the rubric repair: it completes and findings carry their criterion. All on new test essays; none of Noe's essays are used.

## Mechanical greps

```bash
grep -rn $'\u00b7' src/components/review src/lib/review
grep -rnE "uppercase|text-\[(9|10|11)(\.5)?px\]" src/components/review
grep -rnE "Benchmark|Evaluar|Pluma|pasada|Empirista|Sistémico|Práctico|Crítico|sabio" src/components/review | grep -vE "computeBenchmark|BenchmarkResult|lib/benchmark"
grep -rnE "Claude|Opus|Sonnet|Anthropic|modelo" src/components/review
grep -rn "scorebarDismissed\|BenchmarkDrilldown\|pluma-roja:" src
```

All must be empty.
