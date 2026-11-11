# Data Model: Finding Quality

No persisted change. `FindingRecord` and the annotation mark are unchanged.

## FindingView (derived)
- Adds `sentenceKey?: string`: block start position and sentence index; absent when the finding is not located.

## SentenceCard (derived, never stored)
- `key`: the sentence key, or the finding id for a lone not-located finding.
- `quote`: the sentence text under the marks.
- `findings`: views, most severe first.
- `status`: open if any finding is open; resolved when all are resolved; not applicable hides the card when all are not applicable.
- `severidad`: highest among open findings.

## Score input
- One entry per open card at its highest severity, plus one per criterion present in the card at that criterion's highest severity.
