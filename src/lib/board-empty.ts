// Pure selector shared by the toolbar (T016) and the empty board layer (T044):
// a board is empty when its saved snapshot holds no shape record.

export function boardHasNotes(board: unknown): boolean {
  if (!board || typeof board !== "object") return false;
  // tldraw's getSnapshot wraps the store as { document: { store }, session }.
  const b = board as { store?: unknown; document?: { store?: unknown } };
  const store = b.document?.store ?? b.store;
  if (!store || typeof store !== "object") return false;
  for (const rec of Object.values(store as Record<string, unknown>)) {
    if (rec && typeof rec === "object" && (rec as { typeName?: unknown }).typeName === "shape") {
      return true;
    }
  }
  return false;
}
