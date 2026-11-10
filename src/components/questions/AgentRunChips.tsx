"use client";

// One chip over each column of the run (Paper R3.2 and R3.4, and the failure
// line of "Cuando algo falla"). Thinking: icon, name and a voice line that
// changes every 2 s until the agent's first note lands; then icon and dots;
// done: icon and a check, no words; failed: "no terminó" and Reintentar.
// Done chips stay over their columns until the writer's next pointer down on
// the board or the next run (Paper R3.4, last frame). A chip never grows past
// its column: the voice line truncates, then the name drops, so chips of
// neighbouring columns never overlap at any width. Stopped agents show nothing. Chips keep their size at any zoom and follow
// the columns; they sit outside <Tldraw> so the canvas cannot swallow clicks.

import { useEffect, useState } from "react";
import { useValue, type Editor } from "tldraw";
import { AgentChip } from "@/components/ui/AgentChip";
import { identityOf } from "@/lib/agent-identity";
import { landingLayout } from "@/lib/questions/landing";
import { NOTE_WIDTH } from "@/components/ui/StickyNote";
import { retryAgent, retryOwn } from "@/lib/questions/run";
import { useStore, type AgentRunState, type OwnQuestionState } from "@/lib/store";

export type AgentRunChipsProps = { editor: Editor };

const CHIP_GAP = 8;
const EDGE = 8;
/** Least room a chip needs at the right edge of the board: icon and dots. */
const EDGE_ROOM = 80;
/** Gap between two columns of notes, as the landing lays them out. */
const COLUMN_GAP = 28;
/** Row height when chips that would collide share the board edge. */
const ROW = 40;
/** Widest chip, and the room each tier needs: icon, name and voice; icon and name; icon only. */
const FULL_MIN = 200;
const NAME_MIN = 150;
const NATURAL_NAME = 150;
const NATURAL_COMPACT = 66;
type Tier = "full" | "name" | "compact";
const tierFor = (avail: number): Tier => (avail >= FULL_MIN ? "full" : avail >= NAME_MIN ? "name" : "compact");
const VOICE_MS = 2000;

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function Dots({ ink }: { ink: string }) {
  return (
    <span aria-hidden="true" className="flex flex-none items-center gap-[3px]">
      <span className="h-[4px] w-[4px] rounded-full" style={{ background: ink }} />
      <span className="h-[4px] w-[4px] rounded-full" style={{ background: ink, opacity: 0.6 }} />
      <span className="h-[4px] w-[4px] rounded-full" style={{ background: ink, opacity: 0.3 }} />
    </span>
  );
}

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="flex-none">
      <circle cx="8" cy="8" r="7" fill="var(--color-ink-1)" />
      <path
        d="M5 8.3l2 2 4-4.3"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RetryButton({ onClick, testId }: { onClick: () => void; testId: string }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="flex h-[30px] flex-none cursor-pointer items-center rounded-[8px] bg-sheet px-[12px] font-sans text-[13px] font-medium leading-[16px] text-ink-1 shadow-[0_0_0_1px_#1D1B181A]"
    >
      Reintentar
    </button>
  );
}

/** The agent's line, changing every 2 s. Under reduced motion it stays on the first. */
function VoiceLine({ lines }: { lines: readonly string[] }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (lines.length < 2 || reducedMotion()) return;
    const t = setInterval(() => setTick((n) => n + 1), VOICE_MS);
    return () => clearInterval(t);
  }, [lines.length]);
  if (lines.length === 0) return null;
  const text = lines[tick % lines.length];
  return (
    <span
      key={text}
      data-testid="voice-line"
      className="voice-line min-w-0 truncate font-sans text-[13px] italic leading-[16px] text-ink-2"
    >
      {text}
    </span>
  );
}

/** The agent's line fades out in 200 ms when its first note lands (Paper R3.4). */
const LINE_OUT_MS = 200;

function WorkingChip({ agent, tier, maxWidth }: { agent: AgentRunState; tier: Tier; maxWidth: number }) {
  const id = identityOf(agent.sage);
  const waiting = agent.landedCount === 0;
  const [faded, setFaded] = useState(false);
  useEffect(() => {
    if (waiting) return;
    const t = setTimeout(() => setFaded(true), LINE_OUT_MS);
    return () => clearTimeout(t);
  }, [waiting]);
  const firstLine = waiting || !faded;
  return (
    <div
      data-testid={`run-chip-${agent.sage}`}
      data-phase={agent.phase}
      data-tier={tier}
      style={{ maxWidth }}
      className="flex h-[32px] items-center gap-[8px] rounded-full bg-[#FFFFFFB3] pl-[6px] pr-[12px]"
    >
      <AgentChip author={agent.sage} badge={22} size={13} />
      {firstLine && tier !== "compact" ? (
        <>
          <span
            className="flex min-w-0 items-center gap-[8px]"
            style={waiting ? undefined : { animation: `fade-out ${LINE_OUT_MS}ms var(--ease-out) both` }}
          >
            <span className="flex-none font-sans text-[13px] font-semibold leading-[16px] whitespace-nowrap" style={{ color: id.ink }}>
              {id.name}
            </span>
            {tier === "full" ? <VoiceLine lines={id.voiceLines} /> : null}
          </span>
        </>
      ) : null}
      <Dots ink={id.ink} />
    </div>
  );
}

