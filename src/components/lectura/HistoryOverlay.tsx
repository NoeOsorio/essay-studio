"use client";

// Sesión 12 — Historial de versiones.
//
// Append-only snapshots per essay. The overlay shows the metas (no
// full content per row), and only fetches the full TipTap doc when the
// user picks a row to preview. Restoring snapshots the current state
// first (kind="before-restore") so the user can always undo the
// restore itself.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useStore } from "@/lib/store";
import type { Snapshot, SnapshotKind, SnapshotMeta } from "@/lib/storage/types";

export function HistoryOverlay() {
  const overlay = useStore((s) => s.overlay);
  const setOverlay = useStore((s) => s.setOverlay);
  const current = useStore((s) => s.current);
  const history = useStore((s) => s.history);
  const snapshotNow = useStore((s) => s.snapshotNow);
  const previewSnapshot = useStore((s) => s.previewSnapshot);
  const restoreVersion = useStore((s) => s.restoreVersion);

  if (overlay !== "history") return null;
  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink-1/30 backdrop-blur-[2px]"
      onClick={() => setOverlay(null)}
    >
      <div
        className="w-[860px] max-w-[96vw] max-h-[92vh] bg-paper-2 border border-rule-2 rounded-[14px] shadow-(--shadow-pop) overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        data-testid="history-overlay"
      >
        <HistoryInner
          essayTitle={current.title}
          history={history}
          onSnapshotNow={() => void snapshotNow("manual")}
          onPreview={previewSnapshot}
          onRestore={(takenAt) => void restoreVersion(takenAt)}
          onClose={() => setOverlay(null)}
        />
      </div>
    </div>
  );
}

