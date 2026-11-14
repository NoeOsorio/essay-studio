"use client";

import { useMemo, useRef, useState } from "react";
import { AGENTS, identityOf, type AgentId } from "@/lib/agent-identity";
import type { CustomAgent, CustomAgentId } from "@/lib/storage/types";
import { WindowedList } from "@/components/ui/WindowedList";

export type Selection = AgentId | CustomAgentId | "new";

const SEARCH_FROM = 8;
const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function Lock() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="flex-none">
      <rect x="3" y="6.2" width="8" height="5.6" rx="1.2" stroke="var(--color-ink-3)" strokeWidth="1.3" />
      <path d="M4.8 6.2V4.6a2.2 2.2 0 0 1 4.4 0v1.6" stroke="var(--color-ink-3)" strokeWidth="1.3" />
    </svg>
  );
}

function Row({
  selected,
  onClick,
  chip,
  label,
  muted,
  trailing,
  testId,
}: {
  selected: boolean;
  onClick: () => void;
  chip: React.ReactNode;
  label: string;
  muted?: boolean;
  trailing?: React.ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-row
      data-testid={testId}
      aria-current={selected ? "true" : undefined}
      onClick={onClick}
      className={`flex h-[40px] w-full flex-none items-center gap-[10px] rounded-[10px] px-2 text-left font-sans outline-none focus-visible:ring-2 focus-visible:ring-ink-1 ${
        selected ? "bg-shade" : "hover:bg-shade/60"
      }`}
    >
      {chip}
      <span
        className={`min-w-0 flex-1 truncate text-[14px] font-medium leading-[18px] ${muted ? "text-ink-2" : "text-ink-1"}`}
      >
        {label}
      </span>
      {trailing}
    </button>
  );
}

function Chip({ id, record }: { id: string; record?: CustomAgent }) {
  const a = identityOf(id, record ? { agentName: record.name, agentColor: record.color } : undefined);
  const Icon = a.Icon;
  return (
    <span
      className="grid h-[28px] w-[28px] flex-none place-items-center rounded-[8px]"
      style={{ background: a.note, color: a.ink }}
    >
      <Icon size={16} />
    </span>
  );
}

export function AgentList({
  agents,
  selected,
  onSelect,
}: {
  agents: CustomAgent[];
  selected: Selection;
  onSelect: (s: Selection) => void;
}) {
  const [query, setQuery] = useState("");
  const box = useRef<HTMLDivElement | null>(null);
  const searching = agents.length > SEARCH_FROM;
  const shown = useMemo(() => {
    const q = fold(query.trim());
    return searching && q ? agents.filter((a) => fold(a.name).includes(q)) : agents;
  }, [agents, query, searching]);

  // Arrow keys move the selection through every visible row.
  const order: Selection[] = [...AGENTS.map((a) => a.id as AgentId), ...shown.map((a) => a.id), "new"];
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    e.preventDefault();
    const at = order.indexOf(selected);
    const next = order[Math.min(order.length - 1, Math.max(0, at + (e.key === "ArrowDown" ? 1 : -1)))];
    if (next === selected) return;
    onSelect(next);
    requestAnimationFrame(() => {
      box.current?.querySelector<HTMLElement>('[aria-current="true"]')?.focus();
    });
  };

  const newRow = (
    <Row
      testId="agent-row-new"
      selected={selected === "new"}
      onClick={() => onSelect("new")}
      muted
      label="Nuevo agente"
      chip={
        <span
          className="grid h-[28px] w-[28px] flex-none place-items-center rounded-[8px] bg-sheet text-ink-2"
          style={{ boxShadow: "0 0 0 1px #1D1B181A" }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </span>
      }
    />
  );

  return (
    <div
      ref={box}
      onKeyDown={onKeyDown}
      className="flex h-full w-[300px] flex-none flex-col bg-paper"
      style={{ padding: "28px 16px 20px", gap: 20 }}
    >
      <h2 className="px-2 font-sans text-[20px] font-semibold leading-[26px] tracking-[-0.01em] text-ink-1">
        Agentes
      </h2>
      {searching ? (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar"
          aria-label="Buscar agente"
          data-testid="agent-search"
          className="-mt-2 h-[36px] w-full flex-none rounded-[10px] bg-sheet px-3 font-sans text-[14px] text-ink-1 outline-none placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-ink-1"
          style={{ boxShadow: "0 0 0 1px #1D1B181F" }}
        />
      ) : null}
      <div className="flex flex-none flex-col" style={{ gap: 2 }}>
        {AGENTS.map((a) => (
          <Row
            key={a.id}
            testId={`agent-row-${a.id}`}
            selected={selected === a.id}
            onClick={() => onSelect(a.id as AgentId)}
            label={a.name}
            chip={<Chip id={a.id} />}
            trailing={<Lock />}
          />
        ))}
      </div>
      {agents.length > 0 ? (
        <div className="flex min-h-0 flex-col">
          <div className="px-2 pb-[6px] font-sans text-[13px] font-medium leading-[16px] text-ink-3">Tuyos</div>
          <WindowedList
            items={shown}
            rowHeight={40}
            gap={2}
            className="min-h-0"
            style={{ height: Math.max(0, shown.length * 42 - 2) }}
            getKey={(a) => a.id}
            renderRow={(a) => (
              <Row
                testId={`agent-row-${a.id}`}
                selected={selected === a.id}
                onClick={() => onSelect(a.id)}
                label={a.name}
                chip={<Chip id={a.id} record={a} />}
              />
            )}
          />
          <div className="flex-none pt-[2px]">{newRow}</div>
        </div>
      ) : (
        <div className="flex-none">{newRow}</div>
      )}
    </div>
  );
}
