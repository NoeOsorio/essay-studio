"use client";

// The Rúbrica panel (Paper R6.1, R6.2, R6.6 and the Slice 0 reading, proposal, no
// criteria, rejection and long assignment states). Noe pastes the professor's
// assignment or drops its PDF and the criteria fill themselves; the list stays
// editable in place. Paper hangs this sheet at the right of the window (right 12,
// top 64, bottom 12, 540 wide), not centered, so it does not use the centered Panel.
//
// The work belongs to `src/lib/materials/import.ts`. This file keeps only what the
// writer is looking at: which view, the last rejection, an assignment awaiting his
// confirmation. That state lives in the component that stays mounted, so a reading
// that finishes while the panel is closed is not lost.

import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type CSSProperties, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Popover, SHEET_CLASS, useSheetBehavior } from "@/components/ui/Popover";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  confirmRubricProposal,
  importAssignment,
  importAssignmentFile,
  readAssignment,
  type RejectReason,
  type RubricImportOutcome,
} from "@/lib/materials/import";
import { ASSIGNMENT_MAX_CHARS } from "@/lib/materials/limits";
import { useStore } from "@/lib/store";
import type { Criterio } from "@/lib/storage/types";
import type { ProposedCriterio } from "../../../sidecar/src/extract-parser";

// ---------- Copy (Paper, copied exactly) ----------

/** Title line of a rejected file, from the sources drop zone. */
const REJECTION_LINE: Record<RejectReason, string> = {
  unsupported: "No puedo leer este formato",
  no_text: "Este PDF no tiene texto",
  unreadable: "No pude abrir este PDF",
  locked: "Este PDF tiene contraseña",
  too_large: "Pesa más de 50 MB",
  text_limit: "Es demasiado largo",
  essay_limit: "Es demasiado largo",
};

const ERROR_INK = "#B42318";
const ZONE_RING = "1.5px dashed #1D1B1829";
const SHEET_SHADOW = "0 0 0 1px #1D1B1812, 0 30px 70px -24px #1D1B1859, 0 8px 20px -10px #1D1B1826";
const RING_SHADOW = "0 0 0 1px #1D1B181A, 0 1px 2px #1D1B180F";

// ---------- State ----------

type Local = {
  essayId: string;
  /** He chose «Prefiero escribir los criterios». */
  writing: boolean;
  /** An assignment was read and held no criteria. */
  none: boolean;
  reason: RejectReason | null;
  proposal: ProposedCriterio[] | null;
  /** Rows arrived from a reading: they enter one after another. */
  enter: boolean;
  focusId: string | null;
};

const blank = (essayId: string): Local => ({
  essayId,
  writing: false,
  none: false,
  reason: null,
  proposal: null,
  enter: false,
  focusId: null,
});

// ---------- Panel ----------

