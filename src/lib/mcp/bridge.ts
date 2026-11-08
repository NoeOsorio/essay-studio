"use client";

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { BridgeRequest } from "../../../shared/mcp";
import { executeRequest, setBridgeSession, startRegistry } from "./registry";

export type McpStatus = { enabled: boolean; connected: boolean; working: boolean; sessionId?: string | null };

export function isMcpStatus(value: unknown): value is McpStatus {
  if (!value || typeof value !== "object") return false;
  const status = value as Record<string, unknown>;
  return typeof status.enabled === "boolean" && typeof status.connected === "boolean" && typeof status.working === "boolean"
    && (status.sessionId == null || typeof status.sessionId === "string");
}

/** Install listeners before allowing Rust to dispatch any requests. */
async function startRendererConnection(): Promise<() => void> {
  const stopRegistry = startRegistry();
  const unlisten: UnlistenFn[] = [];
  let active = true;
  let pending = 0;
  try {
    unlisten.push(await listen<{ sessionId: string | null }>("mcp:session", (event) => {
      setBridgeSession(event.payload.sessionId);
    }));
    unlisten.push(await listen<BridgeRequest & { sessionId: string }>("mcp:request", (event) => {
      const request = event.payload;
      if (!active || typeof request.requestId !== "string" || typeof request.sessionId !== "string") return;
      pending += 1;
      void (async () => {
        try {
          await invoke("mcp_set_working", { working: true }).catch(() => undefined);
          const response = await executeRequest(request, request.sessionId);
          // A reload/disconnect may have removed this request; never log payloads.
          if (active) await invoke("mcp_respond", { response }).catch(() => undefined);
        } finally {
          pending -= 1;
          if (!pending) await invoke("mcp_set_working", { working: false }).catch(() => undefined);
        }
      })();
    }));
    await invoke("mcp_renderer_ready");
    const status = await invoke<unknown>("mcp_status");
    if (isMcpStatus(status)) setBridgeSession(status.sessionId ?? null);
    else setBridgeSession(null); // Web regression stub has no native bridge.
  } catch (error) {
    active = false; unlisten.forEach((fn) => fn()); stopRegistry();
    throw error;
  }
  return () => {
    active = false; unlisten.forEach((fn) => fn()); stopRegistry();
  };
}

// React StrictMode can unmount the first effect before async listeners finish
// installing. Both owners share one startup; releasing the first cannot tear
// down the second effect's listeners or revision tracking.
let owners = 0;
let startup: Promise<() => void> | null = null;
export async function connectRenderer(): Promise<() => void> {
  owners += 1;
  startup ??= startRendererConnection();
  let cleanup: () => void;
  try { cleanup = await startup; }
  catch (error) { owners -= 1; if (!owners) startup = null; throw error; }
  let released = false;
  return () => {
    if (released) return;
    released = true; owners -= 1;
    if (!owners) { cleanup(); startup = null; }
  };
}
