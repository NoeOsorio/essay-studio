---
description: "Task list for the Stationery Desk system and app shell"
---

# Tasks: Stationery Desk System and App Shell

**Input**: `specs/004-stationery-shell/` (plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md) and [series.md](./series.md), which wins where it differs from a plan.

**Prerequisites**: Noe approved spec and plan (Gate A). **Slice 0 is the shared Paper pass in series.md, done elsewhere.** It is not repeated here.

**Tests**: No test-writing tasks. E2E work is only the assertion, selector and helper updates the plan lists. Verification is the real app per quickstart.md.

## Conventions

- **Phases are the plan's slices**, so each can be verified before the next starts. `[USn]` links a task to its spec story. Slice 1 is foundational and Slice 6 is cross-cutting, so they carry no story label.
- **Gate tag on every task.** `Gate: Slice 0` means no start until Noe approved the Slice 0 pass. `No Paper gate` means the task is non-visual and may start now (series.md, Coordinator rulings).
- **Paper file**: `01M6VXNCR0ZBA410S026XSG7JT`. Every visual task names its artboard. Read exact values with `get_jsx` and `get_computed_styles`, never from screenshots. Where Paper's token list and computed values differ, computed values win (research R1).
- **`[P]`** only where files are disjoint and no incomplete task is a dependency.
- **Slice 1 owns** all of `src/app/globals.css`, `src/components/ui/icons.tsx`, `src/app/layout.tsx`, the `overlayInstant` flag and the identity and primitive files. Tasks in Slices 2 to 5 do not edit `globals.css`, `icons.tsx` or `layout.tsx`. A missing style or glyph goes back to Slice 1's owner as a fix to that file, not as a local copy.
- **Decisions adopted** (series.md, Decisions taken): caret in a new note lands in the body; Hazme preguntas moves to ⌘⇧P and italic keeps ⌘I. The Práctica underline `#8FB1F0` is proposed and confirmed in Slice 0, like the voice lines.
- Run the app with `ESSAY_STUDIO_DATA_DIR=<scratch> npm run tauri:dev` after `npm run sidecar:build`, and restart it after any Rust change. None of Noe's essays are used, not even a copy. No model calls in this spec.

---

## Phase 1: Slice 1, foundation

**Goal**: Tokens, fonts, motion, identity and primitives. The app runs with the old layout in new colors. Runs first and alone.

**Slice check**: every screen legible, the window drags, no «sabio» visible in the renderer. Native menu labels and sidecar strings change in Slice 2. E2E specs that assert old names are expected to fail until Slices 2 and 4 update them.

### Non-visual pieces

- [x] T001 Create `src/lib/agent-identity.ts` exactly per contracts/agent-identity.md: `AgentId`, `AuthorId`, `Identity`, `AGENTS` (em, sis, pra, cri in display order), `NOTE_AUTHORS` (tu first, then AGENTS), `identityOf(id: unknown)` returning `tu` for an unknown or missing id. Names Evidencia, Sistemas, Práctica, Objeciones, Tú; lens sentences verbatim from the contract's table section; colors only as CSS variables (`--em-note`-style names matching T005). `Icon` points at named glyph exports in `src/components/ui/icons.tsx`; add temporary empty SVG exports there if T006 has not landed. No Paper gate. Done: `npx tsc --noEmit` passes and `grep -nE ": any\b|<any>" src/lib/agent-identity.ts` is empty.
- [x] T002 [P] Create `src/components/ui/useAnchor.ts` per contracts/primitives.md: `type AnchorName = "hazme" | "revisar" | "mas"`, `useAnchor(name): React.RefObject<HTMLElement | null>`, `useRegisterAnchor(name): React.RefCallback<HTMLElement>`. A small registry; `hazme` resolves to whichever trigger is rendered. No Paper gate. Done: `npx tsc --noEmit` passes.
- [x] T003 [P] Add `overlayInstant` to `src/lib/store.ts`: overlay openers take `opts?: { instant?: boolean }`, read strictly as `opts?.instant === true` so an opener passed as a click handler stays animated; the flag clears on close. Persistence code untouched. No Paper gate. Done: `npx tsc --noEmit` passes and `git diff src/lib/store.ts` touches only openers, the flag and its reset.

### Tokens, type, glyphs

