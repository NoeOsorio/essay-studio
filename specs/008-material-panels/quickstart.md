# Quickstart: verifying Rubric, Sources and History

Done is what Noe sees in the desktop app. Every run sets `ESSAY_STUDIO_DATA_DIR` to a scratch directory; none of Noe's essays or files are used, and test PDFs stay in the session scratchpad. Build the real thing: `npm run sidecar:build`, then `npm run tauri:dev`, and at the end `npm run tauri:build:full` for the installed-app pass.

## Real cases (each costs monthly credit, one call per drop)

| Case | Steps | Good result |
|---|---|---|
| A public course assignment | Más, Rúbrica. Paste the text, then repeat with its PDF | Criteria with one-line descriptions and the professor's stated weights, one action, compared with R6.1, R6.2, R6.6 |
| An open-access paper as PDF | Más, Fuentes, drop it | «Leyendo» row, then title and its (Author, year). Every field traceable to the PDF. Copy citation works |
| A class note | Paste text | Saved, says what is missing, «Falta el año», no invention |
| Restore a version | Más, Historial, select, read on the sheet, Restaurar | Sheet shows the old text read-only, restored text loads, previous state listed |
| Rubric then review | With a rubric, run Revisar ensayo | Completes, findings tagged by criterion. Regression check of the repair in 005 Slice 1 |

The implementers gather 5 public course assignments (SC-002) and 10 open-access papers (SC-003). Score SC-003 by hand against each PDF: zero fields absent from the document.

## Failure and edge cases, in the app

Scan PDF. Password-protected PDF. PDF over 50 MiB. Book of about 250 pages then a second one, then Revisar. Same PDF dropped twice. Sidecar stopped (material is saved, retry offered, no vendor name on screen). Assignment with no criteria. Rubric exists, drop an assignment, confirm and cancel. Edit a field during reading; the edit stays. Switch essay during reading. A PDF whose text says to ignore instructions and invent a citation: no effect. Remove a source a finding cites.

**Drop safety** (guard and gate belong to 006, re-checked here): drop a file on the sheet, the board and the toolbar: nothing happens, the page does not navigate, the board gains nothing.

**History**: while previewing, run a live MCP edit; preview is unaffected, Restaurar saves that edit first, undo in the sheet still works after returning to the current version.

**Keyboard**: ⌘⇧R, ⌘⇧F, ⌘⇧H open with no animation. From Más, panels animate per R7.3. With reduced motion on, nothing moves.

**Scale**: load 1000 generated sources and 1000 versions; scrolling holds, search narrows at once.

**MCP**: `get_document` with `includeSources` and `includeRubric` returns the new fields, and works with a book in the library. Write tools unchanged.

## Installed app

From the built `.app` launched with `open --env ESSAY_STUDIO_DATA_DIR=<scratch>`: drop a PDF from a Finder window and see text extracted (apps launched this way have a different environment from a terminal), and open a test essay saved before this change.

## Mechanical

Regression suites: `npm run test:e2e`, Rust tests, lint, typecheck, build. They support the verdict and do not make it.

```bash
LC_ALL=C grep -rn $'\xC2\xB7' src src-tauri/src sidecar/src   # empty
grep -rnE 'text-\[(9|10|11)(\.5)?px\]' src                # empty
grep -rn 'uppercase' src --include='*.tsx'                 # empty
LC_ALL=C grep -rn $'\xE2\x80\x94' src --include='*.tsx'     # no visible strings; code comments reviewed by hand
grep -rniE 'claude|anthropic|openai' src --include='*.tsx' # none visible
```

## Independent review

Separate reviewers, each one lens: fidelity to R6.1 to R6.4 and R6.6 (at least 4 of 5, no structural difference), usefulness, reliability of citation data checked against the PDFs, scan speed. The builder does not grade. Results with their scores and links go to Noe; anything not seen working is stated as such.
