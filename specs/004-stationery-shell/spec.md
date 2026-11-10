# Feature Specification: Stationery Desk System and App Shell

**Feature Branch**: `004-stationery-redesign` (one branch for the series 004 to 008)

**Created**: 2026-11-08

**Status**: Draft

**Input**: Noe approved the Paper redesign v3 and asked to implement it («es hora de implementar el diseño»). This is the foundation of the series: the visual system, the toolbar, the essay sheet and the board. Visual source of truth: Paper file `01M6VXNCR0ZBA410S026XSG7JT`, artboards R2.1, R2.3, R2.4, R2.5, R2.6, R2.7, R1.5, R7.1, R7.2 and R7.3. It supersedes spec 003.

**Series**: 004 this spec, 005 review and stamp, 006 questions on the board, 007 essay library, 008 sources and rubric filled by AI.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A desk that is calm around the writing (Priority: P1)

Noe opens an essay and sees a white sheet on a warm desk with a dotted board beside it. Only the title, the text and a few clear actions compete for attention.

**Why this priority**: It is the screen he lives in, and every other spec builds on it. His review: «No hay jerarquía visual», «hay que ser muy codos con el espacio».

**Independent Test**: Open an existing essay and compare the screen with R2.1.

**Acceptance Scenarios**:

1. **Given** an open essay, **When** he looks at the top bar, **Then** he sees only: back to Ensayos, a saved icon, the view switch, Hazme preguntas, Revisar ensayo and Más, with no line under the bar, no essay title, no language or type controls and no agent avatars.
2. **Given** an open essay, **When** he looks at the sheet, **Then** the title is the most prominent element and no label, counter or keyboard hint appears around the text.
3. **Given** any control with a keyboard shortcut, **When** he rests the pointer on it, **Then** a tooltip shows its name and shortcut, and the shortcut is not printed on the surface.

---

### User Story 2 - Settings and materials live in one menu (Priority: P1)

Language, essay type, Fuentes, Rúbrica and Historial sit in the Más menu, out of the way until needed.

**Why this priority**: He praised this menu («Excelente») and it pays for the space removed from the top bar.

**Independent Test**: Open Más and reach each item; compare with R2.4.

**Acceptance Scenarios**:

1. **Given** an open essay, **When** he opens Más, **Then** he can change Idioma and Tipo in place and open Fuentes, Rúbrica and Historial.
2. **Given** the native menu bar, **When** he uses any existing item or shortcut, **Then** it still works and its labels use the new names.

---

### User Story 3 - Agents you can recognize (Priority: P1)

The four agents are called Evidencia, Sistemas, Práctica and Objeciones. Each has its own icon and color everywhere it appears, and never looks like a logged-in user.

**Why this priority**: «Estos parecen como usuarios en sesión», «nadie sabe quiénes son los sabios», «Aplicación no se entiende».

**Independent Test**: Open an existing essay with old notes and annotations; every agent appears with the new name, icon and color.

**Acceptance Scenarios**:

1. **Given** an essay saved before this change, **When** it opens, **Then** all its notes, annotations and scores are intact and shown with the new names.
2. **Given** any visible text in the app, **When** it names an agent, **Then** it uses the new plain name and never «El X», initials or the word sabio.
3. **Given** text underlined by an agent, **When** he looks at the underline, **Then** its color is that agent's color and no other.

---

### User Story 4 - Sticky notes that feel like sticky notes (Priority: P1)

Every note on the dotted board has translucent tape, a slight tilt, the author's icon and name, an optional bold title and its text. There are no dates and no counters. Selecting a note shows a small bar to change who wrote it, its type, or delete it.

**Why this priority**: «Mantén el estilo de sticky note con diurex», «no estamos respetando los puntitos», «quita fechas de las tarjetas», «súper poco funcional este menú».

**Independent Test**: Create, title, retype, reassign and delete a note; compare with R2.1 and R2.5.

**Acceptance Scenarios**:

1. **Given** the board, **When** he creates a note, **Then** it lands with tape and tilt, ready to write, with an optional title on top.
2. **Given** a selected note, **When** he uses its bar, **Then** he can choose the author with icon chips, choose the type, or delete, and the bar stays attached to the note.
3. **Given** the board tools, **When** he looks at them, **Then** they are icons only with tooltips, and fit-to-view replaces the zoom percentage.
4. **Given** notes created before this change, **When** the essay opens, **Then** they appear taped and tilted without losing text, author or type.
5. **Given** a note he deletes with the pointer, **When** it leaves, **Then** it peels off per R1.5; deleted from the keyboard, it disappears with no animation.

---

### User Story 5 - An empty board that shows the agents working (Priority: P2)

On a board with no notes, faded agent notes land and change, with one call to Hazme preguntas, and no heading, counter or explanation.

**Why this priority**: «Qué aburrido empty state, mucho texto... la gente debería verlos en acción».