- [x] T004 Update `src/app/layout.tsx`: load Geist, Geist Mono and Newsreader through `next/font/google`, drop Inter and JetBrains Mono, update the description copy (no vendor, no «sabio»). Gate: Slice 0. Paper R7.2: read exact values with `get_jsx` and `get_computed_styles`. Done: `npm run build` passes and `grep -nE "Inter|JetBrains" src/app/layout.tsx` is empty.
- [x] T005 Remap tokens in `src/app/globals.css` per research R1's table: `paper #FAF8F3`, `paper-2 #FFFFFF`, `paper-3 #F1EEE6`, `paper-4 #E7E2D6`, `ink-1/2/3 #1D1B18/#4A463F/#6B665C`, `ink-4 #6B665C`, `rule-1/2/3` ink at 8, 12, 24 percent, `seal #1D1B18`, `seal-soft #F1EEE6`, `em/sis/pra/cri` agent ink, `em-bg` and siblings note color, `em-ink` and siblings agent ink, `err #B42318`, `ok` and `warn #4A463F`. Add `sheet`, `shade`, `board #F4F1E8`, `board-dot #CFC8B6`, `placeholder #C9C2B3`, `body #2A2723`, `selection #2F6FEB`, and per agent `-dot`, `-line`, `-text` from the table in contracts/agent-identity.md, with Práctica `-line` taken from the approved Slice 0 artboard (proposed `#8FB1F0`). Point font variables at Geist, Geist Mono, Newsreader. Gate: Slice 0. Paper R7.1: read exact values with `get_jsx` and `get_computed_styles`. Done: `npm run dev`, list and editor render in the new palette with no unreadable text.
- [x] T006 Replace glyphs in `src/components/ui/icons.tsx` with Paper's agent and toolbar glyphs, including every export `agent-identity.ts` references. Gate: Slice 0. Paper R7.1 and R2.1: copy paths with `get_jsx`, read sizes with `get_computed_styles`. Done: `npx tsc --noEmit` passes and each agent shows its own glyph in the running app.
- [x] T007 Extend `src/app/globals.css` for the sheet and marks (after T005): dotted board texture; `.anno` underline per agent keyed on `data-by` carrying the agent id, 3 px, offset 5 px, colors from `-line`, initials chip removed; tiptap type scale (title 40/46 weight 500, tracking -0.015em, essay text 19/32 `#2A2723`); Blockquote restyled with no left bar; remove grain and the seal selection override; move hard-coded `rgba(178,58,42,...)` in `.tiptap-content a`, `.cite`, blockquote, `.quote-block` and `anno-flash` to ink. Gate: Slice 0. Paper R2.1 and R7.2: read exact values with `get_jsx` and `get_computed_styles`. Done: `grep -n "178, *58, *42" src/app/globals.css` is empty.
- [x] T008 Add motion to `src/app/globals.css` (after T007): tokens verbatim from contracts/primitives.md (`--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`, `--ease-standard: ease-out`, `--dur-press: 120ms`, `--dur-tooltip: 120ms`, `--dur-peel: 240ms`, `--dur-note: 280ms`, `--dur-settle: 320ms`, `--stagger: 60ms`); press at `scale(0.97)` on pointer `:active`; `peel`, `land` and empty-board loop keyframes using only transform, opacity and clip-path, with shadow on its own layer so `box-shadow` is never animated; `@media (prefers-reduced-motion: reduce)` next to each animation: no scale, no rotation, no loop, fades remain. Gate: Slice 0. Paper R1.5, R2.6, R2.7, R7.3: read exact values with `get_jsx` and `get_computed_styles`. Done: `grep -nE "@keyframes" -A12 src/app/globals.css | grep -c box-shadow` returns 0.

### Primitives

