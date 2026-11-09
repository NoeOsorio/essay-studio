# Consistency and verification

The approved plan is implemented in an isolated worktree based on merged main. The concurrent monochrome redesign was not modified. Board, document and review slices had separate owners; independent review covered registry authorization, persistence, native transactions, references and asset input handling. No new dependencies or unit tests were added. No model inference was executed.

## Real acceptance

- Native stdio MCP client initialized the adapter, authenticated over the Unix socket and edited live Tauri TipTap/tldraw instances. Headings, source-title cards, outcome cards, formatting, undo/redo, sources, rubric, explicit version creation/restoration, image import, stale-revision refusal and durable reopen passed. The native report and board image are in this chat's outputs directory.
- The first cold native run returned an unknown outcome after a macOS spell-server stall. Saved state was read before proceeding; the expired edit had not applied. A fresh acceptance run passed. No uncertain edit was blindly repeated.
- Temporary renderer scenarios passed collections with 1000 essays, shapes, assets, sources, criteria and versions. A 2,500,042-byte image imported through smaller contiguous chunks and native decoding without increasing the IPC budget.
- Synthetic storage failures returned SAVE_FAILED; finish_work recovered the pending save without repeating the edit. Failed safety snapshots and typing during a held restore refused replacement. Pending deletion blocked reopening the essay.
- Review and SDK transport fixtures passed explicit-start deduplication, bounded results, separate application, stale refusal, cancellation, sidecar shutdown, overlapping annotation preservation, readonly/IME refusal and question materialization. These prove control flow, not actual model access or review quality.
- The full existing browser suite passed 109 cases; its remaining source-indicator assertion was updated to the plain label while preserving the assertions that both sources reach all review passes, and that case passed on targeted rerun. Rust's existing 33 cases passed. ESLint, TypeScript, both nested package builds, production static build, native package build and ad hoc signature verification passed.
- The actual Codex app-server discovered all tools through its local protocol without starting a chat turn. Claude Code reported the temporary server connected. Claude Desktop requires a signed-in profile to finish its connection check; this is explicitly pending in NOE-550, labelled Ask Human. No personal Claude configuration was changed.

## Security boundaries

The registry validates sessions before cached results, hashes semantic operation arguments, limits cached response memory, and reserves opaque operation IDs across renderer restarts. Provably pre-dispatch stale/expired requests can retry with the same intent; unknown outcomes never trigger a second mutation. Read pages and content ranges remain within the existing frame budget.

Literal asset imports reject SVG/HTML, verify MIME/signature and native metadata, and recheck upload epoch, editor, essay, revision and readonly state. Partial imports are transient. Explicit remote assets require HTTPS without credentials. Neither path provides server-side URL fetching or arbitrary filesystem access.

## Existing dependency findings

Audit on 2026-11-08: app lockfile 50 findings, sidecar 9, independent MCP adapter 0. No dependency versions changed except package release metadata. Existing Next advisories predominantly affect hosted server routes, server actions, optimization and caches; this app ships a static export in Tauri and exposes no Next HTTP service in production. Development server exposure remains a development concern.

Existing TipTap/prosemirror paste advisories remain relevant to manual editor input. New MCP rich input rejects unknown/prototype attributes and unsafe URL schemes and does not parse HTML, but that does not certify the manual paste path. A coordinated editor dependency upgrade is deferred to avoid an unreviewed change to the established native editor behavior in this capability release.

Sidecar proxy/HTTP/OAuth advisories concern transitive SDK services not enabled by the empty tools/MCP/settings execution profile; no new HTTP listener or OAuth flow was added. The CLI SDK remains pinned pending a separately verified migration. Review these dependency deferrals by 2026-11-15; no claim of a clean whole-application security audit is made.
