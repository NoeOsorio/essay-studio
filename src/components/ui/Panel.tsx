"use client";

import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { SHEET_CLASS, useSheetBehavior } from "./Popover";

type PanelProps = {
  open: boolean;
  onClose: () => void;
  instant?: boolean;
  width?: number;
  testId?: string;
  children: ReactNode;
};

/** Unanchored sheet. Same motion and Esc handling as Popover. */
export function Panel({ open, onClose, instant, width, testId, children }: PanelProps) {
  const sheet = useRef<HTMLDivElement | null>(null);
  useSheetBehavior({ open, onClose, sheet });

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[900] grid place-items-center pointer-events-none"
      style={{ padding: 10 }}
    >
      <div
        ref={sheet}
        tabIndex={-1}
        data-testid={testId}
        className={`${SHEET_CLASS} pointer-events-auto max-h-full overflow-auto ${instant ? "" : "sheet-in"}`}
        style={{ width, maxWidth: "100%", transformOrigin: "50% 50%" }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
