# Feature Specification: A reference section on each note

**Created**: 2026-11-27
**Input**: Noe: «Requiero, en muchas ocasiones, que las sticky notes tengan referencias explícitas en formato APA, pero es demasiado espacio… Deberíamos diseñar un apartado de referencias en cada nota para que podamos fácilmente copiar la referencia o mostrar dónde está la referencia. Y así recortar el tamaño de las sticky notes.» His screenshot shows notes whose bottom half is the full APA reference plus «Cita en el texto: (…)».

## Behavior
1. **Data.** A note may carry `meta.reference = { sourceId?, apa?, inText?, locator? }`. With `sourceId`, the full reference comes from the essay's source (Fuentes) and stays in sync; `apa` keeps a snapshot so the note still works if the source is deleted. `inText` is the in-text citation; when missing it is built from the source's authors and year with the existing APA helpers (src/lib/materials/apa.ts), plus `locator` (e.g. «p. 2»).
2. **On the board note.** The full reference is never printed. One quiet line at the bottom: a small book icon and the short in-text label («Harney y Alkhalaf, 2021, p. 12»), Geist 12/16 ink-3, truncated to one line. The note's height drops accordingly (geometry, render and SVG export share one measurement in note-shape.tsx).
3. **Hover or click on that line** opens a small popover (existing Popover): full APA reference in Newsreader, «Copiar referencia», «Copiar cita» and, when linked to a source, «Ver en Fuentes» (opens the Fuentes panel on that source).
4. **Reading view (double-click).** A «Referencia» section under the text with the full reference and the same three actions.
5. **Adding or changing it.** NoteBar gains a «Referencia» button (book icon, tooltip). It opens a popover: search the essay's sources and pick one (default), or paste a reference by hand; optional locator («p. 12»). «Quitar referencia» removes it. One undo step per change.
6. **MCP.** create_note and update_nodes accept `reference` ({sourceId | apa, inText?, locator?}; `null` removes); get_node/get_board return it. Descriptions tell the assistant to put references there, never in the note text, and to prefer sourceId when the work is in Fuentes (create it with edit_source first if needed).
7. **Existing notes.** Nothing moves automatically. The assistant can move references out of note text with update_nodes.

## Rules
Reuse existing pieces (Popover, Tooltip, copy buttons, source picker search, NoteBar button style). Spanish, tú, no middle dot, text ≥ 12 px, shortcuts only in tooltips. DESIGN.md updated. Works with 1000 notes and 1000 sources (search in the picker).

## Verification
tsc, lint, cargo check, sidecar build, mcp build, full E2E; stub E2E for pick-from-source, paste-by-hand, copy, popover, reading view, removal and undo, SVG export height; a real MCP client creating notes with references in the QA app, with a screenshot showing shorter notes.
