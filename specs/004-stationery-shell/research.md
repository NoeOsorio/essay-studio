# Research: Stationery Desk System and App Shell

Each entry: decision, why, alternatives rejected. Facts were read from the code and from Paper (computed values and JSX, not screenshots).

## R1. Token strategy

**Decision.** Repoint existing `@theme` names; add names only where none exists.

| Existing | New value | Note |
|---|---|---|
| `paper` | `#FAF8F3` | desk |
| `paper-2` | `#FFFFFF` | sheet |
| `paper-3` | `#F1EEE6` | shade |
| `paper-4` | `#E7E2D6` | segmented track in R2.4 |
| `ink-1`, `ink-2`, `ink-3` | `#1D1B18`, `#4A463F`, `#6B665C` | |
| `ink-4` | `#6B665C` | old value fails AA |
| `rule-1`, `rule-2`, `rule-3` | ink at 8, 12, 24 percent | only unreplaced overlays still draw rules |
| `seal`, `seal-soft` | `#1D1B18`, `#F1EEE6` | red is reserved for errors |
| `em`, `sis`, `pra`, `cri` | the agent ink | used as text and as solid fill, so it must pass AA; the bright dot would not |
| `em-bg` and siblings | note color | |
| `em-ink` and siblings | agent ink | |
| `err` | `#B42318` | |
| `ok`, `warn` | `#4A463F` | color means only which agent |

New: `sheet`, `shade`, `board` `#F4F1E8`, `board-dot` `#CFC8B6`, `placeholder` `#C9C2B3`, `body` `#2A2723`, `selection` `#2F6FEB`, and per agent `-dot`, `-line`, `-text`.

**Why.** About 100 utility usages in overlays that 005 to 008 replace stay legible with no edits, which is what the interim rule asks. **Rejected:** renaming now (touches every overlay twice); keeping old tokens alongside new ones (two palettes on one screen).

**Paper's token list is stale** (`--r-dot #D9D3C4`). The constitution value `#CFC8B6` matches the computed background of the board frame, so computed values win.

## R2. Note geometry

**Finding.** `NoteShapeUtil.getGeometry` uses `getDisplayValues` plus persisted `growY`, measured with tldraw's font, 200 px and no header. The current override draws a header on top, so text is pushed 30 px past the measured box and hidden by `overflow: hidden`, which also clips the tape at `top: -9`.

**Decision.**
- `getCustomDisplayValues` gives Paper's values: width 212 (exported as `NOTE_WIDTH`), padding 18, Newsreader 17/23.
- A single `measureNote(editor, shape)` returns header, title and body heights. Height is `22 + 16 + 10 + title + body + 20`, floored at room for a title line and a body line (114), so an empty note does not jump when editing starts. Those numbers are Paper's padding, header and gap.
- `getGeometry` and `getIndicatorPath` call `super` with a shape whose `growY` is derived from that measure. Result cached in a `WeakCache` by record so the identity `super` caches on is stable.
- `renderHtmlFromRichTextForMeasurement` is a public export of tldraw. `TEXT_PROPS` is not; the few values needed are local.

**Why read time.** `growY` is persisted and was computed with the old values. Recomputing and writing it on open would save the essay, bump `updatedAt` and mark reviews stale, which is exactly what opening must not do. At read time old notes size correctly with no write.

**Spike outcome (Slice 3, run in the dev build).** Reading `editor.getEditingShapeId()` inside `getGeometry` does invalidate the cached geometry: an empty-title note with a long body measured 254 while editing and 229 once editing ended, and back to 254 on re-entering, each equal to the DOM height of the drawn note. The fallback is not needed. tldraw's geometry cache is a computed cache on the record, so atom reads inside it are tracked, and `areShapesContentEqual` compares `props` and `meta`, so a title edit also invalidates it.

**Deviations from the plan text, same outcome.** `getGeometry` and `getIndicatorPath` build their own rectangles from `measureNote` and do not call `super` with a derived shape: `super` would run tldraw's own label measure for nothing, and a derived shape cached by record cannot carry the editing flag. The `WeakCache` holds the measure per record; the editing placeholder line is added after the cache read. The floor is 116 (22 + 16 + 10 + 23 + 2 + 23 + 20, counting the 2 px title gap) so the note does not move by 2 px when editing starts. `onBeforeCreate` and `onBeforeUpdate` return nothing, because tldraw's versions write `growY` and `fontSizeAdjustment` on every text change; a new note keeps `growY` 0 and `fontSizeAdjustment` 1.