function HistoryInner({
  essayTitle,
  history,
  onSnapshotNow,
  onPreview,
  onRestore,
  onClose,
}: {
  essayTitle: string;
  history: SnapshotMeta[];
  onSnapshotNow: () => void;
  onPreview: (takenAt: string) => Promise<Snapshot | null>;
  onRestore: (takenAt: string) => void;
  onClose: () => void;
}) {
  // 4-estado discriminado: idle (nada cargado) / loading / ready /
  // error. Antes era `preview: Snapshot | null` lo que confundía "aún
  // no cargué" con "falló la lectura" — el bug que detectaste mostraba
  // el mensaje de error al abrir el panel cuando en realidad nunca
  // habíamos pedido la lectura todavía.
  type PreviewState =
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "ready"; snapshot: Snapshot }
    | { kind: "error" };

  const [selected, setSelected] = useState<SnapshotMeta | null>(
    history[0] ?? null,
  );
  const [preview, setPreview] = useState<PreviewState>({ kind: "idle" });
  const [pendingRestore, setPendingRestore] = useState<string | null>(null);

  const selectRow = async (meta: SnapshotMeta) => {
    setSelected(meta);
    setPreview({ kind: "loading" });
    const snap = await onPreview(meta.takenAt);
    setPreview(snap ? { kind: "ready", snapshot: snap } : { kind: "error" });
  };

  // Auto-load la versión más reciente al montar el panel, así el
  // usuario ve contenido inmediatamente en vez de el bucket de error
  // (que antes aparecía porque selected estaba pre-seteado pero
  // preview no había sido pedido). Si history está vacía, selected
  // es null y caemos en el estado "Picá una versión".
  //
  // queueMicrotask defiere el primer setState de selectRow fuera del
  // cuerpo síncrono del effect — React 19 strict no permite setState
  // síncrono en effects. Mismo patrón que recordEvaluacion en
  // EditorPane.
  useEffect(() => {
    if (history.length > 0) {
      queueMicrotask(() => void selectRow(history[0]));
    }
    // Solo en mount — el panel se monta fresh cada vez que el overlay
    // abre (parent check `if (overlay !== "history") return null`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {/* Header */}
      <div className="px-6 py-4 border-b border-rule-1 flex items-center justify-between flex-none">
        <div className="min-w-0">
          <div className="font-serif italic text-[18px] text-ink-1 truncate">
            Historial de versiones
          </div>
          <div className="font-mono text-[11px] text-ink-3 tracking-[0.04em] mt-0.5">
            {essayTitle.trim() || "Sin título"} ·{" "}
            {history.length === 1
              ? "1 versión"
              : `${history.length} versiones`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={onSnapshotNow} data-testid="history-snapshot-now">
            Guardar versión ahora
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-3 text-[12px] font-mono text-ink-3 hover:text-ink-1 cursor-pointer"
          >
            cerrar
          </button>
        </div>
      </div>

      {/* Body — split: list + preview */}
      <div className="grid grid-cols-[300px_1px_1fr] min-h-0 flex-1">
        {/* List */}
        <div className="overflow-y-auto thin-scroll">
          {history.length === 0 ? (
            <div className="px-6 py-10 text-center text-ink-3 font-sans text-[12px]">
              Aún no hay versiones guardadas. La primera se toma sola al
              cerrar el ensayo, o ahora mismo con{" "}
              <span className="font-medium text-ink-2">
                Guardar versión ahora
              </span>
              .
            </div>
          ) : (
            <ul role="list" className="py-1">
              {history.map((meta) => (
                <li key={meta.takenAt}>
                  <button
                    type="button"
                    onClick={() => void selectRow(meta)}
                    data-testid={`history-row-${meta.takenAt}`}
                    aria-current={
                      selected?.takenAt === meta.takenAt ? "true" : undefined
                    }
                    className={`w-full text-left px-5 py-2.5 hover:bg-paper-3 cursor-pointer border-l-2 transition-colors ${
                      selected?.takenAt === meta.takenAt
                        ? "bg-paper-3 border-l-seal"
                        : "border-l-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-2 text-[12px] text-ink-1">
                      <span className="font-medium">{formatAgo(meta.takenAt)}</span>
                      <KindChip kind={meta.kind as SnapshotKind} />
                    </div>
                    <div className="font-mono text-[10.5px] text-ink-3 tracking-[0.04em] mt-0.5">
                      {meta.wordCount} palabras ·{" "}
                      <span className="text-ink-4">
                        {formatTimestamp(meta.takenAt)}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-rule-1" />

        {/* Preview */}
        <div className="overflow-y-auto thin-scroll bg-paper">
          {!selected || preview.kind === "idle" ? (
            <div className="px-8 py-12 text-center text-ink-3 font-sans text-[12px]">
              Picá una versión a la izquierda para verla.
            </div>
          ) : preview.kind === "loading" ? (
            <div className="px-8 py-12 text-center text-ink-3 font-sans text-[12px]">
              Cargando…
            </div>
          ) : preview.kind === "error" ? (
            <div className="px-8 py-12 text-center text-err font-sans text-[12px]">
              No se pudo leer esta versión.
            </div>
          ) : (
            <PreviewPanel
              snapshot={preview.snapshot}
              isPendingRestore={pendingRestore === preview.snapshot.takenAt}
              onAskRestore={() =>
                setPendingRestore(preview.snapshot.takenAt)
              }
              onConfirmRestore={() => {
                onRestore(preview.snapshot.takenAt);
                setPendingRestore(null);
                onClose();
              }}
              onCancelRestore={() => setPendingRestore(null)}
            />
          )}
        </div>
      </div>
    </>
  );
}

function PreviewPanel({
  snapshot,
  isPendingRestore,
  onAskRestore,
  onConfirmRestore,
  onCancelRestore,
}: {
  snapshot: Snapshot;
  isPendingRestore: boolean;
  onAskRestore: () => void;
  onConfirmRestore: () => void;
  onCancelRestore: () => void;
}) {
  const plainText = extractPlainText(snapshot.essay.content);

  return (
    <div className="px-8 py-6 flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between flex-none">
        <div className="min-w-0">
          <div className="font-serif italic text-[15px] text-ink-1 truncate">
            {snapshot.essay.title.trim() || "Sin título"}
          </div>
          <div className="font-mono text-[10.5px] text-ink-3 tracking-[0.04em] mt-0.5">
            {formatTimestamp(snapshot.takenAt)} · {snapshot.essay.wordCount}{" "}
            palabras · <KindChip kind={snapshot.kind as SnapshotKind} inline />
          </div>
        </div>
        {isPendingRestore ? (
          <div className="flex items-center gap-2 flex-none">
            <span className="font-mono text-[10.5px] text-ink-3">
              ¿Reemplazar el contenido actual?
            </span>
            <Button
              variant="seal"
              onClick={onConfirmRestore}
              data-testid="history-restore-confirm"
            >
              Sí, restaurar
            </Button>
            <button
              type="button"
              onClick={onCancelRestore}
              className="h-8 px-3 text-[12px] font-mono text-ink-3 hover:text-ink-1 cursor-pointer"
            >
              cancelar
            </button>
          </div>
        ) : (
          <Button onClick={onAskRestore} data-testid="history-restore-ask">
            Restaurar esta versión
          </Button>
        )}
      </div>

      {/* Plain text preview. We deliberately render flat (no TipTap)
          to make it obvious this is a snapshot, not the live editor. */}
      <div
        className="flex-1 min-h-0 overflow-y-auto thin-scroll font-serif text-[14px] text-ink-1 leading-relaxed whitespace-pre-wrap"
        data-testid="history-preview-text"
      >
        {plainText || (
          <span className="text-ink-3 italic">(Versión vacía)</span>
        )}
      </div>

      {isPendingRestore ? (
        <div className="flex-none text-[11px] font-mono text-ink-3 leading-snug">
          El estado actual se guarda automáticamente como{" "}
          <span className="text-ink-2 font-medium">before-restore</span> antes
          de aplicar.
        </div>
      ) : null}
    </div>
  );
}

function KindChip({
  kind,
  inline = false,
}: {
  kind: SnapshotKind;
  inline?: boolean;
}) {
  const label: Record<SnapshotKind, string> = {
    auto: "auto",
    close: "al cerrar",
    manual: "manual",
    "before-restore": "antes de restaurar",
  };
  const tone: Record<SnapshotKind, string> = {
    auto: "text-ink-3 border-rule-1",
    close: "text-ink-2 border-rule-2",
    manual: "text-seal border-[rgba(156,44,31,0.30)] bg-[#F5DAD3]/50",
    "before-restore": "text-ink-3 border-rule-1",
  };
  const cls = `inline-flex items-center h-[18px] px-1.5 rounded-full border font-mono text-[10px] tracking-[0.04em] whitespace-nowrap ${tone[kind]}`;
  return inline ? (
    <span className={cls}>{label[kind]}</span>
  ) : (
    <span className={cls}>{label[kind]}</span>
  );
}

/** "hace 3 días", "ayer 14:32", "hace 2 horas", "hace 5 min". */
function formatAgo(iso: string): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return iso;
  const secs = Math.max(0, Math.floor((Date.now() - at) / 1000));
  if (secs < 45) return "hace unos segundos";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  if (months < 12) return `hace ${months} meses`;
  return `hace ${Math.floor(months / 12)} años`;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-ES", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Flatten a TipTap doc to plain text for the preview. We don't
 *  render rich because the preview is intentionally read-only and
 *  not the source of truth. */
function extractPlainText(content: unknown): string {
  type Node = {
    type?: string;
    text?: string;
    content?: Node[];
  };
  const walk = (node: Node): string => {
    if (!node) return "";
    if (typeof node.text === "string") return node.text;
    if (!Array.isArray(node.content)) return "";
    const inner = node.content.map(walk).join("");
    // Add a paragraph break for block-level nodes.
    if (
      node.type === "paragraph" ||
      node.type === "heading" ||
      node.type === "blockquote" ||
      node.type === "listItem"
    ) {
      return inner + "\n\n";
    }
    return inner;
  };
  return walk(content as Node).trim();
}
