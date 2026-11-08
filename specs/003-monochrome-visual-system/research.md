# Research: Monochrome + Sages Visual System

## R1. Where the problems come from (root cause)

- Decision: fix the shared design tokens and the per-component styling that bypasses them, not
  individual screens.
- Rationale: measured on 2026-11-07 in `src/`:
  - `src/app/globals.css` `@theme` defines `ink-3 #7B7261` (4.22:1 on paper) and `ink-4 #A89E89`
    (2.36:1), used as text 101 and 4 times.
  - There is no type-scale token. Components use arbitrary sizes, 85 of them below 12 px
    (`text-[9px]` ×15, `text-[9.5px]` ×6, `text-[10px]` ×28, `text-[10.5px]` ×6, `text-[11px]`
    ×27, `text-[11.5px]` ×3) across 20 files.
  - Sage tokens double as state colors: `PlumaRojaOverlay.tsx` `SEV_TONE` maps alta/media/baja to
    `bg-seal`/`bg-em`/`bg-sis`; `Scorebar.tsx` paints stale with `--color-em`.
  - `--color-pra #B14B36` and `--color-seal #B23A2A` are visually the same red.
  - 33 `uppercase` utilities, 16 files with `font-serif`, 14 visible em-dashes in strings.
- Alternatives considered: restyling screen by screen (rejected: leaves the token values that
  produce the failures, so new components would repeat them).

## R2. Token naming strategy

- Decision: keep the existing token names where the meaning is unchanged (`ink-1..3`, `rule-*`,
  `em`, `sis`, `pra`, `cri`, `*-bg`, `*-ink`) and change their values; rename `paper*` usage only
  through value changes; add new semantic tokens `accent` (primary action, ink), `danger`
  (system errors and destructive), and a type scale (`text-meta` 12, `text-ui` 13, `text-body`
  14, `text-lead` 16, `text-title` 20, `text-display` 28). `seal` is retired: each of its 21
  usages is remapped by meaning to `accent`, `danger` or neutral.
- Rationale: changing values instead of names keeps the diff small and avoids touching the ~100
  correct usages; retiring `seal` is required because it carries three meanings.
- Alternatives considered: full rename to a new namespace (rejected: large churn, no user benefit).

## R3. Sans family

- Decision: pending Noe at Gate A. Recommendation: Geist (UI) + Geist Mono (numbers only).
- Rationale: the critique and the design-taste skill flag Inter as the default "AI" sans; Geist
  is free, loads through `next/font/google` like today, and was used on the critique artboards.
  Cost of switching is one file (`src/app/layout.tsx`) plus the `--font-sans`/`--font-mono` tokens.
- Alternatives considered: keep Inter (zero risk, keeps the default look).

## R4. Board notes (tldraw)

- Decision: in `note-shape.tsx`, drop the tape rect and tape div, read tints from CSS variables
  instead of inline `rgba(...)` literals, header in sentence case at 12 px.
- Rationale: inline literals bypass the tokens, so the palette change would not reach notes.
- Alternatives considered: keep tape as brand detail (rejected: decorative, critique C.2).

## R5. Copy changes that existing end-to-end tests assert

- Decision: update the assertions in place to the new strings; do not add tests.
- Evidence: `tests/e2e/sage.spec.ts`, `fuentes.spec.ts`, `language.spec.ts` assert the heading
  "Interrogatorio — el consejo"; `benchmark.spec.ts` uses `data-testid="scorebar-stale"` (kept).
- Rationale: constitution principle V (no new unit tests; suites are not deleted).

## R6. Where Rust emits user-visible copy

- Decision: the sidecar-down messages in `src-tauri/src/sidecar.rs` use vos ("Instalalo",
  "reabrí", "Reiniciá"); rewrite to tú. Menu labels in `menu.rs` are already compliant.