function DoneChip({ agent }: { agent: AgentRunState }) {
  return (
    <div
      data-testid={`run-chip-${agent.sage}`}
      data-phase="done"
      className="flex h-[32px] items-center gap-[8px] rounded-full bg-[#FFFFFFB3] pl-[6px] pr-[12px]"
    >
      <AgentChip author={agent.sage} badge={22} size={13} />
      <Check />
    </div>
  );
}

function FailedChip({ agent }: { agent: AgentRunState }) {
  const id = identityOf(agent.sage);
  return (
    <div
      data-testid={`run-chip-${agent.sage}`}
      data-phase="failed"
      className="flex h-[38px] items-center gap-[6px] rounded-full bg-sheet px-[6px] shadow-[0_0_0_1px_#1D1B1814]"
    >
      <AgentChip author={agent.sage} badge={22} size={13} />
      <span className="font-sans text-[13px] font-semibold leading-[16px] whitespace-nowrap" style={{ color: id.ink }}>
        {id.name}
      </span>
      <span className="font-sans text-[13px] leading-[16px] text-ink-2 whitespace-nowrap">no terminó</span>
      <RetryButton testId={`run-retry-${agent.sage}`} onClick={() => retryAgent(agent.sage)} />
    </div>
  );
}

/** His own question, waiting on its answer (Paper "Preguntas, tu pregunta en camino"). */
function OwnChip({ own }: { own: OwnQuestionState }) {
  const id = identityOf(own.sage);
  if (own.phase === "failed") {
    return (
      <div
        data-testid="run-chip-own"
        data-phase="failed"
        className="flex h-[38px] items-center gap-[6px] rounded-full bg-sheet px-[6px] shadow-[0_0_0_1px_#1D1B1814]"
      >
        <AgentChip author={own.sage} badge={22} size={13} />
        <span className="font-sans text-[13px] leading-[16px] text-ink-2 whitespace-nowrap">Tu pregunta no terminó</span>
        <RetryButton testId="run-retry-own" onClick={() => retryOwn()} />
      </div>
    );
  }
  return (
    <div
      data-testid="run-chip-own"
      data-phase={own.phase}
      className="flex h-[32px] items-center gap-[8px] rounded-full bg-[#FFFFFFB3] pl-[6px] pr-[12px]"
    >
      <AgentChip author={own.sage} badge={22} size={13} />
      {own.phase === "done" ? (
        <Check />
      ) : (
        <>
          <span className="font-sans text-[13px] italic leading-[16px] text-ink-2 whitespace-nowrap">Tu pregunta</span>
          <Dots ink={id.ink} />
        </>
      )}
    </div>
  );
}

/** Every agent failed: one chip, one Reintentar. */
function AllFailedChip({ agents }: { agents: AgentRunState[] }) {
  return (
    <div
      data-testid="run-chip-all"
      data-phase="failed"
      className="flex h-[38px] items-center gap-[10px] rounded-full bg-sheet pl-[8px] pr-[6px] shadow-[0_0_0_1px_#1D1B1814]"
    >
      <span className="flex flex-none gap-[4px]">
        {agents.map((a) => (
          <AgentChip key={a.sage} author={a.sage} badge={22} size={13} />
        ))}
      </span>
      <span className="font-sans text-[13px] leading-[16px] text-ink-2 whitespace-nowrap">Ningún agente terminó</span>
      <RetryButton
        testId="run-retry-all"
        onClick={() => {
          for (const a of agents) retryAgent(a.sage);
        }}
      />
    </div>
  );
}