- [x] T009 [P] Create `src/components/ui/Tooltip.tsx` per contracts/primitives.md: `<Tooltip label shortcut side>`; first show waits 400 ms, while one is open or within 300 ms of the last closing neighbors open at once; enter is fade plus `translateY(4px)` to 0 in 120 ms ease-out; reduced motion fades only; keyboard focus opens with no delay and no animation; shortcut renders only here in Geist Mono; portal to `body`, never intercepts pointer events; sets `aria-describedby`; no native `title`. Gate: Slice 0. Paper R7.3: read exact values with `get_jsx` and `get_computed_styles`. Done: mounted on a Slice 2 control, hovering shows name and shortcut with the delay, and the neighbor opens at once.
- [x] T010 [P] Create `src/components/ui/Popover.tsx` with the contract's `PopoverProps` (`anchor`, `open`, `onClose`, `side?: "top" | "bottom"` default bottom, `align?: "start" | "center" | "end"` default end, `keepFocus?`, `instant?`, `width?`, `testId?`, `children`). Solid sheet, `transform-origin` at the trigger, enter under 320 ms with `--ease-out` from `scale(0.96)`, never `scale(0)`, no animation with `instant`. Closes on outside pointer down and on Esc in capture phase with `stopImmediatePropagation`. Returns focus to the trigger unless `keepFocus`. Clamped to the window, flips side on overflow. Portal to `body`, always outside `<Tldraw>`. Gate: Slice 0. Paper R2.4: read exact values with `get_jsx` and `get_computed_styles`. Done: Más (T017) opens from its trigger and Esc closes only the panel.
- [x] T011 [P] Create `src/components/ui/Panel.tsx` with the contract's `PanelProps` (`open`, `onClose`, `instant?`, `width?`, `testId?`, `children`): same sheet, motion and capture-phase Esc as Popover, unanchored, returns focus to the element that had it on open, portal to `body`. Gate: Slice 0. Paper R7.1: read exact values with `get_jsx` and `get_computed_styles`. Done: `npx tsc --noEmit` passes; exercised by spec 005 and 006.
- [x] T012 Create `src/components/ui/StickyNote.tsx` (after T001) per the contract: `export const NOTE_WIDTH = 212`, `export function tiltOf(id: string): number` (FNV-1a, 32 bit, into -2 to 2.5 degrees, skipping plus or minus 0.5), `StickyNote({ author: AuthorId, title?, tilt?, tape?, children })`. Presentational, no tldraw import. Tape 76×22, `#FFFDF5BD`, shadow `#3C2D0A29 0 1px 3px`, top -11, rotate -4 degrees; note radius 3, shadow `#3C2D0A14 0 1px 1px, #3C2D0A4D 0 10px 20px -8px`; padding 18; Newsreader 17/23. Gate: Slice 0. Paper R2.1 and R2.5: read exact values with `get_jsx` and `get_computed_styles`. Done: `grep -n "tldraw" src/components/ui/StickyNote.tsx` is empty.
- [x] T013 Create `src/components/ui/AgentChip.tsx` (after T001, T006) drawing icon and optional name from `identityOf`, never initials. Update `src/components/ui/Button.tsx` and `src/components/ui/IconButton.tsx` with the new variants and press scale. `ui/Avatar.tsx` is deleted in T040, once its callers are gone. Gate: Slice 0. Paper R2.1 and R7.1: read exact values with `get_jsx` and `get_computed_styles`. Done: `npx tsc --noEmit` passes.

### Window and names

- [x] T014 Update `src-tauri/tauri.conf.json` (`titleBarStyle: "Overlay"`, `hiddenTitle: true`, `trafficLightPosition` x 20, y 22) and `src-tauri/capabilities/default.json` (add `core:window:allow-start-dragging`). Add `data-tauri-drag-region` and the left inset to the existing `src/components/Topbar.tsx` for editor and list views, so the window stays movable until T016 replaces that file. Gate: Slice 0. Paper R2.1: read exact values with `get_jsx` and `get_computed_styles`. Done: after restarting `tauri:dev`, traffic lights sit in the toolbar and the window drags from empty toolbar space in editor and list.
- [x] T015 Replace all ten agent maps with imports from `src/lib/agent-identity.ts`: `src/components/lectura/LecturaOverlay.tsx:18`, `src/components/lectura/PlumaRojaOverlay.tsx:69`, `src/components/editor/AnnotationPopover.tsx:24`, `src/components/BenchmarkDrilldown.tsx:30`, `src/components/council/CouncilAvatars.tsx:14`, `src/components/editor/SelectionMenu.tsx:8`, `src/components/canvas/NoteContextPanel.tsx:6`, `src/components/editor/extensions/Annotation.ts:65` (class map from identity; `data-by` now carries the id, attribute names unchanged), `src/components/canvas/note-shape.tsx:36`, `src/components/Scorebar.tsx:16`. Then replace «consejo», «sabio» and «El X» in visible strings of those files and of `src/components/lectura/RubricaOverlay.tsx`, `FuentesOverlay.tsx`, `HistoryOverlay.tsx`, `src/components/EssayList.tsx`, `src/lib/sages.ts`. Names, chips and colors only, no layout changes. Persisted ids unchanged. Gate: Slice 0. Paper R7.1: read names and chips with `get_jsx` and `get_computed_styles`. Done: `grep -rnE "SAGE_[A-Z]+|\bSAGES\b|AUTHOR_[A-Z]+|\bAUTHORS\b" src` is empty, and an old essay shows the new names on notes and underlines.