export function RubricPanel() {
  const open = useStore((s) => s.overlay === "rubrica" && s.current !== null);
  const instant = useStore((s) => s.overlayInstant);
  const setOverlay = useStore((s) => s.setOverlay);
  const flush = useStore((s) => s.flush);
  const essayId = useStore((s) => s.current?.id ?? null);
  const rubrica = useStore((s) => s.current?.rubrica);
  const lectura = useStore((s) => s.lecturaRubrica);
  const updateRubrica = useStore((s) => s.updateRubrica);

  const [stored, setStored] = useState<Local | null>(null);
  const local: Local = stored && stored.essayId === essayId ? stored : blank(essayId ?? "");
  const patch = (next: Partial<Local>) => {
    if (!essayId) return;
    setStored({ ...local, ...next, essayId });
  };

  const sheet = useRef<HTMLDivElement | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const menuAnchor = useRef<HTMLElement | null>(null);

  const close = () => {
    // A pending edit is saved before the sheet goes.
    void flush();
    setMenuId(null);
    setOverlay(null);
    if (local.enter) patch({ enter: false });
  };

  useSheetBehavior({ open, onClose: close, sheet, persistent: true });

  // Outside pointer: closes, except inside the row menu, which lives in a popover.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t || sheet.current?.contains(t)) return;
      if (t.closest('[data-testid="criterio-menu-panel"]')) return;
      close();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
    // `close` reads the latest local state through patch; re-binding each render is cheap.
  });

  if (!open || !essayId || typeof document === "undefined") return null;

  const criterios = rubrica?.criterios ?? [];
  const consigna = rubrica?.consigna;
  const longAssignment = !!consigna && consigna.texto.length > ASSIGNMENT_MAX_CHARS;

  // ----- Bringing the assignment in -----

  const settle = (id: string, outcome: RubricImportOutcome) => {
    switch (outcome.kind) {
      case "applied":
        setStored({ ...blank(id), enter: true });
        break;
      case "proposal":
        setStored({ ...blank(id), proposal: outcome.criterios });
        break;
      case "none":
        setStored({ ...blank(id), none: true });
        break;
      case "rejected":
        setStored({ ...blank(id), reason: outcome.reason });
        break;
      default:
        break;
    }
  };

  const bringText = (text: string) => {
    if (!text.trim()) return;
    setStored(blank(essayId));
    void importAssignment({ text }).then((o) => settle(essayId, o));
  };
  const bringFile = (file: File) => {
    setStored(blank(essayId));
    void importAssignmentFile(file).then((o) => settle(essayId, o));
  };
  const retry = () => {
    setStored(blank(essayId));
    void readAssignment(essayId).then((o) => settle(essayId, o));
  };

  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (t.closest("input, textarea, [contenteditable='true']")) return;
    const file = e.clipboardData.files[0];
    if (file) {
      e.preventDefault();
      bringFile(file);
      return;
    }
    const text = e.clipboardData.getData("text/plain");
    if (text.trim()) {
      e.preventDefault();
      bringText(text);
    }
  };

  // ----- Rubric edits (every keystroke commits; the store debounces the save) -----

  const commit = (next: Criterio[]) => {
    updateRubrica({ criterios: next, ...(consigna ? { consigna } : {}) });
  };
  const edit = (id: string, change: Partial<Criterio>) => {
    commit(criterios.map((c) => (c.id === id ? { ...c, ...change } : c)));
  };
  const addCriterio = () => {
    const id = crypto.randomUUID();
    commit([...criterios, { id, nombre: "", peso: 3, descripcion: "" }]);
    patch({ writing: true, focusId: id });
  };
  const removeCriterio = (id: string) => {
    setMenuId(null);
    commit(criterios.filter((c) => c.id !== id));
  };

  // ----- Which view -----

  const reading = lectura === "leyendo";
  let body: ReactNode;
  let roomy = true;
  if (local.proposal) {
    roomy = false;
    body = (
      <ProposalView
        proposal={local.proposal}
        onKeep={() => patch({ proposal: null })}
        onUse={async () => {
          const proposal = local.proposal;
          if (!proposal) return;
          const ok = await confirmRubricProposal(essayId, proposal);
          if (ok) setStored({ ...blank(essayId), enter: true });
        }}
      />
    );
  } else if (reading) {
    body = <ReadingView />;
  } else if (criterios.length > 0 || local.writing) {
    roomy = false;
    body = (
      <ReadyView
        criterios={criterios}
        enter={local.enter}
        focusId={local.focusId}
        menuId={menuId}
        onEdit={edit}
        onAdd={addCriterio}
        onMenu={(id, el) => {
          menuAnchor.current = el;
          setMenuId(id);
        }}
        notice={
          lectura === "fallo" ? (
            <FailureLine onRetry={retry} />
          ) : null
        }
        footer={
          local.reason ? (
            <NoticeLine>{REJECTION_LINE[local.reason]}</NoticeLine>
          ) : longAssignment ? (
            <NoticeLine tooltip="La consigna es muy larga, usé su comienzo">Leí solo el inicio. Revisa que no falte ningún criterio.</NoticeLine>
          ) : null
        }
        onFile={bringFile}
      />
    );
  } else if (local.none) {
    body = (
      <Zone onFile={bringFile}>
        <ZoneTitle>No encontré criterios en este texto</ZoneTitle>
        <PillButton testId="rubrica-write" icon={<PencilIcon />} onClick={() => patch({ writing: true, none: false })}>
          Escribir a mano
        </PillButton>
      </Zone>
    );
  } else if (local.reason) {
    body = (
      <Zone onFile={bringFile}>
        <ZoneTitle>{REJECTION_LINE[local.reason]}</ZoneTitle>
        <PillButton testId="rubrica-choose" icon={<UploadIcon />} onClick={() => fileInput.current?.click()}>
          Elegir otro
        </PillButton>
      </Zone>
    );
  } else {
    body = (
      <>
        <Zone onFile={bringFile} illustration="steps">
          {lectura === "fallo" ? (
            <div className="w-full">
              <FailureLine onRetry={retry} />
            </div>
          ) : (
            <ZoneTitle>Pega la consigna de tu profesor o suelta el PDF</ZoneTitle>
          )}
          <Tooltip label="Pegar" shortcut="⌘V" side="top">
            <PillButton testId="rubrica-choose" icon={<UploadIcon />} onClick={() => fileInput.current?.click()}>
              Elegir archivo
            </PillButton>
          </Tooltip>
        </Zone>
        <div className="flex justify-center">
          <button
            type="button"
            data-testid="rubrica-prefer-write"
            onClick={() => patch({ writing: true })}
            className="cursor-pointer rounded-[8px] px-[8px] py-[4px] font-sans text-[13px] font-medium leading-[16px] text-ink-3 hover:text-ink-1"
          >
            Prefiero escribir los criterios
          </button>
        </div>
      </>
    );
  }

  const menuCriterio = criterios.find((c) => c.id === menuId) ?? null;

  return createPortal(
    <>
      <div
        ref={sheet}
        tabIndex={-1}
        data-testid="rubrica-overlay"
        onPaste={onPaste}
        className={`${SHEET_CLASS} fixed z-[900] flex flex-col ${instant ? "" : "sheet-in"}`}
        style={{
          right: 12,
          top: 64,
          bottom: 12,
          width: 540,
          maxWidth: "calc(100% - 24px)",
          boxShadow: SHEET_SHADOW,
          transformOrigin: "100% 0",
          gap: roomy ? 28 : 20,
          padding: roomy ? "28px 32px 32px" : "28px 20px 32px",
        }}
      >
        <header className={`flex flex-none items-center justify-between ${roomy ? "" : "pl-[12px]"}`}>
          <h2 className="font-sans text-[22px] font-semibold leading-[28px] tracking-[-0.01em] text-ink-1">Rúbrica</h2>
          <Tooltip label="Cerrar" shortcut="Esc">
            <button
              type="button"
              aria-label="Cerrar"
              onClick={close}
              className="grid h-[32px] w-[32px] flex-none cursor-pointer place-items-center rounded-[8px] press hover:bg-shade"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="var(--color-ink-3)" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </Tooltip>
        </header>
        {body}
        <input
          ref={fileInput}
          type="file"
          accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
          className="hidden"
          data-testid="rubrica-file-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) bringFile(file);
          }}
        />
      </div>
      <Popover
        anchor={menuAnchor}
        open={menuCriterio !== null}
        onClose={() => setMenuId(null)}
        align="end"
        size="compact"
        width={140}
        instant
        testId="criterio-menu-panel"
      >
        <div className="flex flex-col gap-[2px] p-[6px]">
          <button
            type="button"
            data-testid="criterio-remove"
            onClick={() => menuCriterio && removeCriterio(menuCriterio.id)}
            className="flex h-[34px] cursor-pointer items-center gap-[8px] rounded-[8px] px-[10px] text-left hover:bg-shade"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="flex-none">
              <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8h5.8l.6-8" fill="none" stroke="var(--color-ink-1)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="font-sans text-[13px] font-medium leading-[16px] text-ink-1">Quitar</span>
          </button>
        </div>
      </Popover>
    </>,
    document.body,
  );
}

