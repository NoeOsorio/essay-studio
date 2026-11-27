# Feature Specification: The assistant can edit while you write

**Created**: 2026-11-27
**Input**: Noe relayed his assistant's failure: «No pude meterlo en Essay Studio: mientras escribes, el documento cambia a cada segundo y la app rechaza mis cambios para no pisar los tuyos.»

## Root cause
`src/lib/mcp/registry.ts` keeps one revision number for the whole app (`epoch:essayId:N`) and bumps N on every change to `current` (each keystroke autosave, board edit, finding change). Every mutating tool calls `checkRevision`, so any write sent a few seconds after a read is rejected with STALE_REVISION while the writer types, even when the two edits cannot collide.

## Behavior
1. Anchor and id addressed tools do not fail because unrelated parts changed: add_findings (literal quotes resolved at apply time), edit_annotations, link_note, board tools that address nodes by id, notes, sources, rubric, agents, views. They still require the essay to be open and fail if what they address no longer exists or changed (e.g. updating a node whose text changed since the read keeps working; deleting a missing node fails clearly).
2. Position addressed document edits (edit_document insert/replace/rich_*/format with from/to): the app keeps the step maps of document transactions per revision (bounded ring, e.g. last 2000 revisions or 10 minutes). A stale revision maps from/to through the steps since then; if the mapped range was touched by those steps (deleted or edited inside), the call fails with RANGE_CHANGED and the current text of that range; otherwise it applies at the mapped positions. Title rename keeps a title-only check.
3. Navigation and destructive tools (open/close/delete essay, restore_version, clear) keep the strict check.
4. Every result returns the latest revision; errors tell the assistant exactly what to reread.
5. Undo, durable saves and the writer's own typing are unaffected; the writer never sees their text moved or lost.

## Verification
A real MCP client inserting text, adding findings, creating and linking a note while a script types continuously in the QA app; all succeed or fail only on true overlap. Full E2E.
