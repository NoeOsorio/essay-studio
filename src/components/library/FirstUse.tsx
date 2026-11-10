"use client";

// First use (Paper R1.2 and its storyboard). A real title types itself on a
// sheet, the four voices stick a question each around it, then they peel off
// and another title types. It repeats while the library is empty and nowhere
// else. With reduced motion the title and the notes sit still. Timers are
// cleared on unmount and the loop pauses while the window is hidden.

import { useEffect, useState } from "react";
import { StickyNote } from "@/components/ui/StickyNote";
import type { AgentId } from "@/lib/agent-identity";
import type { EssayMode } from "@/lib/storage/types";
import { AcademicIcon, ArrowRight, BlogIcon } from "./icons";

const TITLES = [
  "Feedback que no duele",
  "Cultura como sistema",
  "Seguridad psicológica en equipos remotos",
] as const;

type Note = { agent: AgentId; text: string; x: number; y: number; tilt: number };

// Positions are inside the 1000 x 640 stage; Paper left minus 220.
const NOTES: readonly Note[] = [
  { agent: "em", text: "¿Qué datos lo muestran?", x: 8, y: 118, tilt: -4 },
  { agent: "sis", text: "¿Qué lo sostiene día a día?", x: 816, y: 84, tilt: 3 },
  { agent: "pra", text: "¿Cómo se ve el lunes?", x: 30, y: 330, tilt: 2.5 },
  { agent: "cri", text: "¿Y si fuera al revés?", x: 832, y: 318, tilt: -2 },
];

const TYPE_MS = 55;
const ERASE_MS = 30;
const NOTE_STAGGER_MS = 60;
const PEEL_MS = 240;
const CYCLE_MS = 7000;
const ERASE_AT_MS = 5600;

type Frame = { chars: number; shown: number; peeling: boolean };

