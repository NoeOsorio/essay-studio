# Implementation

## Remaining manual actions, approved continuation

Noe approved closing the named gaps with "Dale pues" on 2026-11-09. Reuse native tldraw group/ungroup and page APIs, an isolated TipTap title history (browser undo was proved document-global) and the existing asset import pipeline. Extend the shared registry rather than accepting arbitrary commands. Preserve locked descendants, page limits, revision checks, durable snapshots and native undo. Page switching is a view effect; page deletion is explicitly destructive. SVG support must use a bounded, validated image-only subset with no script, foreign HTML, event attributes, external references or active CSS. Unsupported SVG content is rejected before persistence, not silently executed or uploaded.

Delivery: board groups/pages, title undo/redo and safe SVG import have separate owners. Coordinator owns shared contracts, registry integration and expanded native acceptance. Verify every advertised tool and all new operations on a disposable native app with the deterministic sidecar; no model inference. Independent review must inspect the new boundaries and actual reports. Existing test suites remain; no new unit tests.

Cause: the MCP renderer adapters restrict node types and plain text; application and review operations remain tied to UI components. Extend the shared registry and extract reusable actions rather than implementing a second editor or review engine.

Board work owns src/lib/mcp/board.ts and optional board helpers. It adds native shape CRUD, properties, duplication, ordering, connection editing, selection/camera, native undo/redo and paginated summaries. Expose type-specific validated properties from native schemas; preserve locked objects unless explicitly unlocking.

Document work owns src/lib/mcp/document.ts and optional document helpers. It adds JSON schema checked rich edits, block formatting, native selection/history and ranged structured reads. Do not accept HTML or arbitrary schema attributes.

Review work owns src/lib/reviews/, src/lib/agents/index.ts, review/interrogation UI integration, sidecar runtime cancellation and Rust sidecar cancellation. Shared jobs provide explicit start, lookup, cancel, separate apply, provenance and stale fingerprint checks, and operation-id deduplication. Never invoke models for verification.

Coordinator owns shared/mcp.ts, src/lib/mcp/registry.ts, application/source/rubric/history helpers, storage race fixes, MCP server metadata, docs and integration. All tools have explicit effects; existing names preserved. Library and history operations use store/storage actions with failure propagation, context rechecks after awaits and save confirmation. Add bounded pagination/ranges instead of increasing 2 MiB IPC frames.

Deliver board/navigation, document, essay/history, sources/rubric and review jobs in independently verified slices. Main worktree is isolated from the concurrent redesign. No dependencies added. Existing suites and real native app verification are required; independent review checks reliability and safety. Record unavailable client verification explicitly rather than claim it passed.
