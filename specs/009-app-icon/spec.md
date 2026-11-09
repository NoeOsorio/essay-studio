# Feature Specification: New app icon, notes on the board

**Feature Branch**: `009-app-icon`

**Created**: 2026-11-08

**Status**: Draft

**Input**: User description: "Replace the Essay Studio macOS app icon with the approved design from Paper: artboard «Notas en el tablero, pulida» on page «Icono de la app» of file 01M6VXNCR0ZBA410S026XSG7JT. The current icon is a transparent parchment PNG that macOS shows inside a gray plate in the Dock and does not fill the space, unlike professional icons next to it. Acceptance bar from what Noe sees: in his real Dock the new icon fills the rounded square at the same visual size as neighbors, with no gray plate; four notes on the dotted board with tape, big yellow note in front; no letters; favicon and every generated size updated; the old parchment no longer appears anywhere in the app or installed bundle. Out of scope: Maiden's icon, any other UI change from spec 003."

## Acceptance bar

What Noe sees in his Dock after installing the app:

- **Must contain**: the approved artwork (four taped notes on the dotted board, a large yellow note in front), filling the rounded square at the same visual size as the icons beside it.
- **Must not contain**: a gray plate around the artwork, letters, the old parchment, or a visible difference between what Paper shows and what the Dock shows beyond the system's own rendering.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The Dock icon looks like it belongs (Priority: P1)

Noe opens Essay Studio and looks at his Dock. The icon fills the same rounded square as Chrome, Spotify and the other apps next to it, and shows the notes on the board instead of a small parchment inside a gray plate.

**Why this priority**: This is the complaint that started the work. Nothing else matters if the Dock still shows the plate.

**Independent Test**: Install the app, open it, and take a screenshot of the real Dock with its neighbors.

**Acceptance Scenarios**:

1. **Given** the installed app with the new icon, **When** Noe opens it, **Then** the Dock shows the approved artwork filling the rounded square with no gray plate.
2. **Given** the Dock with neighboring professional icons, **When** the icons are compared, **Then** the Essay Studio icon has the same visual size as its neighbors.
3. **Given** a Mac that previously showed the parchment, **When** the new version is installed, **Then** the parchment no longer appears in the Dock.

---

### User Story 2 - The same icon everywhere (Priority: P2)

Wherever the system or the app shows Essay Studio's icon (Finder, the app switcher, the About panel, the browser tab during development), Noe sees the new artwork.

**Why this priority**: A leftover parchment in one place makes the change look unfinished, but it does not block daily use.

**Independent Test**: Open each place that shows the icon and compare it with the approved artwork.

**Acceptance Scenarios**:

1. **Given** the installed app, **When** Noe finds it in Finder or switches apps, **Then** the new artwork is shown.
2. **Given** the app's web content, **When** its tab icon is displayed, **Then** the new artwork is shown.

---

### User Story 3 - Still recognizable when small (Priority: P3)

In small places such as list views, Noe can still pick out Essay Studio by its yellow note with colored notes behind it.

**Why this priority**: Small sizes are used less often than the Dock, and the approved design already accepts that fine details disappear there.

**Independent Test**: View the icon at 32 and 16 points beside other icons.

**Acceptance Scenarios**:

1. **Given** the icon at 32 points, **When** it is viewed beside other icons, **Then** the yellow note and the colored notes behind it are distinguishable.

---

### Edge Cases

- The system keeps showing the old icon from its cache after installing: the check is only valid once the cached icon has been refreshed.
- Two copies of the app are visible in the Dock, as in Noe's screenshot: every copy Noe runs must show the new icon, or the older copy must be identified and explained.
- The Mac is set to a dark, tinted or clear icon appearance: the artwork must stay recognizable and must not regain a plate.
- An older supported macOS version opens the app: it shows the same artwork.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST use the approved artwork from Paper as its icon, with no letters or added elements.
- **FR-002**: On Noe's macOS version the icon MUST fill the system's rounded square with no gray plate in the Dock.
- **FR-003**: Every place that shows the app's icon MUST show the new artwork, including the Dock, Finder, the app switcher, the About panel and the web content's tab icon.
- **FR-004**: The old parchment artwork MUST NOT remain in the installed app.
- **FR-005**: Every size the platforms require MUST come from the same approved artwork.
- **FR-006**: Older macOS versions the app supports MUST show the same artwork.
- **FR-007**: The approved master artwork MUST be kept with the project so the icon can be regenerated.
- **FR-008**: Installing the new icon MUST NOT change essays, settings or any other app behavior.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a screenshot of Noe's real Dock, the icon's rounded square matches its neighbors' size within 2 pixels at the Dock's displayed scale, with no plate visible.
- **SC-002**: An independent reviewer scores the real Dock result at 7 or more out of 10 for cozy, belongs to the app, fills the shape, reads small and looks professional.
- **SC-003**: None of the icons in the installed app shows the parchment when each is opened and checked.
- **SC-004**: Noe confirms in his Dock that the icon is right.

## Assumptions

- The approved artwork is the Paper artboard «Notas en el tablero, pulida», and Noe's choice of it on 2026-11-08 is the design approval.
- The icon's note colors are slightly deeper than the app's note colors so they hold up at small sizes; they appear only in the icon.
- Replacing the app in Noe's Applications folder needs his explicit go-ahead, separate from approving this spec.
- Mobile and Windows icon files generated alongside the Mac ones are refreshed for consistency, but only macOS is checked end to end.
- Maiden's icon and every other UI change are out of scope.
