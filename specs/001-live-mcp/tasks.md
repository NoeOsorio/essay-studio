# Approved implementation tasks

- [x] T01 Shared wire registry/schema and protected live-app IPC. Done: real MCP initialize/list/call reaches the active renderer; unauthorized/closed connections fail.
- [x] T02 Native document adapter, selection, revisions, durable serialized save and batch snapshots. Done: real visible text edit survives reopen; stale edit rejected; native undo preserves formatting.
- [x] T03 Native board adapter and sticky organization. Done: cluttered notes become readable grid/topic columns, arrows stay bound, locked/unselected nodes stay fixed, single undo and reopen work.
- [x] T04 Stdio adapter, setup commands and docs. Done: SDK client reads tools/calls live app and receives image content; no logging to stdout.
- [x] T05 Existing regression suite, build/lint/typecheck, native run and independent review. Done: actual evidence recorded, limitations explicit.

T01 IPC, T02 renderer/document, T03 board and T04 adapter have disjoint ownership after the shared registry is created. No new unit tests. Baseline E2E initially could not start because dependencies were absent; install with scripts disabled, inspect required scripts, then rerun before editing interactions.

Consistency review: each accepted capability maps to a shared tool and task; mutations carry essay ID/revision, use native transactions and persistence acknowledgment. No file-only writer, paid calls or remote exposure. Platform scope and unavailable model exception are explicit in spec/plan.

Evidence 2026-11-07: 110 existing browser E2E and33 Rust tests passed; typecheck/lint/build passed. Native SDK client and CUA verified visible editing, six notes, bound arrow, topic/grid layout, locked/rotated bounds, exact one-menu-action undo, saved reopen and auth/replay/stale fences. Stdio adapter audit0 findings. Global MCP registration and replacing installed app remain blocked by automatic approval review pending explicit Noe authorization; code/build verification does not imply these final integration steps completed.

Final integration completed after explicit Noe authorization: installed0.2.0 in /Applications, verified ad hoc signature, registered essay-studio globally. The real configured SDK client discovered15 tools and read the installed app context. Prior approval-review blocks resolved, not bypassed.
