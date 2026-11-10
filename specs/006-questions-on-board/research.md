# Research: Questions on the Board

Every decision below was checked against the code at commit b394c0b or the installed tldraw 5.0.0 source in `node_modules`. Line references are to those versions.

## R1. Why a question only reaches the board on save

**Finding**: `LecturaOverlay.tsx` holds the whole run in component state. Questions become notes only inside `save()` (line 221), which dispatches `sage:materialize-preguntas`. `BoardPane.materializePreguntas` (234 to 312) creates them in one batch.

**Decision**: Move the run out of the panel into a store slice plus a module (`src/lib/questions/run.ts`). The panel folds into the pill, so it cannot own the run. Essay navigation must also be able to stop it.

**Rejected**: Keeping the window event. Notes land through the live editor that `src/lib/mcp/board.ts` already registers, through `ensureBoard`.

## R2. Incremental questions without raw output

**Finding**: `parsePreguntas` (`src/lib/agents/index.ts:179`) returns the whole text as one question when nothing matches (line 187). This is the only route by which raw output could become a note.

**Decision**: One parser, `parseQuestions(text): string[]`, in a new browser-safe `sidecar/src/question-stream.ts`. No match returns `[]`, and `[]` at the end of a run is an agent failure with code `NO_QUESTIONS`. There is no fallback and no downstream filter.

Item grammar:

- An item starts on a line matching `^\d+[.)]\s+`.
- Following non-blank lines are continuation and are joined with a space.
- A blank line ends the item, so a closing remark is not glued to the last question.
- Text before item 1 is ignored.
- At most `QUESTIONS_PER_AGENT` items are returned. That constant is 3, matching the prompt contract at `prompts.ts:50`.

Streaming rule: on each token the sidecar re-parses the accumulated text. Item k is emitted once item k+1 exists, since a newline alone can arrive in the middle of a wrapped question. On `complete`, the authoritative `result` is parsed with the same function, and every index not yet emitted is sent before `complete`. Emission is keyed by index, so nothing lands twice.

The cost is that the last question lands at `complete`, a fraction of a second after its text ends. SC-001 still holds.

**Why in the sidecar**: the renderer then handles finished questions only. Rust forwards JSON unchanged (`sidecar.rs:393`) and needs no change for this event.

## R3. Own-question request and the prepareReview ternary

**Finding**: `runner.ts:32` and `:37` choose with `req.type === "critique" ? ... : ...`. A third type would silently get the interrogation prompt. Consumers of `ReviewRequest` are `sage.ts`, `runner.ts` and `eval/run.ts`. The eval harness builds critique requests only and calls `prepareReview` and `runReview`, so it needs no change beyond compiling.

**Decision**: New request type `ask`. Both ternaries become exhaustive switches on `req.type`, with a `never` check. `assertReviewRequest` validates `question` as a non-empty string under `MAX_QUESTION_CHARS`. The answer has no streaming need: it lands on `complete`.

`MAX_QUESTION_CHARS` is 300. The bold title has to fit a note `NOTE_WIDTH` (212 units) wide without pushing the answer out of reach, and the personas' own question limit (under 30 words, `prompts/el-empirista.md:67`) is about 200 characters.

## R4. Cancel

**Finding**: The sidecar handles `cancel` (`sage.ts:34`), but no Tauri command sends it. There is also a defect on this path. When the run aborts, `session.close()` ends the iterator normally, and `if (!completed) throw new ReviewRunError("INCOMPLETE_REVIEW", ...)` at the end of the `try` wins, because the `catch` rethrows any `ReviewRunError` unchanged. A cancelled run can therefore report `INCOMPLETE_REVIEW`.

**Decision**: Spec 005 delivers the `sage_cancel` command, `cancelSidecarRequest(id)`, `code` on the client error type, the aborted-run code in `runner.ts`, `SidecarRequestError` and `SIDECAR_DOWN` in `runSidecarCommand` (`specs/005-review-stamp/contracts/mcp-and-tauri.md`). This spec consumes them and adds no cancel of its own. The run module maps `SIDECAR_DOWN` to the generic failure line, and the existing sidecar banner explains the rest. A live but silent sidecar is bounded by the 120 s timeout in `runner.ts`.

Errors raised in `handleLine` today have no `code`. `assertReviewRequest` throws a plain `Error`, and the busy check does too. Both get codes: a typed `ReviewRequestError(code, message)` in `review-contract.ts` with `INVALID_REQUEST` and `SOURCE_TOO_LARGE`, and `BUSY` for the cap.

## R5. tldraw history for landed notes

**Finding**: `HistoryManager` has three modes. `record` clears the redo stack. `record-preserveRedoStack` keeps it but adds an undo step. `ignore` (state `Paused`) records nothing and leaves both stacks untouched. `Translating` cancels with `bailToMark` (line 186), which reverts recorded changes since its mark.

