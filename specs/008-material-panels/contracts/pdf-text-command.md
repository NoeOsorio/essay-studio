# Contract: `pdf_extract_text` (Tauri command)

**Purpose**: turn the bytes of one PDF into text, on the Mac, with no file access offered to the renderer.

**Request**: raw body, `invoke("pdf_extract_text", new Uint8Array(bytes))`. Any non-raw body is an error. There is no path parameter.

**Response**

```ts
type PdfTextResult =
  | { status: "ok"; pages: number; text: string[] }   // one string per page, normalized by the renderer
  | { status: "no_text"; pages: number }
  | { status: "locked" }
  | { status: "unreadable" }
  | { status: "too_large" };
```

**Behavior, enforced in Rust**
1. Reject over `MAX_PDF_BYTES` before writing anything.
2. Check the `%PDF-` header within the first 1024 bytes.
3. Write to `<app cache>/pdf-import/<uuid>.pdf`, created exclusively with mode 0600. Delete on every exit path. Each call also removes leftovers older than one hour, so a crash cannot strand a private document.
4. Run `/usr/bin/osascript -l JavaScript - <temp path>` with the script from `include_str!` on stdin. Absolute binary path. `kill_on_drop`, 60 s timeout, stdout read through a 16 MiB bound. stderr is discarded.
5. A crash or malformed output becomes `unreadable`. PDFKit runs in its own process, so a hostile file cannot take the app down.

Never logs file names or text. On non-macOS builds the command returns `unreadable`.

**E2E stub** (`tests/e2e/setup.ts`): decodes the bytes as text. `%PDF-scan` returns `no_text`, `%PDF-locked` returns `locked`; otherwise the body after the header is one page of text.
