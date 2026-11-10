# Quickstart: verifying the Stationery Desk

No model calls are needed. Run the real app with `npm run sidecar:build && npm run tauri:dev`, restarting it after any Rust change. Every run sets `ESSAY_STUDIO_DATA_DIR` to a scratch directory. None of Noe's essays are used, not even a copy (series.md).

## Real cases on test essays (SC-006)

1. **Reopen a test essay saved before the change** (notes, marks, a review and history, in the scratch directory; keep a copy to compare). Notes, annotations, score and history intact, with new names. Close without editing and confirm that `content`, `board` and `updatedAt` in the essay file equal the backup, and that the review does not show as out of date. (The existing close snapshot still adds a history line; that is not a change to the essay.)
2. **Write and tag a note.** Press N, click the board, write; add a title; change author and type from the bar; undo each step; delete with the trash and watch it peel.
3. **Change language from Más.** Reopen the essay; the value holds.
4. **Create a new essay and watch the empty board.** Full 12 s loop; Hazme preguntas on the board; create a note and the loop fades and does not return.

## Screens, side by side

| Compare | With |
|---|---|
| Toolbar, sheet, notes, bar, tools | R2.1 |
| Empty board, slash menu | R2.3 |
| Más | R2.4 |
| New note | R2.5, R2.6 |
| Loop | R2.7 |
| Peel, landing, drag | R1.5 |
| Tooltips and press | R7.3 |
| Colors, type, rules | R7.1, R7.2 |

Expected interim differences, owned by spec 005: on a reviewed essay the old score strip is still at the bottom and the stamp place in the toolbar is empty.

## Edge cases

- Window at 1200 px: toolbar on one row, nothing clipped.
- Board closed: sheet full width and centered; Hazme preguntas in the toolbar.
- Very long title and text: note grows; tape and tilt intact; the arrow stays attached.
- A note with an unknown author id: shown as Tú, text intact.
- Sidecar down (rename `sidecar/dist/sage.js`, relaunch, restore): banner in the new style, no vendor name.
- Traffic lights clear of content in editor, list and every overlay; window drags from the empty toolbar.

## Keyboard and motion

- Every action of FR-004 by its shortcut: ⌘N, ⌘W, ⌘\\, ⌘⇧H, ⌘⇧E, ⌘⇧R, ⌘⇧F, ⌘⇧⌫, ⌘⇧P (Hazme preguntas, per Decision 2), V, N, A, ⇧1, ⌫, ⌘Z and ⌘⇧Z on sheet, board and title. Record what ⌘I and ⌘⇧E do with the caret in the text.
- ⌘= and ⌘- still zoom the board.
- ⌫ removes a note with no animation; arrow keys move one with none.
- System Settings, Accessibility, Reduce motion on: ghost notes still, no loop, no peel, fades only.
- Essay open, board toggle, restore and panning replay no landing animation.

## MCP

With a connected client: `create_note` with `title`; `get_board` returns it; `update_nodes` changes it, and author and kind survive; `""` clears it; one ⌘Z undoes each; `get_board_image` shows the new note. Old args without `title` still work.

## Mechanical checks

Touched files are those listed in `plan.md`, except interim overlays, whose copy rules are met by the spec that replaces them.

```bash
# Middle dot between words (byte form so this document stays clean)
grep -rn $'\xc2\xb7' src/components/Topbar.tsx src/components/toolbar src/components/canvas src/components/editor/EditorPane.tsx src/components/editor/SelectionMenu.tsx src/lib/agent-identity.ts

# Text under 12 px or uppercase labels on touched surfaces
grep -nE "text-\[(8|9|10|11)(\.[0-9])?px\]|fontSize: ?(8|9|10|11)\b|uppercase" src/components/Topbar.tsx src/components/toolbar/* src/components/canvas/* src/components/editor/EditorPane.tsx src/components/editor/SlashMenu.tsx src/components/editor/SelectionMenu.tsx src/components/SidecarBanner.tsx

# One identity
grep -rnE "SAGE_[A-Z]+|\bSAGES\b|AUTHOR_[A-Z]+|\bAUTHORS\b" src

# Old names and words, visible strings
grep -rnE "Empirista|Sistémico|Práctico|Crítico|[Ss]abios?\b|[Cc]onsejo" src src-tauri/src/sidecar.rs src-tauri/src/menu.rs | grep -vE "sabios:|^\S+:\s*[0-9]+:\s*(//|\*)"

# Vendors in the interface
grep -rnE "Claude|Anthropic" src/components

# Hard-coded colors: triage each hit as remapped, error red or interim overlay. No red may remain on the sheet or the toolbar
grep -rnE "#[0-9A-Fa-f]{6}|rgba?\(" src/app/globals.css src/components

# Shortcuts printed on a surface
grep -rn "kbd" src/components/Topbar.tsx src/components/editor/EditorPane.tsx
```

Each returns nothing, except the hard-coded color list, which is triaged. Then `npm run lint`, `npm run build`, `npx tsc --noEmit`, `npm run test:e2e`, `cargo test` in `src-tauri`.

## Independent review

Reviewers who did not build it score the running app against the artboards, one lens each: hierarchy, fun, consistency (minimum 4 of 5, SC-001), copy, accessibility. Report includes screenshots and scores. Anything not seen working is stated as «no lo he visto funcionar».
