// Every way a finding changes. `Finding` calls these directly, so no
// surface re-implements an action. Order inside each mutating action:
// mark the undo surface as the document, run the TipTap command, read the
// store fresh, write the record, flush.

import { getDocumentEditor } from "@/lib/mcp/document";
import { setUndoSurface } from "@/lib/editor/history";
import { findCitaRange } from "@/lib/editor/findCita";
import { computeBenchmark } from "@/lib/benchmark/score";
import { reviewFingerprint } from "@/lib/review/fingerprint";
import { deriveFindings, type FindingView } from "@/lib/review/findings";
import { useStore } from "@/lib/store";
import type { FindingRecord } from "@/lib/storage/types";

function nowIso(): string {
  return new Date().toISOString();
}

function currentView(id: string): { essayId: string; view: FindingView } | null {
  const cur = useStore.getState().current;
  if (!cur) return null;
  const view = deriveFindings(cur.content, cur.findings).find((v) => v.id === id);
  return view ? { essayId: cur.id, view } : null;
}

/** Which occurrence of the quote this finding sits on, so a repeated quote re-anchors correctly. */
function occurrenceOf(
  editor: ReturnType<typeof getDocumentEditor>,
  view: FindingView,
): number | undefined {
  if (!view.located || view.from === null) return view.occurrence;
  for (let k = 0; k < 50; k++) {
    const r = findCitaRange(editor, view.quote, k);
    if (!r) return undefined;
    if (r.from >= view.from) return k;
  }
  return undefined;
}

/** A record for a finding that never had one (older essays), or the existing record refreshed. */
function recordFrom(
  view: FindingView,
  existing: FindingRecord | undefined,
  occurrence: number | undefined,
): FindingRecord {
  if (existing) return { ...existing, ...(occurrence !== undefined ? { occurrence } : {}) };
  return {
    id: view.id,
    sage: view.sage,
    pase: view.pase,
    severidad: view.severidad,
    cita: view.hasRecord ? view.cita : view.quote,
    mensaje: view.mensaje,
    ...(view.reemplazo ? { reemplazo: view.reemplazo } : {}),
    ...(view.criterioId ? { criterioId: view.criterioId } : {}),
    ...(view.evidence ? { evidence: view.evidence } : {}),
    ...(view.provenance ? { provenance: view.provenance } : {}),
    generadoEn: view.generadoEn ?? nowIso(),
    status: "open",
    ...(occurrence !== undefined ? { occurrence } : {}),
  };
}

function upsert(list: FindingRecord[], record: FindingRecord): FindingRecord[] {
  const i = list.findIndex((r) => r.id === record.id);
  if (i < 0) return [...list, record];
  const next = list.slice();
  next[i] = record;
  return next;
}

function close(
  id: string,
  status: "resolved" | "not_applicable",
  closedBy?: "check" | "replacement",
): void {
  const hit = currentView(id);
  if (!hit) return;
  const { essayId, view } = hit;
  setUndoSurface("document");
  const editor = getDocumentEditor(essayId);
  const occurrence = occurrenceOf(editor, view);
  if (view.located) editor.commands.removeAnnotationById(id);
  // The command's own onUpdate has already replaced `current`; read fresh.
  const existing = useStore.getState().current?.findings?.find((r) => r.id === id);
  const base = recordFrom(view, existing, occurrence);
  const record: FindingRecord = {
    ...base,
    status,
    closedAt: nowIso(),
    ...(closedBy ? { closedBy } : {}),
  };
  if (!closedBy) delete record.closedBy;
  useStore.getState().commitFindings((prev) => upsert(prev, record));
}

export function resolveFinding(id: string): void {
  close(id, "resolved", "check");
}

export function markNotApplicable(id: string): void {
  close(id, "not_applicable");
}

