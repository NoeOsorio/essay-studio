# Essay Studio MCP — specification and implementation proposal

Status: approved by Noe; implemented and verified locally. Global registration and installed-app replacement completed following explicit user approval.
Date: 2026-11-07
Repository: /Users/noe/Dev/Tools/essay-studio

## User request

“Crear un MCP para que tú puedas trabajar en él de forma similar a lo que hace Paper.”

Interpretation: an agent works inside the live desktop app. Noe sees text edits and board changes as they happen. Paper is the interaction reference, not a request to reproduce its design features.

## Proposed project constitution

1. Preserve Noe's writing, annotations, sources, rubric and board metadata. Never silently overwrite concurrent work.
2. The live editor and board are authoritative while mounted. MCP commands use native TipTap/tldraw transactions and existing app storage, not a second JSON writer.
3. Edits are visible, undoable and persisted before a tool reports durable success. Save failures are explicit.
4. Local capability only: no public endpoint, arbitrary file access, arbitrary JavaScript, shell execution or credential access.
5. Preserve Pergamino's visual language, strict TypeScript and the existing Claude OAuth sidecar. The MCP does not automatically run paid sage calls.
6. Approve scope before implementation; verify actual desktop use and protocol behavior. No new unit tests. Run existing required checks.

Approval requested for these principles together with this plan. The feature-flow skill names Opus for planning and Sonnet for implementation; neither is available here. Proposed exception: use available Codex agents with an independent reviewer after implementation. Do not claim those models were used.

## Observed architecture and cause of the gap

- `src/lib/storage/index.ts` invokes Rust storage commands; there is no MCP command surface in `src-tauri/src/lib.rs`.
- `src/lib/store.ts` updates the current essay and debounces saves for 800 ms.
- `src/components/editor/EditorPane.tsx` initializes TipTap once and remounts on essay/restoration changes. Replacing a file or store value alone does not reliably update the live editor.
- `src/components/canvas/BoardPane.tsx` owns the tldraw instance and listens to document edits to persist snapshots. It hydrates on mount.
- The board already provides note creation, arrow tools and custom note metadata. Reuse these APIs rather than construct an alternative board model.

Therefore a standalone file-editing MCP would create competing state. The root addition is a narrow live-app command bridge, with a standard MCP adapter outside it.

This is static source evidence, not a reproduced runtime failure. No existing MCP feature exists to reproduce; actual edit/save behavior remains to be exercised before changing it.

## First version: user-visible behavior

1. Discover the app, list essays and open an essay by ID. Report its title, language, mode, save state and a compact board summary.
2. Read document blocks with stable session IDs and revision, read text selection and selected board nodes. Read sources, rubric and existing annotations without changing them.
3. Insert or replace a document range/block, preserving unrelated formatting and annotations. Reject stale revisions, ambiguous text matches and schema-invalid content. Renaming is supported.
4. Read, create, update, move and remove notes; create/remove connections. Use existing tldraw IDs and note metadata. Deletion is scoped to explicitly named nodes; no whole-essay deletion tool.
5. Return a board image using tldraw's export capability. This is a board preview, not a claim to capture native window chrome.
6. Finish a batch by flushing pending saves and reporting changed IDs and revision. Expose the connection/working state in the app with a disconnect control.
7. Organize sticky notes on request: tidy a selection or the whole board into a grid, align/distribute notes, or arrange explicit topic groups into columns. For semantic grouping, the agent reads the notes and submits explicit groups by existing note ID; the layout command does not call another model. Respect actual note dimensions, readable spacing and locked nodes. Keep all text, IDs, authors, kinds, colors and arrow bindings; only change permitted geometry. Reject unknown/duplicate IDs and stale revisions before moving anything. Leave unselected nodes untouched and account for them as obstacles. Include connected arrow geometry in the same native undo transaction where needed. Empty/single-note inputs are safe no-ops. Return moved IDs/group bounds and a preview; the entire arrangement can be undone in one action and survives reopening. This is an MCP capability; a new manual layout toolbar is out of scope.

Suggested tool families: `get_basic_info`, `list_essays`, `open_essay`, `get_document`, `get_selection`, `edit_document`, `get_board`, `get_node`, `create_note`, `update_nodes`, `organize_notes`, `connect_notes`, `delete_nodes`, `get_board_image`, `finish_work`. Exact schemas are defined during approved tasks, before implementation.

Read tools return compact summaries with explicit options for detailed content. Mutation tools require essay ID, expected revision and bounded operation payloads. Return structured errors, never guessed success.

## Explicit exclusions

Remote/cloud access, mobile clients, real-time multi-user collaboration, whole-essay deletion, automatic sage evaluation, new model providers, PDF/Word import and broad visual redesign. Source/rubric mutation and authoring new critique annotations can be a later separately approved extension. Existing annotation reading and preservation are part of this version.

## Proposed architecture

Codex MCP client → Node stdio MCP adapter → authenticated local bridge in Tauri → renderer command registry → native editor/board/store APIs → existing Rust persistence.

