import { randomInt } from "node:crypto";
import { resolve } from "node:path";
import { arg, loadCorpus, writePrivate, DEFAULT_RUNS, cliError } from "./io.js";
import { validateCorpus } from "./validate.js";
import { readEvaluationInput, assess } from "./score.js";
async function main() {
  const input = await readEvaluationInput(); const corpus = await loadCorpus(input.plan.corpusDirectory); validateCorpus(corpus);
  const scored = assess(input, corpus);
  const profiles = [...new Set(input.plan.calls.map((c) => c.profileId))];
  // OS randomness determines aliases/order. The private key stays separate from
  // the packet; a human can reverse A/B order when assessing position bias.
  for (let i = profiles.length - 1; i > 0; i--) { const j = randomInt(i + 1); [profiles[i], profiles[j]] = [profiles[j], profiles[i]]; }
  const aliases = Object.fromEntries(profiles.map((profile, i) => [profile, `Candidate ${String.fromCharCode(65 + i)}`]));
  const selectedIds = [...new Set(input.plan.calls.map((c) => c.caseId))];
  const packet = selectedIds.map((id, index) => {
    const item = corpus.cases.find((c) => c.id === id)!;
    const outputs = input.records.filter((r) => r.caseId === id).map((r) => ({ candidate: aliases[r.profileId], status: r.status, rawOutput: r.rawOutput ?? null }));
    if (index % 2) outputs.reverse();
    return { caseId: id, language: item.language, pase: item.pase, draft: item.draft,
      sources: item.sourceIds.map((sourceId) => corpus.sources.find((s) => s.id === sourceId)), outputs,
      questions: ["Which diagnoses are justified by the supplied evidence?", "Are quotations, source identities and locators faithful?", "Does the comment explain a concrete problem and preserve the writer's voice?", "Is uncertainty warranted, and is correct text left alone?"],
      candidateAnswerKey: { status: item.answerKeyStatus, expectedFindings: item.expectedFindings, forbiddenCorrections: item.forbiddenCorrections, expectedBehavior: item.expectedBehavior, ruleReferences: item.ruleReferences },
      warning: "Candidate key is not human-adjudicated. Review source evidence first; do not treat generated labels as truth." };
  });
  const directory = resolve(arg("--out-dir") ?? DEFAULT_RUNS, input.plan.id);
  await writePrivate(resolve(directory, "human-review-packet.json"), { corpusHash: corpus.corpusHash, modelQualityMeasured: false, instructions: "Blind outputs. Calibrate draft answer keys against sources; independently adjudicate critical/disputed labels. Permit ties. Rate specificity, pedagogy, voice and uncertainty 1–5. No AI detector or banned-word grade.", cases: packet });
  await writePrivate(resolve(directory, "blind-key.json"), { aliases, note: "Keep this separate from the blinded human review packet." });
  await writePrivate(resolve(directory, "report.json"), { ...scored, answerKeys: { draft: corpus.cases.filter((c) => c.answerKeyStatus === "draft").length, adjudicated: corpus.cases.filter((c) => c.answerKeyStatus === "adjudicated").length }, recommendation: input.records.length ? "Await independent answer-key/output adjudication; do not promote a model from raw output counts." : "No model calls executed; reliability, citation accuracy and voice quality are unmeasured. Review the answer-key packet before authorizing a bounded comparison." });
  console.log(JSON.stringify({ reportDirectory: directory, plannedCases: packet.length, observedOutputs: input.records.length, modelQualityMeasured: false }));
}
main().catch(cliError);
