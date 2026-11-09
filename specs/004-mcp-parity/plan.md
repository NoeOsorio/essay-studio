# Implementation

Cause: the MCP renderer adapters restrict node types and plain text; application and review operations remain tied to UI components. Extend the shared registry and extract reusable actions rather than implementing a second editor or review engine.

Board work owns src/lib/mcp/board.ts and optional board helpers. It adds native shape CRUD, properties, duplication, ordering, connection editing, selection/camera, native undo/redo and paginated summaries. Expose type-specific validated properties from native schemas; preserve locked objects unless explicitly unlocking.

Document work owns src/lib/mcp/document.ts and optional document helpers. It adds JSON schema checked rich edits, block formatting, native selection/history and ranged structured reads. Do not accept HTML or arbitrary schema attributes.

Review work owns src/lib/reviews/, src/lib/agents/index.ts, review/interrogation UI integration, sidecar runtime cancellation and Rust sidecar cancellation. Shared jobs provide explicit start, lookup, cancel, separate apply, provenance and stale fingerprint checks, and operation-id deduplication. Never invoke models for verification.

Coordinator owns shared/mcp.ts, src/lib/mcp/registry.ts, application/source/rubric/history helpers, storage race fixes, MCP server metadata, docs and integration. All tools have explicit effects; existing names preserved. Library and history operations use store/storage actions with failure propagation, context rechecks after awaits and save confirmation. Add bounded pagination/ranges instead of increasing 2 MiB IPC frames.

Deliver board/navigation, document, essay/history, sources/rubric and review jobs in independently verified slices. Main worktree is isolated from the concurrent redesign. No dependencies added. Existing suites and real native app verification are required; independent review checks reliability and safety. Record unavailable client verification explicitly rather than claim it passed.
