"use client";

// The Hazme preguntas panel (Paper R3.1). It hangs from the Hazme preguntas
// button, or from the empty board's call to action. The writer picks a source,
// sees which agents will ask, and presses Preguntar. The run itself belongs to
// `src/lib/questions/run.ts`; pressing Preguntar starts it and the panel
// closes, so the questions can be watched landing on the board.

import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";

import { AgentTiles } from "@/components/questions/AgentTiles";
import { SourcePicker } from "@/components/questions/SourcePicker";
import { Popover } from "@/components/ui/Popover";
import { Tooltip } from "@/components/ui/Tooltip";
import { useAnchor } from "@/components/ui/useAnchor";
import { startQuestionRun } from "@/lib/questions/run";
import { addSource, importSourceFile, type AddSourceOutcome } from "@/lib/materials/import";
import { REJECTION_LINES, sourceFits, sourceLabel, TOO_LARGE_LINE } from "@/lib/questions/source";
import { ALL_SAGES, defaultSagesForMode } from "@/lib/sages";
import { MAX_QUESTION_CHARS } from "../../../sidecar/src/review-contract";
import { useStore } from "@/lib/store";
import type { Fuente, Sage } from "@/lib/storage/types";

type Choice = { kind: "selection" } | { kind: "fuente"; id: string } | null;

export function QuestionsPanel() {
  const open = useStore((s) => s.overlay === "lectura" && s.current !== null);
  const instant = useStore((s) => s.overlayInstant);
  const setOverlay = useStore((s) => s.setOverlay);
  const essayId = useStore((s) => s.current?.id ?? null);
  const anchor = useAnchor("hazme");
  const close = () => setOverlay(null);

  return (
    <Popover
      anchor={anchor}
      open={open}
      onClose={close}
      side="bottom"
      align="end"
      width={392}
      instant={instant}
      testId="lectura-overlay"
    >
      {open && essayId ? <PanelBody key={essayId} onClose={close} /> : null}
    </Popover>
  );
}

/** Paper R3.4: the panel opens in 240 ms and folds toward the pill in 280 ms. */
const OPEN_MS = 240;
const FOLD_MS = 280;
/** Reduced motion has no travel, only a 200 ms fade (globals.css `.panel-fold`). */
const FOLD_REDUCED_MS = 200;

