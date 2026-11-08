"use client";

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { connectRenderer, isMcpStatus, type McpStatus } from "@/lib/mcp/bridge";

export function McpConnection() {
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [changing, setChanging] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    let active = true;
    let disconnect: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const value = await invoke<unknown>("mcp_status");
        if (active && isMcpStatus(value)) {
          setStatus((previous) => previous?.enabled === value.enabled && previous.connected === value.connected && previous.working === value.working ? previous : value);
        }
      } catch { if (active) setFailed(true); }
      if (active) timer = setTimeout(() => { void refresh(); }, 1000);
    };
    void connectRenderer().then((cleanup) => {
      if (!active) { cleanup(); return; }
      disconnect = cleanup;
      void refresh();
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; clearTimeout(timer); disconnect?.(); };
  }, []);

  if (!status) return failed ? (
    <div role="status" className="flex items-center justify-between gap-3 border-b border-rule-1 bg-paper-2 px-5 py-1.5 font-mono text-[10px] text-ink-2">
      <span>No se pudo iniciar la conexión MCP local.</span>
      <button type="button" className="cursor-pointer underline underline-offset-4" onClick={() => window.location.reload()}>Reintentar</button>
    </div>
  ) : null;
  const label = failed ? "MCP sin respuesta" : !status.enabled ? "MCP desconectado" : status.working ? "Agente trabajando" : status.connected ? "Agente conectado" : "MCP local disponible";
  return (
    <div className="flex items-center justify-between gap-3 border-b border-rule-1 bg-paper-2 px-5 py-1.5 font-mono text-[10px] text-ink-3">
      <span role="status" aria-live="polite">{label}</span>
      <button type="button" disabled={changing} className="cursor-pointer text-ink-2 underline decoration-rule-3 underline-offset-4 disabled:opacity-50"
        onClick={async () => {
          setChanging(true);
          try {
            const value = await invoke<unknown>("mcp_set_enabled", { enabled: !status.enabled });
            const next = isMcpStatus(value) ? value : await invoke<unknown>("mcp_status");
            if (isMcpStatus(next)) setStatus(next);
            setFailed(false);
          } catch { setFailed(true); }
          finally { setChanging(false); }
        }}>
        {status.enabled ? "Desconectar" : "Conectar MCP"}
      </button>
    </div>
  );
}
