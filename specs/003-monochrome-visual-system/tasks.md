---
description: "Tasks for 003 Monochrome + Sages Visual System"
---

# Tasks: Monochrome + Sages Visual System

**Input**: Design documents from `/specs/003-monochrome-visual-system/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ui-rules.md, quickstart.md

**Tests**: No new tests (constitution V). The only test work is updating existing E2E assertion
text (T026). Every task has an observable done-check instead.

**Organization**: grouped by the plan's delivery slices so parallel agents get disjoint files.
Story labels say which user story each task serves (US1 color meaning, US2 legibility, US3 calm
chrome, US4 copy). Slice 1 blocks everything; slices 2 to 5 run in parallel; slice 6 runs last.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- Done-checks refer to contracts/ui-rules.md (rules R1 to R11) and quickstart.md

## Rules every implementation task follows

- Values come only from data-model.md tokens; never a new hex literal in a component.
- Type sizes come only from the scale: `text-meta` 12, `text-ui` 13, `text-body` 14, `text-lead`
  16, `text-title` 20, `text-display` 28. Nothing below 12 px.
- Sage tokens (`em`, `sis`, `pra`, `cri` and `-bg`/`-ink`) only where a sage is identified. Text on
  a sage tint uses the sage `-ink` token.
- Keep every `data-testid`, every handler, every layout. Do not change data shapes.
- Spanish copy in tú, no em-dash, no English, no vendor/model/tool names (except reviewer-model
  selector options).

---

## Phase 1: Setup

- [x] T001 Create branch `003-monochrome-visual-system` from `main` after the spec 001 work in the
  working tree is committed or set aside (Gate decision). Done-check: `git branch --show-current`
  prints the branch and `git status --short` shows no spec 001 files.
- [ ] T002 Save a contrast audit script in the scratchpad that parses `@theme` in
  `src/app/globals.css` and prints each text/background pair from data-model.md with its WCAG
  ratio. Done-check: running it on the current file reproduces ink-3 4.22:1 and ink-4 2.36:1.

---

## Phase 2: Foundational, Slice 1 (blocks all other slices)

**Goal**: palette B tokens, type scale and primitives exist; the app runs with them.

- [ ] T003 Rewrite the `@theme` color block in `src/app/globals.css` with data-model.md values:
  paper `#F8F8F6`, paper-2 `#FDFDFC`, paper-3 `#EFEFEC`, paper-4 `#E4E4E0`, ink-1 `#18181B`,
  ink-2 `#3F3F46`, ink-3 `#52525B`, ink-4 `#A1A1AA`, rule-1 `#E4E4E0`, rule-2 `#DEDED9`, rule-3
  `#86868E`, accent `#18181B`, danger `#B91C1C`, em `#B45309`/`#FCEFE3`/`#7C2D12`, sis
  `#0F766E`/`#E0F2EF`/`#134E4A`, pra `#2F5FA6`/`#E4ECF7`/`#1E3A66`, cri `#6E4FA8`/`#ECE6F5`/`#3B2766`.
  Remove `seal`, `seal-soft`, `warn`, `ok`; keep `err` as an alias of danger only if a component
  still needs it during migration, and delete it in T027. Retint shadows to neutral
  `rgba(24,24,27,…)`. Update the header comment (no "Pergamino"). Done-check: T002 script shows
  every pair at least 4.5:1 (rule-3 at least 3:1).
- [ ] T004 Add the type scale to `@theme` in `src/app/globals.css` (`--text-meta: 12px` with
  line-height 16px, `--text-ui: 13px`/18, `--text-body: 14px`/21, `--text-lead: 16px`/24,
  `--text-title: 20px`/26, `--text-display: 28px`/32) so Tailwind exposes `text-meta` and the rest.
  Done-check: `npm run build` succeeds and a component using `text-meta` renders 12 px in dev tools.
- [ ] T005 In `src/app/globals.css`: point `.anno-emp/.anno-sis/.anno-pra/.anno-cri` tints at the new
  sage values (tint alpha 0.20, solid = sage token); remove the `.postit::before` tape rule; keep
  `@keyframes anno-flash` but tint it with `accent`. Done-check: an essay with marks shows four
  distinct underline colors and the Práctico mark is blue.
- [ ] T006 Apply the UI sans (Gate decision 2026-11-07: Geist) in `src/app/layout.tsx` and the `--font-sans`/
  `--font-mono` tokens: Geist + Geist Mono via `next/font/google` (recommended) or keep Inter.
  Newsreader stays loaded for the essay surface. Done-check: dev tools show the chosen family on
  the top bar and Newsreader on the essay body.
- [ ] T007 [P] Update `src/components/ui/Button.tsx`: primary/dark variant uses `bg-accent`
  `text-paper-2`; default variant neutral with `border-rule-3`; no seal; label `text-ui`.
  Done-check: R3 grep finds no seal in the file; buttons render ink and neutral.