**Rejected:** writing own `growY` on load (writes); fixing height at 200 (square notes do not match R2.1 and long notes still need growth).

## R3. Tilt and selection

**Decision.** `tiltOf(id)`: hash the id (FNV-1a, 32 bit) into R2.6's range of -2 to 2.5 degrees, skipping the band of plus or minus 0.5 so every note reads as tilted. CSS rotate on the inner element, only when `shape.rotation === 0`. Notes that the agents placed earlier keep their real rotation, and `materializePreguntas` stops writing one.

The selection ring (paper gap, then `#2F6FEB`, per R2.1) is drawn by the renderer so it rotates with the note. `hideSelectionBoundsFg` returns true for a single note. For that note `getIndicatorPath` returns an empty path; hover and multi-select keep a tilted path and tldraw's bounds.

**Accepted cost.** At 2.5 degrees on a 212 px note, corners sit about 5 px off the geometry, so a bound arrow stops slightly off the drawn edge and the rotated corner tip is not clickable. Not a bug.

**Rejected:** writing `rotation` to the record (migration, changes the bounds MCP reports).

## R4. Title editing and focus

**Finding.** `RichTextArea` sets `autofocus` and re-focuses the body on a 100 ms timer after mount. `handleBlur` in tldraw's editing hook is a no-op, so moving focus to another field inside the shape does not end editing. Keyboard shortcuts stay off while a text field has focus (`activeElementShouldCaptureKeys`).

**Decision.** A textarea in the shape while editing, controlled by `meta.title`; plain text otherwise. `onPointerDown` is marked handled and stopped. On focus one `markHistoryStoppingPoint`, so the whole title is one undo step while still autosaving each keystroke. Enter, Tab or ↓ move to the body via `editor.getRichTextEditor()`. ↑ at the start of the body moves to the title.

**Spike outcome (Slice 3).** Confirmed in the dev build: N, click, type lands in the body; the title is a textarea mounted only while editing; ↑ from the first line of the body focuses it with the caret at the end; Enter, Tab or ↓ (caret at the end) return to the body; one ⌘Z removes the whole title typed in one visit and leaves the body text. Two things differ from the text above. tldraw's `editor.undo()` calls `complete()` first, so that undo also ends editing mode; the title is one step, the editing state is not kept. And tilt does not interfere with the textarea, because the whole note is rotated by one CSS `rotate` on a wrapper, caret and selection included. The textarea keeps a local draft that follows the store, so undo and MCP edits flow in without the caret jumping. `isAccelKey` is not exported by `tldraw`, so Cmd or Ctrl plus Enter is tested inline.

R2.6 versus R2.5 on caret placement was resolved as plan Decision 1 (caret in the body), because stealing focus from a 100 ms timer means the first keystrokes can land in the body, and it departs from the native flow that session 3 of the repo history settled on after two failed attempts.

## R5. Mount-triggered motion

**Finding.** Component mount also happens on essay open, board toggle, `restoreNonce` remount and culling during pan. Animating on mount would replay on all of them.

**Decision.** A `Set` of ids in `note-motion.ts`, filled by an after-create side effect only when `editor.isIn("note.pointing")`, consumed once by the renderer. MCP and keyboard creation never enter the set. `markLanding(id)` is the only other way in, used by spec 006. Lift and land on drag read `editor.isIn("select.translating")`; nothing runs from idle, so nudges with arrow keys do not animate.

## R6. Peel

**Decision.** The bar's delete calls `editor.deleteShapes` first, then animates a DOM clone of the note in a layer outside `<Tldraw>` at the same viewport position and zoom. The body, corner, shadow and tape are separate layers per R1.5, animating transform, opacity and clip-path only. Reduced motion uses opacity.

