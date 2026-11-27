# Implementation Plan: Your Assistant Writes Corrections Through MCP

## Design
1. **Identity.** New author id `as` (persisted) with pase `asistente`, shown as «Tu asistente» in `src/lib/agent-identity.ts`: ink-neutral chip (fill `#E7E2D6`, ink `#3F3B34`, underline `#8F897C`) and a sparkle icon, no «en» check name (Paper R4.5), so color still means who wrote it. Paper: R4.5 on page «04 Evaluar». DESIGN.md gets the identity.
2. **Tool.** `add_findings` in `shared/mcp.ts` (effect content, surface review): `{essayId, revision, operationId, findings: [{cita, mensaje, severidad, reemplazo?, criterioId?, occurrence?}] (1..100), replaceOwn?: boolean}`. Result: per item `{id, located}` plus rejected items with reasons, and the new revision.
3. **Write path.** `src/lib/reviews/actions.ts` builds `Anotacion`s with `buildAnotacion` (criterion id validated against the rubric), applies `replacementIsGrounded` and `matchFirstLetterCase`, and calls `writeReviewFindings` with pase `asistente`. `writeReviewFindings` gains an append option: without `replaceOwn` it keeps existing open `asistente` findings; with it, it replaces only those. One transaction, so one undo.
4. **Types and filters.** `Sage`/`Pase` accept `as`/`asistente`; `list_annotations` enums include them; score treats `asistente` like a custom pass (counts, outside coverage).
5. **Docs.** `docs/mcp-installation.md` and the tool description explain the flow: read with `get_document`, then `add_findings`.

## Must not break
Agent runs and MCP review jobs; existing findings; undo; the paste guards; revision checks.

## Verification
tsc, lint, cargo check, full E2E; a stub E2E through the MCP bridge; a real run from Claude Code connected to the QA app adding corrections to a test essay, with a screenshot; independent reviewer.

## Execution
One Sonnet agent for tool + write path + types, one for identity/card + docs after Paper approval. Opus reviews.
