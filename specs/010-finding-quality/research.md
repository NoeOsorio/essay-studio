# Research: Finding Quality

## Group on read or merge on write
- Decision: group on read, derived from the document.
- Rationale: no migration; saved essays group too; reverting restores old behavior; each agent's diagnosis is kept.
- Alternatives: merge findings when a review lands (loses per-agent diagnoses, needs migration for old essays).

## Unit of grouping
- Decision: the sentence from `Intl.Segmenter`, the same unit `isSuppressed` uses.
- Alternatives: overlapping quotes (misses two quotes in one sentence), paragraph (too coarse).

## Score of a group
- Decision: highest severity once overall; per criterion, highest severity among that criterion's findings in the group.
- Rationale: one problem location costs once; criteria still see their own problem.
- Alternatives: sum with a cap (still double counts), average (hides an alta).

## Replacements for coherence and argument
- Decision: none.
- Rationale: their correct fix changes reasoning, so paste-ready text must invent; prompt-only rules failed in real runs.
- Alternatives: a second model call to check each replacement (cost, still probabilistic); word-overlap heuristic (band-aid).

## Name and number guard
- Decision: drop a replacement when it carries a number or a capitalized word that appears neither in the essay nor in the sources, ignoring the first word of a sentence.
- Rationale: extends the existing number guard to names, which is how invented authors and studies show up.
