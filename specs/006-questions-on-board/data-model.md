# Data Model: Questions on the Board

## Persisted, all additive and optional

Old essays open unchanged. No migration. Rust stores `interrogatorios` as an opaque value, and tldraw `meta` is a free JSON object.

### `Interrogatorio` (`src/lib/storage/types.ts`)

| Field | Type | Status | Meaning |
|---|---|---|---|
| `sage` | `Sage` | existing | Agent that asked or answered |
| `preguntas` | `string[]` | existing | Only questions still on the board |
| `generadoEn` | ISO string | existing | Run start |
| `costoUsd` | number, optional | existing | Sum for that agent, never shown |
| `runId` | string, optional | new | Groups the entries of one run, so the discard window can rebuild them |
| `fuenteId` | string, optional | new | Saved source. Absent for a text selection |
| `propia` | `true`, optional | new | The entry holds the writer's own question |

An own question is its own entry, with `preguntas: [question]`, `propia: true` and `sage` set to the agent that answered. The answer lives on the note.

### Note `shape.meta`

| Field | Status | Value for a landed note |
|---|---|---|
| `author` | existing | `em`, `sis`, `pra` or `cri` |
| `kind` | existing | `pregunta`, including own questions. No new kind |
| `createdAt` | existing | Landing time, in ms |
| `title` | from spec 004 | The writer's question, only for an own question |
| `fuenteId` | new, optional | Same as the entry |

`props.richText` holds the question, or the answer for an own question. `rotation` is 0, because 004 derives the tilt from the id.

No Rust struct changes: all of the above sits inside values Rust stores opaquely (`interrogatorios`, `board`), so saves, version snapshots and restore keep them.

## In memory only

Never written to `shape.meta` or to disk.

### `QuestionRun` (store slice `questionRun`, null when none)

```ts
type RunTask =
  | { kind: "agent"; sage: Sage; requestId: string }
  | { kind: "own"; sage: Sage; requestId: string; question: string };

type AgentRunState = {
  sage: Sage;
  phase: "thinking" | "landing" | "done" | "failed" | "stopped";
  landedCount: number;
  failure: FailureKind | null;
};

type QuestionRun = {
  runId: string;
  essayId: string;
  source: { fuenteId?: string; label: string };
  status: "running" | "stopping" | "ended";
  agents: AgentRunState[];
  justLanded: string[];
};
```

The one-shot landing motion uses spec 004's `markLanding(id)` in `src/lib/canvas/note-motion.ts`. Module-private state in `src/lib/questions/run.ts`: the task list, the 60 ms landing queue, the `shapeId` to `{ sage, text, propia }` map for the window, and the per-agent cost. `landing.ts` holds the essay id, the anchor, the column cursors, the viewport at run start and the writer-moved-camera flag. It holds no editor: each landing resolves it (research R6).

### State transitions

```
thinking -> landing   first question lands
thinking -> done      own question only, answer landed
landing  -> done      request complete and its questions landed
thinking or landing -> failed    error other than CANCELLED
thinking or landing -> stopped   stop, or leaving the essay
failed   -> thinking  retry
```

Stop sets `status` to `stopping`, and a new run is blocked until every task has reported a terminal event or the sidecar went down. Then `status` becomes `ended`. The entries are not tied to that moment: they follow the notes on the board from the first landing on.

A retry asks again and lands at most `QUESTIONS_PER_AGENT - landedCount` questions, so a partial agent does not end up with more than three.

### Discard window

Opens when the first note lands. Closes when the next run starts or the essay is left (see D1).

## Failure kinds and copy

Raw sidecar messages can name vendors and are logged only. The renderer maps codes:

| Sidecar code | `FailureKind` | Visible line (confirmed in slice 0) |
|---|---|---|
| `NO_QUESTIONS`, `NO_ANSWER` | `unusable` | No pudo formular preguntas |
| `TIMEOUT` | `timeout` | Tardó demasiado |
| `SOURCE_TOO_LARGE` | panel message | Esta fuente es demasiado larga para enviarla |
| `CANCELLED` | not a failure | none |
| `BUSY` | `generic` | No pudo responder |
| `SIDECAR_DOWN` | `generic` | No pudo responder (the existing banner explains why) |
| any other | `generic` | No pudo responder |

## Constants

Live in `sidecar/src/review-contract.ts`, each with its reason beside it: `QUESTIONS_PER_AGENT = 3`, `MAX_QUESTION_CHARS = 300`, `MAX_SOURCE_CHARS = 680_000`, `MAX_REQUEST_BYTES = 2 MiB`.
