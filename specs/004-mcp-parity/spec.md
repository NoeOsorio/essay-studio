# MCP interface parity

Approved by Noe on 2026-11-08: implement the complete plan supplied in chat.

The agent can perform the existing manual document, board, essay, source, rubric, history, review and interrogation actions through authenticated local MCP. Existing tools remain compatible. All edits use live native editors, revision checks, safety snapshots and durable persistence. Navigation, content mutation, deletion and model execution have distinct classifications. Collection reads support compact search/filter/page queries, including collections of 1000 items. Large text is read in ranges, without raising IPC limits.

Acceptance: reproduce source-heading edits and outcome cards entirely through MCP; preserve formatting and metadata across undo/redo and reopen; reject stale edits and locked objects; restore only after a successful safety save; no duplicate work after uncertain outcomes. Model jobs start only after explicit user request, expose status/results/cancellation and never apply results automatically. No model calls during implementation verification.

Excluded: redesign, new category containers, dictation, future conversation features, arbitrary code/filesystem access, Windows/Linux claims. Existing internal persisted identifiers remain compatible. New copy follows Noe's plain naming and design rules, with no middle-dot separators or decorative numbering.