/** Everything that happens in one cycle, as [ms, change] steps. */
function timeline(title: string): Array<[number, Partial<Frame>]> {
  const len = title.length;
  const steps: Array<[number, Partial<Frame>]> = [[0, { chars: 0, shown: 0, peeling: false }]];
  for (let k = 1; k <= len; k++) steps.push([k * TYPE_MS, { chars: k }]);
  // The first note drops as the title nears its end; the rest follow, 60 ms apart.
  const base = Math.max(0, (len - 3) * TYPE_MS);
  for (let j = 0; j < NOTES.length; j++) steps.push([base + j * NOTE_STAGGER_MS, { shown: j + 1 }]);
  // The notes peel as the title is erased, faster than it was typed.
  steps.push([ERASE_AT_MS, { peeling: true }]);
  for (let i = 1; i <= len; i++) steps.push([ERASE_AT_MS + i * ERASE_MS, { chars: len - i }]);
  steps.push([ERASE_AT_MS + PEEL_MS, { shown: 0, peeling: false }]);
  return steps;
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

export function FirstUse({ onCreate }: { onCreate: (mode: EssayMode) => void }) {
  const reduced = useReducedMotion();
  const [titleIndex, setTitleIndex] = useState(0);
  const [frame, setFrame] = useState<Frame>({ chars: 0, shown: 0, peeling: false });

  useEffect(() => {
    if (reduced) return;
    let timers: ReturnType<typeof setTimeout>[] = [];
    let index = 0;
    const clear = () => {
      timers.forEach(clearTimeout);
      timers = [];
    };
    const run = () => {
      clear();
      const title = TITLES[index % TITLES.length];
      setTitleIndex(index % TITLES.length);
      for (const [ms, patch] of timeline(title)) {
        timers.push(setTimeout(() => setFrame((f) => ({ ...f, ...patch })), ms));
      }
      timers.push(
        setTimeout(() => {
          index += 1;
          run();
        }, CYCLE_MS),
      );
    };
    const onVisibility = () => {
      if (document.hidden) {
        clear();
      } else {
        setFrame({ chars: 0, shown: 0, peeling: false });
        run();
      }
    };
    if (!document.hidden) run();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clear();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reduced]);

  const title = TITLES[titleIndex];
  const typed = reduced ? title : title.slice(0, frame.chars);
  const shown = reduced ? NOTES.length : frame.shown;

  return (
    <div data-testid="library-first-use" className="relative flex-1 min-h-0 overflow-hidden">
      <div className="absolute left-1/2 top-[24px] h-[640px] w-[1000px] -translate-x-1/2">
        <div
          className="absolute left-[120px] top-[56px] flex h-[360px] w-[760px] flex-col gap-[26px] rounded-[14px] bg-sheet px-[80px] pb-[40px] pt-[84px]"
          style={{
            boxShadow: "0 0 0 1px #1D1B180F, 0 2px 4px #3C2D0A1A, 0 28px 48px -20px #3C2D0A33",
            rotate: "-0.8deg",
            transformOrigin: "0% 0%",
          }}
        >
          <div
            aria-hidden
            className="absolute left-[330px] top-[-13px] h-[26px] w-[104px]"
            style={{ background: "#FFFDF5BD", boxShadow: "#3C2D0A29 0 1px 3px", rotate: "-2deg", transformOrigin: "0% 0%" }}
          />
          <div className="relative flex items-center gap-[3px] h-[56px]" aria-hidden>
            <span className="font-serif font-medium text-[48px] leading-[56px] tracking-[-0.015em] text-ink-1 whitespace-pre">
              {typed}
            </span>
            <span className="caret-blink h-[48px] w-[2.5px] flex-none rounded-[2px] bg-ink-1" />
          </div>
          <div aria-hidden className="relative flex flex-col gap-[18px] pt-[10px]">
            <div className="h-[10px] w-[560px] rounded-[6px] bg-shade" />
            <div className="h-[10px] w-[600px] rounded-[6px] bg-shade" />
            <div className="h-[10px] w-[420px] rounded-[6px] bg-shade" />
          </div>
        </div>

        {NOTES.map((n, j) =>
          j < shown ? (
            <div
              key={n.agent}
              aria-hidden
              className={`absolute ${frame.peeling && !reduced ? "note-peel-body" : "note-land"}`}
              style={{ left: n.x, top: n.y, ["--stagger" as string]: `${60}ms` }}
            >
              <StickyNote author={n.agent} tilt={n.tilt} width={164}>
                {n.text}
              </StickyNote>
            </div>
          ) : null,
        )}

        <div className="absolute left-[180px] top-[512px] flex w-[640px] gap-[24px]">
          <Choice
            testId="library-new-academico"
            label="Ensayo académico"
            onClick={() => onCreate("academico")}
            icon={<AcademicIcon size={28} stroke="var(--color-ink-1)" width={1.2} />}
          />
          <Choice
            testId="library-new-blog"
            label="Post de blog"
            onClick={() => onCreate("blog")}
            icon={<BlogIcon size={28} stroke="var(--color-ink-1)" width={1.2} />}
          />
        </div>
      </div>
    </div>
  );
}

function Choice({
  label,
  icon,
  onClick,
  testId,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="group flex h-[96px] flex-1 basis-0 items-center gap-[16px] rounded-[16px] bg-sheet pl-[20px] pr-[22px] text-left cursor-pointer shadow-[0_0_0_1.5px_var(--color-ink-1),0_4px_0_var(--color-ink-1),0_10px_18px_-8px_#3C2D0A1A] transition-[transform,box-shadow] duration-[var(--dur-press)] ease-out hover:-translate-y-[2px] hover:shadow-[0_0_0_1.5px_var(--color-ink-1),0_6px_0_var(--color-ink-1),0_14px_24px_-8px_#3C2D0A26] active:translate-y-0 active:scale-[0.98] active:shadow-[0_0_0_1.5px_var(--color-ink-1),0_2px_0_var(--color-ink-1),0_6px_12px_-8px_#3C2D0A1A] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <span className="grid h-[52px] w-[52px] flex-none place-items-center rounded-[14px] bg-shade">{icon}</span>
      <span className="flex-1 font-sans text-[18px] font-semibold leading-[22px] tracking-[-0.01em] text-ink-1">
        {label}
      </span>
      <ArrowRight size={20} />
    </button>
  );
}
