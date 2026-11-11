"use client";

// The only component that renders findings. A card is one sentence: the
// quote once, then one part per agent that flagged it, then one footer
// that acts on the whole card. Popover, panel and criterion views all use
// it; the surface changes layout only. Actions live in lib/review/actions.ts.

import { useEffect, useRef, useState } from "react";

import { AgentChip } from "@/components/ui/AgentChip";
import { EvidenceChip, EvidencePopover } from "@/components/review/FindingEvidence";
import { identityOf } from "@/lib/agent-identity";
import {
  copyReplacement,
  markCardNotApplicable,
  reopenCard,
  resolveCard,
  useReplacement as applyReplacement,
} from "@/lib/review/actions";
import type { FindingView, SentenceCard } from "@/lib/review/findings";
import { useStore } from "@/lib/store";
import type { Pase, Severidad } from "@/lib/storage/types";

export type FindingProps = {
  card: SentenceCard;
  /** Layout only: the panel shows the quote; popover and criterion do not. */
  surface: "popover" | "panel" | "criterion";
};

const PASE_LABEL: Record<Pase, string> = {
  coherencia: "Coherencia",
  estilo: "Estilo",
  argumento: "Argumentación",
  apa: "Citas APA",
};

const IMPORTANCE: Record<Severidad, { label: string; bars: number }> = {
  alta: { label: "Importante", bars: 3 },
  media: { label: "Media", bars: 2 },
  baja: { label: "Menor", bars: 1 },
};

