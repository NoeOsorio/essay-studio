"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { ChevronLeft, MoreHorizontal } from "@/components/ui/icons";
import { CouncilAvatars } from "@/components/council/CouncilAvatars";

type Mode = "academico" | "blog";

export function Topbar() {
  const [mode, setMode] = useState<Mode>("academico");

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-6 px-7 py-3.5 bg-paper-2 border-b border-rule-1">
      {/* Left — back, breadcrumb, save status */}
      <div className="flex items-center gap-2.5">
        <IconButton title="Volver">
          <ChevronLeft />
        </IconButton>
        <div className="flex items-center font-mono text-[11px] text-ink-3">
          <span>psicología-org</span>
          <span className="mx-1.5 text-ink-4">/</span>
          <span>ensayos</span>
          <span className="mx-1.5 text-ink-4">/</span>
          <span className="text-ink-1 font-serif italic text-[13px]">
            paradoja-seguridad-remota
          </span>
        </div>
        <Badge tone="ok">guardado · 2s</Badge>
      </div>

      {/* Center — mode toggle + council avatars */}
      <div className="flex items-center gap-4">
        <div
          role="tablist"
          className="inline-flex p-[3px] bg-paper-3 border border-rule-1 rounded-full"
        >
          <ModeButton
            label="Académico"
            glyph="A"
            active={mode === "academico"}
            onClick={() => setMode("academico")}
          />
          <ModeButton
            label="Blog"
            glyph="B"
            active={mode === "blog"}
            onClick={() => setMode("blog")}
          />
        </div>
        <CouncilAvatars />
      </div>

      {/* Right — actions */}
      <div className="flex items-center justify-end gap-2.5">
        <Button>
          <span className="w-[7px] h-[7px] rounded-full bg-sis" />
          Mesa redonda
          <span className="kbd ml-1">⌘ R</span>
        </Button>
        <Button variant="seal">Pluma roja</Button>
        <Button variant="dark">
          Benchmark
          <span className="kbd kbd-dark ml-1">⌘ B</span>
        </Button>
        <IconButton title="Más">
          <MoreHorizontal />
        </IconButton>
      </div>
    </div>
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
  active: boolean;
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
