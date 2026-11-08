<!--
Sync Impact Report
- Version change: 1.0.0 (unversioned paragraph, ratified 2026-11-07) → 2.0.0
- Bump rationale: MAJOR. The "Preserve Pergamino" visual rule is redefined, replaced by the
  "Monochrome + sages" visual system Noe chose on 2026-11-07 (palette B). Other rules are kept
  verbatim in meaning and only restructured into the template headings.
- Modified principles: "Preserve Pergamino" → "IV. Monochrome + Sages Visual System"
- Added sections: none in substance; existing rules grouped under template headings
- Removed sections: none
- Templates requiring updates: none (plan/spec/tasks templates read this file at runtime)
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

### IV. Monochrome + Sages Visual System

The interface is neutral monochrome: canvas `#F8F8F6`, surface `#FDFDFC`, text `#18181B`,
secondary `#52525B`, tertiary `#71717A`, primary actions in ink. Color MUST mean exactly one
thing, which sage is speaking: Empirista `#B45309`, Sistémico `#0F766E`, Práctico `#2F5FA6`,
Crítico `#6E4FA8`. Red `#B91C1C` is reserved for system errors. Severity, staleness and other
states MUST be shown with text and weight, never with a sage color. Newsreader is used only on the
essay writing surface; all UI chrome uses one sans family. UI text MUST NOT be smaller than 12 px
and MUST pass WCAG AA (4.5:1). No em-dashes in UI copy, no decorative uppercase tracked labels,
one voice (tú) in Spanish copy.

Rationale: the critique of 2026-11-07 measured contrast failures (2.36:1, 4.22:1) and color
collisions (Práctico vs seal 1.11:1, stale and severity reusing sage colors).

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

**Version**: 2.0.0 | **Ratified**: 2026-11-07 | **Last Amended**: 2026-11-07
