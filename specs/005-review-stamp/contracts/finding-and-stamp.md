# Contract: Finding card, stamp and derive function

Spec 007 reuses `deriveFindings`, `openForScore` and `Stamp`. `Popover` props are in spec 004's `contracts/primitives.md`.

## `deriveFindings`

```ts
type SlimRecord = Pick<FindingRecord, "id" | "sage" | "pase" | "severidad" | "criterioId" | "status"> & Partial<FindingRecord>;
function deriveFindings(content: JSONContent, records: SlimRecord[] | undefined): FindingView[];
function openForScore(views: FindingView[]): AppliedAnotacion[];
function reachableScore(args: ComputeBenchmarkArgs, addPases: Pase[]): number | null;
```

Pure. No React, store or Tauri imports. Every surface reads findings through it.

## `<Finding>`

```ts
type FindingProps = {
  finding: FindingView;
  surface: "popover" | "panel" | "criterion"; // layout only: panel shows the quote, popover and criterion do not
};
```

Renders agent (via `agent-identity`), criterion or pass label, importance, explanation, proposed text with Copiar and Usar este texto, source, Ya lo resolví and No aplica. Calls `src/lib/review/actions.ts` itself, so no surface re-implements an action. The root carries `data-testid="finding"`. It is the only component that renders a finding (FR-005).

A not located finding shows the phrase and no selection behavior. A finding with `spansBlocks` shows the phrase in place of Usar este texto; Copiar remains.

## `<Stamp>` and `<ScoreStamp>`

`Stamp({ result, size })` is presentational: a `computeBenchmark` result in, the stamp out, at `toolbar` or `card` size. It reads no store and carries no `scorebar` testid. Spec 007 uses it.

`ScoreStamp` takes no props, reads the open essay, renders `Stamp` plus the states below, and is the only component with the `scorebar`, `scorebar-overall` and `scorebar-stale` testids. `ReportCard` rows keep `scorebar-criterio-<id>`.

| State | Condition | Shows |
|---|---|---|
| none | never reviewed, no findings, no run | nothing |
| score | `overall` is a number | number; `10` with no decimal, otherwise one decimal |
| out of date | `isStale` | number with the out-of-date treatment |
| running | run active for this essay | running treatment, also on a first review |
| no number | findings exist, `overall` is null | variant from slice 0 |

Opens `ReportCard`; while running it opens `ReviewPanel`.

## Actions

```ts
resolveFinding(id): void;
reopenFinding(id): void;
markNotApplicable(id): void;
useReplacement(id): { ok: true } | { ok: false; reason: "spans_blocks" | "not_located" };
copyReplacement(id): Promise<void>;
revealFinding(id): void;
startReview(pases: Pase[]): void;
cancelReview(): void;
```

Order inside each mutating action: mark 004's last-pointer record as `document`, TipTap command, then read the store fresh, then write the record, then flush.
