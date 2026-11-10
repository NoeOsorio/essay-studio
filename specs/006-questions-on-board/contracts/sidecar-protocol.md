# Contract: sidecar protocol additions

JSON Lines over stdin and stdout, as today. Everything existing stays.

## Requests

### `ask` (new)

```json
{ "id": "uuid", "type": "ask", "sage": "em", "text": "<source>", "question": "<writer's question>", "language": "es" }
```

Validated by `assertReviewRequest`: `question` is a non-empty string of at most `MAX_QUESTION_CHARS`. `text` must pass `sourceFits`, for `interrogate` and `critique` too.

The prompt comes from `buildAskPrompt`. The source is data, never instructions. The answer uses only that source, in plain prose of at most 60 words, because it has to fit a note. If the source does not answer, the agent says so plainly and invents nothing.

### `cancel` (existing, now reachable)

```json
{ "id": "uuid", "type": "cancel" }
```

An unknown or finished id is a no-op.

## Events

### `question` (new, `interrogate` only)

```json
{ "id": "uuid", "type": "question", "index": 0, "text": "¿Qué N tenían?" }
```

Each `index` is emitted at most once, ascending, before `complete`. `text` is never raw output: it comes only from `parseQuestions`.

### `error` (extended use)

`code` is always present on errors tied to a request id, including those raised in `handleLine`. New codes: `NO_QUESTIONS`, `NO_ANSWER`, `SOURCE_TOO_LARGE`, `INVALID_REQUEST`, `BUSY`. `CANCELLED` is reliable since spec 005.

An interrogation with zero parsed questions emits `error` with `NO_QUESTIONS` and never `complete`.

`token`, `started` and `complete` are unchanged.

## Tauri commands (`src-tauri/src/sidecar.rs`)

| Command | Arguments | Notes |
|---|---|---|
| `sage_ask` | `id, sage, text, question, language?` | Same validation as `sage_interrogate` |
| `sage_cancel` | `id` | Delivered by spec 005. Reused, not redefined |

The `question` event needs no Rust change: stdout JSON is forwarded unchanged to `sage://event`.

## Renderer (`src/lib/agents/index.ts`)

- `InterrogateUpdate` and `SidecarEvent` gain `question`. `error` already carries `code?` from spec 005.
- `SidecarRequestError { code }` and `SIDECAR_DOWN` in `runSidecarCommand` come from spec 005.
- `interrogate` accepts `requestId?`, so the run can cancel it with spec 005's `cancelSidecarRequest(id)`.
- New: `ask({ requestId?, sage, text, question, language })`.
- `parsePreguntas` is deleted. The renderer never parses model text.
