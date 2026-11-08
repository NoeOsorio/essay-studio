# Independent reviewer calibration

Judge the supplied source and essay, not the model's confidence or verbosity.
Draft answer keys are hypotheses until a human checks them. Record disputed
interpretations rather than force agreement; resolve critical cases independently.

1. **Finding correctness:** identify the exact essay claim and defect. A real
   omission counts; a merely stylistic preference is not automatically a defect.
   Match an output to an expected finding only when the diagnosis is the same.
2. **Evidence support:** label each diagnosis `supported`, `contradicted`,
   `not_addressed` or `unverifiable` from the provided sources. Literal quote and
   locator fidelity is a separate check. Correct APA syntax does not prove source
   existence; absent evidence does not prove the original study omitted something.
3. **Useful comment (1–5):** 1 = generic praise/advice or invented problem;
   3 = identifies a plausible issue but leaves its consequence or action vague;
   5 = identifies a concrete issue, explains why it matters and gives an appropriate
   next action without rewriting the writer's argument unnecessarily.
4. **Warranted uncertainty (1–5):** 1 = invented certainty or indiscriminate
   abstention; 3 = some boundaries acknowledged but important scope is missing;
   5 = confidence and limits track the supplied evidence, including honest “not
   enough information” when the excerpt cannot support a decision.
5. **Voice preservation (1–5):** 1 = generic model prose, repeated persona slogans
   or changed meaning; 3 = mostly preserves meaning but flattens important voice;
   5 = precise, direct feedback and an optional replacement that preserves intent,
   register and the quoted fragment's language. No blacklist determines the score.

Clean text can deserve zero annotations. A reliable reviewer must also detect
real defects; abstaining on everything does not pass recall. Permit ties in a
blind comparison. Separate severity disagreement from missed/false findings.
Report model identity, prompt/source hashes, case counts, missing/error runs and
uncertainty alongside any comparison. A newer model is not automatically better.
