"use client";

// Source search, list and drop zone of the Hazme preguntas panel (Paper R3.1
// and the Slice 0 states: no match, no sources, selection row, zone refusals).
// The list renders every match inside a scroll area, with `content-visibility`
// so 1000 rows cost no more than the ones on screen.

import { useDeferredValue, useMemo, useRef, useState, type DragEvent } from "react";

import { Tooltip } from "@/components/ui/Tooltip";
import { searchSources, sourceLabel } from "@/lib/questions/source";
import type { Fuente } from "@/lib/storage/types";

export type SourcePickerProps = {
  fuentes: Fuente[];
  /** Saved source currently selected, if any. */
  selectedId: string | null;
  onSelect: (fuente: Fuente) => void;
  onFile: (file: File) => void;
  /** The text selected in the essay, offered as a source that is never saved. */
  selection?: string | null;
  selectionChosen?: boolean;
  onSelectSelection?: () => void;
  /** Short line that replaces the zone's text after a refused drop. */
  notice?: string | null;
  /** Line under the list, for a chosen source that is too long to send. */
  note?: string | null;
  /** Ask the panel to clear the notice when the writer starts something new. */
  onActivity?: () => void;
  /** Ref the panel uses to focus the search field with Cmd K. */
  searchRef?: React.RefObject<HTMLInputElement | null>;
};

const ZONE_BORDER = "#CFC8B6";

