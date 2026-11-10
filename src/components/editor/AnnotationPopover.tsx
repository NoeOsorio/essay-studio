"use client";

// A thin anchor: clicking an underline opens the one finding card in the
// shared Popover. All content and actions live in `Finding`.

import { useEffect, useMemo, useState } from "react";
import type { Editor } from "@tiptap/core";

import { Finding } from "@/components/review/Finding";
import { Popover } from "@/components/ui/Popover";
import { deriveFindings } from "@/lib/review/findings";
import { useStore } from "@/lib/store";

type Open = { id: string; el: HTMLElement };

export function AnnotationPopover({ editor }: { editor: Editor | null }) {
  const [open, setOpen] = useState<Open | null>(null);
  const content = useStore((s) => s.current?.content);
  const findings = useStore((s) => s.current?.findings);
  const bump = useStore((s) => s.bumpReviewSurfaces);
  const isOpen = open !== null;
  useEffect(() => {
    if (!isOpen) return;
    bump(1);
    return () => bump(-1);
  }, [isOpen, bump]);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-anno-id]");
      if (!el) return;
      const id = el.dataset.annoId;
      if (!id) return;
      e.preventDefault();
      e.stopPropagation();
      setOpen({ id, el });
    };
    dom.addEventListener("click", onClick);
    return () => dom.removeEventListener("click", onClick);
  }, [editor]);

  // Scrolling moves the underline away from the card.
  useEffect(() => {
    if (!open) return;
    const onScroll = (e: Event) => {
      if ((e.target as HTMLElement | null)?.closest?.("[data-testid='annotation-popover']")) return;
      setOpen(null);
    };
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [open]);

  const anchor = useMemo(
    () => ({ current: open?.el ?? null }),
    [open],
  );

  const view = useMemo(() => {
    if (!open || !content) return null;
    return deriveFindings(content, findings).find((v) => v.id === open.id) ?? null;
  }, [open, content, findings]);

  // Closing the finding removes its underline: the card unmounts with it.
  if (!open || !view || !view.located) return null;

  return (
    <Popover
      anchor={anchor}
      open
      onClose={() => setOpen(null)}
      side="bottom"
      align="start"
      offset={{ x: -6 }}
      keepFocus
      width={456}
      testId="annotation-popover"
    >
      <Finding finding={view} surface="popover" />
    </Popover>
  );
}