// ---------- Views ----------

function Zone({
  children,
  onFile,
  illustration = "sheet",
}: {
  children: ReactNode;
  onFile: (file: File) => void;
  illustration?: "sheet" | "steps";
}) {
  const [over, setOver] = useState(false);
  const drop = useDrop(setOver, onFile);
  return (
    <div
      data-drop-zone
      data-testid="rubrica-zone"
      data-over={over}
      {...drop}
      className="material-zone flex min-h-0 flex-1 flex-col items-center justify-center gap-[32px] rounded-[14px] p-[40px]"
      style={{ border: ZONE_RING }}
    >
      {illustration === "steps" ? <StepsIllustration /> : <PaperSheet />}
      <div className="flex w-full flex-col items-center gap-[18px] [&>span]:flex">{children}</div>
    </div>
  );
}

function ReadingView() {
  return (
    <div
      data-testid="rubrica-reading"
      role="status"
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[32px] rounded-[14px] bg-shade p-[40px]"
    >
      <PaperSheet reading />
      <div className="font-sans text-[17px] font-medium leading-[24px] text-ink-1" style={{ width: 260, textAlign: "center" }}>
        Leyendo la consigna
      </div>
    </div>
  );
}

function ReadyView({
  criterios,
  enter,
  focusId,
  menuId,
  onEdit,
  onAdd,
  onMenu,
  notice,
  footer,
  onFile,
}: {
  criterios: Criterio[];
  enter: boolean;
  focusId: string | null;
  menuId: string | null;
  onEdit: (id: string, change: Partial<Criterio>) => void;
  onAdd: () => void;
  onMenu: (id: string, el: HTMLElement) => void;
  notice: ReactNode;
  footer: ReactNode;
  onFile: (file: File) => void;
}) {
  const [over, setOver] = useState(false);
  const drop = useDrop(setOver, onFile);
  return (
    <div
      data-drop-zone
      data-over={over}
      {...drop}
      className="thin-scroll flex min-h-0 flex-1 flex-col gap-[4px] overflow-y-auto"
    >
      {notice}
      {criterios.map((c, index) => (
        <CriterioRow
          key={c.id}
          criterio={c}
          index={index}
          enter={enter}
          autoFocus={focusId === c.id}
          menuOpen={menuId === c.id}
          onEdit={(change) => onEdit(c.id, change)}
          onMenu={(el) => onMenu(c.id, el)}
        />
      ))}
      <button
        type="button"
        data-testid="rubrica-add"
        onClick={onAdd}
        className="flex flex-none cursor-pointer items-center gap-[10px] rounded-[12px] px-[12px] py-[14px] text-left hover:bg-shade"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="flex-none">
          <path d="M8 3.5v9M3.5 8h9" fill="none" stroke="var(--color-ink-3)" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <span className="font-sans text-[15px] font-medium leading-[20px] text-ink-3">Añadir criterio</span>
      </button>
      {footer}
    </div>
  );
}

