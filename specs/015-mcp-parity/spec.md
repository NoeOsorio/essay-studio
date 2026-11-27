# Feature Specification: MCP can do everything the app does

**Created**: 2026-11-27
**Input**: Noe: «Revisa qué otras funcionalidades de la app faltan en el MCP, se debería poder hacer todo lo que se puede desde la app.»

An audit (2026-11-27) compared every UI action with the MCP tools. Each gap below must be closed by reusing the same store/actions the UI calls, so behavior (undo, guards, versions before destructive changes, limits) matches the app. Every new or changed tool keeps the existing conventions in shared/mcp.ts: revision + operationId on mutations, typed errors, bounded outputs, clear descriptions written for an assistant. Bump CAPABILITY_VERSION once. Update docs/mcp-installation.md.

## Part A: corrections, agents, questions
1. `edit_annotations` gains `resolve` («Ya lo resolví», resolveCard) and `reopen` (reopenCard).
2. Custom agents in runs: `start_review.pases` accepts `custom:<id>`, `start_interrogation.sages` accepts `c_<id>`; jobs pass the agent to critique/interrogate exactly as the panels do (findings carry agentName/agentColor; canPaste respected); defaults include agents with defaultOn like the UI.
3. Agents CRUD: `list_agents` (built-ins with description, examples, whenItRuns; custom with all fields), `edit_agent` (create/update/delete with the same validation as the form), `improve_agent_instructions` (returns the rewrite; does not save unless `apply: true`).
4. Own question: `start_interrogation` accepts `ownQuestion` answered via ask() as in questions/run.ts.
5. `list_annotations`: filter by `criterioId`, `custom:*`/`c_*`, `as`/`asistente`; items include criterioId, reemplazo and noteId.
6. Runs started in the UI: `get_basic_info` reports the active review run and question run (status per pass/agent); `cancel_review_job` (or a new `control_run`) can cancel/stop/retry them; `get_review_job` returns omittedSources.

## Part B: sources, rubric, library, views
7. Fix: `edit_rubric` must keep the saved assignment (consigna); `get_rubric` returns it.
8. Rubric from an assignment: `import_assignment` (text, or a PDF uploaded in chunks like import_board_asset), runs the same extraction, returns the proposal; `confirm_rubric_proposal` replaces the rubric after saving a version, as the UI does.
9. Sources: `edit_source` create/import goes through addSource (duplicate check, limits, citation reading); PDF upload in chunks; `read_source_citation` runs/retries the AI citation reading; update and get_source include autores, anio, publicacion; undo of a removed source.
10. Library: `list_essays` body search (library_search with snippets), review-state filter, sort, score per essay; `delete_essay` for an essay that is not open (confirm: true).
11. `set_app_view` targets: settings (agents), report card, corrections (optionally filtered by criterion), note reading view (noteId), history preview (takenAt), interrogation panel with preselected agents and prefilled text.

## Verification
tsc, lint, cargo check, sidecar build, full E2E; a throwaway stub spec per part; then a real MCP client run against the QA app covering resolve/reopen, a custom agent run, list_agents/edit_agent, the rubric keeping its assignment, and opening the corrections view.
