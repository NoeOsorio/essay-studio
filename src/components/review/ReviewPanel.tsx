"use client";

// Revisar ensayo (Paper R4.1 and the Slice 0 running and failure states).
// A small panel hanging from the toolbar button. Agents are filled toggles,
// not check boxes: color means active, paper means off. While a run is
// active the panel shows one line per agent and Cancelar. The run itself
// belongs to `src/lib/review/run.ts`; closing the panel never stops it.

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { Popover } from "@/components/ui/Popover";
import { Tooltip } from "@/components/ui/Tooltip";
import { useAnchor } from "@/components/ui/useAnchor";
import { identityOf } from "@/lib/agent-identity";
import { cancelReview, defaultReviewPases, dismissReview, startReview } from "@/lib/review/run";
import { agentOfPase } from "@/components/review/useReviewResult";
import { ALL_PASES } from "@/lib/sages";
import { useStore } from "@/lib/store";
import type { EssayMode, Pase } from "@/lib/storage/types";

const PASE_LABEL: Record<Pase, string> = {
  coherencia: "Coherencia",
  estilo: "Estilo",
  argumento: "Argumento",
  apa: "Citas APA",
};

/** Tile tilt and tape tilt, copied from Paper R4.1. */
const TILT: Record<Pase, { rotate: number; tape: number }> = {
  coherencia: { rotate: 1.6, tape: 3 },
  estilo: { rotate: -2, tape: -4 },
  argumento: { rotate: 2.2, tape: -5 },
  apa: { rotate: -1, tape: -3 },
};

function tooltipOf(pase: Pase, mode: EssayMode): string {
  const who = identityOf(agentOfPase(pase, mode)).name;
  switch (pase) {
    case "coherencia":
      return `${who} revisa que las ideas se sostengan entre sí.`;
    case "estilo":
      return `${who} revisa que el texto se lea claro y preciso.`;
    case "argumento":
      return `${who} revisa que tus argumentos resistan una objeción.`;
    case "apa":
      return `${who} revisa que tus citas sigan APA.`;
  }
}

function PaseIcon({ pase, mode, size }: { pase: Pase; mode: EssayMode; size: number }) {
  const Icon = identityOf(agentOfPase(pase, mode)).Icon;
  return <Icon size={size} />;
}

export function ReviewPanel() {
  const open = useStore((s) => s.overlay === "review" && s.current !== null);
  const instant = useStore((s) => s.overlayInstant);
  const setOverlay = useStore((s) => s.setOverlay);
  const anchor = useAnchor("revisar");
  const essayId = useStore((s) => s.current?.id ?? null);

  const onClose = () => {
    setOverlay(null);
    // A settled run leaves its failure line behind; closing clears it.
    dismissReview();
  };

  return (
    <Popover
      anchor={anchor}
      open={open}
      onClose={onClose}
      side="bottom"
      align="end"
      width={392}
      instant={instant}
      testId="pluma-overlay"
    >
      {open && essayId ? <PanelBody key={essayId} onClose={onClose} /> : null}
    </Popover>
  );
}

const FEW = ["", "una", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez"];

/** Paper E7: «A no entró en esta revisión.» up to «A, B y dos más no entraron en esta revisión.» */
export function leftOutSentence(names: readonly string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return `${names[0]} no entró en esta revisión.`;
  if (names.length === 2) return `${names[0]} y ${names[1]} no entraron en esta revisión.`;
  const rest = names.length - 2;
  const more = rest <= 10 ? FEW[rest] : String(rest);
  return `${names[0]}, ${names[1]} y ${more} más no entraron en esta revisión.`;
}

/**
 * The one quiet line for sources a review left out. It sits under the title of
 * Correcciones (Paper E7), and nothing renders when every source fit.
 */
export function SourcesLeftOutLine() {
  const names = useStore((s) =>
    s.reviewOutcome?.essayId === s.current?.id &&
    (s.reviewOutcome?.kind === "done" || s.reviewOutcome?.kind === "some_failed")
      ? s.reviewOutcome.fuentesOmitidas
      : undefined,
  );
  if (!names?.length) return null;
  return (
    <div className="flex-none px-[22px] pt-[6px]" data-testid="review-sources-left-out">
      <div className="text-[13px] leading-[18px] text-ink-3">{leftOutSentence(names)}</div>
    </div>
  );
}

function PanelBody({ onClose }: { onClose: () => void }) {
  const essayId = useStore((s) => s.current?.id ?? "");
  const mode = useStore((s) => s.current?.mode ?? "academico");
  const hadReview = useStore((s) => !!s.current?.evaluacionMeta);
  const review = useStore((s) => (s.review?.essayId === s.current?.id ? s.review : null));
  const outcome = useStore((s) =>
    s.reviewOutcome?.essayId === s.current?.id ? s.reviewOutcome : null,
  );
  const [selected, setSelected] = useState<Pase[]>(() => defaultReviewPases());

  const running = !!review && ALL_PASES.some((p) => review.passes[p].status === "running");
  const available = ALL_PASES.filter((p) => p !== "apa" || mode === "academico");
  const chosen = selected.filter((p) => available.includes(p));

  // The review landed while this panel was open: the findings are in the
  // text, so the panel gets out of the way. A panel opened later, after a run
  // that finished behind it, starts on the options.
  const finished = outcome?.kind === "done";
  const sawRunning = useRef(running);
  useEffect(() => {
    if (running) sawRunning.current = true;
    if (finished && !running && sawRunning.current) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, running]);

  const start = () => {
    if (chosen.length > 0) startReview(chosen);
  };

  // Cmd+Enter starts the review from anywhere inside the panel.
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !running) {
      e.preventDefault();
      start();
    }
  };

  const failedState =
    !running && outcome && (outcome.kind === "all_failed" || outcome.kind === "some_failed");

  return (
    <div data-essay={essayId} onKeyDown={onKeyDown} className="font-sans">
      {running && review ? (
        <RunningLines review={review} mode={mode} />
      ) : !running && outcome?.kind === "too_long" ? (
        <div data-testid="review-too-long" className="px-[16px] py-[14px] text-[15px] leading-[20px] text-ink-1">
          Tu ensayo es demasiado largo para revisarlo de una vez.
        </div>
      ) : failedState && outcome ? (
        <FailureLine
          outcome={outcome}
          mode={mode}
          hadReview={hadReview}
          review={review}
          fallback={chosen}
        />
      ) : (
        <Options
          mode={mode}
          available={available}
          chosen={chosen}
          onToggle={(p) =>
            setSelected((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]))
          }
          onStart={start}
          onClose={onClose}
        />
      )}
    </div>
  );
}

