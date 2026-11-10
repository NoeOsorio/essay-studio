# Contract: Library Commands (Tauri)

Both new commands are `async`, with file IO and parsing inside `tauri::async_runtime::spawn_blocking`. The renderer calls them through `src/lib/storage/index.ts` only. No new permission or capability is needed; they are app commands like `essay_list`.

## `library_list`

Input: none. Output: `LibraryEntry[]` (data-model.md) newest `updatedAt` first.

Reconciles first. Rejects only if `essays/` cannot be read; the renderer then shows the load-failed state and keeps any list it had. A damaged essay is omitted, not an error.

## `library_search`

Input: `{ query: string }`. Output:

```ts
type Segment = { text: string; hit: boolean };
type SearchHit = {
  id: string;
  rank: "title" | "body";
  title: Segment[];
  /** Only when rank is "body". */
  snippet?: Segment[];
};
type SearchResult = { hits: SearchHit[] };
```

- Reconciles first (3 ms).
- A query with no words returns no hits.
- Every word must be present in the title or the body, as a substring, after folding (lowercase, accents removed, «ñ» kept).
- `rank` is `title` when every word is in the title, else `body`.
- Hits are ordered title before body, then newest first. The renderer reorders when another order is chosen.
- All matches are returned; filters run in the renderer because review state is computed there.
- `snippet` starts at the beginning of the sentence holding the first match if that is within 60 characters, otherwise at a word boundary after a leading «…». It runs about 120 characters and ends with «…» when text continues. It is the width of one ledger line, cut further by CSS.
- Every query word found in the title or snippet is `hit: true`.
- The renderer drops any response older than the latest query.

## `essay_list` (unchanged for callers)

Output stays exactly the six `EssayMeta` fields. It now reconciles and answers from the index, and is `async`. It is what MCP `list_essays` returns.

## `essay_delete` (unchanged for callers)

After removing the files, it starts a background reconcile, so the deleted essay's text leaves the index right away, the same reason it already removes the history file.

## `essay_read`, `essay_write`, `history_*`

Unchanged.

## MCP surface

No tool is added or changed. `list_essays` keeps its description and shape.

## Native menu

New item `view:search`, Vista > Buscar ensayos, accelerator ⌘K. The bridge acts only while the list is showing and otherwise does nothing. No other surface binds ⌘K today: installed tldraw's `edit-link` action has no shortcut, and TipTap's link extension and `src` bind none. Re-check after 004 to 006 land.
