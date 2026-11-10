"use client";

// Paper R6.4, the preview half of Historial. A read-only copy of the sheet
// with a version's text and a floating bar with one primary action. It is a
// separate TipTap instance: it never registers with `getDocumentEditor`, so
// MCP, undo and autosave keep talking to the live editor underneath, which
// EditorPane keeps mounted. HistoryPanel chooses what is shown through the
// small store below; EditorPane renders it over the sheet.

import { useSyncExternalStore } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

import { Annotation } from "@/components/editor/extensions/Annotation";
import { useStore } from "@/lib/store";
import type { Snapshot } from "@/lib/storage/types";

let shown: Snapshot | null = null;
const listeners = new Set<() => void>();

/** Show a version over the sheet, or null to go back to the live text. */
export function setHistoryPreview(snapshot: Snapshot | null): void {
  if (shown === snapshot) return;
  shown = snapshot;
  listeners.forEach((l) => l());
}

export function useHistoryPreview(): Snapshot | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => shown,
    () => null,
  );
}

export function HistoryPreview({ snapshot }: { snapshot: Snapshot }) {
  const restoreVersion = useStore((s) => s.restoreVersion);
  const setOverlay = useStore((s) => s.setOverlay);

  const editor = useEditor(
    {
      extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] } }), Annotation],
      content: snapshot.essay.content,
      editable: false,
      editorProps: {
        attributes: { class: "tiptap-content focus:outline-none", spellcheck: "false" },
      },
      immediatelyRender: false,
    },
    [snapshot.takenAt],
  );

  const restore = async () => {
    await restoreVersion(snapshot.takenAt);
    setHistoryPreview(null);
    setOverlay(null);
  };

  const title = snapshot.essay.title.trim();

  return (
    <div className="absolute inset-0 z-[2] flex flex-col bg-sheet" data-testid="history-preview">
      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-[28px] px-[72px] pb-[96px] pt-[64px]">
          <div
            className={`font-serif text-[40px] font-medium leading-[46px] tracking-[-0.015em] ${
              title ? "text-ink-1" : "text-ink-3"
            }`}
          >
            {title || "Sin título"}
          </div>
          <div data-testid="history-preview-text">
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
      <div
        className="absolute bottom-[28px] left-1/2 flex -translate-x-1/2 items-center gap-[14px] rounded-[14px] bg-sheet py-[8px] pl-[18px] pr-[8px]"
        style={{ boxShadow: "0 0 0 1px #1D1B1814, 0 18px 40px -14px #1D1B1859" }}
      >
        <div className="flex-none whitespace-pre text-[13px] leading-[16px] text-ink-2">Vista previa</div>
        <div className="flex flex-none gap-[6px]">
          <button
            type="button"
            onClick={() => setHistoryPreview(null)}
            data-testid="history-preview-back"
            className="flex h-[34px] flex-none cursor-pointer items-center whitespace-pre rounded-[10px] px-[12px] text-[13px] font-medium leading-[16px] text-ink-1 hover:bg-shade"
          >
            Volver a la actual
          </button>
          <button
            type="button"
            onClick={() => void restore()}
            data-testid="history-restore-confirm"
            className="flex h-[34px] flex-none cursor-pointer items-center gap-[8px] rounded-[10px] bg-ink-1 pl-[12px] pr-[14px] text-[13px] font-semibold leading-[16px] text-white"
            style={{ boxShadow: "inset 0 1px 0 #FFFFFF1F, 0 2px 0 #000000, 0 3px 8px #1D1B182E" }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="flex-none">
              <path d="M3.5 8a4.5 4.5 0 1 0 1.4-3.3" fill="none" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" />
              <path d="M4.5 2.2v2.8h2.8" fill="none" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Restaurar
          </button>
        </div>
      </div>
    </div>
  );
}
