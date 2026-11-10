"use client";

// Surfaces a failed start of the agents (Paper E5). Shown only when the
// sidecar is `down`. Sits under the toolbar as a sheet strip with the single
// red of the bar; the second sentence is the status message. Technical detail
// goes to the logs, never to the screen.

import { useSidecarStatus } from "@/lib/sidecar/status";
import { WarnTriangle } from "@/components/toolbar/toolbar-icons";

export function SidecarBanner() {
  const status = useSidecarStatus();
  if (status.state !== "down") return null;

  return (
    <div className="flex-none px-[10px] pb-[10px]">
      <div
        role="alert"
        data-testid="sidecar-banner"
        className="flex min-h-[44px] items-center gap-[10px] rounded-[12px] bg-sheet px-[16px] py-[12px] shadow-[0_0_0_1px_#1D1B1814]"
      >
        <WarnTriangle size={18} />
        <p className="font-sans text-[15px] leading-[20px] text-ink-1">
          Los agentes no pudieron arrancar.{" "}
          <span className="text-ink-3">{status.message}</span>
        </p>
      </div>
    </div>
  );
}
