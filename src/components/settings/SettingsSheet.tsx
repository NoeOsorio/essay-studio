"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "@/lib/store";
import { useSheetBehavior } from "@/components/ui/Popover";
import type { AgentId } from "@/lib/agent-identity";
import type { CustomAgentId } from "@/lib/storage/types";
import { AgentList, type Selection } from "./AgentList";
import { AgentForm } from "./AgentForm";
import { BuiltinAgentView } from "./BuiltinAgentView";

const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";

/** Ajustes: the veil and the 920 x 660 sheet with the agent list and its detail. */
export function SettingsSheet() {
  const open = useStore((s) => s.settingsOpen);
  const instant = useStore((s) => s.settingsInstant);
  const asked = useStore((s) => s.settingsAgentId);
  if (!open || typeof document === "undefined") return null;
  return <SheetInner key={asked ?? ""} instant={instant} />;
}

function SheetInner({ instant }: { instant: boolean }) {
  const close = useStore((s) => s.closeSettings);
  const agents = useStore((s) => s.agents);
  const sheet = useRef<HTMLDivElement | null>(null);
  const veil = useRef<HTMLDivElement | null>(null);
  const [selected, setSelected] = useState<Selection>(() => {
    const { agents: list, settingsAgentId: asked } = useStore.getState();
    // A client can ask for one agent: a built-in or one of the writer's own.
    if (asked && (["em", "sis", "pra", "cri"].includes(asked) || list.some((a) => a.id === asked))) return asked as Selection;
    const first = list[0];
    return first ? first.id : "em";
  });

  useSheetBehavior({ open: true, onClose: close, sheet });

  // Entry: opacity plus scale 0.97 to 1, ease-out, 240 ms. None from the
  // keyboard shortcut; reduced motion fades only.
  useEffect(() => {
    if (instant) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const opts = { duration: reduce ? 160 : 240, easing: EASE, fill: "both" as const };
    veil.current?.animate([{ opacity: 0 }, { opacity: 1 }], opts);
    sheet.current?.animate(
      reduce
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, transform: "scale(0.97)" },
            { opacity: 1, transform: "scale(1)" },
          ],
      opts,
    );
  }, [instant]);

  const isCustom = typeof selected === "string" && selected.startsWith("c_");
  const agent = isCustom ? (agents.find((a) => a.id === selected) ?? null) : null;

  return createPortal(
    <div className="fixed inset-0 z-[880] grid place-items-center" style={{ padding: 10 }}>
      <div ref={veil} className="absolute inset-0" style={{ background: "#1D1B1838" }} aria-hidden="true" />
      <div
        ref={sheet}
        tabIndex={-1}
        role="dialog"
        aria-label="Ajustes"
        data-testid="settings-sheet"
        className="relative flex overflow-hidden bg-sheet text-ink-1 outline-none"
        style={{
          width: 920,
          height: 660,
          maxWidth: "100%",
          maxHeight: "100%",
          borderRadius: 16,
          boxShadow: "0 0 0 1px #1D1B1814, 0 18px 40px -12px #3C2D0A29, 0 2px 6px #1D1B180F",
        }}
      >
        <AgentList agents={agents} selected={selected} onSelect={setSelected} />
        <div className="min-w-0 flex-1 overflow-auto">
          {selected === "new" || (isCustom && agent) ? (
            <AgentForm
              key={selected === "new" ? "new" : (selected as CustomAgentId)}
              agent={agent}
              onSaved={(id) => setSelected(id)}
              onDeleted={() => {
                const rest = useStore.getState().agents;
                setSelected(rest[0] ? rest[0].id : "em");
              }}
            />
          ) : (
            <BuiltinAgentView key={selected} id={(isCustom ? "em" : selected) as AgentId} />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
