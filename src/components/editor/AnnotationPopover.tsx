"use client";

// A thin anchor: clicking an underline opens the card of that sentence in the
// shared Popover. All content and actions live in `Finding`.

import { useEffect, useMemo, useState } from "react";
import type { Editor } from "@tiptap/core";

import { Finding } from "@/components/review/Finding";
import { Popover } from "@/components/ui/Popover";
import { deriveFindings, groupBySentence } from "@/lib/review/findings";
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

  // The whole card of the clicked underline's sentence, every part.
  const card = useMemo(() => {
    if (!open || !content) return null;
    const views = deriveFindings(content, findings);
    return (
      groupBySentence(views).find((c) => c.findings.some((f) => f.id === open.id)) ?? null
    );
  }, [open, content, findings]);

  // Closing the card removes its underlines: the card unmounts with them.
  if (!open || !card || !card.located) return null;

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
      <Finding card={card} surface="popover" />
    </Popover>
  );
}
