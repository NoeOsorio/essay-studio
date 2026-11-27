// Which notes exist on a saved board snapshot. Cards use it to drop «Ver nota»
// when the note was deleted. The set is built once per snapshot object, so a
// list of 1000 cards pays for one pass over the board, not one each.

const cache = new WeakMap<object, Set<string>>();

function storeOf(board: unknown): Record<string, unknown> | null {
  if (!board || typeof board !== "object") return null;
  const b = board as { store?: unknown; document?: { store?: unknown } };
  const store = b.document?.store ?? b.store;
  return store && typeof store === "object" ? (store as Record<string, unknown>) : null;
}

export function boardNoteIds(board: unknown): Set<string> {
  if (!board || typeof board !== "object") return new Set();
  const hit = cache.get(board);
  if (hit) return hit;
  const ids = new Set<string>();
  const store = storeOf(board);
  if (store) {
    for (const [key, rec] of Object.entries(store)) {
      if (rec && typeof rec === "object") {
        const r = rec as { typeName?: unknown; type?: unknown };
        if (r.typeName === "shape" && r.type === "note") ids.add(key);
      }
    }
  }
  cache.set(board, ids);
  return ids;
}

/** A link to a note that is gone counts as no link. */
export function liveNoteId(board: unknown, noteId: string | undefined): string | undefined {
  return noteId && boardNoteIds(board).has(noteId) ? noteId : undefined;
}