function Bars({ count }: { count: number }) {
  const op = (i: number) => (i < count ? 1 : 0.25);
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className="flex-none">
      <rect x="1" y="8" width="3" height="5" rx="1" fill="var(--color-ink-1)" opacity={op(0)} />
      <rect x="5.5" y="5" width="3" height="8" rx="1" fill="var(--color-ink-1)" opacity={op(1)} />
      <rect x="10" y="2" width="3" height="11" rx="1" fill="var(--color-ink-1)" opacity={op(2)} />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className="flex-none">
      <rect x="4.5" y="4.5" width="7.5" height="7.5" rx="1.5" fill="none" stroke="var(--color-ink-2)" strokeWidth="1.3" />
      <path d="M9.5 2.5H3.5a1 1 0 0 0-1 1v6" fill="none" stroke="var(--color-ink-2)" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function Part({
  finding,
  surface,
  footer,
}: {
  finding: FindingView;
  surface: FindingProps["surface"];
  footer?: React.ReactNode;
}) {
  const rubrica = useStore((s) => s.current?.rubrica);
  const fuentes = useStore((s) => s.current?.fuentes);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
    },
    [],
  );

  const id = identityOf(finding.sage);
  const criterio = finding.criterioId
    ? rubrica?.criterios.find((c) => c.id === finding.criterioId)
    : undefined;
  const where = criterio?.nombre ?? PASE_LABEL[finding.pase] ?? finding.pase;
  const importance = IMPORTANCE[finding.severidad] ?? IMPORTANCE.media;
  const resolved = finding.status === "resolved";

  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const chipRef = useRef<HTMLButtonElement | null>(null);
  const hasEvidence = !!finding.evidence && finding.evidence.length > 0;
  const chip = hasEvidence ? (
    <EvidenceChip
      evidence={finding.evidence}
      sources={fuentes}
      chipRef={chipRef}
      open={evidenceOpen}
      onToggle={() => setEvidenceOpen((o) => !o)}
    />
  ) : null;

  // Usar este texto and Copiar exist only on a part that has a replacement.
  const canUse = finding.located && !finding.spansBlocks && !!finding.reemplazo && !resolved;

  const onCopy = () => {
    void copyReplacement(finding.id)
      .then(() => {
        setCopied(true);
        if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
        copiedTimer.current = window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => setCopied(false));
  };

  return (
    <div
      data-testid="finding-part"
      data-finding-id={finding.id}
      data-status={finding.status}
      className="flex flex-col gap-[12px] px-[16px]"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-[8px]">
          <AgentChip author={finding.sage} size={16} badge={26} />
          <span className="text-[13px] font-semibold leading-[16px] text-ink-1">{id.name}</span>
          {surface !== "criterion" ? (
            <span className="text-[13px] leading-[16px] text-ink-3" data-testid="finding-where">
              en {where}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-[6px]" data-testid="finding-importance">
          <Bars count={importance.bars} />
          <span className="text-[12px] font-medium leading-[16px] text-ink-2">
            {importance.label}
          </span>
        </div>
      </div>

      <div className="text-[15px] leading-[22px] text-ink-2" data-testid="finding-mensaje">
        {finding.mensaje}
      </div>

      {finding.reemplazo ? (
        <div className="flex flex-col gap-[12px] rounded-[12px] bg-shade pb-[12px] pl-[16px] pr-[14px] pt-[14px]">
          <div
            data-testid="finding-replacement"
            className="font-serif text-[17px] leading-[25px] text-ink-1"
          >
            {finding.reemplazo}
          </div>
          {finding.spansBlocks && finding.located ? (
            <div className="text-[13px] leading-[18px] text-ink-2">
              Abarca varios párrafos. Cópialo y pégalo a mano.
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-[12px]">
            <div className="flex min-w-0 flex-1 items-center gap-[6px]">{chip}</div>
            <div className="flex items-center gap-[6px]">
              <button
                type="button"
                data-testid="finding-copy"
                onClick={onCopy}
                className="flex h-[30px] cursor-pointer items-center gap-[6px] rounded-[8px] bg-sheet px-[10px] text-[13px] font-medium leading-[16px] text-ink-1 shadow-[0_0_0_1px_var(--color-rule-2)] transition-transform duration-[120ms] active:scale-[0.97]"
              >
                <CopyIcon />
                {copied ? "Copiado" : "Copiar"}
              </button>
              {canUse ? (
                <button
                  type="button"
                  data-testid="finding-use"
                  onClick={() => {
                    applyReplacement(finding.id);
                  }}
                  className="flex h-[30px] cursor-pointer items-center rounded-[8px] bg-ink-1 px-[12px] text-[13px] font-semibold leading-[16px] text-white transition-transform duration-[120ms] active:scale-[0.97]"
                >
                  Usar este texto
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : chip ? (
        <div className="flex items-center">{chip}</div>
      ) : null}

      {hasEvidence ? (
        <EvidencePopover
          anchor={chipRef}
          open={evidenceOpen}
          onClose={() => setEvidenceOpen(false)}
          evidence={finding.evidence}
          sources={fuentes}
        />
      ) : null}

      {footer}
    </div>
  );
}

export function Finding({ card, surface }: FindingProps) {
  const first = card.findings[0];
  const id = identityOf(first.sage);
  const resolved = card.status === "resolved";
  const showQuote = surface === "panel" || !card.located;
  // In the lists the card has no padding of its own (Paper R4.2b: 8 px
  // between quote and parts, 30 px between cards).
  const inList = surface !== "popover";
  const ids = card.findings.map((f) => f.id);
  const openIds = card.findings.filter((f) => f.status === "open").map((f) => f.id);

  const footer = (
    <div className="flex items-center justify-between px-[2px] pt-[2px]">
      <button
        type="button"
        data-testid="finding-resolve"
        aria-pressed={resolved}
        onClick={() => (resolved ? reopenCard(ids) : resolveCard(openIds))}
        className="flex cursor-pointer items-center gap-[8px] text-[13px] font-medium leading-[16px] text-ink-1"
      >
        {resolved ? (
          <span className="grid h-[18px] w-[18px] flex-none place-items-center rounded-[6px] bg-ink-1">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <path d="M2.8 6.2l2.1 2.1 4.3-4.4" fill="none" stroke="#FFFFFF" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        ) : (
          <span className="h-[18px] w-[18px] flex-none rounded-[6px] shadow-[inset_0_0_0_1.5px_var(--color-ink-3)]" />
        )}
        Ya lo resolví
      </button>
      {!resolved ? (
        <button
          type="button"
          data-testid="finding-not-applicable"
          onClick={() => markCardNotApplicable(openIds)}
          className="cursor-pointer text-[13px] font-medium leading-[16px] text-ink-3"
        >
          No aplica
        </button>
      ) : null}
    </div>
  );

  return (
    <div
      data-testid="finding-card"
      data-finding-id={first.id}
      data-status={card.status}
      className={`flex flex-col gap-[8px] font-sans ${inList ? "" : "pb-[14px] pt-[16px]"}`}
    >
      {showQuote ? (
        <div className="px-[16px]">
          <div
            className="font-serif text-[16px] leading-[24px] whitespace-pre-wrap"
            style={
              card.located
                ? {
                    color: "var(--color-ink-1)",
                    textDecoration: `underline 2px ${id.line}`,
                    textUnderlineOffset: 4,
                  }
                : { color: "var(--color-ink-2)" }
            }
          >
            {card.quote}
          </div>
          {!card.located ? (
            <div
              data-testid="finding-not-located"
              className="pt-[2px] text-[13px] leading-[18px] text-ink-2"
            >
              No encontré esta frase en el texto.
            </div>
          ) : null}
        </div>
      ) : null}

      {card.parts.map((f, i) => (
        <Part
          key={f.id}
          finding={f}
          surface={surface}
          footer={i === card.parts.length - 1 ? footer : undefined}
        />
      ))}
    </div>
  );
}
