"use client";

// The library's window bar (Paper R1.1 and «Biblioteca, ventana»). The whole
// strip drags the window; the traffic lights sit in the left inset. Search
// and Nuevo ensayo on the right, the connection button beside them.

import { useRef, useState } from "react";
import { McpListButton } from "@/components/McpConnection";
import { Popover } from "@/components/ui/Popover";
import { Tooltip } from "@/components/ui/Tooltip";
import { useStore } from "@/lib/store";
import type { EssayMode } from "@/lib/storage/types";
import { AcademicIcon, BlogIcon, SearchIcon } from "./icons";

/** Width the native traffic lights need, plus the gap Paper leaves after them. */
const LIGHTS_INSET = "pl-[90px]";

export function LibraryBar({ showTools = true }: { showTools?: boolean }) {
  return (
    <div
      data-tauri-drag-region
      data-testid="library-bar"
      className={`flex items-center justify-end gap-[10px] flex-none h-[56px] pr-[16px] ${LIGHTS_INSET}`}
    >
      {showTools ? (
        <>
          <McpListButton />
          <SearchBox />
          <NewEssay />
        </>
      ) : null}
    </div>
  );
}

function SearchBox() {
  const query = useStore((s) => s.library.query);
  const setLibrary = useStore((s) => s.setLibrary);
  const input = useRef<HTMLInputElement | null>(null);

  return (
    <Tooltip label="Buscar" shortcut="⌘K">
      <div className="flex items-center gap-[8px] h-[34px] w-[280px] pl-[10px] pr-[6px] rounded-[10px] bg-sheet flex-none shadow-[0_0_0_1px_#1D1B180F,0_1px_2px_#3C2D0A14]">
        <SearchIcon />
        <input
          ref={input}
          type="text"
          data-testid="library-search"
          aria-label="Buscar"
          placeholder="Buscar"
          value={query}
          onChange={(e) => setLibrary({ query: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Escape" && query) {
              e.preventDefault();
              setLibrary({ query: "" });
            } else if (e.key === "Escape") {
              input.current?.blur();
            }
          }}
          className="flex-1 min-w-0 bg-transparent outline-none font-sans text-[13px] leading-[16px] text-ink-1 placeholder:text-ink-3"
        />
        {query ? (
          <button
            type="button"
            aria-label="Borrar búsqueda"
            data-testid="library-search-clear"
            onClick={() => {
              setLibrary({ query: "" });
              input.current?.focus();
            }}
            className="grid place-items-center h-[24px] w-[24px] rounded-[6px] hover:bg-shade cursor-pointer flex-none"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <path d="M3 3l6 6M9 3l-6 6" stroke="var(--color-ink-3)" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}
      </div>
    </Tooltip>
  );
}

function NewEssay() {
  const newEssay = useStore((s) => s.newEssay);
  const chevron = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);

  const create = (mode: EssayMode) => {
    setOpen(false);
    void newEssay(mode);
  };

  return (
    <>
      <div className="flex items-center h-[34px] rounded-[10px] bg-ink-1 flex-none shadow-[inset_0_1px_0_#FFFFFF1F,0_2px_0_#000000,0_3px_8px_#1D1B182E]">
        <Tooltip label="Nuevo ensayo" shortcut="⌘N">
          <button
            type="button"
            data-testid="library-new"
            onClick={() => create("academico")}
            className="flex items-center gap-[8px] h-[34px] pl-[12px] pr-[12px] rounded-l-[10px] press cursor-pointer whitespace-nowrap"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <path d="M8 3v10M3 8h10" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span className="font-sans text-[13px] font-semibold leading-[16px] text-white">Nuevo ensayo</span>
          </button>
        </Tooltip>
        <div aria-hidden className="h-[18px] w-px flex-none bg-[#FFFFFF33]" />
        <button
          ref={chevron}
          type="button"
          aria-label="Elegir tipo de ensayo"
          aria-haspopup="menu"
          aria-expanded={open}
          data-testid="library-new-menu"
          onClick={() => setOpen((v) => !v)}
          className="grid place-items-center h-[34px] w-[30px] rounded-r-[10px] press cursor-pointer flex-none"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path d="M3 4.5L6 7.5L9 4.5" fill="none" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <Popover anchor={chevron} open={open} onClose={() => setOpen(false)} testId="library-new-panel">
        <div className="flex flex-col gap-[2px] p-[6px]">
          <MenuItem testId="library-new-academico" onClick={() => create("academico")}>
            <AcademicIcon />
            Académico
          </MenuItem>
          <MenuItem testId="library-new-blog" onClick={() => create("blog")}>
            <BlogIcon />
            Blog
          </MenuItem>
        </div>
      </Popover>
    </>
  );
}

function MenuItem({
  children,
  onClick,
  testId,
}: {
  children: React.ReactNode;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="flex items-center gap-[8px] h-[34px] pl-[10px] pr-[18px] rounded-[8px] hover:bg-shade cursor-pointer text-left whitespace-nowrap font-sans text-[13px] font-medium leading-[16px] text-ink-1"
    >
      {children}
    </button>
  );
}
