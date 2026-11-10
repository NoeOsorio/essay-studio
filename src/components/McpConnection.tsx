"use client";

// MCP connection: one hook that stays mounted for the whole session
// (`useMcpHost`, called from the page) and two views of the same state
// (`McpRow` for the Más panel, `McpListButton` for the list). The state lives
// in a tiny module store so closing the panel never drops the connection.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { connectRenderer, isMcpStatus, type McpStatus } from "@/lib/mcp/bridge";
import { PlugIcon, Spinner, WarnTriangle } from "@/components/toolbar/toolbar-icons";
import { Popover } from "@/components/ui/Popover";
import { Tooltip } from "@/components/ui/Tooltip";

type McpState = { status: McpStatus | null; failed: boolean; changing: boolean };

let state: McpState = { status: null, failed: false, changing: false };
const listeners = new Set<() => void>();

function setState(patch: Partial<McpState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
const getState = () => state;

function sameStatus(a: McpStatus | null, b: McpStatus): boolean {
  return !!a && a.enabled === b.enabled && a.connected === b.connected && a.working === b.working;
}

async function refreshOnce(): Promise<void> {
  try {
    const value = await invoke<unknown>("mcp_status");
    if (isMcpStatus(value)) {
      setState({ status: sameStatus(state.status, value) ? state.status : value, failed: false });
    }
  } catch {
    setState({ failed: true });
  }
}

/** Mount once in the page. Keeps the connection and the status polling alive. */
export function useMcpHost() {
  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    let active = true;
    let disconnect: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loop = async () => {
      await refreshOnce();
      if (active) timer = setTimeout(() => void loop(), 1000);
    };
    void connectRenderer()
      .then((cleanup) => {
        if (!active) {
          cleanup();
          return;
        }
        disconnect = cleanup;
        void loop();
      })
      .catch(() => {
        if (active) setState({ failed: true });
      });
    return () => {
      active = false;
      clearTimeout(timer);
      disconnect?.();
    };
  }, []);
}

function useMcp() {
  const s = useSyncExternalStore(subscribe, getState, getState);
  const toggle = useCallback(async () => {
    const current = getState().status;
    if (!current) return;
    setState({ changing: true });
    try {
      const value = await invoke<unknown>("mcp_set_enabled", { enabled: !current.enabled });
      const next = isMcpStatus(value) ? value : await invoke<unknown>("mcp_status");
      if (isMcpStatus(next)) setState({ status: next });
      setState({ failed: false });
    } catch {
      setState({ failed: true });
    } finally {
      setState({ changing: false });
    }
  }, []);
  const retry = useCallback(() => {
    setState({ failed: false });
    void refreshOnce();
  }, []);
  return { ...s, toggle, retry };
}

function Switch({ on, disabled, onClick }: { on: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="MCP"
      disabled={disabled}
      onClick={onClick}
      data-testid="mcp-switch"
      className={`flex-none flex items-center h-[18px] w-[30px] p-[2px] rounded-full cursor-pointer disabled:opacity-50 ${
        on ? "bg-ink-1 justify-end" : "bg-shade shadow-[inset_0_0_0_1px_#1D1B1826] justify-start"
      }`}
    >
      <span
        className={`h-[14px] w-[14px] rounded-full bg-white ${on ? "" : "shadow-[0_1px_2px_#1D1B1833]"}`}
      />
    </button>
  );
}

/** The row inside Más (Paper E5). Renders nothing until the status is known. */
export function McpRow() {
  const { status, failed, changing, toggle, retry } = useMcp();

  if (failed) {
    return (
      <div data-testid="mcp-row" role="status" className="flex items-center gap-[10px] h-[38px] px-[10px] flex-none">
        <WarnTriangle />
        <span className="flex-1 font-sans text-[14px] font-medium leading-[18px] text-ink-1">MCP no responde</span>
        <button
          type="button"
          onClick={retry}
          className="h-[30px] px-[12px] rounded-[8px] bg-sheet font-sans text-[13px] font-medium text-ink-1 shadow-[0_0_0_1px_#1D1B181A] press cursor-pointer"
        >
          Reintentar
        </button>
      </div>
    );
  }
  if (!status) return null;

  const word = !status.enabled
    ? null
    : status.working
      ? "Trabajando"
      : status.connected
        ? "Conectado"
        : "Disponible";

  return (
    <div data-testid="mcp-row" className="flex items-center gap-[10px] h-[38px] px-[10px] flex-none">
      <PlugIcon />
      <span className="flex-1 font-sans text-[14px] font-medium leading-[18px] text-ink-1">MCP</span>
      {status.enabled && status.working ? <Spinner size={14} /> : null}
      {word ? (
        <span aria-live="polite" className="font-sans text-[13px] leading-[16px] text-ink-3">
          {word}
        </span>
      ) : null}
      <Switch on={status.enabled} disabled={changing} onClick={() => void toggle()} />
    </div>
  );
}

/** List view: an icon in the toolbar opens the same row (Paper E5, last card). */
export function McpListButton() {
  const anchor = useRef<HTMLButtonElement | null>(null);
  const { status, failed } = useMcp();
  const [open, setOpen] = useState(false);
  if (!status && !failed) return null;
  return (
    <>
      <Tooltip label="Conexión MCP" side="bottom">
        <button
          ref={anchor}
          type="button"
          aria-label="Conexión MCP"
          aria-expanded={open}
          data-testid="mcp-list-button"
          onClick={() => setOpen(!open)}
          className="flex-none grid place-items-center h-[34px] w-[34px] rounded-[8px] bg-shade cursor-pointer press"
        >
          <PlugIcon />
        </button>
      </Tooltip>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} width={260} testId="mcp-list-panel">
        <McpRow />
      </Popover>
    </>
  );
}
