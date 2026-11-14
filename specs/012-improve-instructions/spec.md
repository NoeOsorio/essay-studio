# Feature Specification: Improve Agent Instructions

**Feature Branch**: `004-stationery-redesign`
**Created**: 2026-11-14
**Status**: Draft
**Input**: Noe: «¿Puedes agregarle un botón de mejorar prompt con AI?» (on the Configurar agentes form, spec 011).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Turn a rough idea into clear instructions (Priority: P1)

In Configurar agentes, Noe writes a rough instruction for his agent («que me revise la ortografia») and presses «Mejorar» next to Instrucciones. The text is replaced by clearer instructions that keep his intent and fit what the agent does (reviews, asks, or both). A line under the field says «Las reescribí más claras.» with «Volver a las tuyas» to restore his text. Nothing is saved until he presses Guardar.

**Why this priority**: It is the whole request.

**Independent Test**: Type «que me revise la ortografia y ya» on a reviewing agent, press Mejorar.

**Acceptance Scenarios**:
1. **Given** non-empty instructions, **When** he presses Mejorar, **Then** the button shows it is working, the field locks, and within about 20 seconds the field shows the rewritten text and the undo line.
2. **Given** the rewritten text, **When** he presses «Volver a las tuyas», **Then** his exact text returns and the undo line disappears.
3. **Given** the rewritten text, **When** he edits it or presses Guardar, **Then** the undo line disappears and the edited or rewritten text is what gets saved.
4. **Given** empty instructions, **Then** Mejorar is disabled.
5. **Given** the engine is down, the session expired, or the answer is unusable, **Then** his text stays untouched and one plain line says «No pude mejorarlas. Intenta de nuevo.».

### Edge Cases
- The rewrite keeps the language he wrote in.
- The rewrite never asks for tools, never changes the output format, and never turns a spelling agent into a content critic: it keeps the same scope, only clearer.
- The rewrite fits the 2,000-character limit; an answer over the limit or empty counts as unusable.
- Changing «Qué hace» after a rewrite keeps the text; he can press Mejorar again.
- Closing the sheet or switching agents while it works cancels the request and leaves his text.

## Requirements *(mandatory)*

### Functional Requirements
- **FR-001**: The custom agent form MUST show «Mejorar» at the right of the Instrucciones label (Paper R8.3), only for custom agents.
- **FR-002**: Mejorar MUST send the agent's name, what it does and the current instructions, and replace the field with the rewritten instructions, keeping the original for undo.
- **FR-003**: The rewrite MUST keep the user's intent and scope, the user's language, and be plain, specific and under 2,000 characters; it MUST be checked before it is shown.
- **FR-004**: «Volver a las tuyas» MUST restore the exact original; the undo line disappears on edit, save, or agent switch.
- **FR-005**: Nothing is persisted until Guardar.
- **FR-006**: The interface MUST NOT name the AI vendor or model.

### Key Entities
- No new stored data. The rewrite lives only in the form until saved.

## Success Criteria *(mandatory)*
- **SC-001**: For three of Noe's style rough instructions (spelling, «que me diga si mis párrafos están muy largos», an asking agent «hazme preguntas sobre mis fuentes»), the rewrite keeps the intent and scope, and an independent reviewer scores usefulness at least 4 of 5.
- **SC-002**: A spelling agent with the improved instructions still finds the five planted mistakes of spec 011 and comments on nothing else.
- **SC-003**: The undo always returns the exact original text.

## Assumptions
- One call per press, same cost class as one review pass.
- The button label is «Mejorar» (the sparkle icon says it is automatic), per Paper R8.3; Noe's «con AI» is implied by the icon and the result line, keeping vendors out of the interface.
- Built-in agents have no form, so no button there.
