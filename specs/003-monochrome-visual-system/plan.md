# Implementation Plan: Monochrome + Sages Visual System

**Branch**: `003-monochrome-visual-system` | **Date**: 2026-11-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/003-monochrome-visual-system/spec.md`

## Summary

Replace the Pergamino visual system with palette B («monocromo + sabios») at its source, the
`@theme` tokens in `src/app/globals.css`, add a type-scale and two semantic tokens (`accent`,
`danger`), then move every component off the arbitrary sizes, the retired `seal`/`warn`/`ok`
colors and the sage-as-state usages. Copy is cleaned in the same pass (em-dashes, English, vos,
dollar cost). Layouts, flows, shortcuts and data stay as they are.

## Root cause

The interface fails contrast and color meaning because the shared tokens carry failing values
(ink-3 4.22:1, ink-4 2.36:1, Práctico and seal the same red) and because there is no type scale,
so components hard-code 85 sizes below 12 px and reuse sage tokens for severity and staleness
(`SEV_TONE` in PlumaRojaOverlay, stale in Scorebar). Restyling screens one by one would leave the
tokens that produce these failures; the fix is to correct the tokens, give components a scale to
use, and retire the ambiguous tokens so the build no longer offers them.

**Smallest root fix**: new token values plus type scale, retire `seal`/`warn`/`ok`, migrate the
25 affected files, and a mechanical check (contracts/ui-rules.md) that fails loudly if a tiny
size or a retired color returns.

**Bigger redesign, separate proposals (not in this plan)**: list with evaluation status; regrouped
top bar with a settings menu; Evaluar as a side panel with a single list; Rúbrica/Fuentes/Historial
as one context side panel; score bar as ranked text; Settings window (⌘,). Each is its own spec.

## Technical Context

**Language/Version**: TypeScript 5 strict, React 19, Next.js 16 (static export), Rust (Tauri 2)

**Primary Dependencies**: Tailwind 4 (`@theme` tokens), TipTap 3, tldraw 5, `next/font/google`

**Storage**: JSON files per essay; unchanged

**Testing**: existing Playwright E2E (assertions on changed copy updated); no new unit tests

**Target Platform**: macOS desktop app (Tauri), window 1440 × 900, minimum 1200 × 760

**Project Type**: desktop app (single channel)

**Performance Goals**: no change; no new dependencies

**Constraints**: no data migration; every `data-testid` preserved; layouts unchanged

**Scale/Scope**: 25 files (24 under `src/`, 1 in `src-tauri/src/`), 85 tiny sizes, 33 uppercase,
14 em-dashes, 21 seal usages

## Constitution Check

| Principle | Status |
|---|---|
| I. Writer's work never lost | Pass: no data shape changes; marks render by class, tints by token |
| II. Reuse before building | Pass: same Tailwind tokens, TipTap marks and tldraw shape util |
| III. Boundaries in code | Not affected |
| IV. Monochrome + sages | This plan implements it |
| V. Done = Noe can use it | Pass: verification is the real app + independent review |

No violations; Complexity Tracking not needed.

## Must not break (invariants)

- Existing essays, annotations, notes, rubric, sources and history render without migration: marks
  keep their `anno-{sage}` classes and only the CSS values change; note meta (`author`, `kind`) is
  untouched.
- All `data-testid` attributes stay; E2E selectors keep working (only heading-text assertions in
  `sage`, `fuentes` and `language` specs change).
- Keyboard handlers (N, V, A, slash menu, menu accelerators) untouched.
- Sidecar status banner still appears on failure (copy changes only).

## Files touched, by layer

**Tokens and fonts**
- `src/app/globals.css`: new `@theme` values (data-model.md), add `accent`, `danger`, type scale,
  retire `seal`, `seal-soft`, `warn`, `ok`; `.anno-*` tints from the new sage values; remove
  `.postit::before` tape; shadows tinted neutral.
- `src/app/layout.tsx`: sans family (Gate A decision: Geist or keep Inter).

**UI primitives**
- `src/components/ui/Button.tsx`, `Badge.tsx`, `Avatar.tsx`, `IconButton.tsx`: primary variant
  uses `accent`; Badge states without seal/ok/warn; Avatar initials 12 px minimum.

**Editor surface**
- `Topbar.tsx`: sizes, remove seal/sage-as-action (Interrogar dot), tooltips without em-dash,
  sans-only chrome.
- `editor/EditorPane.tsx`, `TitleInput.tsx`, `SlashMenu.tsx`, `SelectionMenu.tsx`: sizes, labels.
- `editor/AnnotationPopover.tsx`, `ReviewEvidenceDetails.tsx`: severity as text, sentence-case
  labels, 12 px minimum.

**Board**
- `canvas/note-shape.tsx`: drop tape rect/div, tints from tokens, header "Empirista, pregunta" in
  12 px sans, Spanish relative time.
- `canvas/NoteContextPanel.tsx`, `BoardToolbar.tsx`, `BoardPane.tsx`: sizes, labels.

**Overlays**
- `lectura/LecturaOverlay.tsx`: title "Interrogar un texto", Spanish status, no cost, sizes.
- `lectura/PlumaRojaOverlay.tsx`: `SEV_TONE` replaced by text labels, sans title without em-dash
  or ✎ badge, no cost in pane status, sizes.
- `lectura/RubricaOverlay.tsx`, `FuentesOverlay.tsx`, `HistoryOverlay.tsx`: sizes, labels, tú.

**Benchmark and system**
- `Scorebar.tsx`, `BenchmarkDrilldown.tsx`: numbers in ink, rings neutral, "Desactualizado",
  sizes, no em-dash empty glyph ("Sin evaluar").
- `EssayList.tsx`, `SidecarBanner.tsx`, `McpConnection.tsx`: sizes, primary action in accent.
- `src-tauri/src/sidecar.rs`: user-facing error strings in tú and without vendor names
  ("Falta un componente que el consejo necesita; la guía está en el README"); the technical
  detail (Node path, error) goes to `log::warn!`.
- `SidecarBanner.tsx`: hint without "Claude Code". `McpConnection.tsx`: labels in plain words
  ("Agente externo conectado", "Conectar agente"). `ReviewEvidenceDetails.tsx` and
  `PlumaRojaOverlay.tsx`: model identifiers removed from pane text and evidence details (they
  stay in the reviewer selector, the FR-016 exception).
- `README.md`: a "Requisitos" section with the Node 20+ and Claude Code setup, which the
  banner points to.

**Tests**
- `tests/e2e/sage.spec.ts`, `fuentes.spec.ts`, `language.spec.ts`: heading regex to the new title.

## Channels

Single channel: the macOS desktop app. The Paper design file is updated afterwards so designs
match the shipped tokens (not part of the code change).

## Verification (end to end)

quickstart.md: mechanical checks after each slice (lint, typecheck, grep contract, E2E), a contrast
script over the final tokens, and the five real cases on the real Tauri window with screenshots.
Independent reviewers (not the implementers) score every screen on the C.0 rubric; minimum 4 on
Legibilidad, Color and Sin slop. Anything not seen working is reported as such.

## Delivery order (slices, each verifiable)

0. **Design in Paper first** (added 2026-11-07 at Noe's request): restyle every screen in the Paper
   file to palette B, review it independently, and get Noe's approval. Code slices implement the
   approved screens.
1. **Foundation**: tokens, fonts, UI primitives. App runs, primary buttons in ink, Práctico blue.
2. **Editor surface** (Topbar, editor, popover): case 1 partially passes.
3. **Board** (note-shape and panels): notes straight and legible.
4. **Overlays** (Interrogar, Evaluar, Rúbrica, Fuentes, Historial): cases 2, 3, 5.
5. **Benchmark and system** (Scorebar, drilldown, list, banners, Rust strings): cases 1, 4.
6. **Copy sweep and E2E update**, then full verification and independent review.

## Execution

Opus coordinates and reviews every diff. Implementation runs on Sonnet subagents
(`model: "sonnet"`). Slice 1 runs alone (everything depends on the tokens). Slices 2, 3, 4 and 5
touch disjoint files and run in parallel, each in its own worktree. Slice 6 runs last.

Prerequisite: the working tree on `main` holds uncommitted work from spec 001 (live MCP). That
work is committed or set aside before branch `003-monochrome-visual-system` is created, so the
two changes do not mix.

## Project Structure

### Documentation (this feature)

```text
specs/003-monochrome-visual-system/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/ui-rules.md
├── checklists/requirements.md
└── tasks.md            # next: /speckit-tasks
```

### Source Code

```text
src/app/            globals.css, layout.tsx
src/components/     Topbar, Scorebar, BenchmarkDrilldown, EssayList, SidecarBanner,
                    McpConnection, ReviewEvidenceDetails
src/components/ui/  Button, Badge, Avatar, IconButton
src/components/editor/   EditorPane, TitleInput, SlashMenu, SelectionMenu, AnnotationPopover
src/components/canvas/   note-shape, NoteContextPanel, BoardToolbar, BoardPane
src/components/lectura/  LecturaOverlay, PlumaRojaOverlay, RubricaOverlay, FuentesOverlay,
                         HistoryOverlay
src-tauri/src/      sidecar.rs (copy only)
tests/e2e/          sage, fuentes, language specs (assertion text only)
```

**Structure Decision**: existing single Next.js + Tauri app; no new directories in `src/`.
