# Implementation Plan: New app icon, notes on the board

**Branch**: `009-app-icon` | **Date**: 2026-11-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/009-app-icon/spec.md`

## Summary

Replace every Essay Studio icon with the approved Paper artwork, using the macOS rounded square on
a 1024 canvas so the system stops adding its gray plate. A throwaway test on this Mac already proved
a classic icon file is enough, so no new build path is needed.

## Root cause

`src-tauri/icons/icon.png` is a parchment cut out on a transparent background, not a rounded square.
macOS only draws an old-format icon edge to edge when its art follows the rounded-square shape;
anything else goes inside a gray plate at a reduced size. The shape of the artwork is the cause, so
fixing the artwork removes the plate.

Evidence (`research.md`): macOS's own icon rendering, compared side by side, shows the plate on the
installed app and no plate on the new artwork, at the same size as Spotify.

## Technical Context

**Language/Version**: None new; image assets only

**Primary Dependencies**: Tauri CLI 2.11.1 (`tauri icon`), already in the project

**Storage**: N/A

**Testing**: No unit tests. Verification is the real Dock (see `quickstart.md`)

**Target Platform**: macOS desktop (checked end to end); other generated files refreshed only

**Project Type**: Desktop app

**Performance Goals**: N/A

**Constraints**: Must not change app code or user data

**Scale/Scope**: One artwork, one icon set

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status |
|---|---|
| I. Writer's work never lost | Pass. No app code or essay data is touched. The app is closed normally before the swap, which saves open work. |
| II. Reuse before building | Pass. Uses `tauri icon`; no custom pipeline. |
| III. Boundaries in code | Not affected. |
| IV. Stationery visual system | Pass. Designed and approved in Paper with notes, tape, tilt and dotted board. The icon's note colors are slightly deeper than the app's so they hold up at small sizes; they appear only in the icon. |
| V. Done means Noe can use it | Pass. Noe approves this plan; done is judged in his real Dock by an independent reviewer. |

Post-design re-check: no change.

## What must not break

- Essays, settings and the sidecar: no file outside the icon assets changes.
- The installed app's code: it reports version 0.3.0 while this checkout says 0.2.0, so rebuilding here could silently change what Noe runs. The installed app keeps its current code and only its icon file is swapped.
- The app bundle's validity: the installed app is signed ad hoc and is signed again after the swap.

## Files touched

| Layer | File | Change |
|---|---|---|
| Source artwork | `src-tauri/icons/source/app-icon-1024.png` | New. The Paper export with transparent corners, 824 px rounded body on a 1024 canvas |
| Generated icons | `src-tauri/icons/*` including `icon.icns`, `icon.ico`, PNG sizes, `android/`, `ios/` | Regenerated with `tauri icon` |
| Web content | `src/app/icon.png` (64), `src/app/apple-icon.png` (180) | Regenerated from the same source |
| Installed app | `/Applications/Essay Studio.app/Contents/Resources/icon.icns` | Swapped and signed again, only after Noe's separate yes |

`tauri.conf.json` already points to these names, so it does not change.

Second copy: Noe's Dock shows two icons because the app is also running from
`src-tauri/target/release/bundle/macos/`. That copy gets the same swap so both match.

## Verification

Noe's real Dock, following `quickstart.md`: screenshot beside its neighbors, Finder, the app switcher, the About panel and the tab icon. An independent reviewer scores the real Dock result against SC-002.

## Delivery order

1. Save the source artwork, regenerate the icons in the repo, and check each generated size.
2. With Noe's yes, close both running copies, swap the icon, sign, refresh the system's icon cache and reopen.
3. Verify in the real Dock.

## Execution

Slice 1 is implemented by one Sonnet subagent. Slice 2 changes Noe's installed app, so Opus runs it directly after his yes. Opus reviews the diff and each generated image.

## Bigger option, not proposed now

A layered macOS icon would add system glass and tinted appearances. The test showed it looks the same in the Dock today, so it buys nothing now.

## Project Structure

### Documentation (this feature)

```text
specs/009-app-icon/
├── spec.md
├── plan.md
├── research.md
├── quickstart.md
└── checklists/requirements.md
```

No data model or contracts: the feature has no data and no interfaces.

### Source Code (repository root)

```text
src-tauri/icons/          # generated icons
src-tauri/icons/source/   # approved master artwork
src/app/                  # tab icon and apple icon
```

**Structure Decision**: Assets stay where the project already keeps them; only the master artwork folder is new.