**Checkpoint**: Opus reviews the diff against the invariants. Slices 2 and 3 may then run in parallel.

---

## Phase 2: Slice 2, shell and sheet

**Goal**: Toolbar, Más, view switch, sheet layout, slash menu, native labels, banner, MCP row, E2E selector updates. Files: Topbar, editor, Rust, `page.tsx`, `setup.ts`, every spec except `board-keyboard`.

**Slice check**: R2.1 and R2.4 side by side with the running app; nothing wraps at 1200 px.

- [x] T016 [US1] Rewrite `src/components/Topbar.tsx` to R2.1: back to Ensayos, saved icon, view switch, Hazme preguntas, an empty `data-slot="stamp"` element between Hazme preguntas and Revisar ensayo, Revisar ensayo, Más. No bottom line, no essay title, no language or type, no agent avatars. Hazme preguntas shows when the board is closed or has notes (pure selector on `current.board`: any record with `typeName: "shape"`) and still opens the current flow (FR-021), Revisar ensayo likewise. Saved icon has saving, unsaved, error with retry and a tooltip with word count. Tooltips on every control through `ui/Tooltip`, with ⌘⇧P for Hazme preguntas. Registers anchors `hazme`, `revisar`, `mas` via `useRegisterAnchor`. Testids: `topbar-back`, `topbar-save`, `topbar-view-editor`, `topbar-view-board` (`data-active`), `topbar-hazme`, `topbar-pluma-roja`, `topbar-more`. List variant loses middle-dot strings and avatars and keeps left inset and drag region. Remove `topbarMore` from `src/lib/features.ts`. Gate: Slice 0. Paper R2.1 and the Slice 0 save icon artboard: read exact values with `get_jsx` and `get_computed_styles`. Done: side by side with R2.1, at most 6 controls in one row at 1200 px; `grep -rn topbarMore src` is empty.
- [x] T017 [US2] Create `src/components/toolbar/MorePanel.tsx` on `ui/Popover` (`testId="more-panel"`): Idioma and Tipo change in place, Fuentes, Rúbrica, Historial open their overlays, MCP row below. Testids kept or added: `topbar-language`, `topbar-language-es`, `topbar-language-en`, `topbar-mode-academico`, `topbar-mode-blog` (`data-active`), `topbar-fuentes`, `topbar-rubrica`, `topbar-historial`. Gate: Slice 0. Paper R2.4 and the Slice 0 MCP row artboard: read exact values with `get_jsx` and `get_computed_styles`. Done: side by side with R2.4; each item reachable; language change persists after reopening the essay.
- [x] T018 [US1] Split `src/components/McpConnection.tsx` into one hook that stays mounted and two views (Más row, list strip). Mount the hook and lay out sheet and board in `src/app/page.tsx`: body frame gap 10, margins 10, sheet 720 wide, padding 64/72/40, radius 16; board closed gives a full-width centered sheet. Gate: Slice 0. Paper R2.1 and the Slice 0 MCP placement artboard: read exact values with `get_jsx` and `get_computed_styles`. Done: MCP status appears in Más on the editor and in the strip on the list; toggling the board with ⌘\ recenters the sheet.
- [x] T019 Delete `src/components/council/CouncilAvatars.tsx` after T016. No Paper gate. Done: `grep -rn CouncilAvatars src` is empty and `npx tsc --noEmit` passes.
- [x] T020 [P] [US1] Update `src/components/editor/EditorPane.tsx` (remove word counter and shortcut hints, shorten placeholder, sheet padding) and `src/components/editor/TitleInput.tsx` (40/46 weight 500, placeholder color). Word count lives only in the save icon tooltip (FR-009). Gate: Slice 0. Paper R2.1: read exact values with `get_jsx` and `get_computed_styles`. Done: `grep -n "kbd" src/components/editor/EditorPane.tsx` is empty; no eyebrow, counter or hint around the text.
- [x] T021 [P] [US1] Update `src/components/editor/SlashMenu.tsx` and `src/components/editor/extensions/SlashCommand.ts` to R2.3's rows and order with Párrafo last, keeping every block type and the old titles in `aliases`. Gate: Slice 0. Paper R2.3 and the Slice 0 Párrafo row artboard: read exact values with `get_jsx` and `get_computed_styles`. Done: typing `/` shows R2.3; `/h1`, `/quote` and other old aliases still match.
- [x] T022 [P] [US3] Update `src/components/editor/SelectionMenu.tsx`: agent chips from identity, no uppercase label; single-agent questioning stays reachable here. Gate: Slice 0. Paper R2.1: read exact values with `get_jsx` and `get_computed_styles`. Done: `grep -n uppercase src/components/editor/SelectionMenu.tsx` is empty; selecting text and clicking a chip opens that agent.
- [x] T023 [P] [US2] Update labels in `src-tauri/src/menu.rs`: Sabios to Agentes, Interrogar to Hazme preguntas, Evaluar to Revisar ensayo, Limpiar evaluación to Limpiar revisión, Mostrar Benchmark to Mostrar puntaje. Move the `sabios:interrogar` accelerator to `CmdOrCtrl+Shift+P`. Ids unchanged. No Paper gate. Done: `cargo test` in `src-tauri` passes; after restart, the native menu shows the new labels and ⌘⇧P opens Hazme preguntas.
- [x] T024 [P] [US3] Update `src/lib/menu/bridge.ts` (confirm dialog copy, comments, overlay openers called with `{ instant: true }`). No Paper gate. Done: `grep -n "instant: true" src/lib/menu/bridge.ts` lists every overlay opener; opening from the native menu has no animation.
- [ ] T025 [P] [US6] Update `src-tauri/src/sidecar.rs` (five user-visible status strings: no «consejo», no voseo, no em-dash, no vendor) and `src/components/SidecarBanner.tsx` (new style, no vendor). Gate: Slice 0. Paper Slice 0 sidecar-down banner artboard: read exact values with `get_jsx` and `get_computed_styles`. Done: rename `sidecar/dist/sage.js`, relaunch, banner shows new style and wording, restore the file.
- [x] T026 Add `openMore(page)` and `openSingleAgent(page, name)` to `tests/e2e/setup.ts`. `openSingleAgent` opens the overlay and picks single-agent mode. No Paper gate. Done: `npx tsc --noEmit` passes.
- [x] T027 Update E2E selectors and assertions only, per the plan's table, after T016 to T026: `tests/e2e/sidecar-banner.spec.ts:51`; `flow.spec.ts:87,91`; `sage.spec.ts` (Interrogar to Hazme preguntas, `:36`, `:102`, `:176`, `:220`, `:222`, `:238`, and `:93`, `:132` through `openSingleAgent`); `selectors.spec.ts:32,58,82,115`; `language.spec.ts` (`openMore`, `:117` «Ensayos»); `fuentes.spec.ts`, `history.spec.ts` (`openMore`); `rubrica.spec.ts` (`openMore`, `:78` overlay row count); `benchmark.spec.ts`, `apply-suggestion.spec.ts` (`openMore`); `editor-keyboard.spec.ts:53,70,79,81` («Título 1» to «Sección»). `menu.spec.ts`, `pluma-roja.spec.ts`, `score.spec.ts` are re-run only. No Paper gate. Done: `npm run test:e2e` passes except `board-keyboard.spec.ts`, which T042 updates.

