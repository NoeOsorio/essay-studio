# Quickstart: verifying the visual system end to end

## Prerequisites

- `npm run sidecar:build` once; `npm run tauri:dev` running with Claude Code logged in.
- Noe's essay "Seguridad psicológica y aprendizaje en equipos remotos" (or a copy) in app data.

## Mechanical checks (after every slice)

```bash
npm run lint && npx tsc --noEmit
grep -rnE "text-\[(9|9\.5|10|10\.5|11|11\.5)px\]" src || echo "ok: no tiny text"
grep -rnE "(bg|text|border|ring|decoration)-(seal|warn|ok)\b" src/components || echo "ok: no state colors"
npm run test:e2e
```

A contrast script in the scratchpad reads the `@theme` values from `src/app/globals.css` and
prints every text/background pair with its ratio; all must be at least 4.5:1.

## Real cases (spec "Real Cases" 1 to 5)

For each, take a screenshot of the real Tauri window at 1440 × 900 and keep it as evidence:

1. Open the evaluated essay: underlines per sage distinct; score bar neutral; no tiny text.
2. Evaluar with four passes: severity as text labels; no dollar cost; sans title without em-dash.
3. Interrogar in council (EM, SI, CR): Spanish statuses; saved notes straight with readable headers.
4. Edit after evaluating: score bar reads "Desactualizado" without amber.
5. History, Rúbrica, Fuentes: no tiny text, tú voice, sans titles.

## Independent review

Reviewers that did not build it score each screen on the C.0 rubric (Paper file
01M6VXNCR0ZBA410S026XSG7JT). Minimum 4 of 5 on Legibilidad, Color and Sin slop.
