"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { useStore } from "@/lib/store";
import {
  computeBenchmark,
  extractAnotacionesFromContent,
  MAX_SCORE,
  type BenchmarkResult,
  type CriterioBreakdown,
} from "@/lib/benchmark/score";
import { BenchmarkDrilldown } from "./BenchmarkDrilldown";

const SAGE_COLOR: Record<string, string> = {
  em: "var(--color-em)",
  sis: "var(--color-sis)",
  pra: "var(--color-pra)",
  cri: "var(--color-cri)",
};

/**
 * Benchmark strip pinned at the bottom of the editor view.
 *
 * The score is *not* asked of the model — it's a deterministic function
 * of the anotaciones the council has applied to the essay (see
 * `lib/benchmark/score.ts`). 10/10 means the council has nothing left
 * to flag; descartar an anotación lifts the relevant score directly.
 *
 * Three states:
 *   - no anotaciones      → "—" + CTA "Corre Evaluar"
 *   - anotaciones, no rúbrica → overall ring + nudge "Define una rúbrica para puntuar por criterio"
 *   - anotaciones + rúbrica   → overall ring + one ring per criterio
 */
export function Scorebar() {
  const current = useStore((s) => s.current);
  const openPlumaRoja = useStore((s) => s.openPlumaRoja);
  const openRubrica = useStore((s) => s.openRubrica);

  const result = useMemo<BenchmarkResult>(() => {
    if (!current) {
      return {
        overall: null,
        perCriterio: [],
        general: [],
        hasRubrica: false,
        hasAnotaciones: false,
        wasEvaluated: false,
        pasadasCubiertas: null,
        pasadasDisponibles: [],
        missingPasadas: [],
        coverageRatio: 0,
        isStale: false,
      };
    }
    const anotaciones = extractAnotacionesFromContent(current.content);
    return computeBenchmark({
      anotaciones,
      rubrica: current.rubrica,
      evaluacionMeta: current.evaluacionMeta,
      essayMode: current.mode,
      essayUpdatedAt: current.updatedAt,
    });
  }, [current]);

  // Drilldown panel: { kind: "criterio" | "general", id?: criterioId }
  type DrillTarget =
    | { kind: "criterio"; criterioId: string }
    | { kind: "general" }
    | null;
  const [drill, setDrill] = useState<DrillTarget>(null);

  if (!current) return null;

  return (
    <div className="relative">
      {drill ? (
        <BenchmarkDrilldown
          breakdown={
            drill.kind === "criterio"
              ? result.perCriterio.find(
                  (b) => b.criterio.id === drill.criterioId,
                ) ?? null
              : null
          }
          general={drill.kind === "general" ? result.general : null}
          onClose={() => setDrill(null)}
        />
      ) : null}

      <div
        className="grid items-center gap-9 px-8 py-5 border-t border-rule-2"
        style={{
          gridTemplateColumns: "minmax(220px,auto) 1fr auto",
          background:
            "linear-gradient(180deg, var(--color-paper-2), var(--color-paper-3))",
        }}
        data-testid="scorebar"
      >
        {/* Left — overall ring */}
        <div className="flex items-center gap-[18px]">
          <OverallRing
            score={result.overall}
            wasEvaluated={result.wasEvaluated}
            isStale={result.isStale}
          />
          <div className="flex flex-col gap-[5px]">
            <span className="font-mono text-[10px] font-semibold text-ink-3 tracking-[0.14em] uppercase">
              Benchmark
              {result.isStale ? (
                <span
                  className="ml-1.5 inline-flex items-center gap-1 normal-case tracking-normal text-ink-2"
                  data-testid="scorebar-stale"
                >
                  <span className="w-[6px] h-[6px] rounded-full bg-em" />
                  <span className="font-mono text-[9px] uppercase tracking-[0.12em]">
                    stale
                  </span>
                </span>
              ) : null}
            </span>
            <BenchmarkSummary result={result} />
          </div>
        </div>

        {/* Center — per-criterio rings, or contextual hint */}
        <div className="flex items-center justify-center gap-1.5 min-h-[78px]">
          {result.wasEvaluated && result.hasRubrica ? (
            <>
              {result.perCriterio.map((b) => (
                <CriterioRing
                  key={b.criterio.id}
                  breakdown={b}
                  onClick={() =>
                    setDrill({
                      kind: "criterio",
                      criterioId: b.criterio.id,
                    })
                  }
                />
              ))}
              {result.general.length > 0 ? (
                <GeneralRing
                  count={result.general.length}
                  onClick={() => setDrill({ kind: "general" })}
                />
              ) : null}
            </>
          ) : result.wasEvaluated && !result.hasRubrica ? (
            <span className="font-serif italic text-[12.5px] text-ink-3 px-4 text-center max-w-[480px]">
              Define una{" "}
              <button
                type="button"
                onClick={openRubrica}
                className="underline decoration-rule-3 underline-offset-2 hover:text-ink-1 cursor-pointer"
              >
                rúbrica
              </button>{" "}
              para ver el puntaje por criterio.
            </span>
          ) : (
            <span className="font-serif italic text-[12.5px] text-ink-3 px-4 text-center">
              Corre Evaluar para puntuar el ensayo.
            </span>
          )}
        </div>

        {/* Right — CTA contextual */}
        <div className="flex gap-2.5 items-center">
          {!result.wasEvaluated ? (
            <Button
              variant="dark"
              onClick={openPlumaRoja}
              data-testid="scorebar-cta-evaluar"
            >
              Evaluar
            </Button>
          ) : (
            <Button
              variant="dark"
              onClick={openPlumaRoja}
              data-testid="scorebar-cta-evaluar"
              title={
                result.isStale
                  ? "El ensayo cambió desde la última revisión — vuelve a correr Evaluar"
                  : "Vuelve a correr Evaluar para refrescar el benchmark"
              }
            >
              Re-evaluar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function BenchmarkSummary({ result }: { result: BenchmarkResult }) {
  // State 1: never ran Evaluar.
  if (!result.wasEvaluated) {
    return (
      <>
        <span className="font-serif italic text-[13px] text-ink-3">
          Sin datos del consejo todavía.
        </span>
        <span className="font-mono text-[10px] text-ink-3 tracking-[0.04em]">
          10/10 cuando el consejo no encuentre nada que arreglar.
        </span>
      </>
    );
  }
  const total =
    result.perCriterio.reduce((n, b) => n + b.anotaciones.length, 0) +
    result.general.length;
  const isPerfect = total === 0 && result.coverageRatio >= 1;
  const isPerfectClean = total === 0 && result.coverageRatio < 1;

  // State 2: perfect with full coverage → the real 10/10.
  if (isPerfect) {
    return (
      <>
        <span className="font-serif italic text-[13px] text-ok">
          Sin pendientes
        </span>
        <span className="font-mono text-[10px] text-ink-3 tracking-[0.04em]">
          El consejo no tiene nada que decir.
        </span>
      </>
    );
  }

  // State 3: clean but partial coverage — show how far you've covered.
  if (isPerfectClean) {
    return (
      <>
        <span className="font-serif italic text-[13px] text-ink-2">
          Sin pendientes en lo revisado
        </span>
        <span
          className="font-mono text-[10px] text-ink-3 tracking-[0.04em]"
          data-testid="scorebar-coverage"
        >
          Cobertura {result.pasadasDisponibles.length - result.missingPasadas.length}/
          {result.pasadasDisponibles.length} pasadas · faltan{" "}
          {result.missingPasadas.join(" + ")} para 10/10.
        </span>
      </>
    );
  }

  // State 4: with issues — show count + nudge.
  return (
    <>
      <span className="font-serif italic text-[13px] text-ink-2">
        {total} {total === 1 ? "anotación activa" : "anotaciones activas"}
        {result.missingPasadas.length > 0 ? (
          <span className="text-ink-3">
            {" "}
            · cobertura{" "}
            {result.pasadasDisponibles.length - result.missingPasadas.length}/
            {result.pasadasDisponibles.length}
          </span>
        ) : null}
      </span>
      <span className="font-mono text-[10px] text-ink-3 tracking-[0.04em]">
        10/10 cuando descartes o resuelvas todas
        {result.missingPasadas.length > 0 ? " y corras las pasadas faltantes" : ""}.
      </span>
    </>
  );
}

function OverallRing({
  score,
  wasEvaluated,
  isStale,
}: {
  score: number | null;
  wasEvaluated: boolean;
  isStale: boolean;
}) {
  // pct of the ring filled: empty state shows the ring as a dotted
  // outline rather than a fake "0%".
  const pct = score !== null ? Math.round((score / MAX_SCORE) * 100) : 0;
  // Color: stale uses ámbar to flag uncertainty; perfect uses ok green;
  // otherwise the seal red.
  const colorStop = !wasEvaluated
    ? "var(--color-rule-2)"
    : isStale
      ? "var(--color-em)"
      : score !== null && score >= 9.95
        ? "var(--color-ok)"
        : "var(--color-seal)";
  return (
    <div className="relative w-[84px] h-[84px] flex-none" data-testid="scorebar-overall">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 84 84">
        <circle
          cx="42"
          cy="42"
          r="36"
          fill="none"
          stroke="var(--color-rule-2)"
          strokeWidth="5"
          strokeDasharray={wasEvaluated ? undefined : "2 3"}
        />
        {wasEvaluated && score !== null ? (
          <circle
            cx="42"
            cy="42"
            r="36"
            fill="none"
            stroke={colorStop}
            strokeWidth="5"
            strokeLinecap="round"
            pathLength="100"
            strokeDasharray={`${pct} 100`}
          />
        ) : null}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <b
          className={`font-serif font-medium text-[28px] tracking-[-0.015em] ${
            score === null ? "text-ink-3" : "text-ink-1"
          }`}
        >
          {score === null ? "—" : score.toFixed(1)}
        </b>
        <small className="font-mono text-[10px] font-normal text-ink-3 tracking-[0.1em] mt-[3px]">
          DE 10
        </small>
      </div>
    </div>
  );
}

function CriterioRing({
  breakdown,
  onClick,
}: {
  breakdown: CriterioBreakdown;
  onClick: () => void;
}) {
  const { criterio, score, anotaciones } = breakdown;
  const pct = Math.round((score / MAX_SCORE) * 100);
  // Color picks: dominant sage of the anotaciones, or ink-1 as neutral.
  const sageColor = pickDominantSage(anotaciones);
  const color = sageColor ?? "var(--color-ink-1)";
  const weak = score < 6;
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${criterio.nombre} · ${anotaciones.length} ${
        anotaciones.length === 1 ? "anotación" : "anotaciones"
      }`}
      data-testid={`scorebar-criterio-${criterio.id}`}
      className="flex flex-col items-center gap-2 px-2.5 cursor-pointer group bg-transparent border-0"
    >
      <div className="relative w-14 h-14">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 56 56">
          <circle
            cx="28"
            cy="28"
            r="23"
            fill="none"
            stroke="var(--color-rule-2)"
            strokeWidth="4"
          />
          <circle
            cx="28"
            cy="28"
            r="23"
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeLinecap="round"
            pathLength="100"
            strokeDasharray={`${pct} 100`}
          />
        </svg>
        <span
          className={`absolute inset-0 grid place-items-center font-serif italic font-medium text-[17px] tracking-[-0.01em] ${
            weak ? "text-seal" : "text-ink-1"
          }`}
        >
          {score.toFixed(1)}
        </span>
      </div>
      <span className="font-mono text-[10px] font-semibold text-ink-3 uppercase tracking-[0.1em] group-hover:text-ink-1 max-w-[88px] truncate">
        {criterio.nombre || "—"}
      </span>
    </button>
  );
}

function GeneralRing({
  count,
  onClick,
}: {
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Anotaciones sin criterio · ${count}`}
      data-testid="scorebar-general"
      className="flex flex-col items-center gap-2 px-2.5 cursor-pointer group bg-transparent border-0"
    >
      <div className="relative w-14 h-14 grid place-items-center">
        <span className="font-serif italic font-medium text-[17px] tracking-[-0.01em] text-ink-2">
          {count}
        </span>
        <div className="absolute inset-0 rounded-full border border-dashed border-rule-3" />
      </div>
      <span className="font-mono text-[10px] font-semibold text-ink-3 uppercase tracking-[0.1em] group-hover:text-ink-1">
        Sin criterio
      </span>
    </button>
  );
}

/** Whichever sage shows up most among the anotaciones — for the ring tint. */
function pickDominantSage(anotaciones: { sage: string }[]): string | null {
  if (anotaciones.length === 0) return null;
  const counts = new Map<string, number>();
  for (const a of anotaciones) {
    counts.set(a.sage, (counts.get(a.sage) ?? 0) + 1);
  }
  let bestSage: string | null = null;
  let bestCount = 0;
  for (const [sage, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      bestSage = sage;
    }
  }
  return bestSage ? SAGE_COLOR[bestSage] ?? null : null;
}
