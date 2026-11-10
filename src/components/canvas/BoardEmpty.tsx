"use client";

// The empty board (Paper R2.3, R2.7): four ghost notes that land one after the
// other, swap their question every two seconds, fade away and start again,
// with one call to action under them. A sibling of <Tldraw>; only the button
// takes pointer events, so the board underneath stays fully usable. No
// heading, no counter, no explanation. With reduced motion the ghosts sit
// still on their first question.

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { StickyNote } from "@/components/ui/StickyNote";
import { useRegisterAnchor } from "@/components/ui/useAnchor";
import { NotesStack } from "@/components/toolbar/toolbar-icons";
import { identityOf, type AgentId } from "@/lib/agent-identity";
import { useStore } from "@/lib/store";

type Ghost = {
  agent: AgentId;
  first: string;
  second: string;
  /** Paper position inside the 480 x 500 cluster, and tilt in degrees. */
  x: number;
  y: number;
  tilt: number;
  /** Seconds into the 12 s cycle. */
  lands: number;
  swaps: number;
};

const CYCLE = 12;
const FIRST_LANDS = 0.5; // half a second of calm
const STAGGER = 0.06;
const LAND = 0.28;
const FADE = 0.2;
const EXIT = 11.3;
// A question swap is out, then in: the outgoing text is gone before the new one starts.
const HALF = 0.15;

// Voice lines: R2.7 and E6 (Evidencia, Objeciones) and R1.5 (Sistemas, Práctica).
const GHOSTS: readonly Ghost[] = [
  { agent: "em", first: "¿Qué datos lo respaldan?", second: "¿Con cuántos casos?", x: 0, y: 22, tilt: -2, lands: FIRST_LANDS, swaps: 3.5 },
  { agent: "sis", first: "¿Qué une esta idea con la siguiente?", second: "¿Qué lo sostiene día a día?", x: 260, y: 0, tilt: 2.2, lands: FIRST_LANDS + LAND + STAGGER, swaps: 5.5 },
  { agent: "pra", first: "¿Cómo lo aplicarías mañana?", second: "¿Cómo se ve el lunes?", x: 28, y: 240, tilt: 1.4, lands: FIRST_LANDS + LAND + 2 * STAGGER, swaps: 7.5 },
  { agent: "cri", first: "¿Y si fuera al revés?", second: "¿Quién te diría que no?", x: 278, y: 202, tilt: -1.6, lands: FIRST_LANDS + LAND + 3 * STAGGER, swaps: 9.5 },
];

const pct = (t: number) => `${((t / CYCLE) * 100).toFixed(3)}%`;

