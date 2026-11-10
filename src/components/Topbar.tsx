"use client";

// Window toolbar (Paper R2.1). Six controls in one row: back to Ensayos,
// saved icon, view switch, Hazme preguntas, Revisar ensayo and Más, with the
// score stamp (spec 005) between Hazme preguntas and Revisar ensayo.
// Traffic lights sit inside the bar (overlay title bar), so the left inset
// clears them and the empty space drags the window.

import { useState, type MouseEvent } from "react";
import { Tooltip } from "@/components/ui/Tooltip";
import { useRegisterAnchor } from "@/components/ui/useAnchor";
import { ScoreStamp } from "@/components/review/ScoreStamp";
import { MorePanel } from "@/components/toolbar/MorePanel";
import {
  BackChevron,
  CheckMark,
  CloudDirty,
  CloudError,
  CloudSaved,
  MoreDots,
  NotesStack,
  Spinner,
  ViewBoard,
  ViewEssay,
} from "@/components/toolbar/toolbar-icons";
import { useStore } from "@/lib/store";
import { boardHasNotes } from "@/lib/board-empty";

/** Width the native traffic lights need, plus the gap Paper leaves after them. */
const LIGHTS_INSET = "pl-[90px]";

/**
 * Spec 004 T044: Hazme preguntas hides only while the board is open and empty,
 * because the empty board carries its own call to action (`board-empty-cta`).
 * With the board closed, or once it has notes, it stays here.
 */
const HIDE_HAZME_ON_EMPTY_BOARD = true;

function groupThousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function Topbar() {
  const view = useStore((s) => s.view);
  // The list view draws its own bar (library/LibraryBar).
  if (view === "list") return null;
  return <EditorBar />;
}

function EditorBar() {
  const closeEssay = useStore((s) => s.closeEssay);
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreInstant, setMoreInstant] = useState(false);
  const moreRef = useRegisterAnchor("mas");

  return (
    <div
      data-tauri-drag-region
      className={`flex items-center justify-between flex-none h-[64px] bg-paper pr-[16px] ${LIGHTS_INSET}`}
    >
      <div data-tauri-drag-region className="flex items-center gap-[8px] min-w-0">
        <Tooltip label="Volver a Ensayos" shortcut="⌘W">
          <button
            type="button"
            data-testid="topbar-back"
            onClick={() => void closeEssay()}
            className="flex items-center gap-[6px] h-[32px] pl-[8px] pr-[12px] rounded-[10px] bg-shade press cursor-pointer whitespace-nowrap"
          >
            <BackChevron />
            <span className="font-sans text-[13px] font-medium leading-[16px] text-ink-1">Ensayos</span>
          </button>
        </Tooltip>
      </div>

      <div data-tauri-drag-region className="flex items-center gap-[8px] flex-none">
        <SaveIcon />
        <ViewSwitch />
        <HazmeButton />
        <ScoreStamp />
        <ReviewButton />
        <Tooltip label="Ajustes, fuentes, rúbrica, historial">
          <button
            ref={moreRef}
            type="button"
            aria-label="Más"
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            data-testid="topbar-more"
            onClick={(e: MouseEvent) => {
              setMoreInstant(e.detail === 0);
              setMoreOpen((v) => !v);
            }}
            className={`grid place-items-center h-[34px] w-[34px] rounded-[10px] press cursor-pointer flex-none ${
              moreOpen ? "bg-shade" : "bg-transparent hover:bg-shade"
            }`}
          >
            <MoreDots />
          </button>
        </Tooltip>
      </div>
      <MorePanel open={moreOpen} onClose={() => setMoreOpen(false)} instant={moreInstant} />
    </div>
  );
}