**Independent Test**: Create a new essay and compare with R2.3 and storyboard R2.7.

**Acceptance Scenarios**:

1. **Given** a new essay, **When** the board is empty, **Then** ghost notes loop per R2.7 and Hazme preguntas is offered on the board instead of in the top bar.
2. **Given** the loop is playing, **When** the first real note appears, **Then** the loop stops and does not return while notes exist.
3. **Given** reduced motion is on, **When** the board is empty, **Then** the ghost notes are still and nothing loops.

---

### User Story 6 - Words that respect the reader (Priority: P2)

Every surface this spec touches follows the rules: no middle dot between words, no em-dashes, no uppercase tracked labels, nothing under 12 px, no provider names, tú voice.

**Why this priority**: These are binding constitution rules and Noe's standing orders.

**Independent Test**: Run the checks in the plan's quickstart over the touched files.

**Acceptance Scenarios**:

1. **Given** the app after this spec, **When** the mechanical checks run over the touched files, **Then** they find nothing.

### Edge Cases

- Very long note text or title: the note grows; tape and tilt stay intact and the text never overflows.
- A note with an author id the app no longer knows: shown as the writer's note, text untouched.
- A narrow window, down to the existing 1200 px minimum: the top bar never wraps or clips.
- Board closed: the sheet takes the full width and stays centered.
- Tooltips: the first one waits, neighbors open at once.
- The sidecar is down: the existing banner still appears, in the new style and wording.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST use the palette, type families, scale, radii and shadows of Paper R7.1 on every surface, in place of Pergamino.
- **FR-002**: The top bar MUST match R2.1 exactly as to contents and order, with sections defined by surface and spacing.
- **FR-003**: Más MUST contain Idioma, Tipo, Fuentes, Rúbrica and Historial per R2.4; these MUST NOT appear elsewhere on the editor surface.
- **FR-004**: Every existing action MUST remain reachable, by pointer and by its current shortcut. One exception: Hazme preguntas moves from ⌘I to ⌘⇧P, so italic keeps ⌘I (series.md, Decisions taken).
- **FR-005**: Shortcuts MUST appear only in tooltips and in the native menu.
- **FR-006**: All tooltips MUST share one component and timing per R7.3.
- **FR-007**: Agents MUST be labeled from one single definition of name, icon, note color, ink and dot.
- **FR-008**: Persisted identifiers and saved essays MUST keep working with no migration step.
- **FR-009**: The essay sheet MUST show no eyebrow, counter or shortcut hints; word count remains available on demand.
- **FR-010**: The slash menu MUST match R2.3, keeping every existing block type.
- **FR-011**: Underlines MUST use the author agent's color.
- **FR-012**: The board MUST show the R2.1 dot texture and hide every built-in canvas chrome.
- **FR-013**: All notes MUST show tape, tilt, author icon and name, optional title and text, with no date.
- **FR-014**: The tilt of a note MUST be stable across reopenings of the essay.
- **FR-015**: A selected note MUST show the floating bar of R2.1, replacing the Autor and Tipo panel.
- **FR-016**: The note title MUST be optional, saved with the essay and visible to the live document tools.
- **FR-017**: Board tools MUST be icon-only and contain no zoom percentage.
- **FR-018**: The empty board MUST follow R2.3 and R2.7.
- **FR-019**: Motion MUST follow R2.6, R2.7, R1.5 and R7.3, with no animation on keyboard actions and with reduced motion honored.
- **FR-020**: Touched surfaces MUST pass the copy and legibility rules of constitution IV.
- **FR-021**: Opening Hazme preguntas and Revisar ensayo MUST keep working through the current flows until specs 005 and 006 replace them.

### Key Entities

- **Agent**: identity with stable id, plain name, lens description, icon, note color, ink and dot.
- **Note**: existing board note, gains an optional title and a stable tilt.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Side by side with R2.1, R2.3, R2.4 and R2.5, an independent reviewer finds no difference in structure, order or copy, and scores hierarchy, fun and consistency at least 4 of 5.
- **SC-002**: The top bar holds at most 6 controls and uses no space beyond its single row.
- **SC-003**: 100% of essays saved before the change open with notes, annotations, score and history intact.
- **SC-004**: All existing actions are reachable; none is lost in the move to Más.
- **SC-005**: The mechanical checks find zero violations on touched surfaces.
- **SC-006**: Real cases, run in the desktop app on test essays, never on Noe's: reopen a test essay saved before the change; write and tag a note; change language from Más; create a new essay and watch the empty board.

## Assumptions

- Essay type is chosen at creation and editable in Más; spec 007 draws the creation choice.
- The word count moves to the tooltip of the saved icon.
- The stamp is added by spec 005, so this spec's toolbar leaves its place between Hazme preguntas and Revisar ensayo.
- Overlays replaced by later specs take the new colors and names here, and their layouts and full rule sweep in the spec that replaces them.
- The list screen keeps its layout until spec 007.
