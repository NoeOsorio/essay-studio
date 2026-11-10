# Consistency and verification

The advertised MCP extension is implemented in an isolated worktree based on merged main. The named gaps from the manual context-menu audit are now implemented; static SVG restrictions and authenticated Claude Desktop verification remain explicit below. The concurrent monochrome redesign was not modified. Board, document and review slices had separate owners; independent review covered registry authorization, persistence, native transactions, references and asset input handling. No new dependencies or unit tests were added. No model inference was executed.

## Complete advertised-tool acceptance

The reproducible runner in mcp/scripts/verify-all-tools.mjs passed all 54 advertised tool names on the signed native 0.4.0 app, through MCP stdio and authenticated local IPC. Its final report contains 423 calls, 127 passing state assertions and no errors. Independent review checked the exact shared-registry inventory, successful calls, assertions, fixture hash and process ownership. The temporary essay library ended empty. Independent review confirmed all new group/page/title/SVG assertions and matched the executable hash against both the build and the copied native acceptance app. The installed 0.4.0 app has the same hash; its adapter advertises 54 tools and capability version 3. The previously open essay was restored and durably saved after installation, with a backup of the prior app retained.

The controlled sidecar recorded 10 unique generation requests: nine completed and one was actually cancelled. It imports only Node builtins and does not invoke the model SDK. These results verify native tool execution and job control, not real model access or quality. The final successful run did not exercise unknown-outcome recovery; earlier startup attempts are not counted as passing acceptance.

This audit reproduced and fixed get_review_job accepting a schema limit of 200 but rejecting it internally at 100. It also found the missing read path for persisted score state. get_document now exposes the UI's existing benchmark calculation through includeEvaluation, with bounded criterion summaries; active panels and score visibility can be inspected and controlled. Never-evaluated, clean partial, clean full, stale, cleared and reopened clean evaluations passed native checks.

The follow-up closes native grouping/ungrouping, native board pages, isolated title undo/redo and static SVG import. Native acceptance verifies group history, locked descendants, complete binding-preserving page moves, off-page read refusal, page creation/rename/delete guards, durable active-page restore and evaluation freshness across hydrated page switches. SVG dimensions, bounded inline reads, durable reopen and six malicious rejection cases passed in WebKit. Separate browser acceptance rejected sixteen hostile or excessive SVG payloads with no asset persistence or external requests.

The title reuses TipTap with a single plain paragraph and its own ProseMirror history. A browser experiment proved document.execCommand undo can target another editable despite focusing the title, so the shared native history engine replaces that unsafe approach. Existing typing, paste, menu and save/reopen scenarios passed with title/body/source histories isolated. create_essay rejects all supported line separators before creating anything, and initialization waits for title registration. No dependency was added.

The initial follow-up native runner incorrectly attached mutation-only arguments to a read refusal assertion and stopped. The runner now constructs refusal requests from each advertised schema. A fresh isolated run passed every advertised tool; that earlier harness failure is not counted as app acceptance.

## Real acceptance

- Native stdio MCP client initialized the adapter, authenticated over the Unix socket and edited live Tauri TipTap/tldraw instances. Headings, source-title cards, outcome cards, formatting, undo/redo, sources, rubric, explicit version creation/restoration, image import, stale-revision refusal and durable reopen passed. The native report and board image are in this chat's outputs directory.
- The first cold native run returned an unknown outcome after a macOS spell-server stall. Saved state was read before proceeding; the expired edit had not applied. A fresh acceptance run passed. No uncertain edit was blindly repeated.
- Temporary renderer scenarios passed collections with 1000 essays, shapes, assets, sources, criteria and versions. A 2,500,042-byte image imported through smaller contiguous chunks and native decoding without increasing the IPC budget.
- Synthetic storage failures returned SAVE_FAILED; finish_work recovered the pending save without repeating the edit. Failed safety snapshots and typing during a held restore refused replacement. Pending deletion blocked reopening the essay.
- Review and SDK transport fixtures passed explicit-start deduplication, bounded results, separate application, stale refusal, cancellation, sidecar shutdown, overlapping annotation preservation, readonly/IME refusal and question materialization. These prove control flow, not actual model access or review quality.
- The full existing browser suite passed all 110 cases after the final changes. Rust's existing 33 cases passed. ESLint, TypeScript, both nested package builds, production static build, native package build and ad hoc signature verification passed.
- The actual Codex app-server discovered all tools through its local protocol without starting a chat turn. Claude Code reported the temporary server connected. Claude Desktop requires a signed-in profile to finish its connection check; this is explicitly pending in NOE-550, labelled Ask Human. No personal Claude configuration was changed.

## Security boundaries

The registry validates sessions before cached results, hashes semantic operation arguments, limits cached response memory, and reserves opaque operation IDs across renderer restarts. Provably pre-dispatch stale/expired requests can retry with the same intent; unknown outcomes never trigger a second mutation. Read pages and content ranges remain within the existing frame budget.

Literal raster/video imports verify MIME/signature and native metadata. Static SVG uses strict UTF-8/XML validation, bounded reference expansion and the native sanitizer before metadata decoding; active or foreign content, external references, animation, filters and HTML are refused. Uploads recheck upload epoch, editor, essay, revision and readonly state. Partial imports are transient. Explicit remote assets require HTTPS without credentials. Neither path provides server-side URL fetching or arbitrary filesystem access.

## Existing dependency findings

Audit on 2026-11-08: app lockfile 50 findings, sidecar 9, independent MCP adapter 0. No dependency versions changed except package release metadata. Existing Next advisories predominantly affect hosted server routes, server actions, optimization and caches; this app ships a static export in Tauri and exposes no Next HTTP service in production. Development server exposure remains a development concern.

Existing TipTap/prosemirror paste advisories remain relevant to manual editor input. New MCP rich input rejects unknown/prototype attributes and unsafe URL schemes and does not parse HTML, but that does not certify the manual paste path. A coordinated editor dependency upgrade is deferred to avoid an unreviewed change to the established native editor behavior in this capability release.

Sidecar proxy/HTTP/OAuth advisories concern transitive SDK services not enabled by the empty tools/MCP/settings execution profile; no new HTTP listener or OAuth flow was added. The CLI SDK remains pinned pending a separately verified migration. Review these dependency deferrals by 2026-11-15; no claim of a clean whole-application security audit is made.