- [ ] T008 [P] Update `src/components/ui/Badge.tsx`: states without seal/ok/warn (neutral text with
  weight; error uses `danger`), `text-meta` minimum, no decorative dot except a live-state dot.
  Done-check: R1 and R3 greps clean for the file.
- [ ] T009 [P] Update `src/components/ui/Avatar.tsx` and `src/components/ui/IconButton.tsx`: avatar
  initials at least `text-meta`, sage tint background with sage `-ink` text, no serif.
  Done-check: R1 grep clean; avatars legible at 100% zoom.

**Checkpoint**: `npm run lint && npx tsc --noEmit && npm run build` pass; app opens in
`npm run tauri:dev`.

---

## Phase 3: Slice 2, Editor surface (parallel with slices 3 to 5)

- [ ] T010 [P] [US1] `src/components/Topbar.tsx`: remove sage/seal used as action color (the
  Interrogar dot); Evaluar as the single primary (`bg-accent`), Interrogar default; all sizes from
  the scale; tooltips without em-dash ("Evaluar: revisión de todo el ensayo", "Español: el consejo
  escribe en español", "English: the council writes in English" stays as the EN option label only).
  Done-check: R1, R3, R6 greps clean for the file; one filled button visible in the top bar.
- [ ] T011 [P] [US2] `src/components/editor/EditorPane.tsx`, `TitleInput.tsx`, `SlashMenu.tsx`,
  `SelectionMenu.tsx`: sizes to the scale; SlashMenu and SelectionMenu labels in sans sentence case
  (no uppercase); TitleInput and editor content keep Newsreader. Done-check: R1, R2 greps clean for
  these files; slash menu readable.
- [ ] T012 [P] [US1] `src/components/editor/AnnotationPopover.tsx`: severity as text label
  ("Grave" ink-1 600 / "Media" ink-2 500 / "Menor" ink-3 400) without colored dot; section labels
  ("Reemplazar por") sentence case `text-meta`; sage name next to avatar in full ("Crítico"); no
  serif except the quoted replacement text, which may stay Newsreader as document text.
  Done-check: R1, R2, R3 greps clean; popover screenshot.
- [ ] T013 [P] [US4] `src/components/ReviewEvidenceDetails.tsx`: remove model identifiers
  ("Modelo: …", "Solicitado: …") from the visible text (FR-016); sizes to scale; verification
  states in neutral text, mismatch in `danger`. Done-check: R1 and R11 greps clean.

---

## Phase 4: Slice 3, Board (parallel)

- [ ] T014 [P] [US3] `src/components/canvas/note-shape.tsx`: delete the tape `<rect>` and tape
  `<div>`; replace inline `rgba(...)` tints and borders with CSS variables of the sage tokens;
  header "Empirista, pregunta" (author full name, kind) in sans `text-meta` sentence case; relative
  time in Spanish ("ahora", "hace 5 min"; no "just now"); note body keeps Newsreader. Done-check:
  board with notes from all four authors shows straight notes, no tape, readable headers.
- [ ] T015 [P] [US2] `src/components/canvas/NoteContextPanel.tsx`, `BoardToolbar.tsx`,
  `BoardPane.tsx`: sizes to scale, labels sentence case, counter text `text-meta` ink-3, no serif.
  Done-check: R1, R2, R5 greps clean for these files.

---

## Phase 5: Slice 4, Overlays (parallel)

- [ ] T016 [P] [US4] `src/components/lectura/LecturaOverlay.tsx`: heading "Interrogar un texto"
  (sans `text-title`, no em-dash); pane status via `phaseLabel` in Spanish ("En espera",
  "Escribiendo…", "Listo", "Error") with no dollar cost; sage descriptions and labels sentence case;
  sizes to scale. Done-check: R1, R2, R6, R7, R8 greps clean; council run shows Spanish statuses.
- [ ] T017 [P] [US1] `src/components/lectura/PlumaRojaOverlay.tsx`: replace `SEV_TONE` dots with the
  severity text labels of T012; header "Evaluar el ensayo" in sans `text-title` with the essay title
  as subtitle, remove the ✎ seal badge; pane `phaseLabel` without cost ("2 hallazgos"); remove model
  ids from pane text and "Última evaluación" line (keep them only in the reviewer selector options,
  FR-016); sizes to scale. Done-check: R1, R2, R3, R6, R8, R11 greps clean; Evaluar screenshot.
- [ ] T018 [P] [US2] `src/components/lectura/RubricaOverlay.tsx` and `FuentesOverlay.tsx`: titles in
  sans, sizes to scale, labels sentence case, copy in tú. Done-check: R1, R2, R5 greps clean.
- [ ] T019 [P] [US4] `src/components/lectura/HistoryOverlay.tsx`: sizes to scale, kind chips
  neutral (manual = weight 600, antes de restaurar = ink-3), "Elige una versión" instead of "Picá
  una versión", preview keeps Newsreader. Done-check: R1, R3, R9 greps clean.

---

## Phase 6: Slice 5, Benchmark and system (parallel)

- [ ] T020 [P] [US1] `src/components/Scorebar.tsx`: rings and numbers in neutral ink (no sage, no
  seal, no ok); weak criteria (< 8) emphasized by weight 600; stale pill reads "Desactualizado" in
  ink-2 with a dashed neutral ring (no `--color-em`); empty score shows "Sin evaluar" (no em-dash
  glyph); labels `text-meta` minimum, sentence case. Keep `data-testid="scorebar-stale"`.
  Done-check: R1, R2, R3, R4, R6 greps clean; case 4 screenshot.
- [ ] T021 [P] [US1] `src/components/BenchmarkDrilldown.tsx`: severity text labels as T012; sage
  name in full; sizes to scale; no em-dash. Done-check: R1, R3, R6 greps clean.
- [ ] T022 [P] [US3] `src/components/EssayList.tsx`: page title sans `text-display`; essay titles
  Newsreader; "Nuevo académico"/"Nuevo blog" same neutral style (remove serif italic A/B letters);
  primary "Crear primer ensayo" in accent; empty-state copy functional ("Escribe ensayos y recibe
  preguntas y revisiones de cuatro sabios."); meta `text-meta` ink-3 without 3 px dots.
  Done-check: R1, R3, R5 greps clean; list screenshot.
- [ ] T023 [P] [US4] `src/components/SidecarBanner.tsx` and `src/components/McpConnection.tsx`:
  banner hint without "Claude Code" ("Revisa la sección Requisitos del README."); connection strip
  labels without "MCP" ("Agente externo disponible", "Agente externo conectado", "Un agente está
  editando", "Agentes externos desactivados", "No responde la conexión con agentes", action
  "Conectar agente"/"Desconectar"); sizes `text-meta`. Done-check: R1 and R11 greps clean.
- [ ] T024 [P] [US4] `src-tauri/src/sidecar.rs`: user-facing strings in tú without vendor names
  ("Falta un componente que el consejo necesita. Revisa Requisitos en el README y vuelve a abrir la
  app."; "El consejo se cerró de forma inesperada. Vuelve a abrir la app."); move Node path and
  error detail into `log::warn!`. Done-check: `cargo check` in `src-tauri` passes; R6, R9, R11 hold
  for these strings.
- [ ] T025 [P] [US4] `README.md`: add a "Requisitos" section (Node 20+ install, Claude Code
  installed and logged in, `npm run sidecar:build`) that the banner refers to. Done-check: section
  exists and matches the banner text.

**Checkpoint**: each slice agent reports lint + typecheck green and its greps clean.

---

## Phase 7: Slice 6, Copy sweep, E2E and verification

- [ ] T026 Update assertion text only in `tests/e2e/sage.spec.ts`, `tests/e2e/fuentes.spec.ts`,
  `tests/e2e/language.spec.ts` (heading regex to "Interrogar un texto") and any other assertion that
  fails only because of a copy change made above. Done-check: `npm run test:e2e` green.
- [ ] T027 Repo-wide sweep against contracts/ui-rules.md R1 to R11 in `src/` and
  `src-tauri/src/`; remove the temporary `err` alias if unused; fix leftovers. Done-check: every
  grep in quickstart.md prints its "ok" line; `npm run lint`, `npx tsc --noEmit`, `npm run build`
  pass.
- [ ] T028 Run the five real cases of spec.md on the real Tauri window at 1440 × 900 and save
  screenshots as evidence. Done-check: five screenshots, each matching its acceptance scenario.
- [ ] T029 Independent review: reviewers that did not implement score every screen on the C.0
  rubric (Paper 01M6VXNCR0ZBA410S026XSG7JT); minimum 4 on Legibilidad, Color, Sin slop; failures go
  back to slices. Done-check: score table with all screens at least 4.
- [ ] T030 Update `CLAUDE.md` design section (palette B, scale, Newsreader scope) and the Paper
  design file tokens so docs match the shipped system. Done-check: CLAUDE.md no longer describes
  Pergamino as current.

---

## Dependencies & Execution Order

- T001 → T002 → Slice 1 (T003 to T009; T007 to T009 in parallel after T003 to T006).
- Slices 2 (T010 to T013), 3 (T014 to T015), 4 (T016 to T019), 5 (T020 to T025) depend only on
  Slice 1 and touch disjoint files: run as four parallel Sonnet agents, each in its own worktree.
- T012 defines the severity labels; T017 and T021 reuse the same wording (agents get the wording
  in their brief, so no ordering dependency).
- Slice 6 (T026 to T030) after all slices merge.

## Parallel Example

```text
Agent A (Slice 2): T010, T011, T012, T013
Agent B (Slice 3): T014, T015
Agent C (Slice 4): T016, T017, T018, T019
Agent D (Slice 5): T020, T021, T022, T023, T024, T025
```

## Implementation Strategy

MVP = Slice 1 + Slice 2: palette and scale with the editor surface already shows US1 and US2 on
the screen Noe uses most. Then the remaining slices in parallel, then the sweep and verification.
