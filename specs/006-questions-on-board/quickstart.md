# Quickstart: verifying Questions on the Board

## Prerequisites

- Specs 004 and 005 merged on the branch.
- `npm run sidecar:build`, then `npm run tauri:dev`, with Claude Code logged in. Restart `tauri:dev` after any change to Rust or `tauri.conf.json`.
- Every run sets `ESSAY_STUDIO_DATA_DIR` to a scratch directory, never the default app data (series.md).
- A new test essay, never one of Noe's, with notes and an arrow on the board and an open-access paper among its sources.
- A test essay with 50 sources (seeded through the Fuentes panel or by writing test essay JSON in the scratch directory).
- Real model calls are approved with the plans (decision D2): about 18 per pass, at most 40 across all rounds.

## Mechanical checks, after every slice

```bash
npm run lint && npx tsc --noEmit
npm run sidecar:build
(cd src-tauri && cargo test)
npm run test:e2e
```

Copy and system rules on this spec's surfaces. `absent` prints FAIL if the pattern is found or grep itself errors. BSD grep has no `-P`, so the middle dot is built from its bytes.

```bash
absent() { grep -rnE "$1" "${@:2}"; [ $? -eq 1 ] && echo ok || echo FAIL; }
DOT=$(printf '\xC2\xB7')
SURFACES="src/components/questions src/lib/questions"
absent "$DOT" $SURFACES
absent "uppercase|text-\[(9|9\.5|10|10\.5|11|11\.5)px\]" src/components/questions
absent "Claude|Anthropic|OpenAI" $SURFACES
absent "parsePreguntas|materialize-preguntas|LecturaOverlay|Guardar seleccionadas" src
```

## Parser check, no model

Run once from the scratchpad, not committed. Feed `sidecar/dist/question-stream.js` these token streams and read the emitted indexes:

- Three clean lines, split at awkward token boundaries, including inside the number.
- A wrapped question over two lines.
- A preface before item 1 and a closing remark after a blank line.
- Prose with no numbers: expect nothing emitted, and failure.
- Four items: expect three.

## Real cases in the Tauri window at 1440 by 900

Keep a screenshot of each for review. Use the live document tools (MCP) `get_board` before and after each run, and compare `x`, `y`, `rotation` and `text` of every existing node. They must be identical (SC-002).

Runs are shared between cases so one pass costs about 18 model requests.

**Run A: 3 agents and one own question the source answers (4 requests).** Start zoomed into the left of a board with notes.

1. Open Hazme preguntas. Evidencia, Sistemas and Objeciones are on, Práctica is off. Type "edm", pick it, type the question, press Preguntar. The panel folds to the pill, each agent shows its voice line, notes land one by one without waiting for the others. Existing notes do not move. Compare with R3.1, R3.2, R3.3, R3.4.
2. The view moves to show the notes.
3. During the run, call MCP `create_note`. It either succeeds or returns `STALE_REVISION` and succeeds after re-reading. Later landings avoid that note.
4. The own question lands with its title. During the run, hover a landed note and discard it: it peels off. Wait for another note to land, then press Cmd Z with the board focused: the discarded note returns, and no other note is affected. Discard it again. Close and reopen the essay: it does not return, the others keep author and kind. Read the essay JSON: `interrogatorios` lists only kept questions, with `fuenteId`.

**Run B: 3 agents, one own question the source does not answer, and Revisar ensayo (8 requests).**

5. Scroll the board during the run: the view stays where the writer left it.
6. The note titled with the question says plainly that the source does not cover it.
7. Press Revisar ensayo while the agents think: both finish. The stamp does not go out of date because of the notes.

**Run C: stop (3 requests, ended early).**

8. Press stop after the first note. Remaining agents stop, no note lands afterwards, nothing shows as failed. Confirm in the log that the sidecar reports `CANCELLED`. Press Preguntar again at once: it is available only after the agents have ended, and it does not report busy.

**Runs D to F: one agent each (3 requests).**

9. Leave during a run: press Cmd W. It stops, landed notes are saved, the essay reopens with them.
10. Reduced motion and selection together: turn on Reduce Motion in macOS, select text, pick an agent in the bubble. The panel opens with that text as source and only that agent on. Notes appear in place, lines do not rotate, the view changes without animating.
11. Failure: kill the sidecar process mid-run. The agent shows its short line, the banner appears, the pill does not hang, no raw output and no vendor name on screen. Restart, run, and force a retry through the stub path only if a real failure cannot be produced.

**No model needed.**

12. File drop, also from the built `.app` launched with `open --env ESSAY_STUDIO_DATA_DIR=<scratch>` and dragging from Finder, which is the gate spec 008 depends on. Drop a `.txt` on the zone: it is saved as a source and selected. Drop a `.png`: a short message. Drop a file on the board and on the editor: nothing happens, no navigation, no asset in the essay JSON.
13. 50 sources: find one by typing part of its name in under 5 seconds.
14. Open the panel with Hazme preguntas by keyboard or the native menu: no opening animation.

## Independent review

Reviewers who did not build it compare the real screens with R3.1 to R3.5 and score usefulness, UX, how fast it scans, design and filler. Minimum 4 of 5 on each (SC-005). A first-time reader says who asks whom from the button and panel alone (SC-003).