**Checkpoint**: Compare R2.1 and R2.4; run quickstart's keyboard list for toolbar shortcuts.

---

## Phase 3: Slice 3, the note

**Goal**: Display values, geometry, render, tape, tilt, ring, export, `title` in MCP. Files: `note-shape.tsx`, `src/lib/mcp/board.ts`, `shared/mcp.ts`. May run in parallel with Slice 2.

**Slice check**: an old essay opens with zero writes; a long note grows.

- [x] T028 Spike on `src/components/canvas/note-shape.tsx` (throwaway branch of work, not committed): confirm whether reading `editor.getEditingShapeId()` inside `getGeometry` invalidates cached geometry so the placeholder title line can be counted while editing, and how the title field behaves with tilted editing. Caret placement is already decided: body. No Paper gate. Done: outcome and chosen path written into research.md R2 and R4.
- [x] T029 [US4] In `src/components/canvas/note-shape.tsx`, implement `getCustomDisplayValues` (width 212 via `NOTE_WIDTH`, padding 18, Newsreader 17/23) and one `measureNote(editor, shape)` returning header, title and body heights. Height is `22 + 16 + 10 + title + body + 20`, floored at 114. `getGeometry` and `getIndicatorPath` call `super` with a shape whose `growY` comes from that measure, cached in a `WeakCache` by record. Persisted `growY` is ignored for display and never written. Gate: Slice 0. Paper R2.1 and the Slice 0 long-note artboard: read exact values with `get_jsx` and `get_computed_styles`. Done: a very long note grows with no overflow; opening a pre-change test essay in a scratch `ESSAY_STUDIO_DATA_DIR` and closing it leaves `content`, `board` and `updatedAt` equal to its saved copy.
- [x] T030 [US4] In `src/components/canvas/note-shape.tsx`, render through `ui/StickyNote`: tape, author icon and name (testid `note-author`), optional title (testid `note-title`), body, no date and no kind. Tilt uses `tiltOf(shape.id)` only when `shape.rotation === 0`. Keep stamping `meta.createdAt`. Unknown author renders as Tú. `getHandles` returns none (research R12). Gate: Slice 0. Paper R2.1, R2.5, R2.6: read exact values with `get_jsx` and `get_computed_styles`. Done: an old essay shows taped, tilted notes with no text, author or kind lost, and tilt is the same after reopening.
- [x] T031 [US4] In `src/components/canvas/note-shape.tsx`, add the title field while editing: a textarea controlled by `meta.title` (string, "Absent or empty means no title. Plain text, no length limit; the note grows"), plain text otherwise; `onPointerDown` marked handled and stopped; on focus one `markHistoryStoppingPoint` so the whole title is one undo step while autosaving each keystroke; Enter, Tab or ↓ move to the body via `editor.getRichTextEditor()`; ↑ at the start of the body moves to the title. The caret starts in the body. Gate: Slice 0. Paper R2.5 and R2.6: read exact values with `get_jsx` and `get_computed_styles`. Done: N, click, type goes to the body; ↑ reaches the title; one ⌘Z undoes the whole title.
- [x] T032 [US4] In `src/components/canvas/note-shape.tsx`, add the selection ring (paper gap, then `#2F6FEB`, drawn by the renderer so it rotates with the note), `hideSelectionBoundsFg` true for a single note, `getIndicatorPath` empty for that note, tilted path on hover and multi-select. Update `toSvg` to draw title, tape, tilt, author icon and name, no date and no kind, resolving CSS variables with `getComputedStyle`. Gate: Slice 0. Paper R2.1: read exact values with `get_jsx` and `get_computed_styles`. Done: the selected note's ring follows the tilt; `get_board_image` shows the new note.
- [x] T033 [P] [US4] Add optional `title: string` to `create_note` and `nodeUpdate` in `shared/mcp.ts` with updated descriptions; a patch with only `title` satisfies the "supply something to change" check. Fail-closed validation still rejects unknown properties. Re-read `mcp/src/server.ts` to confirm it needs no change. No Paper gate. Done: `npx tsc --noEmit` passes and `mcp` builds.
- [ ] T034 [P] [US4] Update `src/lib/mcp/board.ts`: `title: string | null` next to `text` in `describe`, `create_note` and `update_nodes` write `meta.title` merged with existing `meta`, empty string clears it. Tool names, error codes, revision checks and one-step undo unchanged. `bounds` is the measured height, `rotation` remains `shape.rotation`. No Paper gate. Done: with a connected client, the MCP steps in quickstart.md pass, including author and kind surviving a title update.

