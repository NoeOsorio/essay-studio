# Design System: Essay Studio (Stationery Desk)

The visual source of truth is Paper (file `01M6VXNCR0ZBA410S026XSG7JT`, «Essay Studio, pantallas y flujos»). Every redesign is drawn and approved there before code. This file describes what is approved and built; tokens live in `src/app/globals.css` (`@theme`) and the binding rules in `.specify/memory/constitution.md`, Principle IV.

**Keeping it current.** Every change that reaches git and touches what the user sees (a screen, a component, a color, copy rules, motion) updates this file in the same commit. The «Screens» section lists the Paper artboard for each screen.

## 1. Visual Theme and Atmosphere

A warm writing desk, not a dashboard. Off-white paper under a white sheet where the essay lives, a dotted corkboard-like board with sticky notes for ideas, and four agents who each own one pastel color. Calm and tactile: notes have tape and a slight tilt, sheets have soft warm shadows, and nothing shouts. Density is balanced (a daily writing tool), layouts are mostly symmetric and quiet, and motion is short and functional.

Color means only one thing: which agent wrote something. Review is never red; red is only for system errors.

## 2. Color Palette and Roles

**Surfaces**
- **Desk paper** `#FAF8F3`: the app background, list columns, example cards.
- **Sheet white** `#FFFFFF`: the essay sheet, panels, sheets, inputs.
- **Shade** `#F1EEE6`: selected rows, segmented control tracks, soft buttons, the stamp area.
- **Board** `#F4F1E8` with dots `#CFC8B6`: the board, only for sticky notes. Review and corrections never sit on it.
- **Placeholder** `#C9C2B3`. **Body text on the sheet** `#2A2723`. **Text selection** `#2F6FEB`.

**Ink (text)**
- **Ink** `#1D1B18`: titles, primary text, primary buttons (dark fill with white text).
- **Ink 2** `#4A463F`: secondary text, section labels.
- **Ink 3** `#6B665C`: tertiary text, group labels, hints, locks.
- **Rules** ink at 8, 12 and 24 percent (`rgba(29,27,24,.08/.12/.24)`), used as 1 px rings on inputs and sheets, never as divider lines.

**Agents** (note fill / ink / dot / underline)
- **Evidencia** (`em`): `#FFE08A` / `#6E4600` / `#E8B421` / `#F5C542`.
- **Sistemas** (`sis`): `#BDEBD6` / `#0D5E46` / `#2FA57C` / `#7FD3AE`.
- **Práctica** (`pra`): `#CADDFF` / `#234A9C` / `#4C7EE0` / `#8FB1F0`.
- **Objeciones** (`cri`): `#E3D5FF` / `#563397` / `#9670E0` / `#B79AF0`.
- **Your notes** (`tu`): `#FFFDF8`.
- **Tu asistente** (`as`, corrections an outside assistant writes through MCP, never a note author): chip `#E7E2D6`, ink `#3F3B34`, underline `#8F897C`, sparkle icon (the one of «Mejorar»). Neutral on purpose so color still means which agent wrote it. Its card shows no «en» plus check name. Paper R4.5.

**Custom agents** (fill / ink / dot), chosen in Configurar agentes, never equal to the four:
rosa `#FFC9D6`/`#8A2846`/`#E0567A`, durazno `#FFD3B5`/`#8A3D12`/`#E07A3A`, lima `#DDEFB0`/`#4A5E12`/`#7FA82A`, cielo `#C3E8F5`/`#11536B`/`#2E9AC4`, arena `#EADFC8`/`#5E4A22`/`#B0915A`, gris `#E2E2DE`/`#45453F`/`#8A8A82`.

**Semantic**: error `#B42318` (system errors only). There is no accent color: the primary action is ink.

## 3. Typography

- **Geist** for all interface text. **Geist Mono** only for numbers that must align (the score stamp). **Newsreader** only for essay text, essay titles and note text.
- The app root is 14 px, so sizes are written in px (`text-[13px]`), never rem utilities.
- Scale in use: 12/16 (smallest allowed), 13/16 (labels, buttons), 14/18 and 14/20 (rows, body UI), 15/20 and 15/22 (descriptions, textareas), 17/24 and 17/26 (note and example sentences in Newsreader), 20/26 (sheet titles, 600, tracking -0.01em), 22/28 (agent name in its view).
- Hierarchy comes from weight (500 for labels and rows, 600 for titles) and ink level, not from size jumps.
- Never uppercase tracked labels, never text under 12 px, always WCAG AA contrast.

## 4. Components