function FileIcon({ on }: { on: boolean }) {
  const stroke = on ? "var(--color-ink-1)" : "var(--color-ink-3)";
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" className="flex-none" aria-hidden="true">
      <path d="M4 2.5h5l3 3v8H4v-11Z" fill="none" stroke={stroke} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M9 2.5v3h3" fill="none" stroke={stroke} strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function Row({
  chosen,
  label,
  onClick,
  testId,
  title,
}: {
  chosen: boolean;
  label: string;
  onClick: () => void;
  testId: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      data-active={chosen}
      aria-pressed={chosen}
      title={title}
      onClick={onClick}
      className={`flex h-[40px] w-full flex-none cursor-pointer items-center gap-[10px] rounded-[10px] px-[12px] text-left font-sans text-[15px] leading-[20px] hover:bg-shade ${
        chosen ? "bg-shade font-medium text-ink-1" : "text-ink-2"
      }`}
      // 1000 rows: the browser skips the ones out of view.
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 40px" }}
    >
      <FileIcon on={chosen} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

function SelectionRow({ text, chosen, onClick }: { text: string; chosen: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      data-testid="lectura-selection-row"
      data-active={chosen}
      aria-pressed={chosen}
      onClick={onClick}
      className={`flex h-[60px] w-full flex-none cursor-pointer items-center gap-[10px] rounded-[10px] px-[12px] text-left hover:bg-shade ${
        chosen ? "bg-shade" : ""
      }`}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" className="flex-none" aria-hidden="true">
        <path d="M6 2.5h4M6 13.5h4M8 2.5v11" fill="none" stroke="var(--color-ink-1)" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className="font-sans text-[15px] font-medium leading-[20px] text-ink-1">Tu selección</span>
        <span className="truncate font-serif text-[15px] leading-[20px] text-ink-2">{text.replace(/\s+/g, " ").trim()}</span>
      </span>
    </button>
  );
}

function Zone({
  notice,
  tall,
  onFile,
  onActivity,
}: {
  notice?: string | null;
  tall: boolean;
  onFile: (file: File) => void;
  onActivity?: () => void;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  const [over, setOver] = useState(false);

  const files = (e: DragEvent) => Array.from(e.dataTransfer?.files ?? []);
  const pick = (list: File[]) => {
    onActivity?.();
    for (const f of list) onFile(f);
  };

  return (
    <>
      <div className="[&>span]:flex [&>span]:w-full">
      <Tooltip label="PDF, .txt o .md, o pega con" shortcut="⌘V" side="top">
        <div
          role="button"
          tabIndex={0}
          data-drop-zone
          data-testid="lectura-drop-zone"
          onClick={() => input.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              input.current?.click();
            }
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOver(false);
            pick(files(e));
          }}
          className={`flex w-full flex-none cursor-pointer items-center justify-center gap-[10px] rounded-[12px] px-[14px] font-sans text-[15px] leading-[20px] text-ink-2 ${
            tall ? "h-[132px]" : "h-[52px]"
          } ${over ? "bg-shade" : ""}`}
          style={{ border: `1.5px dashed ${over ? "var(--color-ink-3)" : ZONE_BORDER}` }}
        >
          {notice ? (
            <svg width="18" height="18" viewBox="0 0 16 16" className="flex-none" aria-hidden="true">
              <path d="M8 2.2l6.2 11a.6.6 0 0 1-.5.9H2.3a.6.6 0 0 1-.5-.9z" fill="none" stroke="var(--color-ink-1)" strokeWidth="1.4" strokeLinejoin="round" />
              <path d="M8 6.3v3.4" fill="none" stroke="var(--color-ink-1)" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="8" cy="11.8" r=".9" fill="var(--color-ink-1)" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 18 18" className="flex-none" aria-hidden="true">
              <path d="M9 12V3.5M5.5 7L9 3.5 12.5 7" fill="none" stroke="var(--color-ink-2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3 11.5v2a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5-1.5v-2" fill="none" stroke="var(--color-ink-2)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          )}
          <span data-testid={notice ? "lectura-zone-notice" : undefined} role={notice ? "status" : undefined}>
            {notice ?? "Suelta un archivo o pega un texto"}
          </span>
        </div>
      </Tooltip>
      </div>
      <input
        ref={input}
        type="file"
        accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
        multiple
        className="hidden"
        data-testid="lectura-file-input"
        onChange={(e) => {
          pick(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </>
  );
}

export function SourcePicker({
  fuentes,
  selectedId,
  onSelect,
  onFile,
  selection,
  selectionChosen,
  onSelectSelection,
  notice,
  note,
  onActivity,
  searchRef,
}: SourcePickerProps) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const deferred = useDeferredValue(query);
  const matches = useMemo(() => searchSources(fuentes, deferred), [fuentes, deferred]);
  const hasSources = fuentes.length > 0;
  const hasSelection = !!selection && selection.trim().length > 0;
  const typed = deferred.trim().length > 0;

  return (
    <div className="flex flex-col gap-[6px]" data-testid="lectura-source-picker">
      {hasSources ? (
        <div className="[&>span]:flex [&>span]:w-full">
        <Tooltip label="Buscar" shortcut="⌘K" side="top">
          <label
            className="flex h-[40px] w-full flex-none cursor-text items-center gap-[8px] rounded-[10px] bg-sheet px-[12px]"
            style={{
              boxShadow: focused
                ? "var(--color-ink-3) 0 0 0 1.5px, #3C2D0A14 0 2px 6px"
                : "#1D1B1824 0 0 0 1px inset",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" className="flex-none" aria-hidden="true">
              <circle cx="7" cy="7" r="4.25" fill="none" stroke="var(--color-ink-3)" strokeWidth="1.5" />
              <path d="M10.2 10.2L13.5 13.5" fill="none" stroke="var(--color-ink-3)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              ref={searchRef}
              type="text"
              value={query}
              placeholder="Buscar en tus fuentes"
              aria-label="Buscar en tus fuentes"
              data-testid="lectura-search"
              autoComplete="off"
              spellCheck={false}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onChange={(e) => {
                setQuery(e.target.value);
                onActivity?.();
              }}
              className="min-w-0 flex-1 bg-transparent font-sans text-[13px] leading-[16px] text-ink-1 outline-none placeholder:text-[15px] placeholder:leading-[20px] placeholder:text-ink-3"
            />
            {query ? (
              <button
                type="button"
                aria-label="Borrar búsqueda"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setQuery("")}
                className="grid h-[18px] w-[18px] flex-none cursor-pointer place-items-center rounded-full bg-shade"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                  <path d="M2.2 2.2L7.8 7.8M7.8 2.2L2.2 7.8" fill="none" stroke="var(--color-ink-2)" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            ) : null}
          </label>
        </Tooltip>
        </div>
      ) : null}

      {hasSelection || hasSources ? (
        <div
          data-testid="lectura-fuente-chips"
          className="thin-scroll flex max-h-[232px] flex-col gap-[2px] overflow-y-auto pb-[6px] pt-[4px]"
        >
          {hasSelection ? (
            <SelectionRow
              text={selection as string}
              chosen={!!selectionChosen}
              onClick={() => onSelectSelection?.()}
            />
          ) : null}
          {matches.map((f) => (
            <Row
              key={f.id}
              chosen={f.id === selectedId}
              label={sourceLabel(f)}
              title={f.cita ?? sourceLabel(f)}
              testId="lectura-fuente-chip"
              onClick={() => onSelect(f)}
            />
          ))}
          {hasSources && typed && matches.length === 0 ? (
            <div className="py-[18px] text-center font-sans text-[15px] leading-[20px] text-ink-2">
              {`Nada con «${deferred.trim()}»`}
            </div>
          ) : null}
        </div>
      ) : null}

      {note ? (
        <p data-testid="lectura-source-note" className="pl-[12px] font-sans text-[13px] leading-[18px] text-ink-2">
          {note}
        </p>
      ) : null}

      <Zone
        notice={notice}
        tall={!hasSources && !hasSelection}
        onFile={onFile}
        onActivity={onActivity}
      />
    </div>
  );
}