**Decision**: Land with `editor.run(fn, { history: "ignore" })`. Discard is a normal recorded operation preceded by `markHistoryStoppingPoint("discard-question")`.

Reasons:

- With recorded landings, pressing Cmd Z after a discard would undo the latest landing rather than the discard whenever another note landed in between. FR-009 needs the discard to be what comes back.
- Recorded landings would clear redo for the writer's own work.
- A landing during a drag would be reverted by Esc through `bailToMark`. With `ignore` it is not part of that diff, so no gesture queue is needed.

Consequence: Cmd Z only ever reverses what the writer did. A landed note leaves through discard or delete, both of which are undoable. This must be confirmed in the dev build, by discarding, waiting for another landing, then pressing Cmd Z (see quickstart).

MCP `transaction()` is not reused, because it sets marks.

## R6. Placement

**Finding**: `src/lib/mcp/board.ts` already has `boundsOf`, `common`, `overlaps` and `clearObstacles`. The last is a finite vertical sweep over measured obstacles. Note height depends on `growY`, set in `onBeforeCreate` from measured text, and on the 004 title.

**Decision**: Export those helpers and reuse them.

- At run start, fix `anchorX` to the right edge of the whole board content plus 56 units (today's value at `BoardPane:260`) and `anchorY` to the top of the viewport plus the room the status chips need. On an empty board, `anchorX` is the viewport left plus the same inset.
- Each active agent owns a column, in `ALL_SAGES` order, `NOTE_WIDTH + 28` apart (`NOTE_WIDTH` is 212, exported by spec 004).
- On each landing, inside one `editor.run`: create the shape at the column's next y, read its real bounds, run `clearObstacles` against every other shape on the page (read fresh, including locked shapes and arrows) and apply the offset.
- The region is fixed at run start and holes are never filled. Filling a hole could take the spot that a drag or an undo is about to return a note to, which would violate FR-005.

The tldraw editor is resolved per landing with `ensureBoard(essayId)`, never held for the run, because `BoardPane` unmounts when the board is hidden and a held editor would be dead. `landing.ts` re-attaches its camera listeners when the resolved editor is a new instance. Consequence, and the series ruling: `ensureBoard` opens a closed board (`board.ts:92`), so the run start opens it and, if the writer hides it during a run, the next landing simply opens it again. Simplest thing, rare case.

New notes set `rotation: 0`. Spec 004 applies its visual tilt only when `shape.rotation === 0`, so setting both would change which tilt shows and rotate the bounds used for free space. The visual tilt is outside the measured bounds, but at 212 units wide its corners sit about 5 units off the geometry at 2.5 degrees (004 research R3), inside the 28 unit gap. Today's code at `BoardPane:246` is removed with the rest of `materializePreguntas`. Spec 004 measures note height in `getGeometry`, which is why bounds are read after creating the shape rather than estimated.

## R7. Camera

**Finding**: `zoomToBounds(bounds, { targetZoom, inset, animation, immediate })` clamps zoom with `min(targetZoom, fit)`, so passing the current zoom means it never zooms in. `EASINGS.easeInOutCubic` is the same curve as Paper's `cubic-bezier(0.65, 0, 0.35, 1)`. `wheel` and `pinch` call `stopCameraAnimation` (Editor.ts:10928, 10994).

**Decision**: After a landing, if the run's notes are not fully inside the viewport and the writer has not moved the view, call `zoomToBounds` with `targetZoom` equal to the zoom at run start.

The frame is the union of the run's notes and the viewport at run start, which keeps the writer's context as in R3.4. If that union needs a zoom under 0.5, frame the run's notes alone. The approved board is drawn at 0.56 in Paper, so below 0.5 the note text stops being legible. Calls are coalesced so a burst produces one move. Duration is 420 ms. Reduced motion uses `immediate: true`, as R3.4 states.

Detecting that the writer moved the view (FR-006):

| Path | How it is detected |
|---|---|
| Wheel or trackpad | `editor.on("event")` with `type === "wheel"` |
| Pinch | same bus, `type === "pinch"` |
| Hand tool or space drag | same bus, on pointer move, `editor.inputs.getIsPanning()` |
| Ver todo in `BoardToolbar` (004 removes the zoom buttons) | its handler calls `markWriterMovedCamera()` directly |
| Cmd = and Cmd -, arrow pan, anything else | synchronous `sideEffects.registerAfterChangeHandler("camera")` firing outside the app-move window |
| Interrupting the app's animation | wheel or pinch reach the event bus regardless of the window |

The app-move window is a flag set around the `zoomToBounds` call and held for the animation duration. The listener uses the synchronous side effect, not `store.listen`, so an `immediate` move is flagged correctly.

## R8. Drag and drop in Tauri

**Finding**: `tauri.conf.json` does not set `dragDropEnabled`, which defaults to true. On macOS, Tauri then intercepts file drops and emits native events, so a DOM `drop` handler does not receive a `File`. The renderer has no file access by design.

**Decision**: Set `dragDropEnabled: false` on the window, after confirming the behavior in the dev build. Spec 008 needs the same setting, and 006 owns the change because it ships first. Two guards come with it:

- `editor.registerExternalContentHandler("files", null)` on the board, so a dropped file does not become an asset inside the essay JSON. This stays in 006.
- `src/lib/fileDrop.ts`: a capture-phase window guard that cancels every file drop outside an element marked `data-drop-zone`, so a drop elsewhere neither navigates the webview nor reaches tldraw or TipTap. Spec 008 uses the same guard and only marks its zones.

Playwright cannot verify this. The gate is manual, on the built `.app` launched with `open --env ESSAY_STUDIO_DATA_DIR=<scratch>` (series.md), dragging from Finder: a real file drop reaches a marked zone, and a drop anywhere else does nothing. Text extraction from a PDF is a separate gate, in spec 008.

## R9. Limits on a source

**Finding**: The IPC cap is 2 MiB (`sage.ts:9`). The real budget is the model's input.

**Decision**: Move `MAX_REQUEST_BYTES` to the browser-safe `review-contract.ts`, which from here on owns every wire limit in the series, and add `MAX_SOURCE_CHARS = 680_000`. The derivation goes in a comment beside it: a 200,000 token context at a conservative 3.5 characters per token, less about 5,000 tokens for the persona prompt and the output. `sourceFits(text)` checks both limits and is used by the panel before any request. `assertReviewRequest` enforces it too, because constitution III puts boundaries in code.

## R10. Concurrency

**Finding**: Maximum 8 concurrent requests (`sage.ts:10`). A full question run is 5 (4 agents plus the own question) and Revisar is 4, so 9.

**Decision**: Raise the cap to 9 and write that sum next to it. Spec 008 raises it again to 11 for extraction and updates the same comment. Questions touch the board and Revisar touches the text, so they have no reason to block each other. Only one question run exists at a time, and a retry replaces its failed request.

A cancelled request stays in the sidecar's `active` map until `runReview` finishes, so a new run right after stop could exceed the cap. The run therefore has a `stopping` status that blocks a new run until every task has reported its terminal event, and `SIDECAR_DOWN` ends it too. `BUSY` remains a retryable failure as a backstop.

## R11. Recording questions

**Finding**: `Interrogatorio` has no source field, so "as today" does not cover the spec's "their source". `interrogatorios` is opaque in Rust (`Option<serde_json::Value>`), so optional fields pass through. Nothing else reads it: there are no references in `shared/mcp.ts`, `mcp/` or `src/lib/mcp/`.

**Finding on persistence**: Rust's `Essay` struct has explicit fields, reused by `history.rs`, so a new top-level field would be silently lost. These additions are not top level. They sit inside `interrogatorios` (`storage.rs:22`, opaque JSON) and inside the board snapshot (`meta`), so no Rust struct changes. The real-app reopen check in the quickstart confirms it.

**Decision**: Add optional `runId`, `fuenteId` and `propia`. One rule: the entries of a run are always derived from the notes of that run still on the board, and are rebuilt whenever that set changes. This follows the `registerBoard` pattern. After-create and after-delete handlers on `shape` mark the run dirty when the id belongs to it, and `registerOperationCompleteHandler` does the rebuild, never the side-effect callback. The rebuild goes through the debounced autosave, not `flush()` on every landing. That one path covers landing, discard, keyboard delete, undo, redo and MCP delete, and it also keeps the record if the app quits mid-run. The leave hook performs one synchronous rebuild before navigating. If the board was hidden and remounted, handlers re-register on the new editor; while no editor is mounted, nothing is rebuilt. See decision D1 in the plan.

"Just landed", the camera owner and the pending peel stay in memory, never in `shape.meta`. Meta persists, reaches MCP and enters history. Only `fuenteId` goes on the note, because it is a real attribute of that note.

## R12. Voice lines

**Finding**: R3.4 draws "Buscando el punto débil" and "Leyendo como un escéptico" for Objeciones, "Buscando qué se midió" for Evidencia and "Siguiendo el ciclo" for Sistemas. Práctica has none, and Evidencia and Sistemas have only one each.

**Decision**: Voice lines are client copy in `agent-identity.ts`. The missing lines are added in slice 0 in Paper, then copied here. They rotate every 2 s, as R3.4 specifies.

## R13. Source search at 1000 items

**Decision**: Filter on a precomputed lowercase, accent-free `nombre` plus `cita`, memoized per `fuentes` array, with `useDeferredValue` on the query. Recent first by `agregadoEn`. All matches are rendered in a scroll area with `content-visibility: auto` and an intrinsic row size. This avoids both a virtualization dependency and an arbitrary row cap that would strand older sources.

A selection from the editor is a transient source row, never saved. Otherwise a 1000-item library fills with fragments, which is also today's behavior.