**Checkpoint**: Run the zero-write check from quickstart case 1.

---

## Phase 4: Slice 4, board chrome and note motion

**Goal**: Tools, floating bar, header and zoom removed, landing, lift, peel. Owns `BoardPane.tsx`, `history.ts`, `board-keyboard.spec.ts`. Starts after Slices 2 and 3.

**Slice check**: delete with the trash peels per R1.5; ⌫ removes with no animation.

- [x] T035 [P] [US4] Create `src/lib/canvas/note-motion.ts` per the contract: `markLanding(id: TLShapeId): void` (next mount of this id plays the landing, once) and `peelNote(editor: Editor, id: TLShapeId): void` (calls `editor.deleteShapes` first, then animates a DOM clone outside `<Tldraw>` at the same viewport position and zoom, body, corner, shadow and tape as separate layers; reduced motion uses opacity). A one-shot `Set` filled by an after-create side effect only when `editor.isIn("note.pointing")`; MCP and keyboard creation never enter it. Gate: Slice 0. Paper R1.5 and R2.6: read exact values with `get_jsx` and `get_computed_styles`. Done: creating with the pointer lands once; reopening the essay, toggling the board, restoring and panning replay nothing.
- [x] T036 [US4] Create `src/components/canvas/NoteBar.tsx` (after T035), a sibling of `<Tldraw>` attached to the selected note: author icon chips from `NOTE_AUTHORS`, kind choice on `ui/Popover` with `keepFocus`, delete via `peelNote`. Testids `note-bar`, `note-bar-author-<id>`, `note-bar-kind`, `note-bar-delete`. Mousedown `preventDefault` so focus stays on the board. Author, kind and delete are one undo step each. Gate: Slice 0. Paper R2.1: read exact values with `get_jsx` and `get_computed_styles`. Done: with the bar mounted by T038, each change undoes with one ⌘Z and Esc closes the kind menu without deselecting the note.
- [x] T037 [P] [US4] Rewrite `src/components/canvas/BoardToolbar.tsx`: bottom-left, icons plus fit, tooltips through `ui/Tooltip`, testids `board-tool-select`, `board-tool-note`, `board-tool-arrow`, `board-tool-fit`, `BoardZoom` removed. Gate: Slice 0. Paper R2.1: read exact values with `get_jsx` and `get_computed_styles`. Done: side by side with R2.1; `grep -nE "BoardZoom|%" src/components/canvas/BoardToolbar.tsx` is empty.
- [x] T038 [US4] Update `src/components/canvas/BoardPane.tsx` (after T035 to T037): remove header, counts, zoom state and the tilt array; stop writing `rotation: args.tilt` at `BoardPane.tsx:332`, so `materializePreguntas` no longer sets a rotation; mount `NoteBar` outside `<Tldraw>`; wire landing and peel. Gate: Slice 0. Paper R2.1 and R1.5: read exact values with `get_jsx` and `get_computed_styles`. Done: `grep -n "args.tilt" src/components/canvas/BoardPane.tsx` is empty; ⌘= and ⌘- still zoom.
- [x] T039 [US4] In `src/components/canvas/note-shape.tsx`, consume the landing set once on mount and add lift and land on drag, reading `editor.isIn("select.translating")`, so arrow-key nudges never animate. Gate: Slice 0. Paper R1.5 and R2.6: read exact values with `get_jsx` and `get_computed_styles`. Done: pointer creation lands once; dragging lifts and lands; arrow keys move a note with no animation.
- [x] T040 [US4] Delete `src/components/canvas/NoteContextPanel.tsx` and `src/components/ui/Avatar.tsx`, and reduce `src/components/ui/Badge.tsx` to what remains or delete it if no caller is left. No Paper gate. Done: `grep -rnE "NoteContextPanel|ui/Avatar" src` is empty and `npx tsc --noEmit` passes.
- [x] T041 Update `src/lib/editor/history.ts` with one last-pointer-surface record: `export function setUndoSurface(surface: "board" | "document"): void`, written by a capture-phase pointer listener (`.tl-container` or `[data-board-surface]` is `board`, the editor is `document`). Focus inside tldraw or the editor routes as today, text fields keep their native stack, otherwise `body` included follows the record. No Paper gate. Done: click the board, click empty desk, ⌘Z undoes the board change; the same from the sheet undoes the document change.
- [x] T042 Update `tests/e2e/board-keyboard.spec.ts` selectors and assertions only: `:86` and `:91` note locator count; `:106` name «Sistemas», kind via the bar; `:111-112` note shows «Sistemas», kind asserted on the bar trigger. No Paper gate. Done: `npx playwright test board-keyboard` passes.

