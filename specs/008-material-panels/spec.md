# Feature Specification: Rubric, Sources and History Panels

**Feature Branch**: `004-stationery-redesign` (one branch for the series 004 to 008)

**Created**: 2026-11-08

**Status**: Draft

**Input**: Implement the approved Paper screens R6.1 rubric empty, R6.2 rubric ready, R6.3 sources, R6.4 history and R6.6 animation. Noe: «Por qué no tenemos una IA que me ponga todo esto de forma automática, qué aburrido hacer esto manual en 2026». Depends on spec 004.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Rubric from the assignment (Priority: P1)

Noe pastes his professor's assignment or drops its PDF. Criteria and weights appear on their own, ready to adjust.

**Why this priority**: It replaces the most tedious manual step, and rubric criteria drive the score.

**Independent Test**: Paste a real assignment on an essay with no rubric; compare with R6.1, R6.2 and R6.6.

**Acceptance Scenarios**:

1. **Given** an essay with no rubric, **When** he pastes an assignment or drops its PDF, **Then** criteria with names, one-line descriptions and weights appear.
2. **Given** an assignment that states weights or percentages, **When** criteria are extracted, **Then** the weights reflect them; if none are stated, they all start equal.
3. **Given** criteria proposed by the AI, **When** he changes one, **Then** his change stays and is not overwritten.
4. **Given** a rubric already exists, **When** he adds an assignment, **Then** nothing is replaced until he confirms.
5. **Given** he prefers writing them, **When** he chooses to, **Then** he can create criteria by hand.

---

### User Story 2 - Sources that complete themselves (Priority: P1)

He drops a PDF or file, or pastes text. A reading state appears, then the title, authors, year and APA citation fill in. The list is searchable and quiet.

**Why this priority**: «Qué aburrido hacer esto manual», «un cuadro, dentro de otro cuadro», «muchas X no?».

**Independent Test**: Drop a real PDF paper and a text note; compare with R6.3.

**Acceptance Scenarios**:

1. **Given** a real paper in PDF, **When** dropped, **Then** its text is available to the agents and its APA citation is filled in from the document.
2. **Given** missing data such as the year, **When** the citation is built, **Then** it says what is missing and never invents it.
3. **Given** a source row, **When** he hovers it, **Then** he can copy the citation and, from one menu, copy the full reference, open or remove the source.
4. **Given** many sources, **When** he searches, **Then** the list narrows at once.
5. **Given** a PDF with no extractable text, such as a scan, **When** dropped, **Then** a short message says so and nothing broken is saved.

---

### User Story 3 - Go back in time calmly (Priority: P2)

Historial shows versions by time, previews the selected one on the sheet, and restores it with one primary action.

**Why this priority**: Constitution I, and «nada de rayitas a la izquierda».

**Independent Test**: Preview and restore a version; compare with R6.4.

**Acceptance Scenarios**:

1. **Given** versions, **When** he selects one, **Then** the sheet previews it read-only and the selected row is marked by its surface alone.
2. **Given** a preview, **When** he restores, **Then** the current version is saved first and the essay reloads with the restored text, as today.
3. **Given** a version he saved himself, **When** it is listed, **Then** it carries the soft tag.

### Edge Cases

- AI unavailable: pasted or dropped material is still saved, and criteria or citation can be filled by hand; a short message offers retry.
- A very large PDF: accepted up to a stated limit, with a clear message beyond it.
- Duplicate source: offers the existing one instead of adding it twice.
- The assignment contains no recognizable criteria: says so, and offers writing them.
- Removing a source cited by a correction: the correction stays, its source shown as removed.
- Text in a document that tries to give the AI instructions: treated as data only.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Rubric, Fuentes and Historial MUST open as panels from Más, per R6.1 to R6.4, replacing their modals.
- **FR-002**: The app MUST extract criteria and weights from pasted text or a PDF.
- **FR-003**: The app MUST complete APA citations only from the content of the source, and flag what is missing.
- **FR-004**: PDFs MUST be accepted as sources and assignments, with text extracted on the Mac; only what the agents need leaves it, as today.
- **FR-005**: Every AI-filled field MUST remain editable and MUST NOT overwrite a value the writer set.
- **FR-006**: Source material MUST be treated as data, never as instructions.
- **FR-007**: The panels MUST keep the existing data format, so older essays keep working.
- **FR-008**: The source list MUST scale to 1000 sources.
- **FR-009**: AI work MUST use the existing sign-in and no new key.
- **FR-010**: Motion MUST follow R6.6 and R7.3.
- **FR-011**: Surfaces of this spec MUST pass the constitution IV rules, with no word counts, numbering or rows of X buttons.

### Key Entities

- **Criterion**: existing, with name, weight 1 to 5 and description.
- **Source**: existing, gains authors and year when extracted, with reading state.
- **Version**: existing.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From pasting an assignment to a usable rubric takes one action.
- **SC-002**: On 5 public course assignments, at least 90% of criteria stated by the professor are extracted.
- **SC-003**: On 10 open-access papers, 100% of the citation data shown comes from the document, with zero invented fields.
- **SC-004**: An independent reviewer compares with R6.1 to R6.4, finding no structural difference and scoring at least 4 of 5.
- **SC-005**: Real cases, in the desktop app, on test essays and public material: a public course assignment, an open-access paper as PDF, a class note, and restoring a version.

## Assumptions

- AI-filled fields use the same monthly credit as the other agents.
- Word documents and links as sources remain out of scope.