**Why.** Data changes atomically: undo, autosave and MCP revisions never observe a note that is mid-animation. **Rejected:** delaying deletion by 240 ms (a window where the note exists but the user has deleted it, and undo ordering gets complicated).

## R7. Window chrome

R2.1 draws the traffic lights inside the toolbar. `titleBarStyle`, `hiddenTitle` and `trafficLightPosition` are in the Tauri schema. The toolbar is 56 tall and the lights 12, so y is 22; x is 20. `data-tauri-drag-region` on the empty toolbar areas needs `core:window:allow-start-dragging`, an explicit permission. The list view gets the same inset and drag region or the window cannot be moved. Overlays are centered modals, so their content does not reach the light region; checked in quickstart.

## R8. Shortcut ⌘I

**Verified statically.** `menu.rs` binds `CmdOrCtrl+I` to `sabios:interrogar`. `extension-italic` binds `Mod-i`. `EditorPane` prints "⌘ I cursiva". Paper's layer name gives ⌘I to Hazme preguntas.

**Not verified at runtime.** Repo session 17 observed WKWebView receiving key equivalents before the native menu, which would make ⌘I italic inside the text and Hazme preguntas outside it. I have not run it. The recommendation holds either way: if the menu wins, italic is already broken in the editor; if the webview wins, the tooltip is wrong while he writes.

**Replacement key.** ⌘⇧I fails: `extension-italic` binds both `Mod-i` and `Mod-I`, and `prosemirror-keymap` retries a shifted character without Shift. ⌘⇧P is free: no TipTap extension binds `Mod-p` or `Mod-P`, tldraw binds only `cmd+p` (print) without Shift, and WebKit has no default for it.

**Existing, not fixed here.** By the same retry ⌘⇧E can reach `Mod-e` (inline code) while the caret is in the text. Quickstart records what it does.

## R9. Visible copy beyond touched surfaces

US3 applies to any visible text. Occurrences of "consejo", "sabio" and "El X" exist in `EssayList`, `Scorebar`, all overlays, `AnnotationPopover`, `BenchmarkDrilldown` and five strings in `sidecar.rs`. `SidecarBanner` names a vendor. The sweep found one more map than the brief listed: `SAGE_COLOR` in `Scorebar.tsx:16`, so ten in all. Other copy rules on files replaced later are met by the spec that replaces them.

`prompts/*.md` stay as they are: their hashes are part of review provenance.

## R10. Paper values that the brief did not carry

- Underlines are not the dots: Evidencia `#F5C542`, Sistemas `#7FD3AE`, Objeciones `#B79AF0`, 3 px, offset 5 px. Práctica is not drawn anywhere (66 underlined nodes checked): Slice 0.
- Note body has its own ink per agent: `#2B2410`, `#0F2E24`, `#14264D`, `#2A1A4A`; the writer's note uses ink.
- Tape: 76×22, `#FFFDF5BD`, shadow `#3C2D0A29 0 1px 3px`, top -11, rotate -4 degrees.
- Note: radius 3, shadow `#3C2D0A14 0 1px 1px, #3C2D0A4D 0 10px 20px -8px`.
- Sheet: 720 wide, padding 64/72/40, radius 16. Body frame gap 10, margins 10.
- Title 40/46 weight 500, tracking -0.015em. Essay text 19/32, `#2A2723`.
- Only Evidencia's ghost has a second question in R2.7 (`¿Con cuántos casos?`). R1.5 supplies `¿Qué lo sostiene día a día?` for Sistemas and `¿Cómo se ve el lunes?` for Práctica. Objeciones has none: proposal `¿Qué lo refutaría?` goes to Slice 0.

## R11. Hazme preguntas placement

R2.3 moves it to the board when empty. With the board closed it would then be unreachable, so it shows in the toolbar whenever the board is closed or has notes. "Empty" is a pure selector over `current.board` (any record with `typeName: "shape"`), which `updateBoard` keeps current synchronously. No new store state.

## R12. Things left alone on purpose

- Spec 005 owns the stamp and the Scorebar; the toolbar only leaves the place for it.
- `window.confirm` in Limpiar revisión stays, with new copy.
- Clone handles on notes are removed through `getHandles` returning none (FR-012). Keyboard note creation is unaffected.
