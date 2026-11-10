# Feature Specification: Essay Library at Scale

**Feature Branch**: `004-stationery-redesign` (one branch for the series 004 to 008)

**Created**: 2026-11-08

**Status**: Draft

**Input**: Implement the approved Paper screens R1.1 list, R1.2 first use with its animation, R1.3 list with 1000 essays (top and mid-scroll), R1.4 search (results and none) and the growth note. Depends on spec 004; the stamps need spec 005.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pick up where I left off (Priority: P1)

The list opens with the essay he is writing on a big taped sheet, with an excerpt and Seguir escribiendo, and his other recent essays as different papers around it, each with words, reading time and a stamp if reviewed.

**Why this priority**: «¿Qué pasó con el diseño divertido tipo papelería?», «Esto me gusta, podríamos agregar el tiempo aprox de lectura».

**Independent Test**: Open the app with a generated library of a few essays; compare with R1.1.

**Acceptance Scenarios**:

1. **Given** saved essays, **When** the list opens, **Then** the most recently edited one is featured with title, excerpt, type, words and minutes of reading.
2. **Given** a reviewed essay, **When** its card shows, **Then** it carries the same stamp as the top bar with the same number.
3. **Given** a never-reviewed essay, **When** its card shows, **Then** it has no stamp and no «sin revisar» text.
4. **Given** the list, **When** he presses Nuevo ensayo, **Then** he can choose académico or blog from it, and its shortcut is only in the tooltip.

---

### User Story 2 - A first use that shows instead of explains (Priority: P1)

With no essays, a blank sheet types real essay titles by itself while agent notes land around it, and two big clear buttons offer Ensayo académico and Post de blog.

**Why this priority**: «Por qué no poner animaciones de lo que realmente se hace», «Me encanta».

**Independent Test**: Start with no essays; compare with R1.2 and its storyboards.

**Acceptance Scenarios**:

1. **Given** no essays, **When** the list opens, **Then** only the sheet, the animation and the two choices appear, with no counter, eyebrow or explanatory paragraph.
2. **Given** the animation, **When** a cycle ends, **Then** titles delete and retype and notes peel away per R1.5.
3. **Given** reduced motion, **When** the screen shows, **Then** the title and notes are still.
4. **Given** a choice is pressed, **When** the essay opens, **Then** it has that type.

---

### User Story 3 - 1000 essays stay manageable (Priority: P1)

Below the recent cards, every essay sits on one ruled notebook page, one line each, in continuous scroll with month headings. Filters stay at hand, and the sticky month jumps to any month or year.

**Why this priority**: «Siempre piensa si esto nos va a servir para 1000 ensayos, no tenemos paginación, ni es práctico».

**Independent Test**: Load a library of 1000 generated essays and browse; compare with R1.3.

**Acceptance Scenarios**:

1. **Given** 1000 essays, **When** the list opens, **Then** it appears with no noticeable wait and scrolls smoothly from end to end.
2. **Given** more than the growth threshold, **When** the list shows, **Then** recents and the ruled page both appear, and essays shown as cards are not repeated below.
3. **Given** the month heading, **When** he opens it, **Then** he can jump to any month and year that has essays.
4. **Given** a filter by type, review state or order, **When** applied, **Then** the page updates at once and shows everything matching.

---

### User Story 4 - Find any essay (Priority: P1)

The search looks in titles and the essay body, showing results as he types, with the matching words emphasized and a short excerpt when the match is inside the text.

**Why this priority**: At 1000 essays, browsing is not enough.

**Independent Test**: Search for a word that appears only inside a body; compare with R1.4.

**Acceptance Scenarios**:

1. **Given** 1000 essays, **When** he types, **Then** results update as he types.
2. **Given** a match inside the body, **When** the result shows, **Then** a short excerpt with the word emphasized appears.
3. **Given** no matches, **When** the search ends, **Then** the message says so in a few words and offers to remove the filter.
4. **Given** text only in notes or annotations, **When** he searches for it, **Then** the essay does not match, since only the title and the writing are searched.

---

### User Story 5 - The index never lies (Priority: P2)

Whatever is shown in the list matches the essay itself after any change, crash or restore.

**Why this priority**: Constitution I: the work and its state must be reliable.

**Independent Test**: Edit an essay, force-quit and reopen; restore a version; delete one file by hand.

**Acceptance Scenarios**:

1. **Given** an essay edited and saved, **When** he returns to the list, **Then** title, excerpt, words, minutes and stamp are current.
2. **Given** the app was closed abruptly, **When** it reopens, **Then** the list is correct.
3. **Given** a damaged essay file, **When** the list loads, **Then** the others appear and nothing is lost or overwritten.

### Edge Cases

- An essay with no title or no text: shows «Sin título» and no excerpt.
- An essay with a stale review: the stamp shows the same out-of-date state as in the editor.
- Deleting from the list keeps today's confirmation behavior.
- Dates in the future or missing: grouped under the file's last modified month.
- Very long titles: truncated to the line in the ruled page; full in a tooltip.
- First-time upgrade: the index is built once, without blocking the app.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The list MUST follow R1.1 with few essays and R1.3 past the threshold of 11 essays.
- **FR-002**: Reading time MUST be derived from words at 230 words per minute.
- **FR-003**: Every essay MUST be reachable by scrolling, with no pagination.
- **FR-004**: The list MUST open and scroll without perceptible delay at 1000 essays.
- **FR-005**: Listing MUST NOT load the full content of every essay.
- **FR-006**: Search MUST cover titles and essay text only, in the local library, offline.
- **FR-007**: Filters MUST be type, review state and order.
- **FR-008**: The stamp in the list MUST show the same value as the editor, from one computation.
- **FR-009**: The index MUST be derived data: rebuilt from the essay files whenever missing or inconsistent, never the only copy of anything.
- **FR-010**: First use MUST follow R1.2 and its storyboards.
- **FR-011**: Motion MUST follow R1.2, R1.5 and R7.3, and looping MUST exist only on the empty state.
- **FR-012**: Surfaces of this spec MUST pass the constitution IV rules.

### Key Entities

- **Library entry**: derived record per essay with title, type, words, excerpt, score state, dates.
- **Search index**: derived record of title and essay text.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With 1000 essays, the list is usable in under 1 second after opening.
- **SC-002**: With 1000 essays, the first search results appear in under 200 ms after a keystroke.
- **SC-003**: Reaching any essay by name takes under 10 seconds.
- **SC-004**: After a forced quit during saving, list and essays agree in 100% of tries.
- **SC-005**: An independent reviewer compares with R1.1 to R1.4, finding no structural difference and scoring at least 4 of 5.
- **SC-006**: Real cases, in the desktop app, all on generated libraries, never on Noe's essays: open a library of a few essays, continue the latest one, find one by a word from its body, and browse a library of 1000.

## Assumptions

- The threshold of 11 comes from the note beside R1.1.
- Ledger lines say «13 min», per R1.3.
- The excerpt is the opening of the essay's text.
