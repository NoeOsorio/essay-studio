"use client";

// Every finding of the open essay, in the order of the text. With a
// criterion selected it is the same panel narrowed (R5.4). Solid sheet.

import { useMemo, useRef, useState } from "react";

import { Finding } from "@/components/review/Finding";
import { useNarrowedUnderlines } from "@/components/review/useNarrowedUnderlines";
import { useReviewReading } from "@/components/review/useReviewResult";
import { SourcesLeftOutLine } from "@/components/review/ReviewPanel";
import { Popover } from "@/components/ui/Popover";
import { useAnchor } from "@/components/ui/useAnchor";
import { identityOf } from "@/lib/agent-identity";
import type { CriterioBreakdown } from "@/lib/benchmark/score";
import { getDocumentEditor } from "@/lib/mcp/document";
import { revealFinding } from "@/lib/review/actions";
import type { FindingView } from "@/lib/review/findings";
import { useStore } from "@/lib/store";

type CorrectionsPanelProps = {
  open: boolean;
  onClose: () => void;
  /** Criterion the list is narrowed to, or null for all. */
  criterioId: string | null;
  onCriterioChange: (id: string | null) => void;
  /** Volver a revisar. */
  onReview?: () => void;
};

const fmt = (n: number) => (Math.round(n * 10) / 10 >= 10 ? "10" : (Math.round(n * 10) / 10).toFixed(1));

function Chevron({ rotate = 0, color = "var(--color-ink-2)" }: { rotate?: number; color?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      aria-hidden
      className="flex-none"
      style={{ rotate: `${rotate}deg`, transformOrigin: "50% 50%" }}
    >
      <path d="M5 3l4 4-4 4" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ScoreBar({ score, width, height }: { score: number; width: number; height: number }) {
  return (
    <span
      className="flex flex-none"
      style={{ width, height, borderRadius: height > 3 ? 3 : 2, background: "rgba(29,27,24,0.10)" }}
    >
      <span
        style={{
          width: Math.round((Math.max(0, Math.min(10, score)) / 10) * width),
          height,
          borderRadius: height > 3 ? 3 : 2,
          background: height > 3 ? "var(--color-ink-1)" : "var(--color-ink-2)",
        }}
      />
    </span>
  );
}

function CriterionChip({
  breakdown,
  onPick,
}: {
  breakdown: CriterioBreakdown;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      data-testid={`corrections-criterio-${breakdown.criterio.id}`}
      className="flex h-[30px] min-w-0 flex-1 cursor-pointer items-center gap-[8px] rounded-[8px] bg-shade px-[10px] text-left"
    >
      <span className="min-w-0 flex-1 truncate text-[13px] leading-[16px] text-ink-2">
        {breakdown.criterio.nombre}
      </span>
      <ScoreBar score={breakdown.score} width={32} height={3} />
      <span className="w-[26px] flex-none text-right font-mono text-[12px] leading-[16px] text-ink-2">
        {fmt(breakdown.score)}
      </span>
    </button>
  );
}

function ResolvedRow({ view }: { view: FindingView }) {
  const [open, setOpen] = useState(false);
  const id = identityOf(view.sage);
  const Icon = id.Icon;
  if (open) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="block w-full cursor-pointer text-left"
          aria-label="Cerrar"
        >
          <ResolvedLine view={view} />
        </button>
        <Finding finding={view} surface="panel" />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      data-testid="corrections-resolved-row"
      className="block w-full cursor-pointer text-left"
    >
      <ResolvedLine view={view} icon={<Icon size={14} />} />
    </button>
  );
}

function ResolvedLine({ view, icon }: { view: FindingView; icon?: React.ReactNode }) {
  const id = identityOf(view.sage);
  const Icon = id.Icon;
  return (
    <span className="flex h-[42px] items-center gap-[10px] rounded-[10px] px-[12px]">
      <span className="grid h-[18px] w-[18px] flex-none place-items-center rounded-[6px] bg-ink-1">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <path d="M2.8 6.2l2.1 2.1 4.3-4.4" fill="none" stroke="#FFFFFF" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span
        className={`grid h-[22px] w-[22px] flex-none place-items-center rounded-[6px] ${id.chipClass}`}
        style={{ color: id.ink }}
      >
        {icon ?? <Icon size={14} />}
      </span>
      <span className="min-w-0 flex-1 truncate whitespace-nowrap font-serif text-[16px] leading-[22px] text-ink-2">
        {view.quote}
      </span>
    </span>
  );
}

/** R4.3: the underline fades out (200 ms) while the card folds. The mark
 *  itself goes when the action runs; nothing here is stored. */
function eraseUnderline(findingId: string): void {
  const essayId = useStore.getState().current?.id;
  if (!essayId) return;
  try {
    getDocumentEditor(essayId).commands.annotationFx({ erase: [findingId] });
  } catch {
    /* editor gone: nothing to erase */
  }
}

/** Card wrapper: reveals on click, folds before a mouse resolve. Keyboard
 *  activations (detail 0) and reduced motion act at once, with no animation. */
function CorrectionCard({
  view,
  index,
  surface,
  onReveal,
}: {
  view: FindingView;
  index: number;
  surface: "panel" | "criterion";
  onReveal: (e: React.MouseEvent, id: string) => void;
}) {
  const [folding, setFolding] = useState(false);
  const replay = useRef(false);

  const onClickCapture = (e: React.MouseEvent) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>(
      '[data-testid="finding-resolve"], [data-testid="finding-not-applicable"]',
    );
    if (!btn || replay.current || folding || e.detail === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    e.stopPropagation();
    e.preventDefault();
    setFolding(true);
    eraseUnderline(view.id);
    window.setTimeout(() => {
      replay.current = true;
      btn.click();
      replay.current = false;
    }, 240);
  };

  return (
    <div
      onClick={(e) => onReveal(e, view.id)}
      onClickCapture={onClickCapture}
      className={folding ? "card-fold" : index < 4 ? "card-in" : undefined}
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: "auto 260px",
        ["--card-i" as string]: index,
      }}
    >
      <Finding finding={view} surface={surface} />
    </div>
  );
}

