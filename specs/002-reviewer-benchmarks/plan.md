# Essay Studio — reviewer benchmarks and updatable models

Status: approved for implementation on 2026-11-07; Noe explicitly prohibited model runs. No inference or promotion is authorized.
Date: 2026-11-07. Linear: [NOE-545](https://linear.app/noeosorio/issue/NOE-545).
Repository: `/Users/noe/Dev/Tools/essay-studio`.

## User outcome and scope

Noe wants reviewers that evaluate essays against the available evidence, cite faithfully, recognize uncertainty and give precise feedback without generic AI prose. First create an exam that can expose failures; then compare and update models. A newer model is a candidate, not proof of improvement.

This is a separate feature from the approved live MCP. It preserves the four sages, the existing desktop workflow and Claude Code OAuth. First delivery is an offline corpus validator plus a bounded real-sidecar evaluation runner and model configuration. No new provider, API-key flow, fine-tuning, autonomous literature search or production essay bulk processing.

## What the current code establishes

1. `sidecar/src/sage.ts:122-148` builds one `Options` object for every sage/pass with no explicit `model` or effort setting. `settingSources: []` intentionally prevents user/project instruction leakage. A fixed tool denylist intends text-only operation, but `allowedTools: []` means no auto-approved tools, not “no tools”; validate an actual empty tool surface rather than relying on that comment. **The actual currently resolved model is unknown until a real run records it.** Do not infer that it is Sonnet or Opus from the app's name or documentation. The SDK documents an omitted model as the CLI default. [SDK reference](https://code.claude.com/docs/en/agent-sdk/typescript).
2. `sidecar/package.json:13-15` requests `@anthropic-ai/claude-agent-sdk: latest`; the checked lockfile currently resolves **0.2.141**. A clean `npm ci` is locked, but a later install/update can change the SDK unintentionally. Pinning the manifest to a reviewed version removes this ambiguity. Latest registry version was not established during this audit; no version upgrade is assumed safe.
3. `sidecar/src/sage.ts:175-200` returns aggregate usage/estimated cost but discards initialization model identity and per-model usage. Existing saved evaluation metadata does not establish which model/prompt produced feedback.
4. `src/lib/benchmark/score.ts:1-16,28-49` computes the essay's score from reviewer annotations. It cannot tell whether those annotations are correct. `tests/e2e/setup.ts:322-340` supplies canned annotations: those tests verify UI/protocol behavior, not real model judgment. Keep them, but do not call them a reviewer-quality benchmark.
5. `sidecar/src/sage.ts:283-298` places source names, optional references and full text into the prompt but omits stable source IDs and exact source locations. `src/lib/storage/types.ts:106-132` defines annotation `cita` as a highlighted fragment of the **essay**, not a bibliographic citation. The parser at `src/lib/agents/index.ts:279-324` checks basic output shape and sanitizes prefixes; it does not verify evidence support or reference existence.
6. `sidecar/src/sage.ts:265` tells the APA pass to require page numbers for quotations and reject page numbers in paraphrases. APA explicitly permits optional page/paragraph locators in paraphrases. Quotations from unpaginated sources can use a heading or paragraph number. These are prompt defects that can produce false corrections regardless of model. [APA paraphrases](https://apastyle.apa.org/style-grammar-guidelines/citations/paraphrasing), [APA unpaginated quotations](https://apastyle.apa.org/style-grammar-guidelines/citations/quotations/no-page-numbers).
7. `sidecar/src/sage.ts:321` asks for 3–8 annotations, while later instructions allow an empty result. The minimum-count pressure should be removed rather than rewarded by a benchmark. `prompts/el-empirista.md:9-20` also claims exhaustive literature knowledge and imposes rigid methodological judgments. These need evidence-bounded wording, not more confident roleplay.

No real reviewer inference was executed during this audit. These are source-code findings, not measured rates of hallucination or demonstrated model superiority.

## Smallest root fix

Use the same prompt builder, sidecar inference function and production parser for the app and the benchmark runner. Add stable source references and an evidence record to evidence-dependent findings; verify its literal location in the supplied source. Record the requested/resolved model and evaluation provenance. Fix the known APA and forced-count instructions. This makes evidence inspectable and the exam representative without introducing a second review engine.

An exact source quote proves the passage exists, not that it supports the judgment. Semantic support remains a separate gold-label/human-adjudication check. A syntactically correct APA reference proves neither that the paper exists nor that it supports the claim. Report those dimensions separately.

Bigger redesign, excluded: retrieval over an entire personal library, automated external DOI verification, a permanent model-ranking dashboard and adaptive multi-model routing. Add these only if the first exam shows that missing retrieval or model specialization is the real bottleneck.

## Corpus: a small exam with a defensible answer key

Start with **24 pilot cases**: six failure families, four contrasting examples per family. This size is a curation budget, not a statistically sufficient proof of reliability. Expand from real failures after the first comparison. Include correct text as well as flawed text so a reviewer can earn credit for leaving good work alone.

- **Evidence use:** supported statement, contradicted statement, correlation presented as causation, missing information. Distinguish “the supplied excerpt does not say” from “the study did not do.” Test numbers, scope, populations and qualification words.
- **Citation fidelity:** faithful quotation versus a one-word reversal; true reference used for an unsupported claim; wrong author/year/page; plausible but nonexistent DOI/reference. A supplied but unverified reference must stay “not verified,” not be certified from memory.
- **APA rules:** paraphrase with/without an optional locator (both valid), quotation with a real locator, unpaginated quotation with a section/paragraph locator, narrative versus parenthetical forms, and author disambiguation/secondary-source cases. Each answer points to the applicable official rule.
- **Calibration:** an answerable claim versus withheld source, conflicting sources, truncated excerpt and a clearly unsupported request for certainty. Explicit abstention can be correct; abstaining on everything fails recall/coverage.
- **Editing reliability:** exact essay anchor, ambiguous duplicate text, tiny punctuation defects that do not fit a 4–25-word anchor, preserved meaning, cross-language quotations and replacements, and no replacement when a safe replacement cannot be justified.
- **Useful voice:** a concrete diagnosis and actionable suggestion versus generic praise, invented defects, repeated persona catchphrases, empty “deepen this” advice and long feedback without a clear claim. Include a good passage where zero annotations is the correct answer. Source text containing “ignore instructions” must remain reference data.

Cross-cut Spanish/English and the four sages' intended domains through the cases; do not multiply every case by every sage/pass. Each case declares the relevant production pass so costs and attribution remain clear.

### Sources and provenance

No existing gold reviewer corpus was found in the repository. Current source tests use synthetic content. Do not present it as expert-labeled scientific evidence.

Begin with transparent synthetic numerical/methodological examples and short, legally usable primary-source excerpts for citation rules. Then add sources from **one essay Noe selects in the app**, using the already stored library rather than requesting uploads. Do not scan every personal essay or commit copyrighted full texts. Imported private sources stay in a gitignored local corpus; commit only safe case manifests/hashes and permitted excerpts. Model execution sends case text to Anthropic through the existing authorized sidecar, so private-case inclusion is explicit in the run manifest.

Each source record contains stable `sourceId`, bibliographic metadata, original URL/file identity, access date, edition/version, license or permitted-use status, content hash, normalized excerpt, printed-page label when verified, and section/paragraph/character locators. Never turn PDF viewer page indices or text offsets into invented printed pages. If pagination was lost in `.txt`, use an honest text locator or mark the page unverified.

Each case contains draft text, language, sage/pass, provided source IDs, rubric if relevant, expected findings with essay spans and evidence spans, valid alternative interpretations, explicitly forbidden corrections, severity rationale, and an `answerKeyStatus` of draft/reviewed/adjudicated. AI-generated cases/labels remain draft until independently checked against the source. Do not claim human validation that has not happened.

Split development and sealed holdout **by source/document family**, not random paraphrase rows. Related excerpts, translations and synthetic perturbations stay together. Curate both halves to cover the failure families. Only development cases may influence prompts; a holdout failure becomes a future regression after a new sealed holdout is reserved. Keep answer keys out of model prompts and runtime bundles. Store human review notes with provenance; model-as-judge agreement is not an independent gold label.

## Measurement and release decisions

Keep separate, inspectable results instead of one flattering score.

1. **Contract:** raw output validity, parser drop count, exact essay-anchor location, unknown criterion/source IDs, source quote/location matches and replacement language/meaning checks. Assess raw output before sanitation as well as applied output, so repairs cannot hide model failures.
2. **Finding precision/recall:** match findings against adjudicated defects (including acceptable alternative spans), deduplicate repeated diagnoses, count unnecessary corrections on clean text, and report severity errors. Keep invalid/empty/error runs in the denominator. Lack of a supported answer is not a model failure when abstention is expected.
3. **Evidence support:** for each factual diagnosis/replacement, label supported, contradicted, not addressed or unverifiable from supplied evidence. Report citation correctness and completeness separately: a model that makes no claims has undefined precision, not a perfect score. The separation of correctness, citation quality and fluency follows the design lesson of [ALCE](https://arxiv.org/abs/2305.14627); this custom writing-review exam is not itself ALCE.
4. **Citation/reference quality:** literal quote fidelity, verified source identity, accurate locator, author/year consistency and APA formatting are distinct measures. Do not let clean formatting compensate for invented evidence. A “not enough source material” warning is not itself a fabricated-citation finding.
5. **Calibration and voice:** a blinded reviewer rates specificity, pedagogical usefulness, author-voice preservation and warranted uncertainty with anchored examples. No word blacklist, AI-text detector, forced brevity count or punctuation heuristic determines “AI slop.” Report overconfidence separately from verbosity.
6. **Operational:** success/error rate, latency, input/output/thinking/cache usage when available, estimated cost and run completeness. A timeout/budget stop is an incomplete case, not a clean essay.

For subjective/semantic checks, use an independent calibrated judge only as assistance; Noe or a designated human adjudicates disputed and critical cases. Randomize candidate identity and order, swap A/B order on reviewed pairs, permit ties, and show sources to the judge. A candidate cannot be its own sole judge. [MT-Bench's original evaluation](https://arxiv.org/abs/2306.05685) documents position, verbosity and self-preference limitations, which motivate these controls.

Pilot acceptance: all deterministic contract checks pass; **zero invented source quotations, sources or verified page claims in the sealed critical cases**; no regression on accepted correct-text cases or critical citation/evidence behavior; and the candidate improves paired usefulness without worse evidence accuracy. Publish counts and uncertainty by case/source family. Treat zero observed critical failures as a gate on this finite exam, never a guarantee. Set wider percentage targets after the baseline and independent answer-key calibration, before tuning candidates; do not invent a universal “90% reliable” threshold from this small pilot. If comparisons are tied or inconclusive, keep the current pinned model and expand the exam.

## Model updates: explicit and reversible

One validated profile registry maps sage/pass to full model IDs and supported effort settings, with one default and sparse overrides. Both benchmark runner and production read it. Reject unknown/unavailable models and unsupported effort values before a run; no silent fallback. Discovery can use `supportedModels()` and record resolution metadata, subject to installed-SDK capabilities. [SDK reference](https://code.claude.com/docs/en/agent-sdk/typescript).

Current candidate IDs documented by Anthropic include `claude-sonnet-5-5` and `claude-opus-5-5`; **their availability in Noe's OAuth account is not established**. Start with those two plus the recorded current baseline only if access preflight succeeds. Use one model for all passes initially; add per-pass specialization only when results justify it. Full model IDs pin a release while convenience names such as `sonnet` move; serving behavior can still change. [Model IDs and versioning](https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions), [Claude Code model configuration](https://code.claude.com/docs/en/model-config).

Record requested and actual model IDs, fallback/refusal events, provider/auth mode, SDK/CLI versions, effort/thinking settings, prompt hashes, source/case/corpus hashes, parser version, timestamp and run ID. Unrecognized provenance invalidates a comparison; do not silently compare different prompts, source truncation or settings. Preserve OAuth and the no-inherited-settings fence; enforce text-only operation using the installed SDK's empty tool configuration and verify initialization reports no executable tools. An enumerated denylist must not let future tools bypass this boundary. Update the SDK only if required for a verified capability, pin the reviewed release, inspect lifecycle scripts and run compatibility checks; newer docs are not proof that installed 0.2.141 supports every new field.

Expose a compact reviewer profile selector for future requests and show the actual model used in evaluation details. An in-flight review finishes with its captured configuration; a profile change does not silently reinterpret old annotations. Saved older annotations remain readable with “model not recorded.” Keep model-quality results separate from the essay's scorebar.

## Budget and approval

Building the harness, validating cases and producing a dry-run manifest need no paid model calls. **No inference run or paid judge is authorized by this plan alone.** Before the first real run, present exact cases/models/repetitions, estimated token ceilings, private-source inclusion and a total consumption budget for Noe to approve.

For scale only, official API list rates checked today are Sonnet 5.5 **$2 input / $10 output per million tokens**, and Opus 5.5 **$4 / $20**. A 24-case, two-model, one-pass comparison bounded to 6,000 input and 2,000 billable output tokens per case is approximately **$2.30** before judge calls, cache effects, retries or overruns. These are planning estimates, not an authorized run or OAuth bill. [Official pricing](https://platform.claude.com/docs/en/about-claude/pricing).

OAuth SDK use currently draws on subscription limits; linked Console API-key use is different. Existing app claims about automatic “monthly Agent SDK credit” should be corrected to match the chosen auth mode. [Anthropic subscription guidance](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan).

The runner requires an explicit nonzero approved budget and a dry-run confirmation artifact, launches sequentially at first, accounts for failed calls and stops before scheduling more when remaining headroom is insufficient. Use timeout/cancellation and per-query budget support, but do not advertise `maxBudgetUsd` as a hard billing cap: SDK cost accounting is an estimate and may overrun or lag. If reliable cost metadata is unavailable, stop or use a separately approved call/token quota. Never fall back to a billable API key or a higher-priced model automatically. [SDK cost tracking](https://code.claude.com/docs/en/agent-sdk/cost-tracking).

## Files and delivery slices

**Slice 1 — corpus and dry-run:** add `benchmarks/reviewers/README.md`, `schema.ts`, `corpus/{sources,cases,manifest}.json` for permitted fixtures, `rubric.md`, and gitignored `local/` + `runs/`. Add `sidecar/src/eval/{validate,run,score,report}.ts`; scripts in `sidecar/package.json`; root forwarding commands only if useful. `validate` checks provenance, splits and span fidelity without calling a model. `run --dry-run` produces the exact planned calls and budget, with no inference. No new unit tests.

**Slice 2 — shared production path and evidence:** extract prompt construction/inference from `sidecar/src/sage.ts` into `sidecar/src/{prompts,runner}.ts`; add `model-profiles.ts` plus a reviewed configuration file. Fix APA/forced-count instructions and evidence-bounded persona wording in `prompts/el-*.md` while preserving each sage's lens. Include source IDs/locators in prompt material. Add backward-compatible `evidence` entries to findings (source ID, literal supporting span, locator, relation) and provenance to completion events. Update `src/lib/agents/index.ts`, `src/lib/storage/types.ts`, `src/components/editor/extensions/Annotation.ts`, `AnnotationPopover.tsx`, `PlumaRojaOverlay.tsx`, and the store's review-metadata action only where needed to preserve/read these fields. Verify native persistence preserves additional annotation data; update Rust types only if its actual serialization requires it. Invalid evidence must be flagged/not accepted as verified, not silently erased to improve scores.

**Slice 3 — model selection:** update sidecar request types and `src-tauri/src/sidecar.rs` forwarding; expose profile status/selection in `src/components/lectura/PlumaRojaOverlay.tsx` or a small shared reviewer-settings component, with `src/lib/store.ts` state/persistence and native menu only if the final placement requires it. Validate settings through the same profile registry, and carry captured actual-model identity through streaming completion/history. Pin SDK manifest/lockfile after compatibility review. Update `README.md`, `AGENTS.md`, `CLAUDE.md` and `specs/002-reviewer-benchmarks/` with approved artifacts and honest auth/cost semantics. Do not touch current MCP files for this feature.

**Slice 4 — approved comparison and native evidence:** run current baseline on the sealed manifest, then compare Sonnet/Opus candidates with identical inputs. First compare models with the same prompt; then evaluate prompt repairs separately so attribution is clear. Repeat only borderline/variable cases under an approved additional-call budget; never retain only the best sample. Replay three concrete cases in the actual Tauri app: (a) a correct paraphrase with a page locator receives no APA correction; (b) a draft contradicting a supplied source gets an evidence-linked diagnosis; (c) missing evidence produces an honest limitation, not an invented reference. Apply a replacement and verify anchoring, preserved meaning and persistence. Confirm switching a profile affects new reviews and old annotations keep their provenance. Independent review covers evidence correctness and useful voice. Existing E2E suite/typecheck/build/sidecar build remain required regression checks, but do not replace these runs.

No production default changes until these results pass and Noe approves the model promotion. Keep the prior profile available for rollback. First supported channel is the local desktop app and its real Node sidecar; no claim of mobile/cloud coverage.

## Decisions requested

1. Approve this benchmark/evidence/model-configuration scope, with no inference spending yet.
2. Then approve a concrete bounded first comparison, once the validated corpus and dry-run estimate exist. Recommended: Sonnet 5.5 versus Opus 5.5 and recorded baseline if available, with one captured configuration per run.

Human answer-key calibration is essential but no action is requested before a concrete small review packet exists. Where real source selection or adjudication requires Noe, record the exact short task under `Ask Human` in Linear. Opus/Sonnet agent execution requirements in feature-flow remain subject to the session's already disclosed availability limits; do not mislabel available agents as those models.
