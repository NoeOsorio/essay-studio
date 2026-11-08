# Data Model: Monochrome + Sages Visual System

No persisted data changes. Essays, annotations (marks with `sage`, `severidad`), board snapshots,
rubric, sources and history keep their shape (FR-014). The only "model" is the token set.

## Color tokens (values per constitution principle IV)

| Token | Value | Meaning | Allowed uses |
|---|---|---|---|
| paper | #F8F8F6 | canvas | app background |
| paper-2 | #FDFDFC | surface | editor, modals, cards |
| paper-3 | #EFEFEC | sunken | bars, inputs, hover |
| paper-4 | #E4E4E0 | pressed / selected | selected rows |
| ink-1 | #18181B | primary text | everything readable |
| ink-2 | #3F3F46 | strong secondary | body secondary |
| ink-3 | #52525B | secondary text (7.3:1) | metadata, labels, placeholders of enabled inputs |
| ink-4 | #A1A1AA | non-text only | borders of disabled, placeholders of disabled |
| rule-1 / 2 / 3 | #E4E4E0 / #DEDED9 / #86868E | separators; rule-3 for control borders (3.4:1) | lines |
| accent | #18181B | primary action | primary buttons, focus ring |
| danger | #B91C1C | system error, destructive | error banners, delete confirm |
| em / em-bg / em-ink | #B45309 / #FCEFE3 / #7C2D12 | Empirista | sage only |
| sis / sis-bg / sis-ink | #0F766E / #E0F2EF / #134E4A | Sistémico | sage only |
| pra / pra-bg / pra-ink | #2F5FA6 / #E4ECF7 / #1E3A66 | Práctico | sage only |
| cri / cri-bg / cri-ink | #6E4FA8 / #ECE6F5 / #3B2766 | Crítico | sage only |

Text placed on a sage tint (`*-bg`) uses the sage `*-ink` (8.2:1 or more); the bare sage color is
used for marks, borders and text on the canvas (4.72:1 or more), never as text on its own tint.

Retired: `seal`, `seal-soft`, `warn`, `ok` as colors of meaning. A perfect score shows "10" in
ink with the word "Sin pendientes"; stale shows "Desactualizado".

## Type scale

| Token | Size / line | Use |
|---|---|---|
| text-meta | 12 / 16 | metadata, counters, timestamps (minimum) |
| text-ui | 13 / 18 | buttons, chips, labels |
| text-body | 14 / 21 | UI paragraphs, popover text |
| text-lead | 16 / 24 | finding messages, questions in UI sans |
| text-title | 20 / 26 | modal titles |
| text-display | 28 / 32 | page title (list) |

Essay surface keeps Newsreader at its current sizes (title 44, body 19).

## Severity

| severidad | Label | Style |
|---|---|---|
| alta | Grave | ink-1, weight 600 |
| media | Media | ink-2, weight 500 |
| baja | Menor | ink-3, weight 400 |
