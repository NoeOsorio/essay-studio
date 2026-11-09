# Tasks: New app icon, notes on the board

**Input**: Design documents from `/specs/009-app-icon/`

**Prerequisites**: plan.md, spec.md, research.md, quickstart.md

**Tests**: No unit tests (constitution principle V). Each task has an observable check.

## Phase 1: Setup

- [x] T001 Save the approved artwork at `src-tauri/icons/source/app-icon-1024.png`, copied from the transparent master prepared in the session scratchpad (`scratchpad/icon-test/master-a.png`). Check: 1024x1024, pixel (5,5) fully transparent, pixel (512,512) opaque yellow.

## Phase 2: Foundational

- [x] T002 Regenerate the icon set in `src-tauri/icons/` with `npx tauri icon src-tauri/icons/source/app-icon-1024.png`. Check: `icon.icns`, `icon.ico`, every PNG size, `android/` and `ios/` have new timestamps, and `src-tauri/icons/source/app-icon-1024.png` is intact.

## Phase 3: User Story 1, the Dock icon looks like it belongs (Priority: P1)

**Goal**: The Dock shows the new artwork with no gray plate.

**Independent Test**: Screenshot of the real Dock beside its neighbors.

- [x] T003 [US1] Confirm `src-tauri/icons/icon.icns` shows the new artwork by extracting it with `iconutil` in the scratchpad and viewing the 512 px image. Check: notes on the dotted board, no parchment.
- [x] T004 [US1] Quit both running copies normally so open work is saved, confirm both exited, and copy `src-tauri/icons/icon.icns` into `/Applications/Essay Studio.app/Contents/Resources/icon.icns`. Check: file hash matches the repo file.
- [x] T005 [US1] Copy the same file into `src-tauri/target/release/bundle/macos/Essay Studio.app/Contents/Resources/icon.icns`. Check: file hash matches the repo file.
- [x] T006 [US1] Sign both bundles ad hoc, touch them, and register them again with Launch Services so the system refreshes its icon. Check: `codesign --verify` passes on both.
- [x] T007 [US1] Reopen `/Applications/Essay Studio.app` and verify in the real Dock following `specs/009-app-icon/quickstart.md`. Check: no plate, same size as neighbors within 2 pixels (SC-001), and an existing essay opens as before (FR-008).

## Phase 4: User Story 2, the same icon everywhere (Priority: P2)

**Goal**: Every other place shows the new artwork.

**Independent Test**: Open each place and compare it with the approved artwork.

- [x] T008 [P] [US2] Replace `src/app/icon.png` (64x64) with the rounded body of the master, cropped to the rounded square so it fills the tab icon. Check: 64x64, new artwork.
- [x] T009 [P] [US2] Replace `src/app/apple-icon.png` (180x180) with the opaque full-bleed version of the artwork. Check: 180x180, no transparency, new artwork.
- [ ] T010 [US2] Check Finder, Command Tab and the About panel for the installed app. Check: new artwork in each.
- [ ] T011 [US2] Search the generated icons and the installed bundle for the old art by viewing every image file in `src-tauri/icons/`, `src/app/` and the installed `Contents/Resources/`. Check: no parchment (SC-003).

## Phase 5: User Story 3, still recognizable when small (Priority: P3)

**Goal**: The icon can be picked out at small sizes.

**Independent Test**: View the 32 and 16 point icons beside others.

- [x] T012 [US3] View `src-tauri/icons/32x32.png` and the 16 point image from `src-tauri/icons/icon.icns`. Check: yellow note and colored notes behind it are distinguishable at 32.

## Phase 6: Polish

- [ ] T013 Give the real Dock screenshot to an independent reviewer. Check: 7 or more on cozy, belongs to the app, fills the shape, reads small and looks professional (SC-002).
- [x] T014 Update Linear ticket NOE-552 with the evidence and hand it to Noe for his confirmation (SC-004).

## Dependencies

T001 before T002. T002 before T003 to T007. T004 and T005 before T006, T006 before T007. T008 and T009 are independent of the install. T013 needs T007. T014 is last.

## Parallel Opportunities

T008 and T009 touch different files and can run together with T002.

```text
T002 regenerate icons
T008 src/app/icon.png
T009 src/app/apple-icon.png
```

## Implementation Strategy

US1 alone delivers what Noe asked for and is the MVP. Repo tasks T001, T002, T003, T008 and T009 are done by one Sonnet subagent. Install tasks T004 to T007 change Noe's installed app and are run by Opus after his approval, given on 2026-11-08.
