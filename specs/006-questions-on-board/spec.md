# Feature Specification: Questions on the Board

**Feature Branch**: `004-stationery-redesign` (one branch for the series 004 to 008)

**Created**: 2026-11-08

**Status**: Draft

**Input**: Implement the approved Paper screens R3.1 elegir fuente, R3.2 agentes trabajando, R3.3 tu propia pregunta, R3.4 animation and R3.5 tooltips, replacing the Interrogar modal. Depends on spec 004.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ask the agents to question me about a source (Priority: P1)

Noe presses Hazme preguntas, finds a source by searching or drops a new one, sees which agents will ask, and presses Preguntar. It is obvious that the agents ask him.

**Why this priority**: «No está claro qué significa interrogar, ¿a quién?», «Y si tienes 50 fuentes? Nada útil eh».

**Independent Test**: Open the panel on an essay with many sources, find one by name, start; compare with R3.1.

**Acceptance Scenarios**:

1. **Given** an academic essay, **When** the panel opens, **Then** Evidencia, Sistemas and Objeciones are on and Práctica is off; on a blog, Evidencia is off and the other three are on. He can toggle any of them.
2. **Given** 50 saved sources, **When** he types part of a name, **Then** the list narrows at once and the recent ones show first.
3. **Given** a file or pasted text dropped on the zone, **When** it is accepted, **Then** it is saved as a source and selected.
4. **Given** an agent, **When** he rests the pointer on its tile, **Then** a tooltip says in one sentence what it asks (R3.5).
5. **Given** no source selected or no agent on, **When** he looks at Preguntar, **Then** it is disabled and says nothing extra.

---

### User Story 2 - Watch the agents work on the board (Priority: P1)

The panel shrinks to a small status. Each active agent shows a short line in its own voice while it thinks, then its questions land one by one as taped notes in free space. His own notes do not move.

**Why this priority**: «La gente debería verlos en acción en el tablero», «podemos hacer mucho aquí para hacerlo entretenido y disruptivo», «¿y qué pasa con mis notas personales?».

**Independent Test**: Run it on a board with existing notes; compare with R3.2 and the R3.4 storyboard.

**Acceptance Scenarios**:

1. **Given** a run in progress, **When** an agent finishes a question, **Then** that note lands on the board without waiting for the others.
2. **Given** existing notes and arrows, **When** new notes land, **Then** none of the existing ones moves, changes or gets covered.
3. **Given** new notes beyond the visible area, **When** they land, **Then** the view moves to show them, and the writer can still move it himself.
4. **Given** an agent thinking, **When** he looks at its area, **Then** a line in its voice changes every few seconds; when it finishes, an icon replaces the line, with no word like «listo».
5. **Given** a run, **When** he presses stop, **Then** remaining agents stop and notes already landed stay.

---

### User Story 3 - Keep what is useful (Priority: P1)

Every new note stays unless he discards it. Hovering a just-landed note offers keep or discard; discarding peels it away.

**Why this priority**: «Mucho texto, poca jerarquía» about the selection footer, and it holds up at any number of questions: «¿Y si tengo 100 preguntas?».

**Independent Test**: Discard one note and keep the others, then close and reopen the essay.

**Acceptance Scenarios**:

1. **Given** landed notes, **When** he discards one, **Then** it peels off per R1.5 and does not return on reopening.
2. **Given** notes he did not touch, **When** the essay reopens, **Then** they are there with their author and kind.
3. **Given** questions landing, **When** the run ends, **Then** the questions and their source are recorded in the essay's history of questions as today.

---

### User Story 4 - Ask something of my own (Priority: P2)

In the same panel he can add his own question about the source, and the answer lands as a note whose bold title is his question.

**Why this priority**: His reply on Interrogar, «Y si tengo 100 preguntas por hacer?», and the approved R3.3.

**Independent Test**: Type a question and run; compare with R3.3.

**Acceptance Scenarios**:

1. **Given** a typed question, **When** he presses Preguntar, **Then** the answer lands as a note titled with his question, alongside any agent questions.
2. **Given** a question the source does not answer, **When** the note lands, **Then** it says so plainly and invents nothing.

### Edge Cases

- An agent fails: its area shows a short line and a retry; the others are unaffected.
- A source too large to send: clear message on the panel, no run started.
- An agent returns malformed text: no note with raw output is created; counts as failed.
- The essay is closed during a run: the run stops, landed notes are saved.
- The writer drags or deletes notes during a run: new notes still find free space and nothing is overwritten.
- Files other than the accepted types: a short message on the drop zone. PDF arrives with spec 008.
- Reduced motion: notes appear in place, with no looping lines and no camera pan.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Hazme preguntas MUST open the panel of R3.1 and the Interrogar modal MUST be removed.
- **FR-002**: Default agents MUST depend on essay type as today (académico without Práctica, blog without Evidencia).
- **FR-003**: The source picker MUST search by name and scale to 1000 sources.
- **FR-004**: Questions MUST land incrementally, as each is complete.
- **FR-005**: New notes MUST never move, alter or overlap existing board content.
- **FR-006**: The view MUST move to reveal new notes only while the writer has not moved it during that run.
- **FR-007**: Each agent's progress MUST be shown per R3.2, with the voice lines of R3.4.
- **FR-008**: A run MUST be stoppable, and stopping MUST end the agents' work.
- **FR-009**: Discard MUST be available on just-landed notes and be undoable.
- **FR-010**: Interrogations MUST continue to be saved with the essay, in the existing format, with only kept questions.
- **FR-011**: Starting from a selection in the text or from an agent MUST keep working, with that text or agent preselected.
- **FR-012**: Own questions MUST be answered only from the selected source.
- **FR-013**: Motion MUST follow R3.4 and R7.3.
- **FR-014**: Surfaces of this spec MUST pass the constitution IV rules.

### Key Entities

- **Question run**: source, active agents, per-agent progress, resulting notes.
- **Note**: existing board note, with source of its question.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The first question lands as soon as the first agent produces one, with no waiting for the rest.
- **SC-002**: In 100% of runs on a board with existing notes, none of them changes position or content.
- **SC-003**: A first-time reader can say who asks whom from the button and the panel alone.
- **SC-004**: Finding one source among 50 takes under 5 seconds.
- **SC-005**: An independent reviewer compares with R3.1 to R3.5, finding no structural difference and scoring at least 4 of 5.
- **SC-006**: Real cases, in the desktop app, on a new test essay: question a real open-access paper on an academic essay with notes on the board; discard one note; stop a run; ask his own question.

## Assumptions

- Agents still produce three questions each.
- The answer to an own question comes from Evidencia, or from the first active agent if Evidencia is off.
- The essay's review and its score are not affected by a question run.
