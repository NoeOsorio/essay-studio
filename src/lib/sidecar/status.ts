"use client";

// Tracks the health of the Node sidecar that runs the Claude Agent SDK.
//
// Rust emits a `sage://status` event whenever the child process
// transitions (Up after a successful spawn; Down on spawn failure or
// when the process exits). The renderer also queries `sage_status` on
// mount so it gets the current state even if the event fired before
// its listener was attached.
//
// This hook is read-only — it doesn't try to relaunch the sidecar
// (which would need a Rust command we haven't built yet). The user's
// recovery path is "Reiniciá la app". The hook returns enough info to
// render a banner with a clear, honest message.

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type SidecarStatus =
  | { state: "unknown" }
  | { state: "up" }
  | { state: "down"; message: string };

function hasTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function isSidecarStatus(v: unknown): v is SidecarStatus {
  if (!v || typeof v !== "object") return false;
  const state = (v as { state?: unknown }).state;
  if (state === "unknown" || state === "up") return true;
  if (state === "down") {
    const msg = (v as { message?: unknown }).message;
    return typeof msg === "string";
  }
  return false;
}

export function useSidecarStatus(): SidecarStatus {
  const [status, setStatus] = useState<SidecarStatus>({ state: "unknown" });

  useEffect(() => {
    if (!hasTauri()) {
      // In `npm run dev` (no Tauri) the sidecar isn't available either,
      // but showing the banner would just confuse local UI iteration.
      // Skip — `interrogate`/`critique` already throw with a clear message
      // when called outside Tauri.
      return;
    }

    let unlisten: UnlistenFn | null = null;
    let cancelled = false;

    void invoke<unknown>("sage_status")
      .then((cur) => {
        if (cancelled) return;
        // Defensive: the test stub returns `null` for unknown commands,
        // and a malformed payload could land here. Only update state if
        // the response actually looks like a `SidecarStatus`.
        if (isSidecarStatus(cur)) setStatus(cur);
      })
      .catch(() => {
        /* command not registered or errored — leave as "unknown" */
      });

    void listen<unknown>("sage://status", (e) => {
      if (isSidecarStatus(e.payload)) setStatus(e.payload);
    }).then((un) => {
      if (cancelled) un();
      else unlisten = un;
    });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  return status;
}
