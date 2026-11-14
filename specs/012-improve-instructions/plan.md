# Implementation Plan: Improve Agent Instructions

## Summary
Reuse the persona-free `extract` path (it already fences the text as untrusted data, has no tools, and returns one JSON object) with a new task `instructions`. The form keeps the original in memory for undo. No new storage.

## Design
1. **Sidecar.** `ExtractTask` gains `"instructions"` (sidecar/src/review-contract.ts). sidecar/src/extract-prompts.ts adds a fixed system prompt: rewrite instructions for a writing assistant agent that reviews and/or asks about an essay; keep the user's intent, scope and language; make it specific (what to look at, what to ignore); plain words; no tools, no output format, no persona theatrics; at most 1,200 characters; answer `{"instrucciones": string}`. The user message carries `{nombre, que_hace, instrucciones}` as JSON between the existing untrusted-data markers.
2. **Rust.** `sage_extract` accepts task `instructions` (src-tauri/src/sidecar.rs).
3. **Renderer.** `extract({ task: "instructions", text })` in src/lib/agents/index.ts; a small `improveInstructions(agent)` in src/lib/agents/improve.ts parses and checks the answer (non-empty, at most 2,000 characters, not identical to the input) and returns the text or throws.
4. **UI.** src/components/settings/AgentForm.tsx: «Mejorar» button per Paper R8.3 (shade background, sparkle icon, 13 px), spinner and locked textarea while working, undo line «Las reescribí más claras.» + «Volver a las tuyas», error line «No pude mejorarlas. Intenta de nuevo.». Cancel on unmount or agent switch with `cancelSidecarRequest`.
5. **Stub.** tests/e2e/setup.ts answers task `instructions` with a deterministic rewrite.

## Must not break
Citation and rubric extraction; custom agent saving; the 2,000 limit; vendor-free UI.

## Verification
- tsc, lint, cargo check, sidecar build, full E2E.
- Real runs on the three SC-001 cases (3 calls), then one spelling review with the improved instructions on the spec 011 planted text (1 call). Independent reviewer grades.
- QA app screenshot of the button and the undo line.

## Execution
One Sonnet agent for sidecar + Rust + renderer client (small, same flow), one for the form UI after it. Opus reviews both diffs.
