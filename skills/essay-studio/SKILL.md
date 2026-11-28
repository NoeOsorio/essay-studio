---
name: essay-studio
description: Work inside Noe's Essay Studio app through its MCP tools (server "essay-studio"): read and edit the open essay, review it with corrections that underline text and offer «Usar este texto», put sources and APA references on board notes, link notes to corrections, manage the rubric, sources and custom agents, and do it safely while Noe is typing. Use whenever the user mentions Essay Studio, «mi ensayo», «el tablero», «las notas», «correcciones», «revísame el ensayo», «ponlo en Essay Studio», or asks to review, annotate, cite or organize an essay that lives in the app.
---

# Essay Studio

Essay Studio is Noe's desktop writing app: an essay on the left, a board of sticky notes on the right, corrections underlined in the text, a score stamp, sources (Fuentes), a rubric and a version history. You work in it through the `essay-studio` MCP tools. Everything you write lands in his real essay, so be precise and leave decisions to him.

## The five rules

1. **Read before you write.** `get_basic_info` first (which essay is open, its revision, what panel is showing), then `get_document` for the text and block positions. Use the revision you got from your last read on every write.
2. **Suggest, don't rewrite.** To improve his text, add corrections with `add_findings` (he decides with one click). Edit the essay directly with `edit_document` only when he asked you to change the text.
3. **Quote literally.** A correction's `cita` is copied character by character from the essay. Never paraphrase it, never invent facts, numbers, pages or citations.
4. **References go in the reference section, never in note text.** Notes stay short; the full APA lives in `reference`.
5. **The app's own agents cost money.** Tools marked as model calls (`start_review`, `start_interrogation`, `import_assignment`, `read_source_citation`, `improve_agent_instructions`) run only when Noe asks for them, with `userRequested: true`. Doing the work yourself with `add_findings`, `create_note` and `edit_source` is free.

## Review the essay (the most common job)

1. `get_document` (add `includeEvaluation: true` to see the current score and checks) and `get_rubric` if there is one, so you can tag findings with its `criterioId`.
2. Write your findings and send them in one `add_findings` call (up to 100):
   - `cita`: the exact words with the problem, the shortest piece that contains it.
   - `mensaje`: what is wrong and why, in Spanish, tú, plain words, under 30 words. Never put the corrected text here.
   - `severidad`: `alta` only if it changes the meaning or blocks understanding; `media` if a reader notices it; `baja` for form.
   - `reemplazo`: whenever the fix is concrete wording, the exact text that replaces `cita` (same language and grammatical role, nothing else). This is what makes the card offer «Usar este texto». No instructions or prefixes like «Reescribe:».
   - `criterioId`: the rubric criterion it belongs to, if any.
   - `noteId`: optional, a board note with more detail (see below).
3. Read the result: `added` (with `located: false` when the quote was not found) and `rejected` with reasons. Fix and resend only the rejected ones. `replacementDropped: true` means the replacement brought a name, number or citation that is not in the essay or its sources; rephrase without it or drop it.
4. Show him: `set_app_view` with `panel: "corrections"`.

Your findings appear as «Tu asistente». Later calls add to them; `replaceOwn: true` replaces only your earlier open ones. To act on cards use `edit_annotations` (`apply`, `discard`, `resolve`, `reopen`); `list_annotations` filters by criterion, agent or status.

## Notes with references

- `create_note` with a short `title` (the idea) and `text` (two to four sentences). Choose `author` honestly: `tu` for Noe's own notes, an agent id only if that agent's lens fits.
- Add `reference`:
  - Prefer `{ sourceId, locator: "p. 12" }`. If the work is not in Fuentes yet, create it first with `edit_source` (`operation: "create"`, `name`, `content`, `authors: [{ lastName, firstNames }]`, `year`), then use its id.
  - Otherwise `{ apa: "<full APA 7 reference>", inText: "Autor y Autor, 2021", locator: "p. 12" }`.
- The board shows only the short citation; Noe copies the full reference from the note. Never paste the APA reference or «Cita en el texto:» into the note text.
- Long explanations are fine: the board shows eight lines and he reads the rest with a double-click.
- To move references out of old notes: `get_board`, then for each note `update_nodes` with the shortened `text` and the `reference`.

## Link a note to a correction

Pass `noteId` in the `add_findings` item, or call `link_note` with `findingId` and `noteId` (`null` unlinks). The card then shows «Ver nota». Get ids from `create_note` (its `node.id`), `get_board`, `add_findings` or `list_annotations`.

## Working while Noe types

He may be writing while you work. That is fine:
- Tools that address things by id or quote (findings, notes, board, sources, rubric, views) accept an older revision.
- `edit_document` with positions maps them through his typing. If he touched that exact range you get `RANGE_CHANGED` with the current text: reread that block and retry.
- `STALE_REVISION` only happens for navigation, deleting, restoring and undo: call `get_basic_info` again.
- Never retry an `operationId` that came back `OUTCOME_UNKNOWN`; inspect the state instead.

## Other things you can do

- **Essays**: `list_essays` (search in titles and text, filter, sort, scores), `open_essay`, `create_essay`, `update_essay` (mode `academico`/`blog`, language).
- **Text**: `edit_document` (insert, replace, rich content, format, rename the title), `set_text_selection` to point at a passage, `editor_history` to undo your own last change.
- **Sources**: `list_sources`, `get_source`, `edit_source`, `import_source_file` for PDFs.
- **Rubric**: `get_rubric`, `edit_rubric`; from an assignment text or PDF, `import_assignment` then `confirm_rubric_proposal` (model call).
- **History**: `create_version` before a big change you were asked to make; `restore_version` only on explicit request.
- **Agents**: `list_agents`, `edit_agent` to create or change Noe's custom agents.
- **Views**: `set_app_view` to open corrections, the report card, a note (`noteId`), a version, Fuentes, the rubric or Configurar agentes.

## Writing for Noe

- Spanish, tú, plain words, short. No vendor or model names in anything that lands in the app.
- Never use the middle dot between words, decorative numbering or filler.
- Cite APA 7: «Apellido, A. y Apellido, B. (año). Título. Revista, vol(núm), páginas. https://doi.org/…» in the reference; «(Apellido y Apellido, año, p. X)» in the text.
- Destructive actions (`delete_essay`, `restore_version`, `edit_annotations` with `clear`, `delete_nodes` of his notes) only when he asks, with `confirm: true` where required.

## When something fails

| Code | What to do |
|---|---|
| `RANGE_CHANGED` | He edited that text. Reread the block with `get_document` and retry with the new positions. |
| `STALE_REVISION` | `get_basic_info`, then retry the navigation or destructive call. |
| `ESSAY_CHANGED` | Another essay is open. `open_essay` the right one or ask. |
| `INVALID_ARGUMENTS` | The message names the field; fix only that. |
| `SOURCE_NOT_FOUND` | Create the source with `edit_source` or use `apa`. |
| `DISCONNECTED` | Essay Studio is closed or MCP is off; ask Noe to open the app. |
