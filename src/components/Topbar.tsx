"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { ChevronLeft, MoreHorizontal, PanelRightIcon } from "@/components/ui/icons";
import { CouncilAvatars } from "@/components/council/CouncilAvatars";
import { useStore } from "@/lib/store";
import { FEATURES } from "@/lib/features";
import type { EssayLanguage, EssayMode } from "@/lib/storage/types";

export function Topbar() {
  const view = useStore((s) => s.view);
  const current = useStore((s) => s.current);
  const closeEssay = useStore((s) => s.closeEssay);
  const updateMode = useStore((s) => s.updateMode);
  const updateLanguage = useStore((s) => s.updateLanguage);

  if (view === "list") {
    return (
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-6 px-7 py-3.5 bg-paper-2 border-b border-rule-1">
        <div className="flex items-center gap-2.5">
          <span className="font-serif italic text-[18px] text-seal">C</span>
          <span className="font-serif italic text-[15px] text-ink-1">
            Companion · Essay Studio
          </span>
        </div>
        <div className="flex items-center gap-4">
          <CouncilAvatars />
        </div>
        <div className="flex items-center justify-end gap-2.5">
          <span className="font-mono text-[11px] text-ink-3 tracking-[0.04em]">
            v0.2 · Sesión 2
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 px-5 py-3.5 bg-paper-2 border-b border-rule-1">
      {/* Left — back, title breadcrumb, save status */}
      <div className="flex items-center gap-2 min-w-0">
        <IconButton title="Volver a la lista" onClick={() => void closeEssay()}>
          <ChevronLeft />
        </IconButton>
        <div className="flex items-center font-mono text-[11px] text-ink-3 min-w-0 flex-1">
          <span
            className="hover:text-ink-1 cursor-pointer whitespace-nowrap"
            onClick={() => void closeEssay()}
          >
            ensayos
          </span>
          <span className="mx-1.5 text-ink-4 flex-none">/</span>
          <span className="text-ink-1 font-serif italic text-[13px] truncate min-w-0">
            {current?.title.trim() || "Sin título"}
          </span>
        </div>
        <SaveBadge />
      </div>

      {/* Center — mode toggle + language toggle + council avatars */}
      <div className="flex items-center gap-3 flex-none">
        <div
          role="tablist"
          aria-label="Tipo de ensayo"
          className="inline-flex p-[3px] bg-paper-3 border border-rule-1 rounded-full whitespace-nowrap"
        >
          <ModeButton
            label="Académico"
            glyph="A"
            active={current?.mode === "academico"}
            onClick={() => updateMode("academico")}
          />
          <ModeButton
            label="Blog"
            glyph="B"
            active={current?.mode === "blog"}
            onClick={() => updateMode("blog")}
          />
        </div>
        <LanguageToggle
          value={current?.language ?? "es"}
          onChange={updateLanguage}
        />
        <CouncilAvatars />
      </div>

      {/* Right — actions. Future-session features stay in source but
          gated by `FEATURES.*`. `whitespace-nowrap` on the row prevents
          any child's text from wrapping under pressure. */}
      <div className="flex items-center justify-end gap-2 min-w-0 flex-nowrap overflow-hidden whitespace-nowrap">
        <BoardToggle />
        <FuentesButton />
        <RubricaButton />
        <InterrogateButton />
        {FEATURES.mesaRedonda ? (
          <Button>
            <span className="w-[7px] h-[7px] rounded-full bg-sis" />
            Mesa redonda
            <span className="kbd ml-1">⌘ R</span>
          </Button>
        ) : null}
        {FEATURES.plumaRoja ? <PlumaRojaButton /> : null}
        {/* Benchmark vive como Scorebar siempre visible al fondo; no
            necesita un botón propio en el topbar. */}
        {FEATURES.topbarMore ? (
          <IconButton title="Más">
            <MoreHorizontal />
          </IconButton>
        ) : null}
      </div>
    </div>
  );
}

function InterrogateButton() {
  const openLectura = useStore((s) => s.openLectura);
  return (
    <Button
      onClick={() => openLectura()}
      title="Interrogar un texto · el Empirista por defecto"
    >
      <span className="w-[7px] h-[7px] rounded-full bg-em" />
      Interrogar
    </Button>
  );
}

function FuentesButton() {
  const openFuentes = useStore((s) => s.openFuentes);
  const count = useStore((s) => s.current?.fuentes?.length ?? 0);
  return (
    <button
      type="button"
      onClick={openFuentes}
      title="Biblioteca de fuentes del ensayo"
      data-testid="topbar-fuentes"
      className="inline-flex items-center gap-1.5 h-[28px] px-3 rounded-full border border-rule-1 bg-paper-3 text-ink-2 hover:text-ink-1 hover:bg-paper-2 font-sans text-[12px] cursor-pointer whitespace-nowrap flex-none"
    >
      <span className="font-serif italic text-[14px]">F</span>
      Fuentes
      {count > 0 ? (
        <span className="font-mono text-[10px] tracking-[0.04em] text-ink-3">
          · {count}
        </span>
      ) : null}
    </button>
  );
}

function RubricaButton() {
  const openRubrica = useStore((s) => s.openRubrica);
  const count = useStore((s) => s.current?.rubrica?.criterios.length ?? 0);
  return (
    <button
      type="button"
      onClick={openRubrica}
      title="Editar la rúbrica de evaluación del ensayo"
      data-testid="topbar-rubrica"
      className="inline-flex items-center gap-1.5 h-[28px] px-3 rounded-full border border-rule-1 bg-paper-3 text-ink-2 hover:text-ink-1 hover:bg-paper-2 font-sans text-[12px] cursor-pointer whitespace-nowrap flex-none"
    >
      <span className="font-serif italic text-[14px]">R</span>
      Rúbrica
      {count > 0 ? (
        <span className="font-mono text-[10px] tracking-[0.04em] text-ink-3">
          · {count}
        </span>
      ) : null}
    </button>
  );
}

function PlumaRojaButton() {
  const openPlumaRoja = useStore((s) => s.openPlumaRoja);
  return (
    <Button
      variant="seal"
      onClick={openPlumaRoja}
      title="Evaluar — revisión multi-pasada del ensayo completo"
      data-testid="topbar-pluma-roja"
    >
      Evaluar
    </Button>
  );
}

function BoardToggle() {
  const boardOpen = useStore((s) => s.boardOpen);
  const toggleBoard = useStore((s) => s.toggleBoard);
  return (
    <IconButton
      onClick={toggleBoard}
      title={boardOpen ? "Ocultar tablero" : "Mostrar tablero"}
      aria-pressed={boardOpen}
      className={boardOpen ? "bg-paper-3 text-ink-1 border-rule-1" : ""}
    >
      <PanelRightIcon active={boardOpen} />
    </IconButton>
  );
}

function LanguageToggle({
  value,
  onChange,
}: {
  value: EssayLanguage;
  onChange: (lang: EssayLanguage) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Idioma del ensayo"
      className="inline-flex p-[3px] bg-paper-3 border border-rule-1 rounded-full"
      data-testid="topbar-language"
    >
      <LanguagePill
        label="ES"
        title="Español — los sabios escriben en español"
        active={value === "es"}
        onClick={() => onChange("es")}
      />
      <LanguagePill
        label="EN"
        title="English — the council writes in English"
        active={value === "en"}
        onClick={() => onChange("en")}
      />
    </div>
  );
}

function LanguagePill({
  label,
  title,
  active,
  onClick,
}: {
  label: string;
  title: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      title={title}
      onClick={onClick}
      data-testid={`topbar-language-${label.toLowerCase()}`}
      data-active={active}
      className={`h-[26px] px-3 inline-flex items-center rounded-full text-[11px] font-mono uppercase tracking-[0.12em] cursor-pointer transition-all ${
        active
          ? "bg-paper text-ink-1 shadow-(--shadow-soft)"
          : "bg-transparent text-ink-3 hover:text-ink-1"
      }`}
    >
      {label}
    </button>
  );
}

function ModeButton({
  label,
  glyph,
  active,
  onClick,
}: {
  label: string;
  glyph: string;
  active: boolean | undefined;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      onClick={onClick}
      className={`h-[26px] px-3.5 inline-flex items-center gap-1.5 rounded-full text-[12px] font-medium font-sans cursor-pointer transition-all ${
        active
          ? "bg-paper text-ink-1 shadow-(--shadow-soft)"
          : "bg-transparent text-ink-3 hover:text-ink-1"
      }`}
    >
      <span className="font-serif italic font-medium text-[14px]">{glyph}</span>
      {label}
    </button>
  );
}

/** Badge that reflects real save state from the store. */
function SaveBadge() {
  const saveStatus = useStore((s) => s.saveStatus);
  const flush = useStore((s) => s.flush);
  // `now` is stored in state and bumped by an interval so the
  // "guardado · Xs" label stays fresh without calling Date.now()
  // during render.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (saveStatus.kind !== "saved") return;
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, [saveStatus.kind]);

  switch (saveStatus.kind) {
    case "idle":
      return null;
    case "dirty":
      return <Badge tone="neutral">cambios sin guardar</Badge>;
    case "saving":
      return <Badge tone="neutral">guardando…</Badge>;
    case "saved": {
      const ago = Math.max(0, Math.floor((now - saveStatus.at) / 1000));
      const label = ago < 5 ? "guardado" : `guardado · ${formatAgo(ago)}`;
      return <Badge tone="ok">{label}</Badge>;
    }
    case "error":
      return (
        <button
          type="button"
          onClick={() => void flush()}
          title={saveStatus.message}
          className="inline-flex items-center gap-1.5 h-[22px] px-2.5 rounded-full font-mono text-[11px] font-medium tracking-[0.04em] border bg-[#F5DAD3] text-err border-[rgba(156,44,31,0.30)] cursor-pointer hover:brightness-105"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-err" />
          error · reintentar
        </button>
      );
  }
}

function formatAgo(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h`;
}

// Re-export types for consumers that may want them
export type { EssayMode };