function Options({
  mode,
  available,
  chosen,
  onToggle,
  onStart,
  onClose,
}: {
  mode: EssayMode;
  available: Pase[];
  chosen: Pase[];
  onToggle: (p: Pase) => void;
  onStart: () => void;
  onClose: () => void;
}) {
  const none = chosen.length === 0;
  return (
    <div className="flex flex-col gap-[16px] p-[20px]">
      <div className="flex items-start justify-between gap-[12px]">
        <div className="flex flex-col gap-[4px]">
          <div className="text-[22px] font-semibold leading-[28px] tracking-[-0.01em] text-ink-1">
            ¿Qué quieres que revisen?
          </div>
          <div className="text-[15px] leading-[20px] text-ink-3">Con tu rúbrica y tus fuentes</div>
        </div>
        <button
          type="button"
          aria-label="Cerrar"
          onClick={onClose}
          className="grid h-[28px] w-[28px] flex-none cursor-pointer place-items-center rounded-[8px] hover:bg-shade"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path
              d="M3.5 3.5l7 7M10.5 3.5l-7 7"
              fill="none"
              stroke="var(--color-ink-3)"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <div className="flex gap-[10px] pb-[12px] pt-[18px]">
        {available.map((pase) => {
          const active = chosen.includes(pase);
          const id = identityOf(agentOfPase(pase, mode));
          const tilt = TILT[pase];
          return (
            <Tooltip key={pase} label={tooltipOf(pase, mode)} side="top" sentence>
              <button
                type="button"
                data-testid={`pluma-pase-toggle-${pase}`}
                data-active={active}
                aria-pressed={active}
                onClick={() => onToggle(pase)}
                className="relative flex h-[76px] w-[80px] flex-none cursor-pointer flex-col items-center justify-center gap-[6px] rounded-[3px] pt-[6px] transition-transform duration-[120ms]"
                style={{
                  rotate: `${tilt.rotate}deg`,
                  background: active ? id.note : "var(--color-sheet)",
                  color: active ? id.ink : "var(--color-ink-3)",
                  boxShadow: active
                    ? "0 1px 1px #3C2D0A14, 0 8px 14px -8px #3C2D0A40"
                    : "0 1px 1px #3C2D0A14, 0 8px 14px -8px #3C2D0A40, 0 0 0 1px #1D1B180F",
                }}
              >
                <PaseIcon pase={pase} mode={mode} size={18} />
                <span className="text-[13px] font-semibold leading-[16px]">{PASE_LABEL[pase]}</span>
                <span
                  aria-hidden="true"
                  className="absolute left-[22px] top-[-8px] h-[14px] w-[36px]"
                  style={{
                    rotate: `${tilt.tape}deg`,
                    background: active ? "#FFFDF5BD" : "#E2DAC6B3",
                    boxShadow: "0 1px 3px #3C2D0A29",
                  }}
                />
              </button>
            </Tooltip>
          );
        })}
      </div>

      <Tooltip label="Revisar" shortcut="⌘↩">
        <button
          type="button"
          data-testid="pluma-start"
          disabled={none}
          onClick={onStart}
          className={`flex h-[44px] w-full flex-none items-center justify-center rounded-[10px] text-[15px] font-semibold leading-[20px] ${
            none
              ? "cursor-default bg-shade text-ink-3"
              : "cursor-pointer bg-ink-1 text-white shadow-[inset_0_1px_0_#FFFFFF1F,0_2px_0_#000000,0_3px_8px_#1D1B182E] press"
          }`}
        >
          Revisar
        </button>
      </Tooltip>
    </div>
  );
}

