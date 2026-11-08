# Reviewer benchmarks and model profiles

Approved by Noe on 2026-11-07: “Sí, implementa sin corridas de modelos”.
Linear: NOE-545. Model execution and default promotion are not approved.

## Acceptance

The app and harness share production prompt preparation, inference configuration
and annotation parsing. Sources have stable identities; literal evidence spans
are checked and distinct from semantic support. Profiles are versioned and old
annotations remain readable with unknown model identity when not recorded.

The pilot corpus has 24 transparent synthetic cases across six failure families,
12 development and 12 holdout cases grouped by source family. Candidate answer
keys remain draft until independent human adjudication. Offline validation and
dry-run produce exact private manifests without calling models. Empty/error runs
cannot fabricate model-quality scores. Execution requires separate positive
human approval of the exact manifest, privacy inclusion and consumption budget.

## Limits

No inference was authorized. No claims of measured citation accuracy, model
superiority or reliable OAuth access may be made from compile/dry-run checks.
No API-key fallback, personal-library scan, remote deployment, fine-tuning or new
provider. Corpus real-source expansion uses one explicitly selected library.
