"use client";

import { useCallback, useMemo, useRef } from "react";

export type AnchorName = "hazme" | "revisar" | "mas" | "stamp";

// Small registry so a panel opened from the native menu or another surface
// finds its trigger. `hazme` resolves to whichever trigger is rendered.
const registry = new Map<AnchorName, HTMLElement>();

/** Ref for the panel: its `current` reads the registered trigger lazily. */
export function useAnchor(name: AnchorName): React.RefObject<HTMLElement | null> {
  return useMemo<React.RefObject<HTMLElement | null>>(
    () => ({
      get current() {
        return registry.get(name) ?? null;
      },
      set current(_value: HTMLElement | null) {
        // Read-only view of the registry.
      },
    }),
    [name],
  );
}

/** Callback ref for the trigger. */
export function useRegisterAnchor(name: AnchorName): React.RefCallback<HTMLElement> {
  const mine = useRef<HTMLElement | null>(null);
  return useCallback(
    (el: HTMLElement | null) => {
      if (el) {
        mine.current = el;
        registry.set(name, el);
      } else {
        // Only drop the entry if it is still ours (two triggers may coexist).
        if (mine.current && registry.get(name) === mine.current) registry.delete(name);
        mine.current = null;
      }
    },
    [name],
  );
}