function RunningLines({
  review,
  mode,
}: {
  review: NonNullable<ReturnType<typeof useStore.getState>["review"]>;
  mode: EssayMode;
}) {
  const lines = ALL_PASES.filter((p) => review.passes[p].status !== "idle");
  return (
    <div className="flex flex-col gap-[16px] p-[20px]">
      <div role="status" className="text-[22px] font-semibold leading-[28px] text-ink-1">
        Revisando
      </div>
      <div className="flex flex-col gap-[2px]">
        {lines.map((pase) => {
          const st = review.passes[pase];
          const id = identityOf(agentOfPase(pase, mode));
          const Icon = id.Icon;
          const pct = st.status === "running" ? st.progress : st.status === "failed" ? 0 : 100;
          return (
            <div
              key={pase}
              data-testid={`pluma-run-${pase}`}
              data-status={st.status}
              className="flex h-[44px] flex-none items-center gap-[12px] px-[8px]"
            >
              <span
                className="grid h-[26px] w-[26px] flex-none place-items-center rounded-[8px]"
                style={{ background: id.note, color: id.ink }}
              >
                <Icon size={16} />
              </span>
              <span className="w-[100px] flex-none text-[15px] font-medium leading-[20px] text-ink-1">
                {PASE_LABEL[pase]}
              </span>
              <span
                role="progressbar"
                aria-valuenow={Math.round(pct)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={PASE_LABEL[pase]}
                className="flex h-[4px] grow rounded-full bg-shade"
              >
                <span
                  className="h-[4px] rounded-full"
                  style={{
                    width: "100%",
                    transform: `scaleX(${Math.round(pct) / 100})`,
                    transformOrigin: "left",
                    background: id.dot,
                    transition: "transform 320ms cubic-bezier(0.23, 1, 0.32, 1)",
                  }}
                />
              </span>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        data-testid="pluma-cancel"
        onClick={() => cancelReview()}
        className="flex h-[44px] w-full flex-none cursor-pointer items-center justify-center rounded-[12px] bg-sheet text-[15px] font-semibold leading-[20px] text-ink-1 shadow-[0_0_0_1px_#1D1B181A] press"
      >
        Cancelar
      </button>
    </div>
  );
}

function FailureLine({
  outcome,
  mode,
  hadReview,
  review,
  fallback,
}: {
  outcome: { kind: "all_failed" } | { kind: "some_failed"; failed: Pase[] } | { kind: string };
  mode: EssayMode;
  hadReview: boolean;
  review: ReturnType<typeof useStore.getState>["review"];
  fallback: Pase[];
}) {
  const some = outcome.kind === "some_failed" ? (outcome as { failed: Pase[] }).failed : null;
  // All failed: retry what the run attempted (its passes keep their status).
  const attempted = review ? ALL_PASES.filter((p) => review.passes[p].status !== "idle") : [];
  const retry = some ?? (attempted.length > 0 ? attempted : fallback);

  let lead: string;
  let tail: string | null = null;
  if (some) {
    const names = some.map((p) => PASE_LABEL[p]);
    const joined = names.length > 1 ? `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}` : names[0];
    lead = `${joined} ${names.length > 1 ? "no terminaron" : "no terminó"}.`;
  } else {
    lead = "No se pudo revisar.";
    tail = hadReview ? "Tu revisión anterior sigue igual." : null;
  }
  const first = some?.[0];
  const id = first ? identityOf(agentOfPase(first, mode)) : null;
  const Icon = id?.Icon;

  return (
    <div data-testid="review-failure" className="flex items-center gap-[10px] px-[16px] py-[14px]">
      {id && Icon ? (
        <span
          className="grid h-[26px] w-[26px] flex-none place-items-center rounded-[8px]"
          style={{ background: id.note, color: id.ink }}
        >
          <Icon size={16} />
        </span>
      ) : null}
      <div className="min-w-0 grow text-[15px] leading-[20px] text-ink-1">
        {lead}
        {tail ? <span className="text-ink-3">{` ${tail}`}</span> : null}
      </div>
      <button
        type="button"
        data-testid="review-retry"
        onClick={() => startReview(retry)}
        className="flex h-[30px] flex-none cursor-pointer items-center rounded-[8px] bg-sheet px-[12px] text-[13px] font-medium leading-[16px] text-ink-1 shadow-[0_0_0_1px_#1D1B181A] press"
      >
        Reintentar
      </button>
    </div>
  );
}