/** Keyframes are generated from the timeline above, so the 12 s loop has one source. */
function loopCss(): string {
  const out: string[] = [];
  GHOSTS.forEach((g, i) => {
    out.push(`@keyframes be-life-${i} {
  0%, ${pct(g.lands)} { opacity: 0; transform: translateY(-8px) scale(0.96); animation-timing-function: var(--ease-out); }
  ${pct(g.lands + LAND)}, ${pct(EXIT)} { opacity: 0.6; transform: translateY(0) scale(1); animation-timing-function: var(--ease-standard); }
  ${pct(EXIT + FADE)}, 100% { opacity: 0; transform: translateY(0) scale(1); }
}
@keyframes be-q1-${i} {
  0%, ${pct(g.swaps)} { opacity: 1; animation-timing-function: var(--ease-standard); }
  ${pct(g.swaps + HALF)}, ${pct(EXIT + FADE)} { opacity: 0; }
  ${pct(EXIT + FADE + 0.05)}, 100% { opacity: 1; }
}
@keyframes be-q2-${i} {
  0%, ${pct(g.swaps + HALF)} { opacity: 0; animation-timing-function: var(--ease-standard); }
  ${pct(g.swaps + 2 * HALF)}, ${pct(EXIT + FADE)} { opacity: 1; }
  ${pct(EXIT + FADE + 0.05)}, 100% { opacity: 0; }
}
@keyframes be-tape-${i} {
  0%, ${pct(g.lands + STAGGER)} { transform: translateY(-6px); }
  ${pct(g.lands + STAGGER + 0.2)}, 100% { transform: translateY(0); }
}
.be-on .be-ghost-${i} { animation: be-life-${i} ${CYCLE}s infinite both; }
.be-on .be-ghost-${i} .be-q1 { animation: be-q1-${i} ${CYCLE}s infinite both; }
.be-on .be-ghost-${i} .be-q2 { animation: be-q2-${i} ${CYCLE}s infinite both; }
.be-on .be-ghost-${i} .note-tape { animation: be-tape-${i} ${CYCLE}s infinite both; }`);
  });
  out.push(`.be-layer { transition: opacity ${FADE}s var(--ease-standard), visibility 0s linear ${FADE}s; }
.be-layer[data-empty="false"] { opacity: 0; visibility: hidden; pointer-events: none; }
.be-ghost { opacity: 0.6; }
.be-q2 { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .be-on .be-ghost, .be-on .be-ghost .be-q1, .be-on .be-ghost .be-q2, .be-on .be-ghost .note-tape { animation: none !important; }
  .be-layer { transition: none; }
}`);
  return out.join("\n");
}

const CLUSTER_W = 480;
const CLUSTER_H = 500;

export function BoardEmpty({ empty }: { empty: boolean }) {
  const openLectura = useStore((s) => s.openLectura);
  const ref = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  // Only the visible call to action is the anchor for the Hazme preguntas panel.
  const anchor = useRegisterAnchor("hazme");

  // Narrow boards shrink the cluster instead of clipping it.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setScale(Math.min(1, (w - 32) / CLUSTER_W, (h - 32) / CLUSTER_H));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const style: CSSProperties = {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: CLUSTER_W,
    height: CLUSTER_H,
    transform: `translate(-50%, -50%) scale(${Math.max(0.5, scale)})`,
    transformOrigin: "50% 50%",
  };

  return (
    <div
      ref={ref}
      data-testid="board-empty"
      data-empty={empty}
      className={`be-layer absolute inset-0 z-[2] pointer-events-none ${empty ? "be-on" : ""}`}
    >
      <style>{loopCss()}</style>
      <div style={style}>
        {GHOSTS.map((g, i) => {
          const id = identityOf(g.agent);
          return (
            <div
              key={g.agent}
              aria-hidden="true"
              className={`be-ghost be-ghost-${i}`}
              style={{ position: "absolute", left: g.x, top: g.y, width: 196 }}
            >
              <StickyNote author={g.agent} tilt={g.tilt} width={196}>
                <div style={{ display: "grid", color: id.text }}>
                  <span className="be-q1" style={{ gridArea: "1 / 1" }}>{g.first}</span>
                  <span className="be-q2" style={{ gridArea: "1 / 1" }}>{g.second}</span>
                </div>
              </StickyNote>
            </div>
          );
        })}
        <button
          ref={empty ? anchor : undefined}
          type="button"
          data-testid="board-empty-cta"
          tabIndex={empty ? 0 : -1}
          onClick={(e) => openLectura(undefined, undefined, { instant: e.detail === 0 })}
          className="press absolute flex items-center gap-[10px] h-[44px] pl-[14px] pr-[18px] rounded-[12px] bg-sheet cursor-pointer whitespace-nowrap pointer-events-auto shadow-[0_0_0_1px_#1D1B181A,0_1px_2px_#1D1B180F,0_12px_24px_-10px_#3C2D0A26]"
          style={{ left: 124, top: 456 }}
        >
          <NotesStack />
          <span className="font-sans text-[15px] font-semibold leading-[18px] text-ink-1">Hazme preguntas</span>
        </button>
      </div>
    </div>
  );
}
