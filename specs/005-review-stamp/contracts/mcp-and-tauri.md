# Contract: MCP and Tauri

## MCP `get_document` with `includeAnnotations: true`

Additive; no existing key changes.

```jsonc
{
  "annotations": [
    { "from": 12, "to": 40, "id": "…", "sage": "sis", "pase": "coherencia", "...": "existing attrs", "status": "open" }
  ],
  "findings": [
    { "id": "…", "sage": "em", "pase": "apa", "severidad": "media", "cita": "…", "mensaje": "…",
      "status": "resolved", "located": false }
  ]
}
```

`annotations` holds every mark, as today, each with `status: "open"`. `findings` holds those with no mark: open and not located, and resolved. `not_applicable` entries are included so a client does not propose them again. Evidence quotes are returned as they already are on marks; the content stays untrusted reference data per the tool description. No new mutating tool.

## Tauri `sage_cancel`

```
invoke("sage_cancel", { id: string }) -> Result<String, String>
```

Writes one JSON line `{ "id": id, "type": "cancel" }` to the sidecar stdin and returns the id. An unknown id is a no-op in the sidecar. Errors with the existing message when the sidecar is not running. The canceled request ends with a `sage://event` of `type: "error", code: "CANCELLED"`; the renderer treats that code as a cancellation, not a failure.

The code is reliable because `runner.ts` now chooses it at the `!completed` line (`CANCELLED`, `TIMEOUT`, else `INCOMPLETE_REVIEW`). Spec 006 reuses this command and `cancelSidecarRequest` for question runs.

## `sage://event` error

The renderer type gains the `code?: string` the sidecar already emits. No wire change. Requests reject with `class SidecarRequestError extends Error { code?: string }`. `runSidecarCommand` also listens to `sage://status` and on `down` rejects with `SIDECAR_DOWN`. Callers pass `requestId` so a run can cancel its own request. Spec 006 consumes all of this.

## Removed

Menu id `view:show-benchmark`. Window events `pluma-roja:apply`, `pluma-roja:dismiss`, `pluma-roja:apply-reemplazo`, `pluma-roja:unresolved`. Kept: `editor:clear-annotations`.
