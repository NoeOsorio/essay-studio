# Feature Specification: Custom Agents

**Feature Branch**: `004-stationery-redesign` (main after merge)
**Created**: 2026-11-14
**Status**: Draft
**Input**: Noe: «Me gustaría una pantalla de configuración que se abra desde el toolbar de Mac donde podamos configurar a nuestros agentes. No podemos modificar ni cambiar el prompt de los 4 por defecto pero podríamos crear agentes nuevos con nuestras instrucciones. Algo sencillo de modificar y crear. Se me ocurrió porque quería poner un corrector de ortografía, ese no tiene por qué hacerte preguntas, solo revisarte ortografía.»

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create an agent in a minute (Priority: P1)

From the Mac menu bar (Essay Studio, Ajustes, ⌘,) Noe opens Ajustes, sees his agents, presses Nuevo agente, writes a name and plain instructions, chooses whether it reviews his essay, asks him questions, or both, and saves.

**Why this priority**: It is the whole request, and «algo sencillo» is the bar.

**Independent Test**: Create «Ortografía» that only reviews, with the instruction «Revisa solo ortografía, acentos y puntuación. No opines del contenido.»

**Acceptance Scenarios**:
1. **Given** the app open, **When** he chooses Ajustes in the menu or presses ⌘,, **Then** the agents screen opens.
2. **Given** the form, **When** he fills name and instructions and picks «Revisa tu ensayo», **Then** the agent is saved and listed with its color and icon.
3. **Given** an agent he made, **When** he edits or deletes it, **Then** the change is saved; deleting asks once.
4. **Given** the four built-in agents, **When** he looks at them, **Then** he sees a plain description of what each does, two real examples of how it corrects (the marked sentence, its comment and, when it proposes text, that text), and when it takes part; their instructions cannot be edited or deleted and are never shown.

### User Story 2 - The agent works where he expects (Priority: P1)

A reviewing agent appears as one more option in Revisar ensayo, and its findings arrive as cards like the others. An asking agent appears as one more tile in Hazme preguntas. An agent that only reviews never appears in Hazme preguntas.

**Independent Test**: Run Revisar ensayo with «Ortografía» on a test essay with spelling mistakes.

**Acceptance Scenarios**:
1. **Given** «Ortografía» set to review, **When** he opens Revisar ensayo, **Then** it is an option there and not in Hazme preguntas.
2. **Given** a review with it, **When** findings land, **Then** they show as its parts inside the sentence cards, with its name and color.
3. **Given** the agent allows text to paste, **When** a spelling fix is found, **Then** Usar este texto offers the corrected words, under the same guards as Citas APA (same first-letter case, no new names or numbers).
4. **Given** «Entra cada vez que revisas tu ensayo» on, **When** a panel opens, **Then** its option starts on; off, it starts off.

### User Story 3 - Nothing breaks when agents change (Priority: P2)

Deleting or renaming an agent never breaks an essay that has its findings or notes; they keep showing the name and color they had.

**Independent Test**: Review with an agent, delete it, reopen the essay.

### Edge Cases
- Empty name or empty instructions: Guardar stays disabled, no message.
- Two agents with the same name: allowed; color and icon tell them apart.
- Very long instructions: a limit of 2,000 characters, shown only near the limit.
- Many agents: the list has search past 8 agents and stays smooth at 1000 (windowed list).
- Instructions that try to change the output format or ask for tools: the format and the fences stay; the agent only adds its focus.
- The engine is down or the session expired: the same notice as today.

## Requirements *(mandatory)*

### Functional Requirements
- **FR-001**: Ajustes MUST open from the app menu (Ajustes…, ⌘,).
- **FR-002**: The four built-in agents MUST be listed read-only with a lock. Selecting one MUST show its description, two fixed examples of corrections in the same look as a correction card, and when it takes part (Paper R8.2). Their instructions cannot be edited or deleted and are never shown.
- **FR-003**: A custom agent MUST have a name, instructions, what it does (reviews, asks, or both), a color from six swatches different from the four agents' colors, an icon chosen from six by pressing its chip, «Puede proponer texto para pegar» (only when it reviews) and «Entra cada vez que revisas tu ensayo» (whether it starts on).
- **FR-004**: Custom agents MUST be saved in the app, not in an essay, and survive restarts.
- **FR-005**: A reviewing agent MUST appear in Revisar ensayo and its findings MUST use the sentence cards, the score and the guards of spec 010.
- **FR-006**: An asking agent MUST appear in Hazme preguntas and land notes like the others.
- **FR-007**: Findings and notes MUST keep the agent's name and color as they were, so deleted or renamed agents never break an essay.
- **FR-008**: The user's instructions MUST only add focus; the output format, the tú voice, the no-invention rules and the no-tools fences stay fixed.
- **FR-009**: The screen MUST follow Paper and the constitution IV rules.

### Key Entities
- **Custom agent**: id, name, instructions, does (review, ask, both), color, icon, canPaste, defaultOn, createdAt.
- **Finding / note**: gains the agent's name and color as of its creation, for custom agents.

## Success Criteria *(mandatory)*
- **SC-001**: Creating the spelling agent takes under one minute.
- **SC-002**: A real review with it on a test essay with five planted spelling mistakes finds at least four, comments on nothing else, and offers correct text to paste.
- **SC-003**: Deleting it leaves its findings readable in that essay.
- **SC-004**: An independent reviewer scores the screen against Paper at least 4 of 5.

## Assumptions
- Custom review findings count in the score like any other, with their severity; they do not change the coverage rule of the four checks.
- Ajustes is a sheet inside the app window, opened by the menu, not a second window.
- Only Noe uses the app; no sharing or importing of agents.
