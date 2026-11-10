# Feature Specification: Monochrome + Sages Visual System

**Feature Branch**: `003-monochrome-visual-system`

**Created**: 2026-11-07

**Status**: Superseded by specs 004 to 008. Noe rejected palette B on 2026-11-08; kept as a record.

**Input**: User description: "UI redesign of Essay Studio using palette B «monocromo + sabios», chosen
by Noe on 2026-11-07. The full critique with rubric, recommendations and proposals per screen is in
the Paper file 01M6VXNCR0ZBA410S026XSG7JT, critique artboards C.0 to C.7. Improvements must give
better UX, better legibility, professional color handling, be genuinely useful, and remove AI slop."

## Context

The critique measured the current interface (Pergamino) against the shipped code:

- Secondary text ink-3 is 4.22:1 and ink-4 is 2.36:1 on the paper background; WCAG AA needs 4.5:1.
- 85 text styles across 20 components are below 12 px (9 to 11.5 px), mostly metadata.
- The Práctico color and the primary red seal are 1.11:1 apart: the same red to the eye.
- Sage colors carry other meanings: the "stale" warning uses the Empirista amber, and finding
  severity uses seal, Empirista amber and Sistémico teal.
- 33 decorative uppercase labels, 14 visible em-dashes, a serif used for UI chrome, English
  strings ("stale", "done", "just now") and two voices (tú and vos) in Spanish copy.

This feature fixes those at their source, the shared visual system, and applies it to every
existing screen without changing layouts or flows. Structural redesigns proposed in the critique
(list with status, regrouped top bar, side panels, Settings window) are separate later features.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Color tells who is speaking, and only that (Priority: P1)

Noe opens an evaluated essay. Each underline, note and avatar shows its sage in one distinct
color. Nothing else in the interface uses those four colors, so a colored mark always means "this
sage said this".

**Why this priority**: color collisions are the most damaging finding; they make the annotation
system, the core of the app, ambiguous.

**Independent Test**: open an essay with findings from all four sages and the board with notes
from all four; check that the four sage colors are distinct, and that severity, stale and primary
actions use no sage color.

**Acceptance Scenarios**:

1. **Given** an essay with Práctico and Crítico findings, **When** Noe looks at the underlines,
   **Then** the Práctico mark is visibly distinct from every other color on screen, including
   primary buttons and error text.
2. **Given** a finding of low severity, **When** it is shown in Evaluar, in the popover or in the
   criterion detail, **Then** its severity reads as a text label with weight, with no sage color.
3. **Given** an essay edited after evaluation, **When** the score bar shows it, **Then** it reads
   "Desactualizado" in neutral text with a visual cue that is not a sage color.

---

### User Story 2 - Everything can be read without effort (Priority: P1)

Every label, metadata line, chip, counter and note header can be read at normal distance on the
1440 × 900 window.

**Why this priority**: illegible metadata is the most widespread finding (20 components).

**Independent Test**: inspect every screen and overlay; no visible text is under 12 px and every
text color passes 4.5:1 against its background.

**Acceptance Scenarios**:

1. **Given** any screen or overlay, **When** its text is measured, **Then** nothing is below
   12 px and every text/background pair is at least 4.5:1 (disabled controls excepted).
2. **Given** a board note, **When** Noe reads its header, **Then** author and type read in plain
   sentence case, for example "Empirista, pregunta", at 12 px or more.

---

### User Story 3 - A calm, professional interface around the writing (Priority: P2)

The UI chrome uses one sans family on a neutral background with ink-colored primary actions. The
serif appears only in the essay itself (title and body). Decorative elements that carry no
information are gone.

**Why this priority**: it removes the "AI default" look and lets the essay be the focus.

**Independent Test**: walk all screens and count serif usage outside the essay, decorative
uppercase labels, decorative dots and tape graphics.

**Acceptance Scenarios**:

1. **Given** any modal title, card title or button, **When** inspected, **Then** it uses the UI
   sans family, not the serif.
2. **Given** the board, **When** notes are shown, **Then** they have no tape graphic and keep the
   sage tint as their only color.
3. **Given** any screen, **When** labels above blocks are inspected, **Then** no decorative
   uppercase tracked labels remain; any needed label is sentence case.

---

### User Story 4 - Copy speaks plainly, in one voice (Priority: P2)

All visible strings are Spanish, in the tú voice, without em-dashes, internal jargon or poetic
filler.

**Why this priority**: copy is part of legibility and trust; mixed voice and English strings read
as unfinished.

**Independent Test**: search every user-visible string for em-dashes, English words, vos forms and
the decorative phrases listed in the critique.

**Acceptance Scenarios**:

1. **Given** the Interrogar panes, **When** a sage finishes, **Then** the status reads in Spanish
   (for example "Listo") and shows no dollar cost.
2. **Given** a note created now, **When** its time is shown, **Then** it reads in Spanish.
3. **Given** the History panel and the sidecar banner, **When** their text is read, **Then** they
   use tú, like the rest of the app.
4. **Given** any modal header or tooltip, **When** read, **Then** it contains no em-dash.

### Edge Cases

- Essays saved before this change keep their annotations, notes and board, and render with the
  new colors without migration.
