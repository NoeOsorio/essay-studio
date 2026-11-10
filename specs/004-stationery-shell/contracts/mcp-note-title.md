# Contract: note title on the MCP board tools

Additive. Defined in `shared/mcp.ts`, the single registry, and implemented in `src/lib/mcp/board.ts`.

| Tool | Change |
|---|---|
| `create_note` | Optional `title: string` |
| `update_nodes` | Each node accepts optional `title: string`. An empty string clears it. A patch with only `title` is valid; the "supply something to change" check includes it |
| `get_board`, `get_node` | Each note reports `title: string \| null` next to `text` |
| `get_board_image` | Note export draws title, tape, tilt, author icon and name. No date, no kind |

Rules:

- `title` is stored in `meta.title`, merged with existing `meta`, so author and kind are never lost.
- Unchanged: tool names, error codes, revision checks, safety versions, one-step undo, locked-note rules, `organize_notes`.
- `bounds` reports the real measured height, so layouts account for titles. `rotation` remains `shape.rotation`; the visual tilt is not reported because it does not affect geometry.
- Fail-closed validation still rejects any unknown property.
