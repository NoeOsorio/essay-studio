# Feature Specification: Review, Corrections and Score Stamp

**Feature Branch**: `004-stationery-redesign` (one branch for the series 004 to 008)

**Created**: 2026-11-08

**Status**: Draft

**Input**: Implement the approved Paper screens R4.1 Revisar ensayo, R4.2 Correcciones, R4.3 animation, R4.4 resolved open, R5.1 sello, R5.4 criterion detail, R2.2 finding open in the text and R6.5 evidence. Depends on spec 004.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ask for a review without leaving the desk (Priority: P1)

Noe presses Revisar ensayo, picks what to review in a small panel hanging from the button, and presses Revisar. The board and his notes stay exactly as they were.

**Why this priority**: The modal of columns and the red button were his strongest rejections: «parece peligroso», «mucho texto papi».

**Independent Test**: Run a review on a test essay with real text; compare with R4.1 and R4.3.

**Acceptance Scenarios**:

1. **Given** an academic essay, **When** the panel opens, **Then** Coherencia, Estilo, Argumento and Citas APA are offered with their agent's icon; a blog omits Citas APA.
2. **Given** the review is running, **When** he keeps writing or closes the panel, **Then** his text is untouched and the review continues.
3. **Given** the review ends, **When** findings arrive, **Then** they are underlined in the text directly, with no separate apply step, and the stamp appears.

---

### User Story 2 - One reliable place for all corrections (Priority: P1)

The stamp opens Correcciones, one solid panel over the desk with every correction in essay order, narrowable by criterion, with resolved ones collapsed at the bottom.

**Why this priority**: «Esto me gusta, tener todas las correcciones en un solo lugar fiable... lo que ya está resuelto aparece colapsable».

**Independent Test**: Open Correcciones on an essay with findings, narrow by criterion, resolve one; compare with R4.2, R4.4 and R5.4.

**Acceptance Scenarios**:

1. **Given** a reviewed essay, **When** he opens Correcciones, **Then** all open corrections appear in essay order, each with the sentence it refers to.
2. **Given** a correction, **When** he selects it, **Then** the text scrolls to its sentence and marks it.
3. **Given** a citation the app could not locate in the text, **When** he opens Correcciones, **Then** it is still listed and says it could not be found. No correction is ever silently lost.
4. **Given** the panel is open, **When** he looks at the board, **Then** his notes are unchanged and the panel uses no dotted surface.

---

### User Story 3 - Finish a correction (Priority: P1)

Each correction is one card: agent, criterion, importance, explanation, proposed text with Copiar and Usar este texto, its source, and a single Ya lo resolví check that closes the whole card. No aplica removes it.

**Why this priority**: «El check mark es más para toda la card», «pon un botón de copiar», «debería tener un checkbox de Done».

**Independent Test**: Use each action on real findings; close and reopen the essay.

**Acceptance Scenarios**:

1. **Given** a correction, **When** he checks Ya lo resolví, **Then** the card folds into Resueltas, its underline leaves and the stamp updates.
2. **Given** a resolved correction, **When** he unchecks it, **Then** it returns to the open list with its underline, if its sentence still exists.
3. **Given** a correction marked No aplica, **When** he runs the review again, **Then** the same finding does not come back.
4. **Given** proposed text, **When** he presses Usar este texto, **Then** the sentence is replaced, the action can be undone, and the card moves to Resueltas.
5. **Given** a correction opened from an underline in the text, **When** it appears, **Then** it is the same card with the same actions (R2.2).
6. **Given** resolved corrections, **When** the essay is closed and reopened, **Then** they are still in Resueltas.

---

### User Story 4 - The stamp is the score (Priority: P1)

A paper stamp in the top bar shows the score. It opens a report card with each criterion and a way into all corrections. A missing check is an invitation with what he could reach, never a penalty sentence.

**Why this priority**: «Hay que rediseñar totalmente toda la barra», and his choice: «Esta es mi favorita». It gives back the height the bar took from writing.

**Independent Test**: Compare with R5.1; resolve a correction and see the number change.

**Acceptance Scenarios**:

1. **Given** a reviewed essay, **When** the top bar shows the stamp, **Then** the number follows the current scoring rules, and the old bottom bar no longer exists.
2. **Given** an essay never reviewed, **When** it is open, **Then** no stamp appears.
3. **Given** no rubric, **When** the report card opens, **Then** it shows the score and all corrections without empty criterion rows.
4. **Given** a check that was not run, **When** the report card opens, **Then** it offers to run it and states the score he could reach.
5. **Given** the essay text changed since the review, **When** he looks at the stamp, **Then** it shows it is out of date and Volver a revisar is one step away. Resolving a correction alone does not make it out of date.

