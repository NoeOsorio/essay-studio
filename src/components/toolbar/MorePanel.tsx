"use client";

// Más (Paper R2.4): language and type change in place; sources, rubric and
// history open their overlays; the MCP row closes the panel.

import type { MouseEvent, ReactNode } from "react";
import { Popover } from "@/components/ui/Popover";
import { useAnchor } from "@/components/ui/useAnchor";
import { useStore } from "@/lib/store";
import type { EssayLanguage, EssayMode } from "@/lib/storage/types";
import { McpRow } from "@/components/McpConnection";
import { HistoryIcon, RubricIcon, SourcesIcon } from "./toolbar-icons";

type Props = { open: boolean; onClose: () => void; instant?: boolean };

/** Button activation from the keyboard (detail 0) opens overlays without animation. */
function instantOf(e: MouseEvent): { instant: boolean } {
  return { instant: e.detail === 0 };
}

export function MorePanel({ open, onClose, instant }: Props) {
  const anchor = useAnchor("mas");
  const language = useStore((s) => s.current?.language ?? "es");
  const mode = useStore((s) => s.current?.mode ?? "academico");
  const updateLanguage = useStore((s) => s.updateLanguage);
  const updateMode = useStore((s) => s.updateMode);
  const openFuentes = useStore((s) => s.openFuentes);
  const openRubrica = useStore((s) => s.openRubrica);
  const openHistory = useStore((s) => s.openHistory);

  const go = (fn: (opts: { instant: boolean }) => void) => (e: MouseEvent) => {
    const opts = instantOf(e);
    onClose();
    fn(opts);
  };

  return (
    <Popover anchor={anchor} open={open} onClose={onClose} side="bottom" align="end" width={300} instant={instant} testId="more-panel">
      <div className="flex flex-col gap-[2px] p-[6px]">
        <div className="flex flex-col gap-[10px] mb-[6px] rounded-[10px] bg-shade px-[10px] py-[12px]">
          <Row label="Idioma">
            <Segmented testId="topbar-language" label="Idioma del ensayo">
              <Seg
                testId="topbar-language-es"
                active={language === "es"}
                width={44}
                onClick={() => updateLanguage("es" as EssayLanguage)}
              >
                ES
              </Seg>
              <Seg
                testId="topbar-language-en"
                active={language === "en"}
                width={44}
                onClick={() => updateLanguage("en" as EssayLanguage)}
              >
                EN
              </Seg>
            </Segmented>
          </Row>
          <Row label="Tipo">
            <Segmented testId="topbar-mode" label="Tipo de ensayo">
              <Seg
                testId="topbar-mode-academico"
                active={mode === "academico"}
                onClick={() => updateMode("academico" as EssayMode)}
              >
                Académico
              </Seg>
              <Seg testId="topbar-mode-blog" active={mode === "blog"} onClick={() => updateMode("blog" as EssayMode)}>
                Blog
              </Seg>
            </Segmented>
          </Row>
        </div>
        <Item testId="topbar-fuentes" icon={<SourcesIcon />} onClick={go(openFuentes)}>
          Fuentes
        </Item>
        <Item testId="topbar-rubrica" icon={<RubricIcon />} onClick={go(openRubrica)}>
          Rúbrica
        </Item>
        <Item testId="topbar-historial" icon={<HistoryIcon />} onClick={go(openHistory)}>
          Historial de versiones
        </Item>
        <McpRow />
      </div>
    </Popover>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-sans text-[14px] font-medium leading-[18px] text-ink-1">{label}</span>
      {children}
    </div>
  );
}

function Segmented({ children, testId, label }: { children: ReactNode; testId: string; label: string }) {
  return (
    <div role="group" aria-label={label} data-testid={testId} className="flex p-[2px] rounded-[8px] bg-paper-4">
      {children}
    </div>
  );
}

function Seg({
  children,
  active,
  onClick,
  testId,
  width,
}: {
  children: ReactNode;
  active: boolean;
  onClick: () => void;
  testId: string;
  width?: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      data-testid={testId}
      data-active={active}
      onClick={onClick}
      style={width ? { width } : undefined}
      className={`flex-none flex items-center justify-center h-[26px] rounded-[6px] font-sans text-[13px] leading-[16px] cursor-pointer ${
        width ? "" : "px-[10px]"
      } ${
        active
          ? "bg-sheet text-ink-1 font-semibold shadow-[0_1px_2px_#1D1B181F]"
          : "text-ink-3 font-medium hover:text-ink-1"
      }`}
    >
      {children}
    </button>
  );
}

function Item({
  icon,
  children,
  onClick,
  testId,
}: {
  icon: ReactNode;
  children: ReactNode;
  onClick: (e: MouseEvent) => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="flex items-center gap-[10px] h-[38px] px-[10px] rounded-[8px] text-left cursor-pointer hover:bg-[#1D1B180D] focus-visible:bg-[#1D1B180D] outline-none flex-none"
    >
      {icon}
      <span className="flex-1 font-sans text-[14px] font-medium leading-[18px] text-ink-1">{children}</span>
    </button>
  );
}