- Board notes created with the old tints or without metadata render with the new tints.
- An annotation from a sage whose color changed (Práctico) still underlines in its new color.
- The sidecar-down and MCP failure states remain visible and legible.
- Disabled controls may fall below 4.5:1, but only when they are clearly disabled.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The interface MUST use the palette B values from the constitution (principle IV) as
  its only source of color.
- **FR-002**: The four sage colors MUST be used only to identify a sage: avatars, annotation
  underlines, note tints, sage names and sage pass chips.
- **FR-003**: Finding severity (alta, media, baja) MUST be shown as a text label with distinct
  weight and no sage or decorative color dot.
- **FR-004**: The stale or outdated state MUST read "Desactualizado" and MUST NOT use a sage color.
- **FR-005**: Red MUST be used only for system errors and destructive confirmations.
- **FR-006**: Primary actions MUST use the ink color. At most one primary action may be visible per
  surface.
- **FR-007**: No visible text may be smaller than 12 px. All text MUST meet 4.5:1 contrast against
  its background, except clearly disabled controls.
- **FR-008**: The serif typeface MUST appear only on text that belongs to the essay or the writer's
  content: the essay title and body in the editor, essay titles in the list, the history preview,
  quoted essay text (citations and replacements in findings) and board note bodies. All other UI
  MUST use one sans family.
- **FR-009**: Decorative uppercase tracked labels MUST be removed or rewritten as sentence case.
- **FR-010**: Board notes MUST drop the tape graphic and render straight, keeping the sage tint and
  a readable header.
- **FR-011**: All user-visible strings MUST be Spanish in the tú voice, with no em-dashes and no
  English words (including "stale", "done", "just now").
- **FR-012**: Cost figures in dollars MUST NOT appear in the UI.
- **FR-013**: Score numbers in the score bar and criterion detail MUST use neutral ink; the visual
  emphasis of a weak criterion MUST come from weight or position, not from a sage color.
- **FR-014**: Existing essays, annotations, notes, rubric, sources and history MUST render
  correctly without any data migration.
- **FR-015**: Layouts, flows, keyboard shortcuts and menu structure MUST stay as they are.
- **FR-016**: The UI MUST NOT name the vendors, models or tools it is built with (no "Claude Code",
  model identifiers, "Node.js", "Homebrew", "MCP") in labels, notices or errors. It says what
  happens and what to do in plain terms; technical detail goes to logs and the README. The only
  exception is the reviewer-model selector in Evaluar, where the user chooses among models.
  (Global rule from Noe, 2026-11-07.)

### Key Entities

- **Sage identity**: one of four sages (Empirista, Sistémico, Práctico, Crítico), each with one
  color, used everywhere that sage appears.
- **Visual tokens**: the shared named colors, type sizes and families every screen draws from.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero visible text styles below 12 px across all screens and overlays (down from 85).
- **SC-002**: 100% of text/background pairs meet 4.5:1, disabled controls excepted.
- **SC-003**: Every pair of sage colors, and every sage color against the primary action and error
  color, is clearly distinguishable by hue in a side-by-side screenshot reviewed by an independent
  reviewer.
- **SC-004**: Zero visible em-dashes, zero English words and zero vos forms in UI strings (down from
  14 em-dashes and several English and vos strings).
- **SC-005**: Zero uses of a sage color for severity, staleness or primary actions.
- **SC-006**: Noe's existing essays open with all marks, notes and scores intact and readable.
- **SC-007**: Independent reviewers score each screen at least 4 of 5 on Legibilidad, Color and
  Sin slop, using the rubric on Paper artboard C.0.
- **SC-008**: Zero vendor, model or tool names visible outside the reviewer-model selector (today:
  "Claude Code" in the sidecar banner, model identifiers in Evaluar panes and evidence details,
  "Node.js"/"Homebrew" in setup errors, "MCP" in the connection strip).

## Real Cases (end-to-end checks)

1. Open "Seguridad psicológica y aprendizaje en equipos remotos" (académico, evaluated with 5
   findings across SI, EM and CR): underlines are distinct per sage; the score bar reads in neutral
   ink; nothing is below 12 px.
2. Run Evaluar with all four passes on the same essay: severity reads as text; cards show no dollar
   cost; the modal title has no em-dash and is in sans.
3. Run Interrogar in council mode with EM, SI and CR: panes show Spanish status; saved questions land
   on the board as straight notes with readable headers.
4. Edit the essay after evaluating: the score bar reads "Desactualizado" without amber.
5. Open History, Rúbrica and Fuentes: no text below 12 px, tú voice, sans titles.

## Assumptions

- The window stays at 1440 × 900 with a 1200 × 760 minimum; responsive work is out of scope.
- Dark mode is out of scope for this feature; tokens are named so a dark theme can be added later.
- The sans family is the one already loaded (Inter) unless the plan finds a strong reason to change.
- Structural redesigns from the critique (list with status, regrouped top bar, side panels, settings
  window, Interrogar single column, score bar as text) are separate later features.
- Existing end-to-end tests that assert on changed copy are updated to the new strings; no new
  unit tests are written.