function ProposalView({
  proposal,
  onKeep,
  onUse,
}: {
  proposal: ProposedCriterio[];
  onKeep: () => void;
  onUse: () => void;
}) {
  return (
    <div data-testid="rubrica-proposal" className="flex min-h-0 flex-1 flex-col gap-[20px]">
      <div className="flex-none px-[12px] font-sans text-[15px] leading-[20px] text-ink-2">Encontré esta rúbrica en la consigna nueva</div>
      <div className="thin-scroll flex min-h-0 flex-1 flex-col gap-[4px] overflow-y-auto">
        {proposal.map((c, index) => (
          <div key={`${c.nombre}-${index}`} className="flex flex-none items-center gap-[20px] rounded-[12px] px-[12px] py-[14px]">
            <div className="flex min-w-0 flex-1 flex-col gap-[4px]">
              <div className="font-sans text-[15px] font-semibold leading-[20px] text-ink-1">{c.nombre}</div>
              <div className="font-sans text-[13px] leading-[18px] text-ink-3">{c.descripcion}</div>
            </div>
            <Dots value={c.peso} />
            <div className="h-[28px] w-[28px] flex-none" />
          </div>
        ))}
      </div>
      <div className="flex flex-none flex-col gap-[12px]">
        <div className="px-[12px] font-sans text-[13px] leading-[18px] text-ink-2">Tu rúbrica actual queda guardada en Historial.</div>
        <div className="flex justify-end gap-[8px]">
          <button
            type="button"
            data-testid="rubrica-proposal-keep"
            onClick={onKeep}
            className="flex h-[38px] cursor-pointer items-center rounded-[10px] bg-shade px-[16px] font-sans text-[13px] font-medium leading-[16px] text-ink-1 press"
          >
            Dejar la mía
          </button>
          <button
            type="button"
            data-testid="rubrica-proposal-use"
            onClick={onUse}
            className="flex h-[38px] cursor-pointer items-center rounded-[10px] bg-ink-1 px-[18px] font-sans text-[13px] font-medium leading-[16px] text-white press"
          >
            Usar esta
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Rows ----------

function CriterioRow({
  criterio,
  index,
  enter,
  autoFocus,
  menuOpen,
  onEdit,
  onMenu,
}: {
  criterio: Criterio;
  index: number;
  enter: boolean;
  autoFocus: boolean;
  menuOpen: boolean;
  onEdit: (change: Partial<Criterio>) => void;
  onMenu: (el: HTMLElement) => void;
}) {
  const name = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (autoFocus) name.current?.focus({ preventScroll: false });
  }, [autoFocus]);

  return (
    <div
      data-testid="criterio-row"
      className={`group flex flex-none items-center gap-[20px] rounded-[12px] px-[12px] py-[14px] hover:bg-shade focus-within:bg-shade ${
        menuOpen ? "bg-shade" : ""
      } ${enter ? "row-in" : ""}`}
      style={enter ? ({ "--stagger": `${index * 60}ms` } as CSSProperties) : undefined}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-[4px]">
        <input
          ref={name}
          type="text"
          data-testid="criterio-nombre"
          aria-label="Nombre del criterio"
          placeholder="Nombre del criterio"
          value={criterio.nombre}
          onChange={(e) => onEdit({ nombre: e.target.value })}
          className="w-full bg-transparent font-sans text-[15px] font-semibold leading-[20px] text-ink-1 outline-none placeholder:font-medium placeholder:text-ink-4"
        />
        <GrowText
          testId="criterio-descripcion"
          label="Descripción del criterio"
          placeholder="Qué se ve cuando se cumple bien"
          value={criterio.descripcion}
          onChange={(value) => onEdit({ descripcion: value })}
        />
      </div>
      <div className="flex flex-none [&>span]:flex">
        <Tooltip label="Cuánto pesa en la nota">
          <Dots value={criterio.peso} stagger={enter ? index * 60 + 240 : undefined} onPick={(peso) => onEdit({ peso })} name={criterio.nombre} />
        </Tooltip>
      </div>
      <button
        type="button"
        data-testid="criterio-menu"
        aria-label="Más acciones"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={(e) => onMenu(e.currentTarget)}
        className={`grid h-[28px] w-[28px] flex-none cursor-pointer place-items-center rounded-[8px] press transition-opacity duration-[var(--dur-press)] ease-out focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 ${
          menuOpen ? "bg-shade opacity-100" : "bg-sheet opacity-0"
        }`}
        style={{ boxShadow: "0 0 0 1px #1D1B1814" }}
      >
        <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
          <circle cx="4" cy="9" r="1.4" fill="var(--color-ink-2)" />
          <circle cx="9" cy="9" r="1.4" fill="var(--color-ink-2)" />
          <circle cx="14" cy="9" r="1.4" fill="var(--color-ink-2)" />
        </svg>
      </button>
    </div>
  );
}

