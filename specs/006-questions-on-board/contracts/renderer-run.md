# Contract: question run in the renderer

## `src/lib/questions/run.ts`

```ts
startQuestionRun(input: {
  source: { fuenteId?: string; label: string; text: string };
  sages: Sage[];
  ownQuestion?: string;
}): void;
stopQuestionRun(): void;     // synchronous up to writing the entries
retryAgent(sage: Sage): void;
keepNote(shapeId: string): void;
discardNote(shapeId: string): void;
```

`stopQuestionRun` sets the run to `stopping`, cancels each active request with `cancelSidecarRequest`, drops the landing queue and rebuilds the entries once, synchronously. It is registered through spec 005's `registerEssayLeaveHook` (exported by `store.ts`, which avoids a circular import), so it runs before `current` changes and entries are written to the right essay. The order inside `closeEssay` is stated once, in 005's plan under Invariants.

## `src/lib/questions/landing.ts`

```ts
beginLanding(essayId: string, sages: Sage[]): Promise<LandingSession>;
land(session, note: { sage: Sage; text: string; title?: string; fuenteId?: string }): Promise<TLShapeId>;
markWriterMovedCamera(): void;
```

`beginLanding` and each `land` resolve the live editor with `ensureBoard(essayId)`, because `BoardPane` unmounts when the board is hidden. So the run start opens a closed board, and if the writer hides it during a run, the next landing opens it again. `land` creates the note with `history: "ignore"` and does not change selection, focus, tool or editing state. It calls spec 004's `markLanding(id)` before creating the shape, so only landed notes play the entry motion. `discardNote` sets a mark and calls spec 004's `peelNote(editor, id)`, which deletes first and animates a clone, so the discard is one undo step.

## `src/lib/mcp/board.ts`

Exports for reuse, with no behavior change: `boundsOf`, `common`, `overlaps`, `clearObstacles`, `Rect`, `ensureBoard`.

## Store

- `questionRun: QuestionRun | null`, written only by `run.ts`.
- `replaceInterrogatoriosForRun(runId, entries)` removes that run's entries, appends the given ones and schedules the debounced autosave. It is the only writer for run entries, and touches nothing else.
- `lecturaSage: Sage | null`. `lecturaMode` and `setLecturaMode` are removed. `openLectura(sage?, prefill?, opts?: { instant?: boolean })` keeps its call sites, and `sage` now means "only this agent on". It is a no-op while a run is `running` or `stopping`. `instant` is passed by the native menu bridge and by button activation with `event.detail === 0`. It sets spec 004's `overlayInstant`, which turns off the panel's opening animation (R3.4).
- The `overlay` value `"lectura"` stays.

## Spec 004 pieces this spec consumes

Read from `specs/004-stationery-shell/contracts/` and its plan. `/speckit-analyze` must check these against what 004 actually delivers.

| Piece | Assumed interface |
|---|---|
| Anchored panel | `Popover` with `anchor`, `open`, `onClose`, `side`, `align`, `instant`. The anchor comes from `useAnchor("hazme")`, which resolves to whichever Hazme preguntas trigger is rendered, in the toolbar or on the empty board. `instant` reads `overlayInstant` |
| Tooltip | `Tooltip` with R7.3 timing, also shown on focus |
| Identity | `agent-identity.ts`, `identityOf`, `AGENTS`. This spec adds `asks` and `voiceLines` to `Identity` |
| Note title | `meta.title` rendered bold, visible to MCP through `describe` |
| Tilt and width | `tiltOf(id)`, applied when `rotation === 0`; `NOTE_WIDTH = 212` |
| Sticky note visual | Presentational `ui/StickyNote.tsx`, used by `AgentTiles` |
| Note motion | `src/lib/canvas/note-motion.ts`: `markLanding(id)` and `peelNote(editor, id)`, `land` and `peel` keyframes |
| Motion | `--ease-out`, `--dur-note`, `--stagger` and a `prefers-reduced-motion` policy |
| Toolbar | A button labeled Hazme preguntas that calls `openLectura()` |
| Selection entry | `SelectionMenu` keeps `openLectura(sage, text)` with agent chips. `CouncilAvatars` is removed by 004, so the selection bubble is the only entry "from an agent" |
| Board controls | `NoteBar` replaces `NoteContextPanel`. `BoardZoom` is gone, the fit control lives in `BoardToolbar` |
| Undo routing | The last-pointer record in `src/lib/editor/history.ts`. Overlays outside `<Tldraw>` carry `data-board-surface` |

## Spec 005 pieces this spec consumes

| Piece | Interface |
|---|---|
| Cancel | `sage_cancel` and `cancelSidecarRequest(id)`, with the aborted-run code in `runner.ts` |
| Sidecar crash | `SIDECAR_DOWN` from `runSidecarCommand`, rejected as `SidecarRequestError { code }` |
| Leaving the essay | `registerEssayLeaveHook` |
| Error code | `code` on the client `SidecarEvent` error |
| Out of date | A fingerprint of text, rubric and sources. A question run never marks the review out of date. A source added from this panel does, under 005 FR-009 |
| E2E stub | `sage_cancel` case, extended here for interrogate |
