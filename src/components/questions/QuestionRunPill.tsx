"use client";

// Status and stop while a question run is on (Paper R3.2, and the stopping
// state of "Preguntas, parar a la mitad"). It centers over the board and
// leaves with a 200 ms fade when the run ends. `data-board-surface` sends
// Cmd Z to the board after a press here.

import { useEffect, useState } from "react";
import { Tooltip } from "@/components/ui/Tooltip";
import { stopQuestionRun } from "@/lib/questions/run";
import { useStore } from "@/lib/store";

type Spot = { x: number; top: number };

/** Center of the board column, a little below its top edge. Re-measured, since the board can open after the run starts. */
function useBoardSpot(on: boolean): Spot | null {
  const [spot, setSpot] = useState<Spot | null>(null);
  useEffect(() => {
    if (!on) return;
    const measure = () => {
      const board = document.querySelector<HTMLElement>(".board-grid");
      const next: Spot = board
        ? (() => {
            const r = board.getBoundingClientRect();
            return { x: r.left + r.width / 2, top: r.top + 8 };
          })()
        : { x: window.innerWidth / 2, top: 64 };
      setSpot((prev) => (prev && prev.x === next.x && prev.top === next.top ? prev : next));
    };
    const first = requestAnimationFrame(measure);
    const timer = setInterval(measure, 250);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(first);
      clearInterval(timer);
      window.removeEventListener("resize", measure);
    };
  }, [on]);
  return spot;
}

function Spinner({ stopping }: { stopping: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="flex-none motion-safe:animate-spin"
    >
      <circle cx="8" cy="8" r="6" fill="none" stroke="#1D1B181F" strokeWidth="2" />
      <path
        d="M8 2a6 6 0 0 1 6 6"
        fill="none"
        stroke={stopping ? "var(--color-ink-3)" : "var(--color-ink-1)"}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function QuestionRunPill() {
  const run = useStore((s) => s.questionRun);
  const active = !!run && run.status !== "ended";
  const [prevActive, setPrevActive] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [label, setLabel] = useState("");

  // Derived during render: when the run ends, the pill stays for its fade.
  if (active !== prevActive) {
    setPrevActive(active);
    setLeaving(!active);
  }
  if (run && active && run.source.label !== label) setLabel(run.source.label);

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => setLeaving(false), 200);
    return () => clearTimeout(t);
  }, [leaving]);

  const visible = active || leaving;
  const spot = useBoardSpot(visible);
  if (!visible || !spot) return null;

  const stopping = !!run && run.status === "stopping";
  return (
    <div
      data-board-surface
      data-testid="question-pill"
      className="fixed z-[60]"
      style={{ left: spot.x, top: spot.top, transform: "translateX(-50%)" }}
    >
      <div
        className={`flex h-[38px] items-center gap-[10px] rounded-full bg-sheet pl-[14px] shadow-[0_0_0_1px_#1D1B1814,0_10px_24px_-10px_#3C2D0A24] ${
          stopping ? "pr-[16px]" : "pr-[6px]"
        } ${leaving ? "pill-out" : ""}`}
      >
        <Spinner stopping={stopping} />
        <div className="font-sans text-[13px] leading-[16px] text-ink-2 whitespace-nowrap">
          {stopping ? (
            "Deteniendo"
          ) : (
            <>
              Preguntando sobre <span className="font-semibold text-ink-1">{label}</span>
            </>
          )}
        </div>
        {stopping ? null : (
          <Tooltip label="Detener" side="bottom">
            <button
              type="button"
              aria-label="Detener"
              data-testid="question-stop"
              onClick={() => stopQuestionRun()}
              className="grid h-[28px] w-[28px] flex-none cursor-pointer place-items-center rounded-full bg-shade"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <rect x="1" y="1" width="8" height="8" rx="1.5" fill="var(--color-ink-2)" />
              </svg>
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