/** Five dots; with `onPick` they are a radio group, so a weight is one click or the arrow keys. */
function Dots({
  value,
  onPick,
  stagger,
  name,
}: {
  value: number;
  onPick?: (peso: number) => void;
  stagger?: number;
  name?: string;
}) {
  const dots = [1, 2, 3, 4, 5];
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!onPick) return;
    const next =
      e.key === "ArrowRight" || e.key === "ArrowUp" ? Math.min(5, value + 1) : e.key === "ArrowLeft" || e.key === "ArrowDown" ? Math.max(1, value - 1) : null;
    if (next === null) return;
    e.preventDefault();
    onPick(next);
    requestAnimationFrame(() => {
      (e.currentTarget.querySelector(`[data-dot="${next}"]`) as HTMLElement | null)?.focus();
    });
  };
  return (
    <div
      role={onPick ? "radiogroup" : undefined}
      aria-label={onPick ? `Peso de ${name || "criterio"}` : undefined}
      data-testid={onPick ? "criterio-peso" : undefined}
      onKeyDown={onKey}
      className="flex w-[70px] flex-none gap-[5px]"
    >
      {dots.map((n) => {
        const on = n <= value;
        const dot = (
          <span
            className={`block h-[10px] w-[10px] rounded-[9px] ${on && stagger !== undefined ? "dot-fill" : ""}`}
            style={{
              backgroundColor: on ? "var(--color-ink-1)" : "#1D1B1820",
              ...(on && stagger !== undefined ? ({ "--stagger": `${stagger + (n - 1) * 40}ms` } as CSSProperties) : {}),
            }}
          />
        );
        if (!onPick) return <span key={n}>{dot}</span>;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={n === value}
            aria-label={`${n}`}
            data-dot={n}
            data-testid={`criterio-peso-${n}`}
            tabIndex={n === value ? 0 : -1}
            onClick={() => onPick(n)}
            className="relative flex-none cursor-pointer rounded-full before:absolute before:-inset-[4px] before:content-['']"
          >
            {dot}
          </button>
        );
      })}
    </div>
  );
}