- **Top bar**: 64 px tall, window controls centered in it (traffic lights at x 20, y 34). Left: back to essays. Right: view toggle, score stamp, «Revisar ensayo», «Más». Shortcuts only in tooltips.
- **Primary button**: ink fill, white text, radius 10, height 36, padding 0 18, Geist 13/16 500. One primary action per surface. Disabled: gray fill.
- **Soft button**: shade fill, ink text, radius 8 to 10. **Text button**: no fill, ink 2.
- **Press feedback**: scale 0.97 on every pressable element.
- **Inputs**: white, radius 10, 1 px ring `#1D1B181F`, label above in Geist 13/16 500 ink 2. Errors as one plain line, never a red box.
- **Segmented control**: shade track, radius 10, padding 3; selected segment white with a soft shadow.
- **Toggle**: 34 x 20 track, ink when on, white 16 px knob.
- **Agent chip**: square with radius 8 (28 px in lists, 44 px with radius 12 in headers), agent fill and a 16 px stroke icon in the agent ink.
- **Sheet** (Configurar agentes): 920 x 660, radius 16, shadow `0 0 0 1px #1D1B1814, 0 18px 40px -12px #3C2D0A29, 0 2px 6px #1D1B180F`, over a dimming veil; list column 300 px on desk paper, detail on white.
- **Panels and popovers** hang from the button that opened them (Revisar ensayo, Correcciones, report card); Correcciones stays open while you work.
- **Correction card**: one card per sentence; one part per agent with its chip, name, «en» plus the check name (hidden when it repeats the name), importance bars and label, the message, and when it proposes text a replacement block with «Copiar» and «Usar este texto». Only Citas APA and custom agents that allow it propose text. A check mark means the whole card is done.
- **Note links on a card**: «Ver nota» (when the correction points at a note that still exists) or «Vincular nota» (while it is open) as a text button, Geist 13/16 500 ink 2, in the footer row next to «No aplica». «Vincular nota» turns the board into pick mode: a pill «Elige una nota» at the top center, a press on a note links it, Esc or a press elsewhere cancels. One undo step. A deleted note leaves no «Ver nota».
- **Reading sheet of a note**: double-click on a note (editing stays on «Editar», Enter and a new note). Centered over a veil `#1D1B1866`: the same sticky note at 560 px with Newsreader 20/30 body and 24/30 title, scrolls when long. Under it a sheet bar with text buttons «Editar», «Ver en el ensayo» (scrolls to the first linked correction) and «Quitar vínculo» (only when linked). Esc or a press on the veil closes it. Enters with veil fade 200 ms and sheet opacity plus scale 0.97 over 240 ms, `cubic-bezier(0.23, 1, 0.32, 1)`; none under reduced motion.
- **Board toolbar**: select, note, arrow, then «Alejar» and «Acercar» (tooltips with ⌘− and ⌘+, the same step and animation as the keyboard) and «Ver todo».
- **Sticky note**: agent fill, translucent tape, slight tilt derived from its id, Newsreader text, a bold title line; shadow `0 1px 1px #3C2D0A14, 0 10px 20px -8px #3C2D0A4D`.
- **Score stamp**: Geist Mono number inside a stamped frame in the top bar; goes out of date when the essay changes.
- **Underlines** in the editor: 2 px in the agent underline color; custom agents use their dot color; Tu asistente uses `#8F897C`.
- **Empty states** show, they do not explain (the board's ghost notes, the desk on first use).

## 5. Layout

- Desktop window 1440 x 900, minimum 1200 x 760. Editor sheet on the left, board on the right, either can be hidden.
- Separation by surface, spacing and type weight. No hairline dividers, no box inside a box, no accent bar on the left.
- Every list is designed for 1000 items: search, filters, a dense ruled view (the library ledger past 11 essays), windowed scrolling.
- Spacing is written in px; common steps 2, 6, 8, 10, 12, 14, 16, 20, 24, 28, 36.

## 6. Motion

- Enter with `cubic-bezier(0.23, 1, 0.32, 1)` in under 320 ms, from opacity 0 and scale 0.97 or more, never from scale 0.
- Nothing animates when opened from the keyboard; reduced motion falls back to a fade or nothing.
- Only transform and opacity animate. No perpetual loops, except the board's empty-state ghost notes.
- Before changing any motion, load the `emil-design-eng` skill.

## 7. Copy

- Spanish, tú voice, plain words, short. Say what happens, not who does it: no vendor or model names in the interface.
- Never the middle dot between words, no em dashes, no decorative numbering, no counters or metadata that do not help the next action, no cartoon titles, nothing said twice on one screen.

## 8. Screens (Paper)

The approved screens are the «R» artboards. Pages in the file:
- **01 Lista de ensayos**: library desk (R1.1), ruled ledger past 11 essays (R1.3), search (R1.4).
- **02 Editor y tablero**, **03 Interrogar**, **04 Evaluar**: editor, board, Hazme preguntas, Revisar ensayo and Correcciones (R4.2b, one card per sentence; R4.5, a correction from Tu asistente).
- **06 Rúbrica, Fuentes e Historial**: material panels (R6.1 to R6.4, R6.6).
- **07 Sistema**: tokens and motion storyboards (R7.3).
- **08** and **09 Estados**: loading, empty, error and partial states.
- **10 Ajustes, agentes**: your agent's form (R8.1), a built-in agent's view (R8.2), «Mejorar» with «Volver a las tuyas» (R8.3).

In Paper, use the `--r-*` tokens; the `--color-*` tokens there are left over from the rejected gray direction.

## 9. Never

Pure black, neon or glow shadows, purple-blue AI gradients, emojis, red for review, the board as a surface for corrections, text under 12 px, shortcuts printed on the surface, the middle dot between words.
