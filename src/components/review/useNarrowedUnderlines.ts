"use client";

// R5.4: with Correcciones narrowed to one criterion, the other underlines
// step back. The editor plugin sets data-annos-narrowed on the editor and
// data-narrowed-in on the underlines of that criterion (decorations, never
// saved); the CSS in globals.css does the rest. Cleared when not narrowed,
// on close and on unmount.

import { useEffect } from "react";

import { getDocumentEditor } from "@/lib/mcp/document";
import { useStore } from "@/lib/store";

export function useNarrowedUnderlines(criterioId: string | null): void {
  const essayId = useStore((s) => s.current?.id ?? null);

  useEffect(() => {
    if (!criterioId || !essayId) return;
    let editor;
    try {
      editor = getDocumentEditor(essayId);
    } catch {
      return;
    }
    editor.commands.annotationFx({ narrow: criterioId });
    return () => {
      if (!editor.isDestroyed) editor.commands.annotationFx({ narrow: null });
    };
  }, [criterioId, essayId]);
}