/** A description that grows with its text, with no scrollbar. */
function GrowText({
  value,
  onChange,
  placeholder,
  label,
  testId,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  testId: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      data-testid={testId}
      aria-label={label}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full resize-none overflow-hidden bg-transparent font-sans text-[13px] leading-[18px] text-ink-3 outline-none placeholder:text-ink-4"
    />
  );
}

// ---------- Small pieces ----------

function useDrop(setOver: (over: boolean) => void, onFile: (file: File) => void) {
  return {
    onDragEnter: (e: DragEvent) => {
      e.preventDefault();
      setOver(true);
    },
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setOver(false);
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    },
  };
}

function ZoneTitle({ children }: { children: ReactNode }) {
  return (
    <div className="font-sans text-[17px] font-medium leading-[24px] text-ink-1" style={{ width: 260, textAlign: "center" }}>
      {children}
    </div>
  );
}

function PillButton({
  children,
  icon,
  onClick,
  testId,
}: {
  children: ReactNode;
  icon: ReactNode;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="flex h-[34px] flex-none cursor-pointer items-center gap-[8px] rounded-[10px] bg-sheet pl-[12px] pr-[14px] font-sans text-[13px] font-medium leading-[16px] text-ink-1 press"
      style={{ boxShadow: RING_SHADOW }}
    >
      {icon}
      {children}
    </button>
  );
}

function FailureLine({ onRetry }: { onRetry: () => void }) {
  return (
    <div data-testid="rubrica-failure" role="status" className="flex min-h-[30px] flex-none items-center gap-[10px] px-[12px]">
      <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" className="flex-none">
        <path d="M8 2.2l6.2 11H1.8l6.2-11Z" fill="none" stroke={ERROR_INK} strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M8 6.6v3M8 11.4v.1" fill="none" stroke={ERROR_INK} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span className="min-w-0 flex-1 font-sans text-[15px] leading-[20px] text-ink-1">La IA no responde.</span>
      <button
        type="button"
        data-testid="rubrica-retry"
        onClick={onRetry}
        className="flex h-[30px] flex-none cursor-pointer items-center rounded-[8px] bg-sheet px-[12px] font-sans text-[13px] font-medium leading-[16px] text-ink-1 press"
        style={{ boxShadow: "0 0 0 1px #1D1B181A" }}
      >
        Reintentar
      </button>
    </div>
  );
}

