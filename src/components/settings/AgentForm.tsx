"use client";

import { useRef, useState } from "react";
import {
  AGENT_COLORS,
  AGENT_COLOR_KEYS,
  AGENT_ICONS,
  AGENT_ICON_KEYS,
} from "@/lib/agent-identity";
import type { AgentColorKey, AgentIconKey, CustomAgent, CustomAgentId } from "@/lib/storage/types";
import { useStore } from "@/lib/store";
import { Tooltip } from "@/components/ui/Tooltip";
import { Popover } from "@/components/ui/Popover";

const NAME_MAX = 40;
const TEXT_MAX = 2000;
const COUNT_FROM = 1800;

type Does = CustomAgent["does"];
type Draft = {
  name: string;
  instructions: string;
  does: Does;
  color: AgentColorKey;
  icon: AgentIconKey;
  canPaste: boolean;
  defaultOn: boolean;
};

const DOES: readonly { value: Does; label: string }[] = [
  { value: "review", label: "Revisa tu ensayo" },
  { value: "ask", label: "Te hace preguntas" },
  { value: "both", label: "Las dos" },
];

const LABEL = "font-sans text-[13px] font-medium leading-[16px] text-ink-2";
const RING = { boxShadow: "0 0 0 1px #1D1B181F" } as const;

function Toggle({
  checked,
  onChange,
  label,
  testId,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  testId: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-testid={testId}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-[12px] rounded-[6px] text-left outline-none focus-visible:ring-2 focus-visible:ring-ink-1"
    >
      <span
        className="flex h-[20px] w-[34px] flex-none items-center rounded-[10px] px-[2px]"
        style={{
          background: checked ? "var(--color-ink-1)" : "#1D1B1826",
          justifyContent: checked ? "flex-end" : "flex-start",
          transition: "background-color 160ms ease",
        }}
      >
        <span className="h-[16px] w-[16px] rounded-full bg-white" />
      </span>
      <span className="font-sans text-[14px] leading-[18px] text-ink-1">{label}</span>
    </button>
  );
}

function draftOf(agent: CustomAgent | null, used: AgentColorKey[]): Draft {
  if (agent) {
    const { name, instructions, does, color, icon, canPaste, defaultOn } = agent;
    return { name, instructions, does, color, icon, canPaste, defaultOn };
  }
  return {
    name: "",
    instructions: "",
    does: "review",
    color: AGENT_COLOR_KEYS.find((k) => !used.includes(k)) ?? AGENT_COLOR_KEYS[0],
    icon: "pluma",
    canPaste: true,
    defaultOn: true,
  };
}

