"use client";

// The report card behind the stamp (R5.1): one row per criterion, a way to
// every correction, and, when a check has not run, an invitation that says
// the score he could reach. Never a penalty sentence.

import { agentOfPase, useReviewReading } from "@/components/review/useReviewResult";
import { Popover } from "@/components/ui/Popover";
import { useAnchor } from "@/components/ui/useAnchor";
import { identityOf } from "@/lib/agent-identity";
import { reachableScore } from "@/lib/review/findings";
import { startReview } from "@/lib/review/run";
import { useStore } from "@/lib/store";
import type { Pase } from "@/lib/storage/types";

type ReportCardProps = {
  open: boolean;
  onClose: () => void;
  /** Open Correcciones, narrowed to a criterion or not. */
  onOpenCorrections: (criterioId: string | null) => void;
};

const INVITE: Record<Pase, { title: string; action: string }> = {
  coherencia: { title: "Revisa la coherencia", action: "Revisar coherencia" },
  estilo: { title: "Revisa tu estilo", action: "Revisar estilo" },
  argumento: { title: "Revisa tu argumentación", action: "Revisar argumentación" },
  apa: { title: "Revisa tus citas APA", action: "Revisar citas" },
};

const fmt = (n: number) => {
  const r = Math.round(n * 10) / 10;
  return r >= 10 ? "10" : r.toFixed(1);
};

export function ReportCard({ open, onClose, onOpenCorrections }: ReportCardProps) {
  const reading = useReviewReading();
  const mode = useStore((s) => s.current?.mode ?? "academico");
  const instant = useStore((s) => s.overlayInstant);
  const anchor = useAnchor("stamp");

  const result = reading?.result;
  const missing = result?.wasEvaluated ? result.missingPasadas[0] : undefined;
  const reach = reading && missing ? reachableScore(reading.args, [missing]) : null;
  const invite = missing && reach !== null && result?.overall != null && reach > result.overall ? missing : null;
  const Icon = invite ? identityOf(agentOfPase(invite, mode)).Icon : null;
  const owner = invite ? identityOf(agentOfPase(invite, mode)) : null;

  return (
    <Popover anchor={anchor} open={open} onClose={onClose} instant={instant} width={392} offset={{ x: 82, y: 8 }} testId="report-card">
      <div className="flex flex-col gap-[18px] px-[22px] pb-[18px] pt-[14px] font-sans">
        {result && result.perCriterio.length > 0 ? (
          <div className="flex flex-col gap-[6px]">
            {result.perCriterio.map((b) => (
              <button
                key={b.criterio.id}
                type="button"
                data-testid={`scorebar-criterio-${b.criterio.id}`}
                onClick={() => onOpenCorrections(b.criterio.id)}
                className="-mx-[10px] flex cursor-pointer items-center gap-[12px] rounded-[10px] bg-[#F7F5EF] p-[10px] text-left hover:bg-shade"
              >
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium leading-[20px] text-ink-1">
                  {b.criterio.nombre}
                </span>
                <span
                  className="flex h-[4px] w-[96px] flex-none rounded-[3px]"
                  style={{ background: "rgba(29,27,24,0.10)" }}
                >
                  <span
                    className="h-[4px] rounded-[3px] bg-ink-1"
                    style={{ width: Math.round((Math.max(0, Math.min(10, b.score)) / 10) * 96) }}
                  />
                </span>
                <span className="w-[36px] flex-none text-right font-mono text-[15px] font-semibold leading-[20px] text-ink-1">
                  {fmt(b.score)}
                </span>
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className="flex-none">
                  <path d="M5 3l4 4-4 4" fill="none" stroke="var(--color-ink-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ))}
          </div>
        ) : null}

        <button
          type="button"
          data-testid="stamp-all-corrections"
          onClick={() => onOpenCorrections(null)}
          className="flex h-[40px] flex-none cursor-pointer items-center justify-between rounded-[10px] bg-sheet px-[12px] text-[14px] font-semibold leading-[18px] text-ink-1 shadow-[0_0_0_1px_rgba(29,27,24,0.15),0_1px_2px_rgba(29,27,24,0.06)]"
        >
          Todas las correcciones
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className="flex-none">
            <path d="M5 3l4 4-4 4" fill="none" stroke="var(--color-ink-1)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {invite && owner && Icon && reach !== null ? (
          <div className="flex items-center gap-[12px] pt-[4px]" data-testid="report-invite">
            <span
              className={`grid h-[30px] w-[30px] flex-none place-items-center rounded-[8px] ${owner.chipClass}`}
              style={{ color: owner.ink }}
            >
              <Icon size={16} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
              <span className="text-[15px] font-medium leading-[20px] text-ink-1">{INVITE[invite].title}</span>
              <span className="text-[13px] leading-[18px] text-ink-3">Puedes llegar a {fmt(reach)}</span>
            </span>
            <button
              type="button"
              data-testid="report-invite-run"
              onClick={() => {
                onClose();
                startReview([invite]);
              }}
              className="flex h-[32px] flex-none cursor-pointer items-center rounded-[8px] bg-ink-1 px-[12px] text-[13px] font-semibold leading-[16px] text-white transition-transform duration-[120ms] active:scale-[0.97]"
            >
              {INVITE[invite].action}
            </button>
          </div>
        ) : null}
      </div>
    </Popover>
  );
}
