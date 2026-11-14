# Tasks: Improve Agent Instructions

**Input**: spec.md, plan.md in specs/012-improve-instructions. Paper file 01M6VXNCR0ZBA410S026XSG7JT, artboard «R8.3 Ajustes, mejorar instrucciones» (screenshot mejorar.jpg here).
**Tests**: none written. Floor after each phase: `npx tsc --noEmit`, `npm run lint`, `cargo check` in src-tauri, `npm run sidecar:build`.

## Phase 1: Foundational (engine)

- [ ] T001 [P] In sidecar/src/review-contract.ts add `"instructions"` to `ExtractTask` and accept it wherever extract requests are validated. In sidecar/src/extract-prompts.ts add a fixed system prompt for task `instructions` (rewrite a writing-assistant agent's instructions: keep the user's intent, scope and language; specific about what to look at and what to ignore; plain words; no tools, no output format, no persona; at most 1,200 characters; answer only `{"instrucciones": string}`) and make `buildExtractPrompt` label the data «INSTRUCCIONES» for that task. The text arrives as JSON `{nombre, que_hace, instrucciones}`. Done when `npm run sidecar:build` passes and citation/rubric prompts are unchanged.
- [ ] T002 [P] In src-tauri/src/sidecar.rs let `sage_extract` accept task `instructions`. Done when `cargo check` passes.
- [ ] T003 In src/lib/agents/index.ts widen `extract` to task `instructions`; add src/lib/agents/improve.ts with `improveInstructions({ name, does, instructions, requestId? })` that sends `{nombre, que_hace, instrucciones}`, parses `{"instrucciones"}`, and returns the trimmed text only if non-empty, at most 2,000 characters and different from the input, otherwise throws. In tests/e2e/setup.ts make the stub `sage_extract` answer task `instructions` with a deterministic rewrite. Done when `tsc` passes.

## Phase 2: User Story 1, the Mejorar button (P1)

- [ ] T004 [US1] In src/components/settings/AgentForm.tsx add «Mejorar» per Paper R8.3: label row with «Instrucciones» left and the button right (height 28, padding 0 10, radius 8, background shade, 14 px sparkle icon, Geist 13/16 500 ink), shown only for custom agents, disabled while instructions are empty. While working: spinner in place of the icon, textarea read-only, button disabled. On success: replace the instructions, keep the original, show under the textarea «Las reescribí más claras.» (13/16 ink-3) and «Volver a las tuyas» (13/16 500 ink, underlined) which restores the exact original. The line disappears on edit, Guardar or agent switch. On failure: text untouched, one line «No pude mejorarlas. Intenta de nuevo.». Cancel with `cancelSidecarRequest` on unmount or agent switch. Nothing persists until Guardar. Load `anthropic-skills:emil-design-eng` before any motion. Done when in `npm run dev` with the stub the full flow works, screenshot saved.

## Phase 3: Verify

- [ ] T005 Full E2E on a fresh server; real runs on the three SC-001 cases and one spelling review with the improved instructions; independent reviewer grades (minimum 4); QA app screenshot. Done when recorded in specs/012-improve-instructions/verification.md.

## Dependencies
T001 and T002 in parallel; T003 after T001; T004 after T003; T005 last.
