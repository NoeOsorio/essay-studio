"use client";

// Agent toggles drawn as small notes (Paper R3.1 and R3.5). Color means the
// agent is on, white paper means off. Each tile has a tape and a fixed tilt,
// and its tooltip says in one sentence what that agent asks.

import { Tooltip } from "@/components/ui/Tooltip";
import { AGENTS, type AgentId } from "@/lib/agent-identity";
import type { Sage } from "@/lib/storage/types";

export type AgentTilesProps = {
  on: Sage[];
  onToggle: (sage: Sage) => void;
  disabled?: boolean;
};

/** Tilt of each tile and of its tape, copied from Paper R3.1. */
const TILT: Record<AgentId, { rotate: number; tape: number }> = {
  em: { rotate: -2, tape: -4 },
  sis: { rotate: 1.6, tape: 3 },
  pra: { rotate: -1, tape: -3 },
  cri: { rotate: 2.2, tape: -5 },
};

const SHADOW = "#3C2D0A14 0 1px 1px, #3C2D0A40 0 8px 14px -8px";
const SHADOW_LIFTED = "#3C2D0A14 0 1px 1px, #3C2D0A59 0 12px 18px -8px";

export function AgentTiles({ on, onToggle, disabled }: AgentTilesProps) {
  return (
    <div className="flex flex-col gap-[12px] pt-[4px]">
      <div className="flex gap-[10px] pt-[6px]" data-testid="lectura-sage-selector">
        {AGENTS.map((agent) => {
          const id = agent.id as AgentId;
          const active = on.includes(id);
          const tilt = TILT[id];
          const Icon = agent.Icon;
          return (
            <Tooltip key={id} label={agent.asks} side="top" sentence>
              <button
                type="button"
                aria-pressed={active}
                aria-label={agent.name}
                disabled={disabled}
                data-testid={`lectura-sage-toggle-${id}`}
                data-active={active}
                onClick={() => onToggle(id)}
                className="relative shadow-[var(--tile-shadow)] transition-[translate,box-shadow] duration-[120ms] hover:-translate-y-[3px] hover:shadow-[var(--tile-shadow-lifted)] motion-reduce:transition-none flex h-[76px] w-[80px] flex-none cursor-pointer flex-col items-center justify-center gap-[6px] rounded-[3px] pt-[6px] font-sans disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  background: active ? agent.note : "var(--color-sheet)",
                  color: active ? agent.ink : "var(--color-ink-3)",
                  rotate: `${tilt.rotate}deg`,
                  transformOrigin: "50% 50%",
                  ["--tile-shadow" as string]: SHADOW,
                  ["--tile-shadow-lifted" as string]: SHADOW_LIFTED,
                }}
              >
                <Icon size={18} />
                <span className="text-[13px] font-semibold leading-[16px]">{agent.name}</span>
                <span
                  aria-hidden="true"
                  className="absolute"
                  style={{
                    top: -8,
                    left: 22,
                    width: 36,
                    height: 14,
                    background: active ? "#FFFDF5BD" : "#E2DAC6B3",
                    boxShadow: "#3C2D0A29 0 1px 3px",
                    rotate: `${tilt.tape}deg`,
                    transformOrigin: "0 0",
                  }}
                />
              </button>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
