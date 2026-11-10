"use client";

// Paper R6.4 and the Slice 0 empty history. Historial hangs at the right edge
// of the desk instead of centering: the sheet beside it is where the chosen
// version shows (HistoryPreview), so the panel must not cover it. The sheet
// shell behavior (Esc, motion) is the shared one from ui/Popover. Outside
// clicks do not close it, because the preview bar lives on the sheet.

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { SHEET_CLASS, useSheetBehavior } from "@/components/ui/Popover";
import { WindowedList } from "@/components/ui/WindowedList";
import { setHistoryPreview } from "@/components/panels/HistoryPreview";
import { useStore } from "@/lib/store";
import type { SnapshotMeta } from "@/lib/storage/types";

const ROW = 48;

export function HistoryPanel() {
  const open = useStore((s) => s.overlay === "history" && s.current !== null);
  const instant = useStore((s) => s.overlayInstant);
  const setOverlay = useStore((s) => s.setOverlay);
  const sheet = useRef<HTMLDivElement | null>(null);
  const close = () => setOverlay(null);

  useSheetBehavior({ open, onClose: close, sheet, persistent: true });

  // The preview belongs to the open panel: it goes when the panel does.
  useEffect(() => {
    if (!open) return;
    return () => setHistoryPreview(null);
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={sheet}
      tabIndex={-1}
      data-testid="history-overlay"
      className={`${SHEET_CLASS} fixed bottom-[12px] right-[12px] top-[64px] z-[900] flex flex-col gap-[20px] px-[20px] pb-[32px] pt-[28px] ${
        instant ? "" : "sheet-in"
      }`}
      style={{
        width: "min(420px, calc(100vw - 24px))",
        transformOrigin: "100% 0",
        boxShadow: "0 0 0 1px #1D1B1812, 0 30px 70px -24px #1D1B1859, 0 8px 20px -10px #1D1B1826",
      }}
    >
      <PanelBody onClose={close} />
    </div>,
    document.body,
  );
}

type Item = { kind: "now" } | { kind: "version"; meta: SnapshotMeta };

function PanelBody({ onClose }: { onClose: () => void }) {
  const history = useStore((s) => s.history);
  const snapshotNow = useStore((s) => s.snapshotNow);
  const flush = useStore((s) => s.flush);
  const previewSnapshot = useStore((s) => s.previewSnapshot);

  // null is the current text; otherwise the takenAt of the chosen version.
  const [selected, setSelected] = useState<string | null>(null);
  const [unreadable, setUnreadable] = useState(false);
  const latest = useRef(0);

  const items = useMemo<Item[]>(() => {
    if (history.length === 0) return [];
    const sorted = [...history].sort((a, b) => b.takenAt.localeCompare(a.takenAt));
    return [{ kind: "now" }, ...sorted.map((meta): Item => ({ kind: "version", meta }))];
  }, [history]);

  const choose = async (takenAt: string | null) => {
    const ticket = ++latest.current;
    setSelected(takenAt);
    setUnreadable(false);
    if (takenAt === null) {
      setHistoryPreview(null);
      return;
    }
    // What is on screen must be what is saved before something replaces it.
    await flush();
    const snapshot = await previewSnapshot(takenAt);
    if (ticket !== latest.current) return;
    if (!snapshot) {
      setSelected(null);
      setHistoryPreview(null);
      setUnreadable(true);
      return;
    }
    setHistoryPreview(snapshot);
  };

  return (
    <>
      <div className="flex items-center justify-between pl-[12px]">
        <div className="text-[22px] font-semibold leading-[28px] tracking-[-0.01em] text-ink-1">Historial</div>
        <button
          type="button"
          aria-label="Cerrar"
          onClick={onClose}
          data-testid="history-close"
          className="grid h-[32px] w-[32px] flex-none cursor-pointer place-items-center rounded-[8px] hover:bg-shade"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="var(--color-ink-3)" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-[2px]">
          <div className="text-center text-[18px] font-medium leading-[24px] text-ink-1">
            Todavía no hay versiones
          </div>
        </div>
      ) : (
        <WindowedList
          items={items}
          rowHeight={ROW}
          gap={2}
          className="min-h-0 flex-1"
          testId="history-list"
          getKey={(item) => (item.kind === "now" ? "now" : item.meta.takenAt)}
          renderRow={(item) =>
            item.kind === "now" ? (
              <Row
                label="Ahora"
                selected={selected === null}
                testId="history-current"
                onChoose={() => void choose(null)}
              />
            ) : (
              <Row
                label={formatWhen(item.meta.takenAt)}
                kind={item.meta.kind}
                selected={selected === item.meta.takenAt}
                testId={`history-row-${item.meta.takenAt}`}
                onChoose={() => void choose(item.meta.takenAt)}
              />
            )
          }
        />
      )}

      {unreadable ? (
        <div className="px-[12px] text-[13px] leading-[16px] text-ink-3">No se pudo abrir esa versión</div>
      ) : null}

      <button
        type="button"
        onClick={() => void snapshotNow("manual")}
        data-testid="history-snapshot-now"
        className="flex h-[40px] flex-none cursor-pointer items-center gap-[8px] rounded-[10px] px-[12px] text-[13px] font-medium leading-[16px] text-ink-2 hover:bg-shade"
      >
        <Bookmark size={16} />
        Guardar esta versión
      </button>
    </>
  );
}

function Row({
  label,
  kind,
  selected,
  testId,
  onChoose,
}: {
  label: string;
  kind?: SnapshotMeta["kind"];
  selected: boolean;
  testId: string;
  onChoose: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChoose}
      data-testid={testId}
      data-kind={kind}
      aria-pressed={selected}
      className={`flex h-full w-full cursor-pointer items-center gap-[10px] rounded-[12px] px-[12px] text-left text-[15px] leading-[20px] text-ink-1 ${
        selected ? "bg-shade font-semibold" : "font-medium hover:bg-shade/35"
      }`}
    >
      <span className="flex-none">{label}</span>
      {kind === "manual" ? (
        <span
          className={`flex h-[22px] flex-none items-center gap-[5px] rounded-full px-[8px] text-[12px] font-medium leading-[16px] text-ink-2 ${
            selected ? "bg-sheet" : "bg-shade"
          }`}
        >
          <Bookmark size={12} filled />
          La guardaste tú
        </span>
      ) : null}
    </button>
  );
}

function Bookmark({ size, filled }: { size: number; filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" className="flex-none">
      <path
        d="M3 1.8h6a.5.5 0 0 1 .5.5v8.2L6 8.4 2.5 10.5V2.3a.5.5 0 0 1 .5-.5Z"
        fill={filled ? "var(--color-ink-2)" : "none"}
        stroke={filled ? undefined : "var(--color-ink-2)"}
        strokeWidth={filled ? undefined : 1.1}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** «hace 12 min», «hace 1 h», «ayer, 19:20», «hace 3 días», then the date. */
function formatWhen(iso: string, now: number = Date.now()): string {
  const at = new Date(iso);
  const t = at.getTime();
  if (Number.isNaN(t)) return iso;
  const secs = Math.max(0, Math.floor((now - t) / 1000));
  if (secs < 45) return "hace un momento";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `hace ${Math.max(1, mins)} min`;
  const startOfDay = (ms: number) => {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const dayGap = Math.round((startOfDay(now) - startOfDay(t)) / 86_400_000);
  if (dayGap === 0) return `hace ${Math.floor(mins / 60)} h`;
  if (dayGap === 1) {
    return `ayer, ${at.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
  }
  if (dayGap < 30) return `hace ${dayGap} días`;
  return at.toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
}
