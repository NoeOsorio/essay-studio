# Feature Specification: Finding Quality

**Feature Branch**: `004-stationery-redesign` (follows the series 004 to 008)

**Created**: 2026-11-10

**Status**: Draft

**Input**: After the redesign, 18 real reviewer calls on a test essay and an independent grade gave the usefulness of the corrections 3 of 5, below the minimum of 4. The same sentence is flagged by two or three passes and each one subtracts from the score (a passable test essay scored 3.0, Argumentación 0.0); ready-to-paste text for coherence and argument findings adds ideas the writer never wrote or breaks the sentence; one correction asserted a false fact from memory.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One problem, one card (Priority: P1)

Noe reviews an essay. When several agents point at the same sentence, he sees one card for that sentence with each agent's view inside it, and the score counts that sentence once.

**Why this priority**: Duplicate cards are noise, and they make the score punish one sentence two or three times.

**Independent Test**: Review a test essay where two or more passes flag the same sentence; open Correcciones and the report card.

**Acceptance Scenarios**:

1. **Given** two or more findings whose quotes fall in the same sentence, **When** Correcciones shows them, **Then** they appear as one card for that sentence, each agent's diagnosis inside it, and no sentence has more than one card.
2. **Given** such a sentence, **When** the score is computed, **Then** it subtracts once, at the most severe level among its findings, and per criterion at most once for that sentence.
3. **Given** he marks the card resolved or not applicable, **When** he does it, **Then** all its findings take that state together, and unchecking reopens them together.
4. **Given** essays reviewed before this change, **When** they open, **Then** their findings show grouped with no loss and no migration.

---

### User Story 2 - Text to paste only when it is safe (Priority: P1)

Usar este texto appears only for fixes of wording or citation format, never for coherence or argument findings. What it inserts reads as a correct sentence in place, with the same capitalization at the start, and says nothing the writer did not say.

**Why this priority**: Pasting an idea the writer never had into an academic essay is worse than no suggestion.

**Independent Test**: Run a real review on test essays and read every replacement offered.

**Acceptance Scenarios**:

1. **Given** a coherence or argument finding, **When** its card shows, **Then** there is no Usar este texto, only the diagnosis.
2. **Given** a style or citation-format finding with a replacement, **When** its quote begins a sentence, **Then** the replacement begins with a capital letter, and the reverse when it does not.
3. **Given** a replacement that carries a number, name or year absent from the essay and its sources, **When** the review lands, **Then** the replacement is dropped and the diagnosis stays.

---

### User Story 3 - No corrections from memory (Priority: P2)

A correction never tells him a fact in his essay is false unless the essay or his sources show it.

**Why this priority**: A false correction teaches him something wrong with the app's authority.

**Independent Test**: Real review of a test essay that cites a known study correctly, with no source attached for it.

**Acceptance Scenarios**:

1. **Given** a fact in the essay not covered by his sources, **When** an agent comments on it, **Then** the card says it could not be verified with his sources and asks him to check the original, never that it is false.

### Edge Cases

- Findings in the same sentence from the same pass: also one card.
- Findings whose quotes span two sentences: grouped with the sentence where the quote starts.
- A finding that could not be located in the text has no sentence: it stays its own card.
- One finding in a group resolved earlier, before this change: the group shows open while any finding in it is open.
- Replacement from a style finding inside a group with coherence findings: still offered on that agent's part of the card.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Findings located in the same sentence MUST show as one card listing each agent's diagnosis.
- **FR-002**: The score MUST count each sentence once, at its most severe finding, overall and per criterion.
- **FR-003**: Resolving, marking not applicable or reopening a card MUST apply to every finding in it.
- **FR-004**: Only Citas APA findings MAY offer text to paste; Coherencia, Estilo and Argumento findings MUST NOT (Noe, 2026-11-10: «Solo en Citas APA», after real runs showed Estilo replacements changing what the author claims).
- **FR-005**: A replacement MUST match the capitalization of the start of its quote.
- **FR-006**: A replacement carrying a number, proper name or year absent from the essay and its sources MUST be dropped, keeping the diagnosis.
- **FR-007**: Reviewer instructions MUST forbid asserting that a fact is false when the essay and sources do not show it.
- **FR-008**: Saved essays and persisted findings MUST keep working with no migration; grouping is derived when shown and scored.
- **FR-009**: The surfaces touched MUST pass the constitution IV rules.

- **FR-010**: Within a sentence card, each agent MUST appear once; its findings in that sentence show as one part at the most severe one and close or reopen together.
- **FR-011**: Each pass MUST stay in its own subject: Coherencia the links and structure between ideas; Estilo wording, clarity and register within the phrase, never attribution, sources or argument; Argumento reasoning and opposing views, never wording; Citas APA citation format only. At most one finding per sentence per pass; a fact that carries a citation is not questioned from memory; mensaje under 30 words, plain tú, no rhetorical questions.

### Key Entities

- **Finding**: unchanged persisted record per agent and pass.
- **Sentence card**: derived group of findings that share a sentence; never stored.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In real reviews of test essays, no sentence shows more than one card.
- **SC-002**: The same test essay scores higher than before for the same findings, with each sentence counted once.
- **SC-003**: In real reviews, 0 replacements offered for coherence or argument findings, and 0 replacements that add a claim, name, number or year not in the essay or sources.
- **SC-004**: An independent reviewer grades usefulness of the corrections at least 4 of 5 on the same real outputs.
- **SC-005**: Real reviews are run only on test essays, within about 8 model calls.

## Clarifications

### Session 2026-11-10

- Q: How to cut repeated comments on one sentence? → A: Noe chose «Unir y acotar»: one part per agent per sentence, and each pass kept to its subject (FR-010, FR-011). A single combined reviewer stays a separate proposal.

## Assumptions

- A sentence is the unit already used to suppress findings already resolved.
- Wording and citation format are the passes Estilo and Citas APA; Coherencia and Argumento lose Usar este texto. Copiar also goes for them, since there is nothing to copy.
- The per-finding records stay as they are, so reverting this change would restore today's behavior.