---

### User Story 5 - Know where a claim comes from (Priority: P2)

The source on a card opens the evidence: each source, and whether it matches, in plain words, with a warning only when something is wrong.

**Why this priority**: «Barras de color arbitrarias», «mucho texto, claramente un AI-slop».

**Independent Test**: Open the evidence of a finding with sources; compare with R6.5.

**Acceptance Scenarios**:

1. **Given** a card with evidence, **When** he opens its source, **Then** each source shows one short phrase and no model or provider name.
2. **Given** a citation that does not match its source, **When** the card is shown, **Then** a warning icon and phrase appear and no check mark.

### Edge Cases

- An agent fails or times out: its corrections are absent, the panel says so in one line, and the check counts as not run, with an offer to retry.
- All agents fail: no stamp changes; the previous review remains.
- Volver a revisar with open corrections: open ones are replaced by the new results, resolved ones and No aplica are kept, with no duplicates.
- The sentence of a resolved correction was edited or deleted: unchecking keeps the card open, without an underline, as not located.
- A replacement spanning paragraphs: Usar este texto explains it cannot be done there; Copiar still works.
- 40 or more corrections: the panel scrolls within the window and narrowing stays reachable.
- A review is running when the essay is closed: results are kept for that essay or discarded with a clear message; never applied to another essay.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Revisar ensayo MUST open the panel of R4.1 and MUST NOT cover or restyle the board beyond the panel itself.
- **FR-002**: Findings MUST apply to the text when the review ends, as non-destructive marks that never change the writer's words.
- **FR-003**: The report card and Correcciones MUST open from the stamp per R5.1, R4.2 and R5.4.
- **FR-004**: Correcciones MUST list every finding of the current review, including those not located in the text.
- **FR-005**: Each finding, everywhere, MUST be rendered by one single component.
- **FR-006**: Resolved and not-applicable states MUST persist with the essay.
- **FR-007**: A not-applicable finding MUST NOT reappear in later reviews of the same sentence.
- **FR-008**: Resolving or dismissing a finding MUST update the score at once and MUST NOT mark the review out of date.
- **FR-009**: Only editing the essay's content, rubric or sources MUST mark the review out of date.
- **FR-010**: Scoring rules MUST NOT change.
- **FR-011**: The bottom score bar and its detail panel MUST be removed.
- **FR-012**: Evidence MUST remain available from the finding after the review is applied.
- **FR-013**: A check mark on a card MUST only mean that card is done.
- **FR-014**: The review MUST be cancelable.
- **FR-015**: Motion MUST follow R4.3 and R7.3.
- **FR-016**: Surfaces of this spec MUST pass the constitution IV rules, with no pass, benchmark or evaluation wording.
- **FR-017**: Existing essays with underlines from earlier reviews MUST keep them and show them in Correcciones as open.
- **FR-018**: The live document tools MUST keep working on annotations and report the new states.

### Key Entities

- **Finding state**: open, resolved or not applicable, kept with the essay, with the original quote and evidence.
- **Review record**: when it ran and what it covered (existing), now independent of finding actions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From an open essay to seeing all corrections takes 2 actions after the review ends.
- **SC-002**: The score uses no writing height: the sheet gains the full height of the old bar.
- **SC-003**: 100% of findings returned by a review appear in Correcciones.
- **SC-004**: Finding states survive closing and reopening in 100% of tries.
- **SC-005**: The same essay's numbers match the existing scoring exam, with no change in any case.
- **SC-006**: An independent reviewer compares with R4.1, R4.2, R4.4, R5.1, R5.4, R2.2 and R6.5 and finds no structural difference, scoring at least 4 of 5.
- **SC-007**: Real cases, in the desktop app, on a new test academic essay, never on Noe's: review it; resolve, reopen and undo a correction; use a proposed text; dismiss one and review again.

## Assumptions

- The stamp's out-of-date and running states, and the error line of the panel, are not drawn in Paper yet; a short Paper step comes first, per constitution IV.
- The reviewer model selector leaves the review flow, per Noe's comment 73.
- The sample 7.3 in the Paper screens is illustrative; the real number follows the scoring rules, so resolving a correction raises it.
- «Limpiar revisión» remains in the native menu.