**Checkpoint**: Quickstart case 2 (write, title, retype, reassign, undo, peel).

---

## Phase 5: Slice 5, empty board

**Goal**: R2.3 layer and R2.7 loop, reduced motion, Hazme preguntas placement. After Slice 4, because both touch `BoardPane.tsx`.

**Slice check**: quickstart case 4.

- [x] T043 [US5] Create `src/components/canvas/BoardEmpty.tsx` (sibling of `<Tldraw>`): ghost notes on `ui/StickyNote` looping per R2.7, with every voice line and second line read from the approved Slice 0 voice lines and Objeciones ghost artboards (R2.7 and R1.5 are the starting copy; Slice 0 wins), one Hazme preguntas call with testid `board-empty-cta` that registers the `hazme` anchor. No heading, counter or explanation. Reduced motion: still ghosts, no loop. Gate: Slice 0. Paper R2.3, R2.7 and the Slice 0 voice lines and Objeciones ghost artboards: read exact values with `get_jsx` and `get_computed_styles`. Done: new essay plays the full 12 s loop; Reduce motion on shows still notes.
- [x] T044 [US5] Mount `BoardEmpty` in `src/components/canvas/BoardPane.tsx` from the same empty selector as T016. The loop fades when the first real note appears and does not return while notes exist. The toolbar's Hazme preguntas hides only while the board is open and empty. Gate: Slice 0. Paper R2.3: read exact values with `get_jsx` and `get_computed_styles`. Done: creating a note fades the loop; with the board closed Hazme preguntas stays in the toolbar.

