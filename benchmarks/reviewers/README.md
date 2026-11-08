# Reviewer benchmark pilot

This is an exam for the reviewer, separate from the essay's annotation-derived
scorebar. The pilot contains **24 synthetic cases and 12 synthetic sources**,
split into 12 development and 12 holdout cases by source/document family. It
covers evidence use, citation fidelity, APA, calibration, useful voice and source
prompt injection. Spanish and English cases are included.

All answer keys are **draft AI-authored candidates**. No human adjudication or
model-quality measurement is claimed. The sources are transparent exercises,
not invented studies presented as real literature. APA cases link to official
rules for independent checking. A literal source match establishes only that a
passage exists; it does not establish that it supports the diagnosis.

## Offline preparation

Run from the repository root; these commands do not call models:

```sh
npm run sidecar:build
npm --prefix sidecar run eval:validate
npm --prefix sidecar run eval:dry-run -- --split development --profiles sonnet-5.5,opus-5.5
```

`runtime-baseline` preserves Claude Code's current default and has no assumed
price/model identity. The other profiles are unmeasured candidates, not proof of
account access or improved quality. The profile registry is
`sidecar/src/model-profiles.ts`; do not promote a default from this dry run.

The dry run captures exact production requests, prompt/source/case/corpus hashes,
SDK/parser identity, token allowances, timeouts and an estimated API-price
allowance. It uses the same prompt preparation as the app and excludes answer
keys from prompts. It writes a private `plan.json` and an **unapproved**
`approval-request.json` under ignored `runs/`. API-price estimates are not an
OAuth bill or a hard spending guarantee. UTF-8 input bytes are used as a
conservative allowance, not a provider tokenizer result.

An empty-run report is useful for checking the review packet without inventing
model output. Replace `/ABSOLUTE/plan.json` with the dry-run path:

```sh
npm --prefix sidecar run eval:score -- --plan /ABSOLUTE/plan.json
npm --prefix sidecar run eval:report -- --plan /ABSOLUTE/plan.json
```

The report must say zero observed outputs and `modelQualityMeasured: false`.
Missing and failed calls remain visible. No request retries or judge calls occur.

## Sources selected by Noe

No command scans a personal essay directory. To import one explicitly selected
essay JSON or a source-array export, run:

```sh
node sidecar/dist/eval/import-library.js --input /ABSOLUTE/selected-essay.json --family selected-document-family
```

The import writes a private source file under ignored `local/`; it does not
modify the sealed pilot, transmit text or infer bibliographic/page facts. Every
import is marked `privacy: "private"`. Curate a separate private corpus using
the same source/case/manifest format before evaluation. Public sources require
explicit provenance and reuse permission, not merely a public URL. Never commit
private full texts or output runs.

Source records require a stable ID, family, content hash, explicit privacy,
attribution, permitted use, capture date and honest section/paragraph locators.
Printed pages are deliberately unverified in this pilot. Case findings contain
exact UTF-16 essay/evidence ranges. `eval:validate` rejects duplicate IDs/drafts,
wrong hashes/spans and source-family overlap between development and holdout.
After reviewed edits, reseal `manifest.files.sourcesSha256` and
`manifest.files.casesSha256` with the SHA-256 of the exact UTF-8 files. Preserve
the previous manifest and record who changed it; do not silently reseal a run.

## Human answer-key and output calibration

Use [rubric.md](rubric.md). First check the draft key against the source and
official rule, allowing alternative legitimate diagnoses. A human records their
identity and decision before `answerKeyStatus` can become `adjudicated`.
Adjudicating keys changes the corpus hash: reseal it **before** preparing the
comparison manifest. Never adjust a key after seeing which model it favors.

Keep `blind-key.json` separate from `human-review-packet.json`. The latter aliases
candidate identity, varies order, shows sources and permits ties. Outputs can
still self-identify in prose, so human review must note any loss of blinding.
Use development cases for prompt work; reserve holdout cases for evaluation.
Once a holdout failure influences prompts it is a regression, and a new untouched
holdout must replace it before another comparative claim.

`eval:score --results /ABSOLUTE/results.json --adjudications /ABSOLUTE/judgments.json`
accepts independent adjudications with this shape (one per observed case/profile):

```json
{
  "caseId": "evidence-supported",
  "profileId": "sonnet-5.5",
  "status": "adjudicated",
  "adjudicator": "human identity",
  "annotationMatches": [],
  "missedExpectedFindingIds": []
}
```

The file itself is an array. Every output annotation requires a match with its
zero-based `annotationIndex`, `expectedFindingId` (or `null` for a false positive),
`support` (`supported`, `contradicted`, `not_addressed`, `unverifiable`), and
`useful`, `warrantedUncertainty`, `preservesVoice` scores from 1–5. All unmatched
expected finding IDs must be listed. No model is its own sole judge.

The scorer reports precision/recall only with adjudicated keys and judgments;
empty denominators stay `null`, not 100%. Literal evidence, parser failures,
missing/ambiguous essay anchors and provenance comparability are separate.
This pilot has no rubric-criterion fixtures, so any returned `criterioId` is
counted as unknown. Criterion-weight evaluation is deferred. There is no
blacklist, AI detector or word-count shortcut for judging voice.

## Consumption gate — not yet approved

No model calls are authorized by the implementation approval. Do not use
`--execute` until Noe approves the exact dry-run hash, cases/models/repetitions,
private-source inclusion and a nonzero total consumption budget.

A separately human-approved JSON file must contain `approved: true`, matching
`planSha256`, `approvedBy`, `approvedAt`, `maxCalls`, `maxBudgetUsd`, and
`privateSourcesApproved` when selected sources are private. These are explicit
local approval records, not cryptographic signatures. Agents must never create
a positive approval on Noe's behalf. No positive approval file ships here.

Execution is sequential through the same production runtime. It revalidates all
case inputs/profiles/prompts/sources and budgets before inference. An exclusive
`execution-claimed.json` beside the plan prevents replay/concurrent reuse of an
approval. A failure, unknown cost or exhausted headroom stops scheduling; no
automatic retry, API-key fallback or higher-priced fallback occurs. Cost metadata
may lag and SDK budgets can overrun. A new attempt needs a new reviewed plan and
approval, not deletion of the claim file.

Only a complete, comparable, independently adjudicated comparison can inform
promotion. Raw output counts, clean JSON and zero observed failures in this small
pilot do not establish general reliability.