/** Uncheck: the underline returns when the quote is still in the text; otherwise the finding is open and not located. */
export function reopenFinding(id: string): void {
  const cur = useStore.getState().current;
  const rec = cur?.findings?.find((r) => r.id === id);
  if (!cur || !rec) return;
  setUndoSurface("document");
  const editor = getDocumentEditor(cur.id);
  const range =
    findCitaRange(editor, rec.cita, rec.occurrence ?? 0) ??
    findCitaRange(editor, rec.cita, 0);
  if (range) {
    editor
      .chain()
      .command(({ tr }) => {
        tr.setMeta("addToHistory", false);
        return true;
      })
      .setAnnotation(range.from, range.to, {
        id: rec.id,
        sage: rec.sage,
        pase: rec.pase,
        severidad: rec.severidad,
        mensaje: rec.mensaje,
        reemplazo: rec.reemplazo ?? null,
        criterioId: rec.criterioId ?? null,
        evidence: rec.evidence ?? null,
        provenance: rec.provenance ?? null,
      })
      .run();
  }
  useStore.getState().commitFindings((prev) =>
    prev.map((r) => {
      if (r.id !== id) return r;
      const { closedAt: _a, closedBy: _b, ...rest } = r;
      void _a;
      void _b;
      return { ...rest, status: "open" as const };
    }),
  );
}

export function useReplacement(
  id: string,
): { ok: true } | { ok: false; reason: "spans_blocks" | "not_located" } {
  const hit = currentView(id);
  const reemplazo = hit?.view.reemplazo;
  if (!hit || !hit.view.located || !reemplazo) return { ok: false, reason: "not_located" };
  const { essayId, view } = hit;
  if (view.spansBlocks) return { ok: false, reason: "spans_blocks" };

  const before = useStore.getState().current!;
  const fpBefore = reviewFingerprint(before);
  const wasFresh =
    !!before.evaluacionMeta &&
    !computeBenchmark({
      anotaciones: [],
      rubrica: before.rubrica,
      evaluacionMeta: before.evaluacionMeta,
      essayMode: before.mode,
      essayUpdatedAt: before.updatedAt,
      contentFingerprint: fpBefore,
    }).isStale;

  setUndoSurface("document");
  const editor = getDocumentEditor(essayId);
  const occurrence = occurrenceOf(editor, view);
  const applied = editor.commands.applyAnnotationReemplazo(id, reemplazo);
  if (!applied) return { ok: false, reason: "spans_blocks" };

  const after = useStore.getState().current!;
  const fpAfter = reviewFingerprint(after);
  const existing = after.findings?.find((r) => r.id === id);
  const record: FindingRecord = {
    ...recordFrom(view, existing, occurrence),
    status: "resolved",
    closedAt: nowIso(),
    closedBy: "replacement",
  };
  useStore.getState().commitFindings(
    (prev) => upsert(prev, record),
    (meta) => {
      // Only a review that was fresh stays fresh: link the old and new
      // fingerprints. One already out of date stays out of date.
      if (!meta || !wasFresh) return meta;
      const linked = new Set(meta.appliedFingerprints ?? []);
      linked.add(fpBefore);
      linked.add(fpAfter);
      return { ...meta, appliedFingerprints: [...linked] };
    },
  );
  return { ok: true };
}

export async function copyReplacement(id: string): Promise<void> {
  const hit = currentView(id);
  if (!hit?.view.reemplazo) return;
  await navigator.clipboard.writeText(hit.view.reemplazo);
}

/** Scroll the underline into view and flash it. Not located findings have nothing to reveal. */
export function revealFinding(id: string): void {
  const hit = currentView(id);
  if (!hit?.view.located) return;
  const editor = getDocumentEditor(hit.essayId);
  const el = editor.view.dom.querySelector<HTMLElement>(
    `[data-anno-id="${CSS.escape(id)}"]`,
  );
  if (!el) return;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.classList.add("anno-flash");
  window.setTimeout(() => el.classList.remove("anno-flash"), 1700);
}
