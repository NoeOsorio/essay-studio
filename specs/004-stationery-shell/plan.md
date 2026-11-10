# Implementation Plan: Stationery Desk System and App Shell

**Branch**: `004-stationery-redesign` (one branch for the series 004 to 008, see [series.md](./series.md); this plan creates no branch) | **Date**: 2026-11-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-stationery-shell/spec.md`. Visual truth: Paper file `01M6VXNCR0ZBA410S026XSG7JT`, artboards R2.1, R2.3, R2.4, R2.5, R2.6, R2.7, R1.5, R7.1, R7.2, R7.3.

## Summary

Replace the Pergamino shell with the approved Stationery Desk: new tokens and fonts, a six-control toolbar with a real Más panel, a white sheet beside a dotted board, one agent identity module replacing every duplicated label map, taped and tilted notes with an optional title, a floating note bar, an animated empty board, and the motion rules of R7.3. Persisted ids and the board snapshot format do not change.

**Root cause.** The screen is built from pieces that each carry their own copy of the design: agent identity lives in ten hand-written maps, controls and metadata all sit in one bar because there was no second surface to hold them, and the note is a CSS skin over a tldraw shape whose measured geometry (200 px, tldraw font, no header) disagrees with what is drawn, so its tape is clipped, long notes overflow and tilt exists only on notes the agents created. Restyling on top would keep all three problems. This plan attacks them directly: one identity module, one anchored panel primitive that gives settings a home, and a note util whose geometry, render and export share a single measurement.

**Smallest root fix.** Remap existing Tailwind token names so unreplaced overlays stay legible with no edits; rewrite only the shell, the note util and the board chrome. No new persisted state except the optional `meta.title`. Everything else is derived at render (tilt, height, empty board).

**Separate short proposals, not in this plan.** (a) The dot texture is static like today; panning it with the camera is about 10 lines but is not asked for. (b) Renaming token names (`em`, `seal`) to semantic names once 005 to 008 have replaced the overlays that use them. (c) Disabling native menu items when no essay is open.

## Technical Context

**Language/Version**: TypeScript 5 strict, Rust stable, CSS (Tailwind 4 `@theme`)

**Primary Dependencies**: Tauri 2.11, Next 16.2.6 static export, React 19, TipTap 3, tldraw 5.0.0. No new packages. Geist and Geist Mono come from `next/font/google` (exports verified in `next/dist/compiled/@next/font/dist/google/index.d.ts`).

**Storage**: Existing JSON per essay. Board stays an opaque tldraw snapshot in `essay.board`; Rust needs no storage change.

**Testing**: No new unit tests. Existing Playwright specs get selector and assertion updates only (listed below). Verification is the running desktop app per `quickstart.md`.

**Target Platform**: macOS desktop (Tauri, WKWebView), minimum window 1200×760.

**Project Type**: Desktop app with a local MCP surface.

**Performance Goals**: 60 fps on motion (transform, opacity, clip-path only); note measurement runs once per record change through tldraw's geometry cache.

**Constraints**: CSS transitions and keyframes only; `prefers-reduced-motion` honored; no text under 12 px on touched surfaces; WCAG AA.

**Scale/Scope**: Boards of hundreds of notes; every Paper list here is fixed-length (Más, slash menu, bar).

## Constitution Check (pre-design)

| Principle | Gate | Status |
|---|---|---|
| I. Work never lost | No migration; no write on open; title edits undoable and autosaved | Pass, see Invariants |
| II. Reuse | Note util still extends `NoteShapeUtil`; native creation, drag and inline edit kept; no parallel shape | Pass |
| III. Boundaries in code | MCP schema stays fail-closed; `title` added to the same registry | Pass |
| IV. Stationery Desk | Paper first: states Paper does not draw go to Slice 0 | Pass with Slice 0 |
| V. Done means usable | Approval before code; real app verification; independent grading | Pass |

## Root-level decisions (details in [research.md](./research.md))

1. **Tokens**: existing `@theme` names are repointed; `seal` becomes ink, never red. New names added only for values with no old name.
2. **Note height is measured at read**, in `getGeometry`, never persisted. Old notes get the right size on first open with zero writes.
3. **Tilt is visual only**, from a hash of the shape id, applied when `shape.rotation === 0`.
4. **Peel deletes first and animates a clone** outside `<Tldraw>`, so deletion stays atomic and one undo step.
5. **Motion on mount is gated** by a transient, one-shot id set filled only by pointer creation.
6. **Traffic lights inside the toolbar** via overlay title bar. One new Tauri permission.
7. **`McpConnection` leaves the toolbar stack** in the editor view and becomes a row in Más (designed in Slice 0); the list view keeps its strip until spec 007.

## Invariants

| Must not break | How it is kept |
|---|---|
| Saved essays open unchanged | No migration. Height and tilt are computed at read. `onMount` performs no shape write, so opening never bumps `updatedAt` and never marks a review stale |
| Persisted ids: `em`, `sis`, `pra`, `cri`, `tu`, pase values, note kinds, `anno` mark attributes | `agent-identity.ts` keys on those ids; only labels change. Unknown author falls back to `tu` |
| Note text, author, kind, `createdAt` | Still in `richText` and `meta`. `createdAt` is kept and still stamped; it is just not drawn |
| Testids | `topbar-fuentes`, `topbar-rubrica`, `topbar-pluma-roja`, `topbar-language`, `-es`, `-en` stay, on their new locations. New controls get the testids in [contracts/primitives.md](./contracts/primitives.md) |
| New persisted field survives Rust | `Essay.board` is `Option<serde_json::Value>` and `history.rs` reuses `Essay`, so `meta.title` inside the snapshot passes through storage and history untouched. `Essay` needs no new field |
| Native menu ids | `sabios:*`, `view:*`, `file:*`, `edit:*` unchanged; labels only |
| Live editor authoritative, autosave, history | `store.ts` persistence untouched; title writes go through `editor.updateShape`, picked up by the existing `registerBoard` side effects |
| MCP tools | All existing args and results keep working; `title` is additive. Bounds stay real because geometry is the measured height; rotation reported is still `shape.rotation` |
| `get_board_image` | Goes through `toSvg`, which is updated to the new note in the same slice |
| Undo | Title: one stopping point on focus, so a title edit is one step. Author, kind, delete: one step each. `applyNativeHistory` keeps today's routing when focus is inside tldraw or the editor. Anywhere else, `body` included, it follows one last-pointer-surface record (`board` or `document`) |
| Tldraw pointer rule (repo session 3) | Bar, toolbar and empty-board layer are siblings of `<Tldraw>`, never inside it |
| Tooltip and panel do not steal board focus | Mousedown `preventDefault` in the bar; Popover and Panel close on Esc in capture phase with `stopImmediatePropagation`, so Esc does not also deselect the note |
| Every action reachable | Hazme preguntas shows in the toolbar whenever the board is closed or has notes, and on the board when open and empty. Questioning by a single agent stays reachable through the selection menu and through the overlay's single-agent mode, once the toolbar avatars are gone. Zoom in and out buttons go; ⌘= and ⌘- and the wheel remain, checked in quickstart |

## Files touched

**Rust**
- `src-tauri/src/menu.rs`: labels only (Sabios to Agentes, Interrogar to Hazme preguntas, Evaluar to Revisar ensayo, Limpiar evaluación to Limpiar revisión, Mostrar Benchmark to Mostrar puntaje). Accelerator of `sabios:interrogar` moves to `CmdOrCtrl+Shift+P` per Decision 2.
- `src-tauri/src/sidecar.rs`: the five user-visible status strings: no "consejo", no voseo, no em-dash, no vendor.
- `src-tauri/tauri.conf.json`: `titleBarStyle: "Overlay"`, `hiddenTitle: true`, `trafficLightPosition`.
- `src-tauri/capabilities/default.json`: add `core:window:allow-start-dragging`.

**Sidecar**: none. `prompts/*.md` are deliberately untouched because prompt hashes are part of review provenance and the benchmark baseline. Model-written "El X" inside generated text is a known gap handed to 005 and 006.

**Shared and MCP**
- `shared/mcp.ts`: optional `title` on `create_note` and on `nodeUpdate`; descriptions updated.
- `mcp/src/server.ts`: none (reads the registry). Re-checked at implementation.

**Renderer: system**
- `src/app/globals.css`: token remap, new tokens, motion tokens and reduced-motion policy, board dots, `.anno` underline per agent with the initials chip removed, Blockquote restyled without left bar, tiptap type scale, remove grain, remove seal selection override. Hard-coded red literals on the sheet (`rgba(178,58,42,...)` in `.tiptap-content a`, `.cite`, blockquote, `.quote-block`, `anno-flash`) move to ink, because a token remap does not reach them.
- `src/app/layout.tsx`: Geist, Geist Mono, Newsreader; description copy.
- `src/lib/agent-identity.ts` (new): see [contracts/agent-identity.md](./contracts/agent-identity.md).
- `src/components/ui/Tooltip.tsx`, `Popover.tsx`, `Panel.tsx`, `useAnchor.ts`, `StickyNote.tsx` (new): see [contracts/primitives.md](./contracts/primitives.md).
- `src/lib/store.ts`: one flag, `overlayInstant`, set through `{ instant: true }` on the overlay openers. Persistence untouched.
- `src/components/ui/AgentChip.tsx` (new), replaces `ui/Avatar.tsx` (deleted). `ui/icons.tsx`: Paper glyphs for agents and toolbar. `ui/Button.tsx`, `ui/IconButton.tsx`: new variants, press scale. `ui/Badge.tsx`: reduced to what remains, or deleted if no caller is left.
- `src/lib/features.ts`: remove `topbarMore`.

**Renderer: shell**
- `src/components/Topbar.tsx`: rewritten to R2.1; list variant loses middle-dot strings and avatars, gains left inset and drag region. Stamp slot left empty. Registers the anchors `hazme`, `revisar` and `mas`.
- `src/components/toolbar/MorePanel.tsx` (new): R2.4 on the Popover.
- `src/components/council/CouncilAvatars.tsx`: deleted.
- `src/app/page.tsx`: sheet and board layout, mounts the MCP hook.
- `src/components/McpConnection.tsx`: split into a hook that stays mounted and two views (Más row, list strip).
- `src/components/SidecarBanner.tsx`: new style and wording, no vendor.
- `src/lib/menu/bridge.ts`: confirm dialog copy, comments; openers called with `{ instant: true }`.
- `src/lib/editor/history.ts`: one last-pointer-surface record, `board` or `document`, written by a capture-phase pointer listener (`.tl-container` or `[data-board-surface]` is `board`, the editor is `document`) and by `setUndoSurface` for actions that drop focus. `body` follows the record, instead of adding selector rules for each surface.

**Renderer: sheet**
- `src/components/editor/EditorPane.tsx`: remove word counter and shortcut hints; placeholder shortened; sheet padding.
- `src/components/editor/TitleInput.tsx`: 40/46 weight 500; placeholder color.
- `src/components/editor/SlashMenu.tsx`, `extensions/SlashCommand.ts`: R2.3 rows and order, Párrafo last; old titles kept in `aliases`.
- `src/components/editor/SelectionMenu.tsx`: agent chips, no uppercase label.
- `src/components/editor/extensions/Annotation.ts`: class map from identity; `data-by` carries the id, chip removed.

**Renderer: board**
- `src/components/canvas/note-shape.tsx`: rewritten render on `ui/StickyNote.tsx`, geometry, indicator, export, title field, tilt.
- `src/components/canvas/BoardPane.tsx`: remove header, counts, zoom state; remove tilt array; mount bar and empty layer; landing and peel wiring.
- `src/components/canvas/NoteBar.tsx` (new), replaces `NoteContextPanel.tsx` (deleted).
- `src/components/canvas/BoardToolbar.tsx`: R2.1 bottom-left, icons plus fit; `BoardZoom` removed.
- `src/components/canvas/BoardEmpty.tsx` (new): ghost notes on `ui/StickyNote.tsx` and call to action, which also registers the `hazme` anchor.
- `src/lib/canvas/note-motion.ts` (new): landing set and peel clone, exported as `markLanding(id)` and `peelNote(editor, id)`.
- `src/lib/mcp/board.ts`: `title` in `describe`, `create_note`, `update_nodes`.

**Renderer: names only (interim rule; layouts replaced by 005 to 008)**
`LecturaOverlay.tsx`, `PlumaRojaOverlay.tsx`, `RubricaOverlay.tsx`, `FuentesOverlay.tsx`, `HistoryOverlay.tsx`, `AnnotationPopover.tsx`, `BenchmarkDrilldown.tsx`, `Scorebar.tsx`, `EssayList.tsx`, `src/lib/sages.ts`: import names and chips from identity, replace "consejo" and "sabio" in visible strings. Nothing else.

**E2E (assertions and selectors only)**

| File | Change |
|---|---|
| `tests/e2e/setup.ts` | Add `openMore(page)` and `openSingleAgent(page, name)` helpers. `:403-406` checked: selects "Nuevo académico" on the list, which does not change |
| `board-keyboard.spec.ts` | `:86` and `:91` counter becomes a note locator count; `:106` name "Sistemas", kind via bar; `:111-112` note shows "Sistemas", kind asserted on the bar trigger |
| `sidecar-banner.spec.ts` | `:51` new heading |
| `flow.spec.ts` | `:87`, `:91` view switch testids |
| `sage.spec.ts` | "Interrogar" toolbar button to "Hazme preguntas"; `:36` view switch; `:102`, `:176` heading names; `:220` drops the removed label; `:222`, `:238` selection menu chip names. `:93` and `:132` clicked toolbar avatars, which the spec removes: both go through a new `openSingleAgent(page, name)` helper in `setup.ts` that opens the overlay and picks single-agent mode. This is the only E2E change beyond selectors, and it is forced by US1 |
| `selectors.spec.ts` | `:32`, `:58`, `:82`, `:115` button name |
| `language.spec.ts` | `openMore` before language testids; `:117` back button name "Ensayos" |
| `fuentes.spec.ts`, `history.spec.ts` | `openMore` first where the item moved |
| `rubrica.spec.ts` | `openMore`; `:78` count assertion moves to the overlay row count |
| `benchmark.spec.ts`, `apply-suggestion.spec.ts`, `language.spec.ts` helpers | `openMore` before `topbar-rubrica` |
| `editor-keyboard.spec.ts` | `:53`, `:70`, `:79`, `:81` "Título 1" to "Sección" |
| `menu.spec.ts`, `pluma-roja.spec.ts`, `score.spec.ts` | Expected unchanged; re-run |

**Docs**: `CLAUDE.md` session entry; `README.md` if it names old agents. `specs/003` stays as history.

## Channels

- **Desktop app**: everything above.
- **MCP**: `title` readable in `get_board` and `get_node`, writable in `create_note` and `update_nodes`; `get_board_image` shows the new note. Empty `title` clears it. Tool names, ids and error codes do not change. The MCP connect row moves from the strip to Más; server behavior does not.

## Safety

- **Data writes**: only `meta.title` is new, written by explicit user or tool action. No background writes.
- **New permissions**: `core:window:allow-start-dragging` (window drag only). Confirmed it is an explicit permission in `src-tauri/gen/schemas/desktop-schema.json`; `core:default` is what the app grants today.
- **Money**: no model calls in this spec or its verification. E2E uses the stubbed sidecar.
- **New dependencies**: none.

## Delivery slices

**Slice 0, design in Paper first (Noe approves).** One Paper pass for the whole series; the deduplicated list in [series.md](./series.md) wins over this one. States Paper does not draw: save icon while saving, unsaved and error with retry, including the tooltip with the word count; sidecar-down banner; MCP row in Más in its states; Práctica underline color (absent from all 66 underlined nodes; proposed `#8FB1F0`, derived the same way as the other three); slash row for Párrafo; note with very long title and text; Objeciones ghost variant copy. No code.

**Slice 1, foundation.** Tokens, fonts, motion tokens, identity, AgentChip, Tooltip, Popover, Panel, `useAnchor`, `StickyNote`, `overlayInstant`, window chrome, all names replaced. App runs with the old layout in new colors. Check: every screen legible, drag works, no "sabio" visible.

**Slice 2, shell and sheet.** Toolbar, Más, view switch, sheet layout, slash menu, native labels, banner, MCP row, E2E selector updates. Check: R2.1 and R2.4 side by side.

**Slice 3, the note.** Starts with a short spike on title focus and tilted editing; its outcome is written into research R2 and R4. Then display values, geometry, render, tape, tilt, ring, export, `title` in MCP. Check: old essay opens with zero writes; long note grows.

**Slice 4, board chrome and note motion.** Toolbar, floating bar, header and zoom removed, landing, lift, peel. E2E `board-keyboard` updates.

**Slice 5, empty board.** R2.3 layer and R2.7 loop, reduced motion, Hazme preguntas placement.

**Slice 6, sweep and grading.** Mechanical checks, real cases, independent reviewers, docs.

## Execution

Implemented by Sonnet subagents, following approved tasks. Slice 1 runs first and alone, and owns all of `globals.css`, `ui/icons.tsx`, `layout.tsx`, the `overlayInstant` flag in `store.ts` and the identity and primitive files, including the CSS and glyphs later slices need. Slice 2 (Topbar, editor, Rust, `page.tsx`, `setup.ts`, every spec except `board-keyboard`) and Slice 3 (`note-shape.tsx`, `board.ts`, `shared/mcp.ts`) run in parallel on disjoint files. Slice 4 owns `BoardPane.tsx` (including removal of the tilt array), `history.ts` and `board-keyboard.spec.ts`; Slice 5 then adds to `BoardPane.tsx`, so 4 and 5 run in sequence. Opus reviews every diff against the quality bar and the invariants before the next slice starts. If a slice changes the plan materially, it returns to Noe.

## Verification

Full procedure in [quickstart.md](./quickstart.md). Real cases (SC-006) in the desktop app, in a scratch `ESSAY_STUDIO_DATA_DIR`: reopen a test essay saved before the change; write and tag a note; change language from Más; create a new essay and watch the empty board. Plus: comparison with each artboard, keyboard and reduced-motion paths, MCP round trip of `title`, mechanical greps, the Playwright suite with selector updates, and independent reviewers scoring hierarchy, fun and consistency at 4 of 5 or better. Evidence is screenshots of the real app; anything not seen working is reported as such.

## Decisions adopted (2026-11-08, see series.md, Decisions taken)

1. **Where the caret lands in a new note.** R2.6 says the optional title; R2.5 draws a note being written in the body. tldraw focuses the body on a timer, so title-first means fighting it, and a quick note typed straight away would all become a title. **Adopted: caret in the body, title one click or ↑ away, with the placeholder visible as in R2.5.** Noe can reverse it when he sees the result.
2. **⌘I.** Paper's tooltip gives ⌘I to Hazme preguntas, and the native menu binds it, while TipTap binds the same key to italic. So the tooltip would be wrong while writing, or italic is already broken. ⌘⇧I is not an option: TipTap also binds `Mod-I`, so it would toggle italic too. **Adopted: italic keeps ⌘I; Hazme preguntas moves to ⌘⇧P (Preguntas), which nothing else binds, and the Paper layer note is updated.** This is the only shortcut that changes (FR-004 exception).

## Constitution Check (post-design)

| Principle | Result |
|---|---|
| I | Pass: no migration, no write on open, undo paths named |
| II | Pass: extends tldraw's util, reuses its focus, geometry cache and history |
| III | Pass: one registry; schema additive; one narrow window permission |
| IV | Pass: Slice 0 covers undrawn states; two Paper divergences adopted per series.md, reversible by Noe; interim overlays get names and colors only |
| V | Pass: plan awaits approval; quickstart is the real app |

## Project Structure

### Documentation (this feature)

```text
specs/004-stationery-shell/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── agent-identity.md
│   ├── primitives.md
│   └── mcp-note-title.md
└── tasks.md             # /speckit-tasks, not created here
```

### Source Code (repository root)

```text
src/
├── app/                 # globals.css, layout.tsx, page.tsx
├── components/
│   ├── Topbar.tsx
│   ├── toolbar/MorePanel.tsx        # new
│   ├── canvas/                      # note-shape, NoteBar (new), BoardEmpty (new), BoardToolbar, BoardPane
│   ├── editor/                      # EditorPane, TitleInput, SlashMenu, SelectionMenu
│   └── ui/                          # Tooltip, Popover, Panel, useAnchor, StickyNote, AgentChip (new), icons
└── lib/
    ├── agent-identity.ts            # new
    ├── canvas/note-motion.ts        # new
    └── mcp/board.ts
shared/mcp.ts
src-tauri/                           # menu.rs, sidecar.rs, tauri.conf.json, capabilities/default.json
tests/e2e/                           # selector updates only
```

**Structure Decision**: Existing single-repo layout. New files sit next to their consumers; no new layer.

## Complexity Tracking

No constitution violations to justify.