function PanelBody({ onClose }: { onClose: () => void }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const foldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [folding, setFolding] = useState(false);
  const sheetOf = () => rootRef.current?.closest<HTMLElement>('[data-testid="lectura-overlay"]') ?? null;

  // The shared sheet opens in 320 ms; this panel's opening is 240 ms in Paper.
  useLayoutEffect(() => {
    const sheet = sheetOf();
    if (sheet?.classList.contains("sheet-in")) sheet.style.animationDuration = `${OPEN_MS}ms`;
  }, []);
  useEffect(() => () => {
    if (foldTimer.current) clearTimeout(foldTimer.current);
  }, []);

  /** The sheet shrinks toward the run pill, which sits at the top center of the board, then closes. */
  const foldAway = () => {
    const sheet = sheetOf();
    if (!sheet) {
      onClose();
      return;
    }
    const sheetBox = sheet.getBoundingClientRect();
    const board = document.querySelector<HTMLElement>(".board-grid")?.getBoundingClientRect();
    const targetX = board ? board.left + board.width / 2 : window.innerWidth / 2;
    const targetY = board ? board.top + 8 + 19 : 83;
    sheet.style.removeProperty("animation-duration");
    sheet.classList.remove("sheet-in");
    sheet.style.setProperty("--fold-origin", `${targetX - sheetBox.left}px ${targetY - sheetBox.top}px`);
    sheet.classList.add("panel-fold");
    setFolding(true);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    foldTimer.current = setTimeout(onClose, reduced ? FOLD_REDUCED_MS : FOLD_MS);
  };

  const mode = useStore((s) => s.current?.mode ?? "academico");
  const fuentes = useStore((s) => s.current?.fuentes);
  const only = useStore((s) => s.lecturaSage);
  const searchRef = useRef<HTMLInputElement | null>(null);

  // A selection from the essay is a transient source: never saved to the library.
  const [selection] = useState(() => useStore.getState().lecturaPrefill);
  const hasSelection = selection.trim().length > 0;
  const [choice, setChoice] = useState<Choice>(hasSelection ? { kind: "selection" } : null);
  // Starting from an agent means only that agent is on; otherwise the essay type decides.
  const [on, setOn] = useState<Sage[]>(() => (only ? [only] : defaultSagesForMode(mode)));
  const [notice, setNotice] = useState<string | null>(null);
  // His own question about the chosen source (Paper R3.3).
  const [own, setOwn] = useState("");

  const list: Fuente[] = fuentes ?? [];
  const chosenFuente = choice?.kind === "fuente" ? (list.find((f) => f.id === choice.id) ?? null) : null;
  const source: { fuenteId?: string; label: string; text: string } | null =
    choice?.kind === "selection" && hasSelection
      ? { label: "Tu selección", text: selection }
      : chosenFuente
        ? { fuenteId: chosenFuente.id, label: sourceLabel(chosenFuente), text: chosenFuente.contenido }
        : null;
  const fits = source ? sourceFits(source.text) : true;
  const canAsk = !!source && source.text.trim().length > 0 && on.length > 0 && fits;

  /** A saved source (new, or the one already there) becomes the chosen one; a refusal shows its short line. */
  const settle = (outcome: AddSourceOutcome) => {
    if (outcome.kind === "added") setChoice({ kind: "fuente", id: outcome.sourceId });
    else if (outcome.kind === "duplicate") setChoice({ kind: "fuente", id: outcome.existingId });
    else if (outcome.kind === "rejected") {
      setNotice(REJECTION_LINES[outcome.reason]);
      return;
    }
    setNotice(null);
  };

  const onFile = async (file: File) => {
    try {
      settle(await importSourceFile(file));
    } catch {
      setNotice(REJECTION_LINES.unreadable);
    }
  };

  const onPaste = (e: ClipboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    const files = Array.from(e.clipboardData.files ?? []);
    if (files.length > 0) {
      e.preventDefault();
      for (const f of files) void onFile(f);
      return;
    }
    const text = e.clipboardData.getData("text/plain");
    if (text.trim().length === 0) return;
    e.preventDefault();
    settle(addSource({ text }));
  };

  const ask = () => {
    if (!source || !canAsk || folding) return;
    startQuestionRun({
      source: {
        ...(source.fuenteId ? { fuenteId: source.fuenteId } : {}),
        label: source.label,
        text: source.text,
      },
      sages: ALL_SAGES.filter((s) => on.includes(s)),
      ...(own.trim() ? { ownQuestion: own.trim() } : {}),
    });
    foldAway();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      ask();
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      searchRef.current?.focus();
    }
  };

  return (
    <div
      ref={rootRef}
      data-board-surface
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      className="flex flex-col gap-[20px] p-[20px] font-sans"
    >
      <div className="flex items-start justify-between gap-[12px]">
        <div className="flex flex-col gap-[4px]">
          <h2 className="text-[22px] font-semibold leading-[28px] tracking-[-0.01em] text-ink-1">
            Los agentes te preguntan
          </h2>
          <p className="text-[15px] leading-[20px] text-ink-3">sobre la fuente que elijas</p>
        </div>
        <Tooltip label="Cerrar" shortcut="Esc">
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="grid h-[28px] w-[28px] flex-none cursor-pointer place-items-center rounded-[8px] hover:bg-shade"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" fill="none" stroke="var(--color-ink-3)" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </Tooltip>
      </div>

      <SourcePicker
        fuentes={list}
        selectedId={choice?.kind === "fuente" ? choice.id : null}
        onSelect={(f) => {
          setChoice({ kind: "fuente", id: f.id });
          setNotice(null);
        }}
        onFile={(f) => void onFile(f)}
        selection={hasSelection ? selection : null}
        selectionChosen={choice?.kind === "selection"}
        onSelectSelection={() => {
          setChoice({ kind: "selection" });
          setNotice(null);
        }}
        notice={notice}
        note={source && !fits ? TOO_LARGE_LINE : null}
        onActivity={() => setNotice(null)}
        searchRef={searchRef}
      />

      <AgentTiles
        on={on}
        onToggle={(s) => setOn((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))}
      />

      <label className="flex h-[44px] flex-none cursor-text items-center gap-[10px] rounded-[12px] bg-shade pl-[14px] pr-[6px] focus-within:shadow-[0_0_0_1.5px_var(--color-ink-3)]">
        <svg width="16" height="16" viewBox="0 0 16 16" className="flex-none" aria-hidden="true">
          <path d="M10.5 3l2.5 2.5-7 7H3.5V10l7-7Z" fill="none" stroke="var(--color-ink-2)" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
        <input
          type="text"
          value={own}
          maxLength={MAX_QUESTION_CHARS}
          placeholder="Añade tu propia pregunta"
          aria-label="Añade tu propia pregunta"
          data-testid="lectura-own-question"
          autoComplete="off"
          onChange={(e) => setOwn(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              ask();
            }
          }}
          className="min-w-0 flex-1 bg-transparent font-sans text-[15px] leading-[20px] text-ink-1 outline-none placeholder:text-ink-3"
        />
      </label>

      <div className="[&>span]:flex [&>span]:w-full">
        <Tooltip label="Preguntar" shortcut="⌘↩" side="top">
          <button
            type="button"
            disabled={!canAsk}
            onClick={ask}
            data-testid="lectura-interrogar"
            className="press h-[44px] w-full flex-none cursor-pointer rounded-[10px] bg-ink-1 text-[15px] font-semibold leading-[20px] text-white disabled:cursor-not-allowed disabled:opacity-40"
            style={{ boxShadow: "#FFFFFF1F 0 1px 0 inset, #000000 0 2px 0, #1D1B182E 0 3px 8px" }}
          >
            Preguntar
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
