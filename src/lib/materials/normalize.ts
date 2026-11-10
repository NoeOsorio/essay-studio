/**
 * Normalization of PDF text, applied once before `contenido` is saved so that later evidence
 * offsets stay valid. Pasted text and .txt/.md files are never passed through here.
 */
export function normalizePdfPage(page: string): string {
  return page
    .normalize("NFKC") // ligatures such as fi and fl
    .replace(/\0/g, "")
    .replace(/\r\n?/g, "\n")
    // "inter-\nnational" -> "international", only when both sides are lowercase letters.
    .replace(/(\p{Ll})-\n(\p{Ll})/gu, "$1$2")
    .replace(/[ \t]+/g, " ");
}

/** Pages join with a blank line. Line breaks otherwise stay. */
export function normalizePdfPages(pages: readonly string[]): string {
  return pages.map(normalizePdfPage).join("\n\n");
}