- MCP adapter uses the maintained official SDK; stdout is reserved for protocol traffic. Logs go to stderr without essay contents or credentials.
- Prefer an OS-local socket/named pipe with owner-only permissions. Final transport selection follows a small platform feasibility check. If loopback HTTP is necessary, bind only loopback, authenticate every request and reject browser origins; no broad CORS. A material change to exposure returns to Noe.
- The app owns the connection endpoint and session credential, protected by OS access controls. Do not put secrets in chat, command arguments or source control.
- Requests are schema validated, correlated by request ID and tied to app/essay/session identity. Serialize mutations; bound payloads and duration.
- Register/unregister editor and board handles at mount/unmount. If a needed pane is unavailable, return an explicit result or mount it through existing navigation. Do not silently edit stale saved state.
- Check expected revision immediately before applying each transaction. In-flight requests cannot land in a newly selected essay.
- Use native undo transactions; create a safety version before an agent editing batch. Serialize saves and wait for successful persistence. Preserve unsaved user input if an operation or save fails.
- Timeout after dispatch may mean an unknown outcome: report it and reconcile by request ID/revision; do not blindly retry mutations.
- Disconnection invalidates the session; restart requires a new handshake.

## Files expected to change

New `mcp/package.json`, `mcp/package-lock.json`, `mcp/tsconfig.json`, `mcp/src/server.ts`, `mcp/src/client.ts`: independent npm package, MCP protocol and bridge client. New SDK/schema dependencies require approval as part of this plan; exact versions and install scripts must be reviewed before installation.

New `src/lib/mcp/{types,registry,bridge,document,board}.ts`: typed commands, schema checks, revision handling, native adapters and lifecycle. Extract a small shared contract package only if needed; do not duplicate contracts between packages.

`src/components/editor/EditorPane.tsx`, `src/components/canvas/BoardPane.tsx`, `src/lib/store.ts`: register native instances, expose selection, route mutations through existing actions, serialize persistence and update revisions.

`src/components/editor/TitleInput.tsx` only if the current uncontrolled field needs synchronization for MCP renames. `src/app/page.tsx` and a new small connection component: bridge initialization, connection indicator and disconnect control.

New `src-tauri/src/mcp.rs`; `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and capabilities/config only as needed: protected transport, request lifecycle and renderer acknowledgments. Prefer existing dependencies; any new crate must be identified before installation.

`src-tauri/src/storage.rs` / `history.rs` only if required to make persistence acknowledgments and safety snapshots reliable. Avoid changing the existing file format unnecessarily.

Root `package.json` / lockfile only for development/build integration as needed. `README.md`, `AGENTS.md`, `CLAUDE.md`: setup, tool semantics, app-open requirement and verification evidence. Initialize `.specify/` in the repository after approval and transfer the approved constitution/spec/plan. Spec Kit was initialized in an isolated planning directory; repository scaffolding is not yet changed.

## Delivery and verification

Slice 1: MCP handshake and live read context. Launch the actual Tauri app with a disposable data directory, connect a real MCP client, open a test essay and compare document/selection/board results with the screen. App-closed requests must report disconnected.

Slice 2: text operations and persistence. Create a paragraph in a disposable essay, replace only a selected sentence, undo, save and reopen. Confirm unrelated marks, sources and metadata remain. Type a human edit after reading a revision; stale MCP writes must fail without altering it.

Slice 3: board operations and image. Create three notes, connect two, move one, edit text and remove one named note. Observe each operation in the app; verify undo, image preview and reopen persistence.

Slice 3 also verifies Noe's sticky-note organization request: use a cluttered disposable board with notes of different heights, arrows, a locked note and unselected obstacles. Exercise “ordena las notas”, “agrúpalas por tema” and “acomódalas en columnas”. Compare before/after screenshots for readable spacing and no overlaps; verify exact text/metadata preservation, arrow endpoints, locked/unselected positions, one-step undo and save/reopen. Exercise selection-only scope, invalid group IDs, a concurrent edit and an empty board. Prefer native tldraw layout operations where they meet these requirements; add only the missing placement behavior in `src/lib/mcp/board.ts`.

Slice 4: resilience and packaging. Exercise hidden board, essay switch during a request, malformed schema, unauthorized connection, duplicate request, save failure, disconnect and app restart. Confirm requests cannot execute shell/code or read arbitrary paths. Configure the finished adapter in Codex and call it from a chat. A standalone client check does not establish that this chat has loaded new tools; verify tool availability explicitly.

Before touching editor/board interaction, run the existing `npm run test:e2e` baseline as repository rules require. Run typecheck/lint/build and existing relevant E2E checks after the change. Inspect official APIs for installed versions before coding; run dependency audits before release. No new unit tests.

Independent review checks usefulness, concurrency/data preservation, tool security and visible app behavior. Attach screenshots/protocol results and actual save/reopen evidence before claiming completion. First ship target is Noe's Mac; Windows/Linux remain unverified unless real platform runs are available.

## Approval scope

Approve the constitution, local live-app MCP scope, SDK/schema dependencies, connection/disconnect UI and use of available agents instead of unavailable Opus/Sonnet. Installation in the development environment and disposable-data verification are included. Existing personal essays are not test fixtures. No public service or paid model calls are needed.

References: [MCP server development](https://modelcontextprotocol.io/docs/develop/build-server), [official Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=app). Paper tool descriptions available in this session informed the discovery → inspect → edit → preview → finish interaction pattern.
