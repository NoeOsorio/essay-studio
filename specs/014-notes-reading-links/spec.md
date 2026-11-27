# Feature Specification: Read notes, zoom the board, link a note to a correction

**Created**: 2026-11-26
**Input**: Noe: «da la opción de linkear un sticky note a una anotación… un botón o link que me lleve a esa sticky note para leer con más detalle», «es muy difícil leer las sticky notes», «no hay forma de hacer zoom con doble click o algo similar».

## Behavior
1. **Read a note.** Double-click a note on the board opens it large in a centered sheet over a dim veil: same note look (agent fill, tape, author header, title) at reading size (Newsreader 20/30 body, 24/30 title), full text, scrolls if long. Esc or a click on the veil closes it. «Editar» closes it and starts editing that note in place on the board. If corrections link to it, «Ver en el ensayo» scrolls the editor to the first one and flashes it.
2. **Zoom.** Two buttons, − and +, in the board toolbar next to «Ver todo», stepping the zoom like tldraw's zoom in/out; tooltips «Alejar» / «Acercar» with ⌘− / ⌘+. Pinch and the shortcuts keep working.
3. **Link a note to a correction.** A finding record may hold `noteId`. On a card part with a linked note, a text button «Ver nota» shows the board if hidden, centers and selects the note, and opens its reading view. A card part without a link offers «Vincular nota» (text button, same row as «Ya lo resolví / No aplica» actions, quiet ink-2): it enters pick mode, the board shows one line «Elige una nota» and clicking a note links it; Esc cancels. The reading view of a linked note offers «Quitar vínculo». Deleting the note leaves the card with no «Ver nota».
4. **MCP.** `add_findings` items accept an optional `noteId` (must be a note on the essay's board). New tool `link_note` `{essayId, revision, operationId, findingId, noteId | null}` links or unlinks. `get_annotation` and `list_annotations` return `noteId`.

## Rules
Reuse existing pieces (StickyNote, Panel/sheet veil, toolbar buttons, Tooltip). Copy in Spanish, tú, no middle dot, text at least 12 px, shortcuts only in tooltips. One undo for a link change. Every list stays fine with 1000 items. Update DESIGN.md.

## Verification
tsc, lint, cargo check, sidecar build, full E2E; a stub E2E for the three flows; a real MCP call creating a note with a reference and a linked correction in the QA app.
