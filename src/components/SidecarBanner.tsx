"use client";

// Surfaces sidecar health to the user. Shown ONLY when the Node sidecar
// is `down` — i.e. spawn failed, or the child process exited after
// running. The banner sits above the editor so the user sees it before
// clicking Interrogar / Evaluar (otherwise they'd hit the same error
// silently inside the overlay).
//
// We deliberately don't offer "Reintentar" yet: there's no Rust
// command to relaunch the sidecar. v2 of the banner can add it once
// `sidecar::spawn` is callable from a Tauri command (Fase 1.2 in the
// ROADMAP).

import { useSidecarStatus } from "@/lib/sidecar/status";

export function SidecarBanner() {
  const status = useSidecarStatus();
  if (status.state !== "down") return null;

  return (
    <div
      role="alert"
      data-testid="sidecar-banner"
      className="flex items-start gap-3 px-5 py-2.5 bg-[#F5DAD3] border-b border-[rgba(156,44,31,0.30)] text-err font-sans text-[12.5px]"
    >
      <span className="mt-[5px] w-2 h-2 rounded-full bg-err flex-none" />
      <div className="min-w-0 flex-1">
        <div className="font-medium">El consejo no está disponible</div>
        <div className="text-[11.5px] mt-0.5 leading-snug text-err/90">
          {status.message}
        </div>
        <div className="text-[11px] mt-1 leading-snug text-err/80">
          Verificá que <span className="font-mono">node</span> esté en el PATH
          y que tengas Claude Code instalado y logueado.
        </div>
      </div>
    </div>
  );
}
