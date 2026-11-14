# Implementation Plan: Custom Agents

## Summary
The four agents are hard-coded: `Sage` and `Pase` are closed unions in src/lib/storage/types.ts and sidecar/src/review-contract.ts, Rust validates `em|sis|pra|cri` in src-tauri/src/sidecar.rs, and the sidecar loads each persona from prompts/*.md. Custom agents need an open, stored registry beside those four, without making the four editable.

## Design
1. **Storage.** `agents.json` in the app data directory, read and written by two Rust commands (`agents_list`, `agents_save`), atomic write like essays. Never inside an essay.
2. **Identity.** Custom ids are `c_<uuid>`. `identityOf` in src/lib/agent-identity.ts resolves built-ins as today and custom ids from the store; an id it cannot resolve uses the name and color saved on the record. Six extra colors and icons in a fixed set, none equal to the four agents'.
3. **Records.** Findings and board notes made by a custom agent store `agentName` and `agentColor`, so deleting never breaks an essay. Built-in records are unchanged.
4. **Wire.** Review and ask requests may carry `custom: { name, instructions, canPaste }` with `sage: "custom"` and pase `custom:<id>`. Rust validates the shape and a 2,000-character limit. The sidecar builds the system prompt from a fixed base (tú, plain words, only real problems, no invented facts, no memory corrections, the JSON format) plus the user's instructions labelled as the agent's focus; tools stay empty.
5. **Runs.** `startReview` accepts custom passes; findings join the sentence cards and the score; custom passes are outside the coverage rule. `replacementIsGrounded` and case matching apply when canPaste is on. Hazme preguntas lists asking agents as tiles.
6. **UI.** App menu item «Ajustes…» ⌘, opens a sheet: the four agents read-only at the top, custom agents below, Nuevo agente, and an edit form. Exact look from Paper R8.1 (custom agent form) and R8.2 (built-in agent: description, two example corrections drawn like correction cards, when it takes part). The built-in descriptions and examples are fixed copy kept next to the agent identity map in src/lib/agent-identity.ts, never the prompt files.

## Files
Rust: menu.rs (item), new agents.rs (storage), lib.rs, sidecar.rs (validation). Sidecar: review-contract.ts, prompts.ts, runner.ts. Renderer: storage/types.ts, storage/index.ts, store.ts, agent-identity.ts, review/run.ts, review/findings.ts, questions/run.ts, components/review/ReviewPanel.tsx, components/questions/AgentTiles.tsx, new components/settings/*, menu/bridge.ts. E2E stub: agents_list, agents_save, custom requests.

## Slices
0. Paper: Ajustes sheet, list, empty, form, delete confirm. Noe approves.
1. Storage, identity, wire, sidecar (no UI).
2. Ajustes screen.
3. Agents in Revisar ensayo and Hazme preguntas.
4. Verify: E2E, a real review with the spelling agent on a test essay (about 2 calls), independent reviewer, QA build.

## Execution
Sonnet subagents per slice; Slice 1 Rust and sidecar parts run in parallel with Slice 2 once Paper is approved. Opus reviews each diff.

## Must not break
Saved essays and findings; the four agents' prompts and passes; tool fences and the OAuth-only path; spec 010 guards; MCP tools.

## Bigger idea, not here
Editable copies of the four («duplicar y ajustar»), and sharing agents between Macs.
