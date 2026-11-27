# Feature Specification: Your Assistant Writes Corrections Through MCP

**Created**: 2026-11-26
**Status**: Draft
**Input**: Noe: «Oye el MCP no acepta las correcciones, el subrayado con anotaciones, etc, debería poder hacerlo.»

## Context
Today an outside assistant connected by MCP (Claude, Codex) can read and edit the essay, create board notes, and apply or discard existing corrections, but it cannot create corrections. The only way to get underlines and correction cards through MCP is `start_review`, which runs the app's own agents. The product direction (Noe, 2026-11-15) is that MCP is the free path: the person's own assistant does the review and writes it into the app; the app's agents are the paid path.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The assistant reviews and the essay shows it (Priority: P1)
Noe asks his assistant «revisa la coherencia de mi ensayo y márcamelo en Essay Studio». The assistant reads the essay, then sends its corrections. Each one appears exactly like an agent's: the words underlined, a card in Correcciones grouped by sentence, with the message, importance, and text to paste when it proposes one. The score counts them.

**Acceptance Scenarios**:
1. **Given** an open essay, **When** the assistant sends three corrections with literal quotes, **Then** three underlines and their cards appear, under the name «Tu asistente», and the stamp updates.
2. **Given** a quote that is not in the essay, **Then** that correction is kept as a card without an underline, like today's agents, and the tool result says it was not located.
3. **Given** a correction with text to paste, **Then** «Usar este texto» works and the usual guards apply (same first-letter case; no names or numbers that are not in the essay or its sources).
4. **Given** the assistant sends more corrections later, **Then** they are added; nothing it sent before is replaced unless it asks to replace its own open corrections.
5. **Given** a rubric, **When** a correction names a criterion id from that rubric, **Then** it counts in that criterion; an unknown id is ignored.

### User Story 2 - The assistant manages what it wrote (Priority: P2)
The assistant can list corrections filtered by author (including its own), and apply, discard or clear them with the existing tools.

### Edge Cases
- The essay changed since the assistant read it: the call is rejected with the current revision, like other content tools.
- More than 100 corrections in one call: rejected; the assistant sends them in parts.
- Empty message or quote: that item is rejected with its reason; the rest go in.
- Undo: one Cmd Z removes the whole batch of a call.

## Requirements *(mandatory)*
- **FR-001**: A new MCP tool lets the assistant add corrections to the open essay: quote, message, importance (alta, media, baja), optional text to paste, optional criterion id, optional occurrence for repeated quotes.
- **FR-002**: Corrections go through the same path as the review panel: records, underlines, sentence cards, score, undo and the paste guards.
- **FR-003**: They appear under one fixed identity, «Tu asistente», with its own color and icon distinct from the four agents and the custom-agent colors.
- **FR-004**: They count in the score like any open correction and stay outside the coverage rule of the four checks.
- **FR-005**: Adding never removes earlier corrections unless the call asks to replace the assistant's own open ones.
- **FR-006**: `list_annotations` can filter by the assistant, and `edit_annotations` works on its corrections.
- **FR-007**: No model call and no cost for the app: this path never starts the app's agents.

## Success Criteria *(mandatory)*
- **SC-001**: From a real MCP client, a review of a test essay with planted problems lands as underlines and cards in the app within 2 seconds of the call.
- **SC-002**: An independent reviewer scores the cards from «Tu asistente» against Paper and DESIGN.md at least 4 of 5.

## Assumptions
- The name is «Tu asistente» (no vendor name, since the assistant may be any client).
- Messages are written by the assistant; the app does not rewrite them.