export function CorrectionsPanel({
  open,
  onClose,
  criterioId,
  onCriterioChange,
  onReview,
}: CorrectionsPanelProps) {
  const reading = useReviewReading();
  const instant = useStore((s) => s.overlayInstant);
  const [resolvedOpen, setResolvedOpen] = useState(false);
  const anchor = useAnchor("stamp");

  const breakdown = useMemo(
    () => reading?.result.perCriterio.find((b) => b.criterio.id === criterioId) ?? null,
    [reading, criterioId],
  );
  const narrowed = breakdown !== null;
  useNarrowedUnderlines(open && narrowed ? criterioId : null);

  const { openViews, resolvedViews } = useMemo(() => {
    const all = reading?.views ?? [];
    const pick = narrowed ? all.filter((v) => v.criterioId === criterioId) : all;
    return {
      openViews: pick.filter((v) => v.status === "open"),
      resolvedViews: pick.filter((v) => v.status === "resolved"),
    };
  }, [reading, narrowed, criterioId]);

  const perCriterio = reading?.result.perCriterio ?? [];
  const width = narrowed ? 468 : 480;

  const onCardClick = (e: React.MouseEvent, id: string) => {
    if ((e.target as HTMLElement).closest("button")) return;
    revealFinding(id);
  };

  return (
    <Popover anchor={anchor} open={open} onClose={onClose} instant={instant} width={width} offset={{ x: 116, y: 3 }} persistent testId="corrections-panel">
      <div
        className="flex flex-col font-sans"
        style={narrowed ? { maxHeight: "calc(100vh - 75px)" } : { height: "calc(100vh - 75px)" }}
      >
        {narrowed && breakdown ? (
          <div className="flex-none px-[22px] pt-[8px]">
            <div className="flex items-center gap-[10px] rounded-[10px] bg-shade py-[10px] pl-[10px] pr-[18px]">
              <button
                type="button"
                aria-label="Todas las correcciones"
                data-testid="corrections-back"
                onClick={() => onCriterioChange(null)}
                className="grid h-[32px] w-[32px] flex-none cursor-pointer place-items-center rounded-[8px]"
              >
                <Chevron rotate={180} color="var(--color-ink-1)" />
              </button>
              <span className="min-w-0 flex-1 truncate text-[17px] font-semibold leading-[22px] tracking-[-0.01em] text-ink-1">
                {breakdown.criterio.nombre}
              </span>
              <ScoreBar score={breakdown.score} width={96} height={4} />
              <span className="pl-[8px] font-mono text-[17px] font-semibold leading-[22px] text-ink-1">
                {fmt(breakdown.score)}
              </span>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-none items-center justify-between pl-[22px] pr-[16px] pt-[16px]">
              <span className="text-[22px] font-semibold leading-[28px] tracking-[-0.01em] text-ink-1">
                Correcciones
              </span>
              <div className="flex items-center gap-[6px]">
                {onReview ? (
                  <button
                    type="button"
                    onClick={onReview}
                    data-testid="corrections-review"
                    className="flex h-[34px] cursor-pointer items-center gap-[7px] rounded-[10px] bg-sheet pl-[12px] pr-[14px] text-[13px] font-medium leading-[16px] text-ink-1 shadow-[0_0_0_1px_rgba(29,27,24,0.10),0_1px_2px_rgba(29,27,24,0.06)]"
                  >
                    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden className="flex-none">
                      <path d="M13 8a5 5 0 1 1-1.6-3.7" fill="none" stroke="var(--color-ink-1)" strokeWidth="1.6" strokeLinecap="round" />
                      <path d="M11.8 1.8v2.8H9" fill="none" stroke="var(--color-ink-1)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Volver a revisar
                  </button>
                ) : null}
                <button
                  type="button"
                  aria-label="Cerrar"
                  onClick={onClose}
                  className="grid h-[34px] w-[34px] flex-none cursor-pointer place-items-center rounded-[10px]"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                    <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="var(--color-ink-2)" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>
            <SourcesLeftOutLine />
            {perCriterio.length > 0 ? (
              <div className="flex flex-none flex-wrap gap-[4px] px-[22px] pt-[12px]" data-testid="corrections-filter">
                {perCriterio.map((b) => (
                  <div key={b.criterio.id} className="flex basis-[calc(50%-2px)] min-w-0">
                    <CriterionChip breakdown={b} onPick={() => onCriterioChange(b.criterio.id)} />
                  </div>
                ))}
              </div>
            ) : null}
          </>
        )}

        <div
          className="thin-scroll flex min-h-0 flex-1 flex-col gap-[30px] overflow-y-auto px-[6px] pt-[18px] pb-[18px]"
          data-testid="corrections-list"
        >
          {openViews.length === 0 ? (
            <div className="px-[16px] text-[15px] leading-[22px] text-ink-3">
              No hay correcciones pendientes.
            </div>
          ) : (
            openViews.map((v, i) => (
              <CorrectionCard
                key={v.id}
                view={v}
                index={i}
                surface={narrowed ? "criterion" : "panel"}
                onReveal={onCardClick}
              />
            ))
          )}
        </div>

        <div
          className="flex flex-none flex-col gap-[2px] rounded-b-[16px] bg-sheet px-[14px] pb-[10px] pt-[8px]"
          style={{ boxShadow: "0 -12px 16px -14px rgba(60,45,10,0.12)" }}
        >
          <button
            type="button"
            data-testid="corrections-resolved"
            aria-expanded={resolvedOpen}
            onClick={() => setResolvedOpen((o) => !o)}
            className="flex h-[40px] w-full flex-none cursor-pointer items-center justify-between rounded-[10px] bg-shade px-[12px] text-[13px] font-medium leading-[16px] text-ink-1"
          >
            <span>Resueltas</span>
            <Chevron rotate={resolvedOpen ? 90 : 0} />
          </button>
          {resolvedOpen ? (
            <div className="thin-scroll max-h-[260px] overflow-y-auto" data-testid="corrections-resolved-list">
              {resolvedViews.map((v) => (
                <ResolvedRow key={v.id} view={v} />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </Popover>
  );
}
