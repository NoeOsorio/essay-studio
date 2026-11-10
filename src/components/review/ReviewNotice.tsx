"use client";

// One line when a review is discarded because the essay was left while it ran
// (Slice 0 copy). It belongs to the essay that was left, so it shows on
// whatever screen follows and goes away by itself.

import { useEffect } from "react";

import { useStore } from "@/lib/store";

const VISIBLE_MS = 6000;

export function ReviewNotice() {
  const discarded = useStore((s) => s.reviewOutcome?.kind === "discarded");
  const clear = useStore((s) => s.setReviewOutcome);

  useEffect(() => {
    if (!discarded) return;
    const t = setTimeout(() => {
      const cur = useStore.getState().reviewOutcome;
      if (cur?.kind === "discarded") clear(null);
    }, VISIBLE_MS);
    return () => clearTimeout(t);
  }, [discarded, clear]);

  if (!discarded) return null;
  return (
    <div
      role="status"
      data-testid="review-notice"
      onClick={() => clear(null)}
      className="fixed top-[76px] left-1/2 z-[950] flex h-[44px] -translate-x-1/2 cursor-pointer items-center rounded-[12px] bg-sheet px-[18px] font-sans text-[14px] leading-[18px] text-ink-1 shadow-[0_0_0_1px_#1D1B1814,0_12px_28px_-12px_#3C2D0A29]"
    >
      Cerraste el ensayo y la revisión se canceló.
    </div>
  );
}
