# Live Essay Studio MCP
Approved by Noe on 2026-11-07, including sticky-note organization and available Codex agents.

Acceptance: the agent reads the live essay/selection, makes visible text and board edits, organizes sticky notes into readable nonoverlapping groups, preserves unrelated content/metadata/connections, supports native undo, and confirms successful persistence/reopen. Stale revisions, unauthorized IPC and disconnected app requests fail explicitly. No paid model calls or arbitrary code/filesystem tools.

Real cases: “ordena las notas”; “agrúpalas por tema”; “acomódalas en columnas”; edit the selected sentence while Noe can see it. Selection-only layout leaves everything else in place.

First verified channel: local macOS Tauri app plus MCP stdio client. Web test mode is a regression surface, not a production storage channel. Windows/Linux support is not claimed without real platform verification.

Detailed requirements, invariants, scope and verification are in plan.md. Later extensions: sources/rubric authoring, remote clients, automatic sage runs. None are included here.