export function AgentRunChips({ editor }: AgentRunChipsProps) {
  const run = useStore((s) => s.questionRun);
  const essayId = useStore((s) => s.current?.id ?? null);
  const ended = run?.status === "ended";

  // Done chips stay until the writer's next pointer down on the board; the next run replaces them.
  const [dismissedRun, setDismissedRun] = useState<string | null>(null);
  useEffect(() => {
    if (!ended || !run) return;
    const runId = run.runId;
    const container = editor.getContainer();
    const onDown = (e: PointerEvent) => {
      const el = e.target;
      if (!(el instanceof Node) || !container.contains(el)) return;
      if (el instanceof Element && el.closest("[data-run-chips]")) return;
      setDismissedRun(runId);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [ended, run, editor]);
  const hideDone = !!run && ended && dismissedRun === run.runId;

  // The columns exist once the board opened; wait for them without an effect that sets state at once.
  const [, setTick] = useState(0);
  const layoutReady = !!landingLayout();
  const runId = run?.runId ?? null;
  useEffect(() => {
    if (!runId || layoutReady) return;
    const t = setInterval(() => setTick((n) => n + 1), 200);
    return () => clearInterval(t);
  }, [runId, layoutReady]);

  const placed = useValue(
    "run chips placement",
    () => {
      const layout = landingLayout();
      if (!layout || !run || run.essayId !== essayId) return [];
      const view = editor.getViewportScreenBounds();
      const top = Math.max(editor.pageToViewport({ x: 0, y: layout.anchorY }).y - 32 - CHIP_GAP, EDGE);
      const pitch = editor.getZoomLevel() * (NOTE_WIDTH + COLUMN_GAP);
      const maxLeft = Math.max(EDGE, view.w - EDGE_ROOM);
      const shown = run.agents
        .filter((a) => a.phase !== "stopped")
        .filter((a) => !(a.phase === "done" && hideDone))
        .map((agent) => {
          const x = layout.columns.get(agent.sage);
          if (x === undefined) return null;
          const raw = editor.pageToViewport({ x, y: layout.anchorY }).x;
          return { agent, raw, x };
        })
        .filter((p): p is { agent: AgentRunState; raw: number; x: number } => p !== null)
        .sort((p, q) => p.x - q.x);
      // Chips keep to their column: the width a chip may take is the pitch, less a gap,
      // except the last one, which may use what is left of the board. A chip that
      // would start before the one on its row ends drops to the next row.
      const rowEnd: number[] = [];
      return shown.map((p, i) => {
        const left = Math.min(Math.max(p.raw, EDGE), maxLeft);
        const last = i === shown.length - 1;
        const room = view.w - left - EDGE;
        const avail = Math.max(48, Math.min(room, last ? 320 : pitch - CHIP_GAP));
        const failed = p.agent.phase === "failed";
        const done = p.agent.phase === "done";
        const tier: Tier = failed || done ? "compact" : tierFor(avail);
        const natural = failed ? 300 : done ? NATURAL_COMPACT : tier === "full" ? avail : tier === "name" ? NATURAL_NAME : NATURAL_COMPACT;
        let row = 0;
        while ((rowEnd[row] ?? -Infinity) + CHIP_GAP > left) row += 1;
        rowEnd[row] = left + Math.min(natural, avail);
        return {
          agent: p.agent,
          left,
          top: Math.min(top + row * ROW, Math.max(EDGE, view.h - 40)),
          tier,
          avail,
        };
      });
    },
    [editor, run, essayId, hideDone, layoutReady],
  );

  // His own question sits over the column of the agent that answers it, above that agent's chip when it has one.
  const ownPlace = useValue(
    "own question chip placement",
    () => {
      const layout = landingLayout();
      const own = run?.own;
      if (!layout || !run || !own || run.essayId !== essayId) return null;
      if (own.phase === "stopped" || (own.phase === "done" && hideDone)) return null;
      const x = layout.columns.get(own.sage);
      if (x === undefined) return null;
      const view = editor.getViewportScreenBounds();
      const maxLeft = Math.max(EDGE, view.w - EDGE_ROOM);
      const raw = editor.pageToViewport({ x, y: layout.anchorY }).x;
      const base = Math.max(editor.pageToViewport({ x: 0, y: layout.anchorY }).y - 32 - CHIP_GAP, EDGE);
      const stacked = run.agents.some(
        (a) => a.sage === own.sage && a.phase !== "stopped" && !(a.phase === "done" && hideDone),
      );
      const top = stacked ? Math.max(base - 38, EDGE) : base;
      return { own, left: Math.min(Math.max(raw, EDGE), maxLeft), top: own.phase === "failed" ? top - 3 : top };
    },
    [editor, run, essayId, hideDone, layoutReady],
  );

  if (!run || (placed.length === 0 && !ownPlace)) return null;

  const allFailed = run.agents.length > 1 && run.agents.every((a) => a.phase === "failed");
  const items = allFailed ? [placed[0]] : placed;

  return (
    <div className="pointer-events-none absolute inset-0 z-[3] overflow-hidden" data-board-surface data-run-chips>
      {items.map(({ agent, left, top, tier, avail }) => (
        <div
          key={allFailed ? "all" : agent.sage}
          data-board-surface
          className="pointer-events-auto absolute"
          style={{ left, top: allFailed ? top - 3 : agent.phase === "failed" ? top - 3 : top }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {allFailed ? (
            <AllFailedChip agents={run.agents} />
          ) : agent.phase === "failed" ? (
            <FailedChip agent={agent} />
          ) : agent.phase === "done" ? (
            <DoneChip agent={agent} />
          ) : (
            <WorkingChip agent={agent} tier={tier} maxWidth={avail} />
          )}
        </div>
      ))}
      {ownPlace ? (
        <div
          data-board-surface
          className="pointer-events-auto absolute"
          style={{ left: ownPlace.left, top: ownPlace.top }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <OwnChip own={ownPlace.own} />
        </div>
      ) : null}
    </div>
  );
}