function SaveIcon() {
  const saveStatus = useStore((s) => s.saveStatus);
  const flush = useStore((s) => s.flush);
  const words = useStore((s) => s.current?.wordCount ?? 0);
  const count = `${groupThousands(words)} ${words === 1 ? "palabra" : "palabras"}`;

  if (saveStatus.kind === "error") {
    return (
      <div data-testid="topbar-save" data-state="error" className="flex items-center gap-[8px] flex-none">
        <CloudError />
        <span className="font-sans text-[13px] leading-[16px] text-ink-1 whitespace-nowrap">No se guardó</span>
        <button
          type="button"
          onClick={() => void flush()}
          className="flex items-center h-[30px] px-[12px] rounded-[8px] bg-sheet shadow-[0_0_0_1px_#1D1B181A] font-sans text-[13px] font-medium leading-[16px] text-ink-1 press cursor-pointer whitespace-nowrap"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const state = saveStatus.kind === "idle" ? "saved" : saveStatus.kind;
  const label =
    state === "saving" ? "Guardando" : state === "dirty" ? "Cambios por guardar" : "Guardado";
  return (
    <Tooltip label={`${label}, ${count}`}>
      <div
        data-testid="topbar-save"
        data-state={state}
        role="status"
        aria-label={`${label}, ${count}`}
        tabIndex={0}
        className="grid place-items-center h-[32px] w-[32px] flex-none rounded-[8px] outline-none focus-visible:bg-shade"
      >
        {state === "saving" ? <Spinner size={16} /> : state === "dirty" ? <CloudDirty /> : <CloudSaved />}
      </div>
    </Tooltip>
  );
}

function ViewSwitch() {
  const boardOpen = useStore((s) => s.boardOpen);
  const toggleBoard = useStore((s) => s.toggleBoard);
  const setView = (wantBoard: boolean) => {
    if (boardOpen !== wantBoard) toggleBoard();
  };
  return (
    <div role="group" aria-label="Vista" className="flex items-center p-[3px] rounded-[10px] bg-shade flex-none">
      <ViewSegment
        testId="topbar-view-editor"
        label="Solo el ensayo"
        active={!boardOpen}
        onClick={() => setView(false)}
      >
        <ViewEssay color={!boardOpen ? "var(--color-ink-1)" : undefined} />
      </ViewSegment>
      <ViewSegment
        testId="topbar-view-board"
        label="Ensayo y tablero"
        active={boardOpen}
        onClick={() => setView(true)}
      >
        <ViewBoard color={boardOpen ? "var(--color-ink-1)" : undefined} />
      </ViewSegment>
    </div>
  );
}

function ViewSegment({
  children,
  label,
  active,
  onClick,
  testId,
}: {
  children: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <Tooltip label={label} shortcut="⌘\">
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        data-testid={testId}
        data-active={active}
        onClick={onClick}
        className={`grid place-items-center h-[26px] w-[30px] rounded-[7px] cursor-pointer flex-none ${
          active ? "bg-sheet shadow-[0_1px_2px_#1D1B181F]" : ""
        }`}
      >
        {children}
      </button>
    </Tooltip>
  );
}

function HazmeButton() {
  const openLectura = useStore((s) => s.openLectura);
  const boardOpen = useStore((s) => s.boardOpen);
  const hasNotes = useStore((s) => boardHasNotes(s.current?.board));
  const ref = useRegisterAnchor("hazme");
  if (HIDE_HAZME_ON_EMPTY_BOARD && boardOpen && !hasNotes) return null;
  return (
    <Tooltip label="Los agentes leen una fuente y te preguntan" shortcut="⌘⇧P">
      <button
        ref={ref}
        type="button"
        data-testid="topbar-hazme"
        onClick={(e) => openLectura(undefined, undefined, { instant: e.detail === 0 })}
        className="flex items-center gap-[8px] h-[34px] pl-[10px] pr-[14px] rounded-[10px] bg-sheet shadow-[0_0_0_1px_#1D1B181A,0_1px_2px_#1D1B180F] press cursor-pointer whitespace-nowrap flex-none"
      >
        <NotesStack />
        <span className="font-sans text-[13px] font-medium leading-[16px] text-ink-1">Hazme preguntas</span>
      </button>
    </Tooltip>
  );
}

function ReviewButton() {
  const openReview = useStore((s) => s.openReview);
  const ref = useRegisterAnchor("revisar");
  // Paper: the filled button is the resting call to action (R2.1, R2.4, R2.5).
  // It yields to a white outlined one while something else holds the writer's
  // attention: nothing written yet (R2.3), a questions or review panel (R3.1,
  // R4.1), a run (R3.2), the report card, corrections or a finding (R5.1, R4.2, R2.2).
  const yielding = useStore(
    (s) =>
      (s.current?.wordCount ?? 0) === 0 ||
      s.overlay === "lectura" ||
      s.overlay === "review" ||
      s.reviewSurfaces > 0 ||
      (s.questionRun !== null && s.questionRun.status !== "ended") ||
      (s.review !== null && Object.values(s.review.passes).some((p) => p.status === "running")),
  );
  return (
    <Tooltip label="Revisar ensayo" shortcut="⌘⇧E">
      <button
        ref={ref}
        type="button"
        data-testid="topbar-pluma-roja"
        data-emphasis={yielding ? "outline" : "filled"}
        onClick={(e) => openReview({ instant: e.detail === 0 })}
        className={`flex items-center gap-[8px] h-[34px] pl-[12px] pr-[14px] rounded-[10px] press cursor-pointer whitespace-nowrap flex-none ${
          yielding
            ? "bg-sheet shadow-[0_0_0_1px_#1D1B181A,0_1px_2px_#1D1B180F]"
            : "bg-ink-1 shadow-[inset_0_1px_0_#FFFFFF1F,0_2px_0_#000000,0_3px_8px_#1D1B182E]"
        }`}
      >
        <CheckMark color={yielding ? "#1D1B18" : "#FFFFFF"} />
        <span className={`font-sans text-[13px] leading-[16px] ${yielding ? "font-medium text-ink-1" : "font-semibold text-white"}`}>
          Revisar ensayo
        </span>
      </button>
    </Tooltip>
  );
}
