# Tasks: Custom Agents

**Input**: spec.md, plan.md in specs/011-custom-agents. Paper file 01M6VXNCR0ZBA410S026XSG7JT, page «10 Ajustes, agentes»: R8.1 (custom agent form), R8.2 (built-in agent view).
**Tests**: none written (Noe's rule). Each task ends with an observable done-check. Floor after every phase: `npx tsc --noEmit`, `npm run lint`, `cargo check` in src-tauri, `npm run sidecar:build`.

## Shared decisions (every task follows these)

- Built-in ids stay `em | sis | pra | cri` and passes stay `coherencia | estilo | argumento | apa`. Renderer types widen to `Sage = BuiltinSage | CustomAgentId` with `CustomAgentId = \`c_${string}\`` and `Pase = BuiltinPase | \`custom:${string}\``. `ALL_SAGES` and `ALL_PASES` keep only the four built-ins.
- Custom agent record: `{ id: CustomAgentId, name: string, instructions: string, does: "review" | "ask" | "both", color: AgentColorKey, icon: AgentIconKey, canPaste: boolean, defaultOn: boolean, createdAt: string }`. `name` 1 to 40 characters after trim, `instructions` 1 to 2,000 characters after trim. `canPaste` is ignored when `does` is `"ask"`.
- Six colors, none equal to the four agents': rosa `#FFC9D6`/ink `#8A2846`, durazno `#FFD3B5`/`#8A3D12`, lima `#DDEFB0`/`#4A5E12`, cielo `#C3E8F5`/`#11536B`, arena `#EADFC8`/`#5E4A22`, gris `#E2E2DE`/`#45453F`. Six icons: spelling (A with check), pen, book, quote, list, spark. Check ink on fill is WCAG AA.
- Findings and notes made by a custom agent store `agentName` and `agentColor` (the color key) at creation. Built-in records are unchanged.
- Wire: review and ask requests may carry `custom: { name, instructions, canPaste }` with `sage: "custom"`; critique uses pase `custom:<id>`. The sidecar never reads a prompt file for `custom`.
- UI copy in Spanish, tú voice, no middle dot, no counters, text at least 12 px, shortcuts only in tooltips and the native menu.

## Phase 1: Setup

- [x] T001 Read the Paper artboards R8.1 and R8.2 with `get_jsx` and save their exact values (sizes, paddings, radii, shadows, colors, copy) to specs/011-custom-agents/paper-values.md. Done when the file lists every element of both artboards.

## Phase 2: Foundational (storage, identity, wire)

- [x] T002 [P] Add src-tauri/src/agents.rs with `agents_list` and `agents_save` commands: one `agents.json` in the app data dir (respects `ESSAY_STUDIO_DATA_DIR` like storage.rs), atomic write (tmp then rename), validates each record (id matches `c_` plus uuid, name 1..=40 chars, instructions 1..=2000 chars, does in review/ask/both, color and icon in the fixed sets), rejects the whole save on any invalid record. Missing file returns `[]`. Register in src-tauri/src/lib.rs. Done when `cargo check` passes; the round trip is seen through the stub in T012 and for real in T019.
- [x] T003 [P] In src-tauri/src/sidecar.rs accept `sage == "custom"` in `sage_critique`, `sage_interrogate` and `sage_ask` only together with a `custom: { name, instructions, canPaste }` argument; validate name 1..=40 and instructions 1..=2000 characters; in `sage_critique` accept pase `custom:<id>` only when sage is `custom`; forward `custom` in the request JSON. Built-in paths unchanged. Done when `cargo check` passes and the four built-in matches are untouched.
- [x] T004 [P] In sidecar/src/review-contract.ts widen the request types: `sage: Sage | "custom"`, `pase: Pase | \`custom:${string}\``, optional `custom?: { name: string; instructions: string; canPaste: boolean }`, required when sage is `custom`. In sidecar/src/prompts.ts add `customSystemPrompt(custom)` that returns a fixed base (tú voice, plain words, only real problems, never invent facts or numbers, never correct a cited fact from memory, mensaje under 30 words, the JSON-lines format) followed by «Tu foco:» and the user's instructions as data; for critique with a custom pase use that base task text and allow `reemplazo` only when `canPaste` is true. In sidecar/src/runner.ts use `customSystemPrompt` instead of `loadSagePrompt` when `req.sage === "custom"`; tools, settings and the OAuth gate unchanged. Done when `npm run sidecar:build` passes.
- [x] T005 Widen renderer types in src/lib/storage/types.ts (`BuiltinSage`, `CustomAgentId`, `Sage`, `BuiltinPase`, `Pase`, `CustomAgent`, optional `agentName`/`agentColor` on finding records and note meta) and add `listAgents()` / `saveAgents()` wrappers in src/lib/storage/index.ts. Fix every type error this causes across src without changing behavior for built-ins. The MCP surface (shared/mcp.ts, src/lib/mcp/registry.ts) keeps its pass enums to the four built-ins (Record<Pase, X> maps over built-ins become Record<BuiltinPase, X> where they only ever hold built-ins). Done when `npx tsc --noEmit` passes.
- [x] T006 In src/lib/agent-identity.ts: add the six colors and six icons above, `identityOf(id, record?)` that resolves built-ins as today, custom ids from the loaded agents in the store, and unknown custom ids from `record.agentName`/`agentColor`, falling back to «Agente» in gris. Add fixed copy for the four built-ins: one description sentence, two examples `{ sentence, marked, comment, replacement? }`, and «Cuándo entra», taken from Paper R8.2 for Evidencia and written in the same plain tú voice for Sistemas, Práctica and Objeciones from what their passes really do (prompts/*.md and PASE_INSTR in sidecar/src/prompts.ts), never quoting the prompts. Done when `tsc` passes and grep finds no other label or color map for agents in src.
- [x] T007 In src/lib/store.ts add `agents: CustomAgent[]`, `loadAgents()`, `saveAgent(agent)`, `deleteAgent(id)` (each persists through T005 wrappers), and `settingsOpen` with `openSettings()`/`closeSettings()`. Load agents at boot next to the essay list. Done when `tsc` passes.
- [x] T008 [P] In src-tauri/src/menu.rs add «Ajustes…» with accelerator `CmdOrCtrl+,` in the app submenu emitting `app:settings`, and handle it in src/lib/menu/bridge.ts by calling `openSettings()`. Done when `cargo check` and `tsc` pass.
- [x] T009 In src/lib/agents/index.ts let `critique`, `interrogate` and `ask` accept a `custom` agent and send `sage: "custom"`, `pase: \`custom:${id}\`` and the `custom` payload. Done when `tsc` passes.

## Phase 3: User Story 1, create an agent (P1)

Goal: Ajustes opens from the menu and he can create, edit and delete agents and read the four built-ins. Independent test: create «Ortografía» in under a minute, restart, it is still there.

- [x] T010 [US1] Create src/components/settings/SettingsSheet.tsx: the sheet over the dimmed app exactly as Paper R8.1 (920x660, radius 16, the sheet shadow, list column 300 px on paper, detail on white), closes with Esc, click outside and after Guardar; entry motion per the constitution (ease-out cubic-bezier(0.23,1,0.32,1), under 320 ms, from scale 0.97 with opacity, none when opened from the keyboard shortcut, reduced motion respected; load `anthropic-skills:emil-design-eng` before writing the motion). Mount it in src/app/page.tsx for both the library and the editor. Done when ⌘, in `npm run dev` with the E2E stub opens and Esc closes it.
- [x] T011 [US1] Create src/components/settings/AgentList.tsx: the four built-ins with lock icons, «Tuyos» with the custom agents and «Nuevo agente», selected row on shade, search field above the list only when there are more than 8 custom agents; «Tuyos» renders through src/components/ui/WindowedList.tsx so 1000 agents scroll smoothly. Done when the list matches Paper R8.1 side by side.
- [x] T012 [US1] Create src/components/settings/AgentForm.tsx per R8.1: chip button (tooltip «Cambiar icono») that opens the six icons, name field, «Qué hace» segmented control (Revisa tu ensayo, Te hace preguntas, Las dos), instructions textarea with the 2,000 limit shown only past 1,800 characters, toggles «Puede proponer texto para pegar» (hidden when it only asks) and «Entra cada vez que revisas tu ensayo» (stored as `defaultOn`), six color swatches, «Borrar agente» with one confirmation in place, dark «Guardar» disabled while name or instructions are empty. Nuevo agente opens an empty form with the next unused color. Add `agents_list`/`agents_save` to the E2E stub in tests/e2e/setup.ts so the screen works in the browser. Done when he can create, edit and delete in `npm run dev`.
- [x] T013 [US1] Create src/components/settings/BuiltinAgentView.tsx per R8.2: chip and name, description, «Así te corrige» with the two examples drawn like correction cards (Newsreader sentence with the marked words underlined in the agent dot color, comment in Geist, replacement chip when present), «Cuándo entra». No edit controls, never the prompt. Done when Evidencia matches R8.2 and the other three render their own copy.

## Phase 4: User Story 2, the agent works where he expects (P1)

Goal: a reviewing agent is an option in Revisar ensayo and its findings join the cards and the score; an asking agent is a tile in Hazme preguntas. Independent test: review a test essay with «Ortografía».

- [x] T014 [US2] In src/lib/review/run.ts let `startReview` take custom review agents: one pass `custom:<id>` per agent, run in parallel with the built-ins, findings stored with `sage: <id>`, `agentName`, `agentColor`; `defaultReviewPases()` adds agents with `defaultOn`. Custom passes never count toward the coverage rule; their findings count in the score with their severity. Replacements from a custom pass are kept only when `canPaste` is on, and then pass `replacementIsGrounded` and `matchFirstLetterCase` like Citas APA. Done when `tsc` passes and a stub review with a custom agent writes its findings.
- [x] T015 [US2] In src/components/review/ReviewPanel.tsx list custom agents that review as extra options after the four checks, with their chip, starting on per `defaultOn`. In src/lib/review/findings.ts and the card components, resolve name and color through `identityOf(id, record)`. Done when a sentence card shows an Ortografía part in its color.
- [x] T016 [P] [US2] In src/lib/questions/run.ts and src/components/questions/AgentTiles.tsx (and AgentRunChips.tsx where it lists agents) add custom agents whose `does` is ask or both as tiles; notes they land carry `agentName`/`agentColor` in meta and render through `identityOf`. Agents that only review never appear. Done when a stub run with a custom asking agent lands notes with its color.

## Phase 5: User Story 3, nothing breaks (P2)

- [x] T017 [US3] Make every place that draws an agent (cards, popover, stamp popover, notes, note bar, library rows) resolve through `identityOf(id, record)` so a deleted or renamed agent still shows its saved name and color. Done when, in the stub, deleting the agent after a review leaves its parts readable after reopening the essay.

## Phase 6: Verify (polish and evidence)

- [x] T018 Run the existing E2E suite on a free port with `reuseExistingServer: false` (scratch pw.config.ts, port 3197) and fix regressions, including the MCP review job specs. Done when the suite is green.
- [x] T019 Real run, test data only (`ESSAY_STUDIO_DATA_DIR` in scratch): build the QA bundle, create «Ortografía» and time it (under one minute, SC-001), review a test essay with five planted spelling mistakes (about 2 model calls). Done when at least four are found, nothing else is commented, and the pasted text is correct; screenshots saved.
- [x] T020 Independent reviewer subagent scores the Ajustes screens against Paper R8.1 and R8.2 (minimum 4 of 5) and the spelling findings for usefulness (minimum 4). Grep the touched files for the middle dot, text under 12 px and vendor names. Done when scores and greps are recorded in specs/011-custom-agents/verification.md.

## Dependencies

T001 before T010 to T013. T002, T003, T004, T008 run in parallel (disjoint files). T005 before T006, T007, T009. Phase 3 needs T005 to T008; Phase 4 needs T009 and Phase 3's store. T016 runs in parallel with T014 and T015. Phase 6 last.

## Execution

Sonnet subagents: one for T002+T003+T008 (Rust), one for T004 (sidecar), one for T005 to T007+T009 (renderer core), then one for Phase 3, one for T014+T015, one for T016, one for T017. Opus reviews every diff and runs the floor checks.
