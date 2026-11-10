<!--
Sync Impact Report
- Version change: 2.0.0 -> 3.0.0
- Bump rationale: MAJOR. Noe rejected "Monochrome + Sages" (palette B, 82 Paper comments) on
  2026-11-08 and approved the Paper redesign v3 ("R" screens). Principle IV is redefined.
- Modified principles: "IV. Monochrome + Sages Visual System" -> "IV. Stationery Desk Visual System"
- Added sections: none
- Removed sections: none
- Templates requiring updates: none (plan/spec/tasks templates read this file at runtime)
- Superseded: specs/003-monochrome-visual-system (its Paper phase is the historical record)
- Deferred TODOs: none
-->

# Essay Studio Constitution

## Core Principles

### I. The Writer's Work Is Never Lost

Writing, annotation marks, sources, rubric and board metadata MUST be preserved across every
change. The live editor is authoritative; concurrent work MUST NOT be silently overwritten.
Edits MUST be visible, undoable and saved before durable success is reported.

### II. Reuse Before Building

TipTap, tldraw and the existing JSON storage MUST be reused instead of parallel systems.
TypeScript strict stays on; `any` is forbidden. The OAuth sage architecture (Node sidecar with the
Claude Agent SDK, no API key in the app) is kept.

### III. Boundaries Live in Code

Local tool boundaries MUST be enforced in code, never through model promises. No tool may offer
arbitrary execution, credential access or file access.

### IV. Stationery Desk Visual System

Paper is the visual source of truth: UI redesigns MUST be designed and approved in Paper before code.
The approved design is the "R" artboards of the Essay Studio Paper file.

The interface is a warm desk: paper `#FAF8F3`, white sheet `#FFFFFF`, shade `#F1EEE6`, dotted board
`#F4F1E8` with dots `#CFC8B6`, ink `#1D1B18`, `#4A463F` and `#6B665C`. Four agents each own a note
color, an ink and a dot: Evidencia `#FFE08A`/`#6E4600`/`#E8B421`, Sistemas
`#BDEBD6`/`#0D5E46`/`#2FA57C`, Práctica `#CADDFF`/`#234A9C`/`#4C7EE0`, Objeciones
`#E3D5FF`/`#563397`/`#9670E0`; the writer's notes are `#FFFDF8`. Color MUST mean only which agent.
Red `#B42318` is reserved for system errors; review MUST never be red. Sticky notes MUST carry
translucent tape and a slight tilt. The dotted board belongs to sticky notes only: review and
corrections MUST NOT use it as their surface.

Geist is used for all UI, Geist Mono only for numbers that align, Newsreader only for essay text,
essay titles and note text. UI text MUST NOT be smaller than 12 px and MUST pass WCAG AA (4.5:1).

Copy uses plain words and one voice (tú), with no em-dashes and no uppercase tracked labels. The
middle dot «·» MUST NEVER separate words anywhere (UI, designs, layer and artboard names, docs,
specs, commits); any use violates Noe's explicit authority. These are binding: no decorative
numbering, no cartoon titles ("El X"), no accent bars on the left, no repeated information on one
screen, keyboard shortcuts only in tooltips (the native menu is the exception), no useless counters,
no nested boxes, surfaces and spacing instead of hairline dividers, one primary action per surface,
and a check mark means only that a whole card is done. Every list MUST be designed for 1000 items.

Motion follows the storyboards in Paper (index: R7.3): enter with `cubic-bezier(0.23,1,0.32,1)` in
under 320 ms, press at scale 0.97, never from `scale(0)`, no animation on keyboard-triggered
actions, and reduced motion is honored.

Internal persisted ids (`em`, `sis`, `pra`, `cri`, `tu`, pass values, note kinds) MUST stay stable so
existing essays keep working; only their labels change.

Rationale: Noe's review of 2026-11-08 («parece velorio», «documento chafa de secundaria en word»)
and his approval of the R screens («me gusta como esta yendo el proceso»).

### V. Done Means Noe Can Use It

Plans are approved by Noe before any code. Verification is the real desktop app exercised the way
Noe uses it, graded by independent reviewers. No new unit tests are written; existing suites are
not the definition of done.

## Execution Constraints

Opus writes specs and plans; implementation runs on Sonnet subagents. Where the skill's named
models are unavailable, available Codex agents may be used, as approved by Noe.

## Development Workflow

Every feature or fix runs through Spec Kit (specify → clarify → plan → tasks → analyze →
implement) via the feature-flow skill. A plan that changes materially during implementation goes
back to Noe.

## Governance

This constitution supersedes other practices in this repo. Amendments require Noe's explicit
approval, a version bump (semantic: MAJOR for redefined or removed principles, MINOR for added
ones, PATCH for wording) and an updated Sync Impact Report. Every `/speckit-analyze` run checks
plans and tasks against these principles.

**Version**: 3.0.0 | **Ratified**: 2026-11-07 | **Last Amended**: 2026-11-08