export function AgentForm({
  agent,
  onSaved,
  onDeleted,
}: {
  agent: CustomAgent | null;
  onSaved: (id: CustomAgentId) => void;
  onDeleted: () => void;
}) {
  const saveAgent = useStore((s) => s.saveAgent);
  const deleteAgent = useStore((s) => s.deleteAgent);
  const agents = useStore((s) => s.agents);
  const [draft, setDraft] = useState<Draft>(() =>
    draftOf(agent, agents.map((a) => a.color)),
  );
  const [baseline, setBaseline] = useState<Draft>(draft);
  const [error, setError] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [picking, setPicking] = useState(false);
  const chip = useRef<HTMLButtonElement | null>(null);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setError(false);
    setDraft((d) => ({ ...d, [k]: v }));
  };

  const name = draft.name.trim();
  const instructions = draft.instructions.trim();
  const dirty = (Object.keys(draft) as (keyof Draft)[]).some((k) => draft[k] !== baseline[k]);
  const canSave = name.length > 0 && instructions.length > 0 && dirty;
  const asks = draft.does === "ask";

  const save = async () => {
    if (!canSave) return;
    const record: CustomAgent = {
      id: agent?.id ?? (`c_${crypto.randomUUID()}` as CustomAgentId),
      createdAt: agent?.createdAt ?? new Date().toISOString(),
      ...draft,
      name,
      instructions,
    };
    try {
      await saveAgent(record);
      setBaseline(draft);
      setError(false);
      if (!agent) onSaved(record.id);
    } catch {
      setError(true);
    }
  };

  const remove = async () => {
    if (!agent) return;
    try {
      await deleteAgent(agent.id);
      onDeleted();
    } catch {
      setError(true);
      setConfirming(false);
    }
  };

  const colors = AGENT_COLORS[draft.color];
  const Icon = AGENT_ICONS[draft.icon];

  return (
    <div
      className="flex h-full min-h-0 flex-col font-sans"
      style={{ padding: "28px 36px 24px", gap: 24 }}
      data-testid="agent-form"
    >
      <div className="flex flex-none items-center gap-[14px]">
        <Tooltip label="Cambiar icono" side="bottom">
          <button
            ref={chip}
            type="button"
            aria-label="Cambiar icono"
            data-testid="agent-icon-button"
            onClick={() => setPicking((p) => !p)}
            className="grid h-[44px] w-[44px] flex-none place-items-center rounded-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ink-1"
            style={{ background: colors.fill, color: colors.ink }}
          >
            <Icon size={22} />
          </button>
        </Tooltip>
        <Popover
          anchor={chip}
          open={picking}
          onClose={() => setPicking(false)}
          side="bottom"
          align="start"
          size="compact"
          keepsParent
        >
          <div className="grid grid-cols-6 gap-[6px] p-[10px]">
            {AGENT_ICON_KEYS.map((k) => {
              const I = AGENT_ICONS[k];
              return (
                <button
                  key={k}
                  type="button"
                  aria-label={k}
                  aria-pressed={draft.icon === k}
                  onClick={() => {
                    set("icon", k);
                    setPicking(false);
                  }}
                  className={`grid h-[36px] w-[36px] place-items-center rounded-[8px] text-ink-1 outline-none focus-visible:ring-2 focus-visible:ring-ink-1 ${
                    draft.icon === k ? "bg-shade" : "hover:bg-shade/60"
                  }`}
                >
                  <I size={18} />
                </button>
              );
            })}
          </div>
        </Popover>
        <input
          value={draft.name}
          maxLength={NAME_MAX}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Nombre del agente"
          aria-label="Nombre del agente"
          data-testid="agent-name"
          className="h-[44px] min-w-0 flex-1 rounded-[10px] bg-sheet px-3 text-[20px] font-semibold leading-[26px] tracking-[-0.01em] text-ink-1 outline-none placeholder:font-normal placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-ink-1"
          style={RING}
        />
      </div>

      <div className="flex flex-none flex-col gap-2">
        <span className={LABEL}>Qué hace</span>
        <div
          role="radiogroup"
          aria-label="Qué hace"
          className="flex w-fit gap-[2px] rounded-[10px] bg-shade p-[3px]"
        >
          {DOES.map((o) => {
            const on = draft.does === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={on}
                data-testid={`agent-does-${o.value}`}
                onClick={() => set("does", o.value)}
                className={`h-[30px] rounded-[8px] px-[14px] text-[13px] font-medium leading-[16px] outline-none focus-visible:ring-2 focus-visible:ring-ink-1 ${
                  on ? "bg-sheet text-ink-1" : "text-ink-2"
                }`}
                style={on ? { boxShadow: "0 1px 2px #1D1B181A, 0 0 0 1px #1D1B180F" } : undefined}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <label htmlFor="agent-instructions" className={LABEL}>
            Instrucciones
          </label>
          {draft.instructions.length > COUNT_FROM ? (
            <span className="text-[12px] leading-[16px] text-ink-3" data-testid="agent-remaining">
              {TEXT_MAX - draft.instructions.length}
            </span>
          ) : null}
        </div>
        <textarea
          id="agent-instructions"
          value={draft.instructions}
          maxLength={TEXT_MAX}
          onChange={(e) => set("instructions", e.target.value)}
          data-testid="agent-instructions"
          className="min-h-[150px] w-full flex-1 resize-none rounded-[10px] bg-sheet text-[15px] leading-[22px] text-ink-1 outline-none focus-visible:ring-2 focus-visible:ring-ink-1"
          style={{ ...RING, padding: "12px 14px" }}
        />
      </div>

      {asks ? null : (
        <div className="flex flex-none flex-col gap-[14px]">
          <Toggle
            testId="agent-can-paste"
            checked={draft.canPaste}
            onChange={(v) => set("canPaste", v)}
            label="Puede proponer texto para pegar"
          />
          <Toggle
            testId="agent-default-on"
            checked={draft.defaultOn}
            onChange={(v) => set("defaultOn", v)}
            label="Entra cada vez que revisas tu ensayo"
          />
        </div>
      )}

      <div className="flex flex-none flex-col gap-2">
        <span className={LABEL}>Color</span>
        <div className="flex gap-[10px]" role="radiogroup" aria-label="Color">
          {AGENT_COLOR_KEYS.map((k) => {
            const on = draft.color === k;
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={k}
                data-testid={`agent-color-${k}`}
                onClick={() => set("color", k)}
                className="h-[28px] w-[28px] rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ink-1 focus-visible:ring-offset-2"
                style={{
                  background: AGENT_COLORS[k].fill,
                  boxShadow: on ? "0 0 0 2px #FFFFFF, 0 0 0 4px #1D1B18" : "inset 0 0 0 1px #1D1B1814",
                }}
              />
            );
          })}
        </div>
      </div>

      {error ? (
        <p className="flex-none text-[13px] leading-[16px] text-ink-2" role="alert" data-testid="agent-error">
          No pude guardar. Intenta de nuevo.
        </p>
      ) : null}

      <div className="flex flex-none items-center justify-between pt-1">
        {agent ? (
          confirming ? (
            <div className="flex items-center gap-1">
              <span className="px-3 text-[13px] leading-[16px] text-ink-2">¿Borrar este agente? Lo que ya corrigió se queda en tus ensayos.</span>
              <button
                type="button"
                data-testid="agent-delete-confirm"
                onClick={remove}
                className="h-[36px] rounded-[10px] px-3 text-[13px] font-medium leading-[16px] text-ink-1 outline-none hover:bg-shade focus-visible:ring-2 focus-visible:ring-ink-1"
              >
                Borrar
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="h-[36px] rounded-[10px] px-3 text-[13px] font-medium leading-[16px] text-ink-2 outline-none hover:bg-shade focus-visible:ring-2 focus-visible:ring-ink-1"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              type="button"
              data-testid="agent-delete"
              onClick={() => setConfirming(true)}
              className="h-[36px] rounded-[10px] px-3 text-[13px] font-medium leading-[16px] text-ink-2 outline-none hover:bg-shade focus-visible:ring-2 focus-visible:ring-ink-1"
            >
              Borrar agente
            </button>
          )
        ) : (
          <span />
        )}
        <button
          type="button"
          data-testid="agent-save"
          disabled={!canSave}
          onClick={save}
          className="h-[36px] rounded-[10px] bg-ink-1 px-[18px] text-[13px] font-medium leading-[16px] text-white outline-none transition-[opacity,transform] duration-150 focus-visible:ring-2 focus-visible:ring-ink-1 focus-visible:ring-offset-2 enabled:active:scale-[0.97] disabled:opacity-40"
        >
          Guardar
        </button>
      </div>
    </div>
  );
}
