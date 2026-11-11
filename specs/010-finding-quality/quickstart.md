# Quickstart: Finding Quality

Every run uses `ESSAY_STUDIO_DATA_DIR` inside the session scratchpad and test essays only.

1. Stub review where three passes flag one sentence: Correcciones shows one card with three parts; the report card score counts it once.
2. Resolve that card: all three findings close; reopen from Resueltas brings all three back.
3. Open an essay reviewed before this change: findings show grouped, nothing lost.
4. Real review, about 8 calls, on two test essays (one with rubric): no sentence has two cards; no replacement on Coherencia or Argumento; every replacement starts with the case of its quote and adds no name or number absent from essay and sources.
5. Independent reviewer grades usefulness of those outputs, minimum 4 of 5.
6. lint, tsc, build, full E2E with score.spec.ts unedited.
