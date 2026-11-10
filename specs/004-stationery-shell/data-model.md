# Data Model: Stationery Desk System and App Shell

No migration and no Rust storage change. `Essay.board` is `Option<serde_json::Value>` in `storage.rs`, and `history.rs` embeds the same `Essay`, so anything inside the tldraw snapshot, including `meta.title`, survives save, snapshot and restore with no new Rust field.

## Note (tldraw `note` shape, `meta`)

| Field | Type | Status | Notes |
|---|---|---|---|
| `meta.author` | `"tu" \| "em" \| "sis" \| "pra" \| "cri"` | existing | Absent or unknown renders as `tu` |
| `meta.kind` | `"concepto" \| "pregunta" \| "conexion" \| "cita" \| "critica"` | existing | Shown in the bar only |
| `meta.createdAt` | number | existing | Still stamped; never drawn |
| `meta.title` | string | **new, optional** | Absent or empty means no title. Plain text, no length limit; the note grows |

## Derived, never stored

| Value | Derivation |
|---|---|
| Tilt | Hash of `shape.id` into -2 to 2.5 degrees. Applied only when `shape.rotation === 0` |
| Height | Measured from header, title and body at read time. Persisted `growY` is ignored for display |
| Board is empty | No record with `typeName: "shape"` in `current.board` |

## Agent (code only)

Defined in [contracts/agent-identity.md](./contracts/agent-identity.md). Keyed by persisted ids, which do not change.

## Annotation mark

Attribute names unchanged. `data-by` is a rendered attribute, not persisted, and now carries the agent id instead of initials.