**Checkpoint**: Quickstart cases 3 and 4.

---

## Phase 6: Slice 6, sweep and grading

- [x] T045 Run every mechanical check in quickstart.md, including the byte-form middle dot grep, and fix hits in the file that owns them; triage the hard-coded color list (remapped, error red or interim overlay; no red on sheet or toolbar). No Paper gate. Done: each grep returns nothing except the triaged colors.
- [x] T046 Run `npm run lint`, `npm run build`, `npx tsc --noEmit`, `npm run test:e2e`, and `cargo test` in `src-tauri`. No Paper gate. Done: all pass.
- [ ] T047 Run the quickstart in the real app: SC-006 cases on test essays in a scratch `ESSAY_STUDIO_DATA_DIR`, including one saved before the change, side-by-side table, edge cases, keyboard and motion, MCP. No model calls. Gate: Slice 0. Done: screenshots of the real app saved as evidence; anything not seen working stated as «no lo he visto funcionar».
- [ ] T048 Independent reviewers who did not build it score the running app against the artboards, one lens each: hierarchy, fun, consistency (minimum 4 of 5, SC-001), copy, accessibility. Below minimum returns to the owning slice. Gate: Slice 0. Done: scores and screenshots reported.
- [x] T049 [P] Add the session entry to `CLAUDE.md` and update `README.md` if it names old agents. `specs/003` stays as history. No Paper gate. Done: `grep -nE "Empirista|Sistémico|Práctico|Crítico" README.md` is empty.

---

## Dependencies and execution order

| Slice | Depends on | Runs |
|---|---|---|
| 0 Paper pass (elsewhere) | Noe's approval | Gates every `Gate: Slice 0` task |
| 1 foundation | T001 to T003 may start now; the rest needs Slice 0 | First and alone |
| 2 shell and sheet | Slice 1 | In parallel with Slice 3, disjoint files |
| 3 note | Slice 1 | In parallel with Slice 2 |
| 4 board chrome | Slices 2 and 3 | Sequential |
| 5 empty board | Slice 4, shared `BoardPane.tsx` | Sequential |
| 6 sweep | All | Last |

Other non-visual tasks that may start early once their files are free: T023, T024, T026, T033, T034, T041.

Shared pieces this spec owns (series.md): `agent-identity.ts` T001; `Tooltip` and motion tokens T009, T008; `Popover`, `Panel` T010, T011; `useAnchor` T002 with registration T016; `overlayInstant` T003; `StickyNote`, `tiltOf`, `NOTE_WIDTH` T012; `markLanding`, `peelNote` T035; last-pointer-surface record T041; `openSingleAgent` T026; stamp slot and window chrome T016, T014.

## Parallel example, Slice 3

```text
T033 shared/mcp.ts
T034 src/lib/mcp/board.ts
(note-shape.tsx tasks T029 to T032 stay sequential on the one file)
```

## Implementation strategy

Each slice is implemented by Sonnet subagents, one per task or per group on the same files. Opus reviews every diff against the invariants in plan.md before the next slice. A slice that changes the plan materially returns to Noe. The first useful stop is the end of Slice 2: the new shell on the real essay.

## Requirement coverage

| Requirement | Tasks |
|---|---|
| FR-001 | T004, T005, T007 |
| FR-002, FR-005 | T016, T020 |
| FR-003 | T017 |
| FR-004 | T016, T017, T023, T047 |
| FR-006 | T009 |
| FR-007, FR-011 | T001, T007, T015 |
| FR-008 | T015, T029, T047 |
| FR-009 | T016, T020 |
| FR-010 | T021 |
| FR-012 | T007, T030 |
| FR-013, FR-014 | T012, T030 |
| FR-015 | T036, T038 |
| FR-016 | T031, T033, T034 |
| FR-017 | T037 |
| FR-018 | T043, T044 |
| FR-019 | T008, T035, T039, T043 |
| FR-020 | T025, T045 |
| FR-021 | T016 |