function NoticeLine({ children, tooltip }: { children: ReactNode; tooltip?: string }) {
  const line = (
    <div data-testid="rubrica-notice" className="flex flex-none items-center gap-[8px] px-[12px] py-[6px]">
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="flex-none">
        <path d="M8 2.2l6.2 11a.6.6 0 0 1-.5.9H2.3a.6.6 0 0 1-.5-.9z" fill="none" stroke="var(--color-ink-1)" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M8 6.3v3.4" fill="none" stroke="var(--color-ink-1)" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="8" cy="11.8" r=".9" fill="var(--color-ink-1)" />
      </svg>
      <span className="font-sans text-[13px] leading-[18px] text-ink-2">{children}</span>
    </div>
  );
  return tooltip ? <Tooltip label={tooltip}>{line}</Tooltip> : line;
}

function UploadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="flex-none">
      <path d="M8 10.5V3M5 6l3-3 3 3" fill="none" stroke="var(--color-ink-1)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 10.5v1.5a1.5 1.5 0 0 0 1.5 1.5h7a1.5 1.5 0 0 0 1.5-1.5v-1.5" fill="none" stroke="var(--color-ink-1)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="flex-none">
      <path d="M3 13l.8-3L11 2.8a1.2 1.2 0 0 1 1.7 0l.5.5a1.2 1.2 0 0 1 0 1.7L6 12.2 3 13Z" fill="none" stroke="var(--color-ink-1)" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

// ---------- Illustrations (Paper R6.1) ----------

/** The assignment sheet: tape on top, lines, two highlighted. While reading, a band of light crosses it. */
function PaperSheet({ reading = false }: { reading?: boolean }) {
  const line = (w: number, color: string, h = 5) => (
    <div className="flex-none" style={{ height: h, width: w, borderRadius: 3, backgroundColor: color }} />
  );
  return (
    <div
      aria-hidden="true"
      className={`relative flex flex-none flex-col bg-sheet ${reading ? "sheet-settle" : ""}`}
      style={{
        width: 118,
        height: 150,
        padding: "22px 16px",
        gap: 9,
        borderRadius: 6,
        rotate: "-3deg",
        boxShadow: "0 1px 1px #3C2D0A14, 0 12px 24px -10px #3C2D0A4D",
        ...(reading ? { overflow: "hidden" } : {}),
      }}
    >
      {line(70, "#1D1B1838", 6)}
      {line(86, "#1D1B181A")}
      {line(80, "#1D1B181A")}
      {line(60, "#E8B42173")}
      {line(84, "#1D1B181A")}
      {line(74, "#9670E066")}
      {line(50, "#1D1B181A")}
      {reading ? (
        <div
          className="read-band absolute left-0 top-[22px]"
          style={{ width: 118, height: 22, borderRadius: 2, ["--band-travel" as string]: "96px" }}
        />
      ) : null}
      <div
        className="absolute"
        style={{
          left: 28,
          top: -9,
          width: 62,
          height: 18,
          rotate: "4deg",
          transformOrigin: "0 0",
          backgroundColor: "#FFFDF5BD",
          boxShadow: "0 1px 3px #3C2D0A29",
        }}
      />
    </div>
  );
}

/** The sheet, an arrow, and four criteria with their weights: what the panel is about to do. */
function StepsIllustration() {
  const weights = [5, 4, 3, 2];
  return (
    <div aria-hidden="true" className="flex flex-none items-center" style={{ gap: 22 }}>
      <PaperSheet />
      <svg width="36" height="20" viewBox="0 0 36 20" className="flex-none">
        <path d="M2 12c8-8 20-8 30-2" fill="none" stroke="var(--color-ink-3)" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M27 5l5.5 5-6.5 2.5" fill="none" stroke="var(--color-ink-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="flex flex-col" style={{ gap: 10, rotate: "1.5deg" }}>
        {weights.map((w) => (
          <div key={w} className="flex items-center bg-sheet" style={{ gap: 10, padding: "8px 10px", borderRadius: 8, boxShadow: "0 1px 2px #1D1B1814" }}>
            <div className="flex-none" style={{ width: 58, height: 6, borderRadius: 3, backgroundColor: "#1D1B1838" }} />
            <div className="flex" style={{ gap: 3 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <div key={n} className="flex-none" style={{ width: 6, height: 6, borderRadius: 9, backgroundColor: n <= w ? "var(--color-ink-1)" : "#1D1B1820" }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

