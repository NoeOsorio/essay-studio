"use client";

// Fuentes (Paper R6.3 and the Slice 0 states: drop rejections, search with no
// match, empty, row menu, open source, duplicate, removed with undo).
//
// Paper hangs this panel from the right edge, under the toolbar, beside the
// essay (540 wide), instead of centering it, so it is a docked sheet built on
// the shared sheet class and behavior rather than on the centered Panel.
//
// A dropped file or pasted text is saved first (`addSource`); the citation
// fills itself in afterwards and never replaces what the writer typed.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { Popover, useSheetBehavior } from "@/components/ui/Popover";
import { Tooltip } from "@/components/ui/Tooltip";
import { WindowedList } from "@/components/ui/WindowedList";
import {
  buildReference,
  filenameStem,
  missingFields,
  shortCitation,
} from "@/lib/materials/apa";
import {
  addSource,
  importSourceFile,
  retrySourceReading,
  type AddSourceOutcome,
  type RejectReason,
} from "@/lib/materials/import";
import { useStore, type RemovedFuente } from "@/lib/store";
import type { Fuente } from "@/lib/storage/types";
import { canonical } from "../../../sidecar/src/extract-parser";

// ---------------------------------------------------------------- copy

/** Drop rejections: the card that replaces the zone (Paper, Al soltar, Fuentes). */
const REJECTION: Record<RejectReason, { title: string; hint: string }> = {
  unsupported: { title: "No puedo leer este formato", hint: "Usa PDF, .txt o .md" },
  no_text: { title: "Este PDF no tiene texto", hint: "Parece escaneado. Pega el texto si lo tienes" },
  unreadable: { title: "No pude abrir este PDF", hint: "Puede estar dañado" },
  locked: { title: "Este PDF tiene contraseña", hint: "Quítasela y suéltalo de nuevo" },
  too_large: { title: "Pesa más de 50 MB", hint: "Prueba con una versión más liviana" },
  text_limit: { title: "Es demasiado largo", hint: "Máximo unas 350 páginas" },
  essay_limit: { title: "Ya no caben más fuentes", hint: "Quita alguna para añadir esta" },
};

/** The same rejections as one short line, when several files are dropped at once. */
const REJECTION_SHORT: Record<RejectReason, string> = {
  unsupported: "No se lee",
  no_text: "Sin texto",
  unreadable: "No abre",
  locked: "Tiene contraseña",
  too_large: "Pesa más de 50 MB",
  text_limit: "Es demasiado largo",
  essay_limit: "Ya no cabe",
};

const ROW_HEIGHT = 66;
const ROW_GAP = 2;

// ---------------------------------------------------------------- icons

const ink = "var(--color-ink-1)";
const ink2 = "var(--color-ink-2)";
const ink3 = "var(--color-ink-3)";

function DocIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden className="flex-none">
      <path d="M4.4 1.8h4.9l3.1 3.1v9.3H4.4a.8.8 0 0 1-.8-.8V2.6a.8.8 0 0 1 .8-.8z" fill="none" stroke={ink3} strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M9.3 1.8v3.1h3.1" fill="none" stroke={ink3} strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

function DocLinesIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden className="flex-none">
      <path d="M5 2.5h5.5L14 6v9a.5.5 0 0 1-.5.5h-8.5A.5.5 0 0 1 4.5 15V3A.5.5 0 0 1 5 2.5Z" fill="none" stroke={ink} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M10.5 2.5V6H14" fill="none" stroke={ink} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M7 10h4.5M7 12.5h3" fill="none" stroke={ink3} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function WarnIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden className="flex-none">
      <path d="M8 2.2l6.2 11a.6.6 0 0 1-.5.9H2.3a.6.6 0 0 1-.5-.9z" fill="none" stroke={ink} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 6.3v3.4" fill="none" stroke={ink} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="11.8" r=".9" fill={ink} />
    </svg>
  );
}

function CloseIcon({ size = 16, color = ink3 }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden className="flex-none">
      <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="flex-none">
      <circle cx="7" cy="7" r="4.25" fill="none" stroke={ink3} strokeWidth="1.5" />
      <path d="M10.2 10.2L13.5 13.5" fill="none" stroke={ink3} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CopyIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden className="flex-none">
      <rect x="4.5" y="4.5" width="7.5" height="7.5" rx="1.5" fill="none" stroke={ink2} strokeWidth="1.3" />
      <path d="M9.5 2.5H3.5a1 1 0 0 0-1 1v6" fill="none" stroke={ink2} strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden className="flex-none">
      <circle cx="4" cy="9" r="1.4" fill={ink2} />
      <circle cx="9" cy="9" r="1.4" fill={ink2} />
      <circle cx="14" cy="9" r="1.4" fill={ink2} />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="flex-none">
      <path d="M10 3.5L5.5 8L10 12.5" fill="none" stroke={ink} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function OpenIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="flex-none">
      <path d="M6.5 3.5H3.5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3" fill="none" stroke={ink2} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M9.5 2.5h4v4M13.5 2.5L7.5 8.5" fill="none" stroke={ink2} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CopyRefIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="flex-none">
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" fill="none" stroke={ink2} strokeWidth="1.4" />
      <path d="M10.5 3.5v-.5A1 1 0 0 0 9.5 2H3.5A1 1 0 0 0 2.5 3v6a1 1 0 0 0 1 1h.5" fill="none" stroke={ink2} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="flex-none">
      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" fill="none" stroke={ink2} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="flex-none">
      <path d="M8 10.5V3M5 6l3-3 3 3" fill="none" stroke={ink} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 10.5v1.5a1.5 1.5 0 0 0 1.5 1.5h7a1.5 1.5 0 0 0 1.5-1.5v-1.5" fill="none" stroke={ink} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="flex-none animate-spin motion-reduce:animate-none">
      <circle cx="8" cy="8" r="6" fill="none" stroke="#1D1B1833" strokeWidth="2" />
      <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------- helpers

type Author = NonNullable<Fuente["autores"]>[number];

/** «Mayer», «Mayer y Davis», «Mayer, Davis y Schoorman». */
function formatAuthors(autores: Fuente["autores"]): string {
  const names = (autores ?? []).map((a) => a.apellidos);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

/** Back from the text above; first names already known are kept for a surname that stays. */
function parseAuthors(text: string, previous: Fuente["autores"]): Author[] {
  return text
    .split(/\s*(?:,|;|&|\sy\s)\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((apellidos) => {
      const known = (previous ?? []).find((a) => a.apellidos.toLowerCase() === apellidos.toLowerCase());
      return known?.nombres ? { apellidos, nombres: known.nombres } : { apellidos };
    });
}

/** «Falta el año», «Faltan autor y año». */
function missingLine(missing: ReturnType<typeof missingFields>): string {
  if (missing.length === 0) return "";
  if (missing.length === 1) return `Falta el ${missing[0]}`;
  const head = missing.slice(0, -1).join(", ");
  return `Faltan ${head} y ${missing[missing.length - 1]}`;
}

function titleOf(f: Fuente): string {
  return f.nombre.trim() || filenameStem(f.archivoNombre) || "Sin título";
}

const haystacks = new WeakMap<Fuente, string>();
/** Title, authors and reference, folded once per source object. */
function haystack(f: Fuente): string {
  let value = haystacks.get(f);
  if (value === undefined) {
    const authors = (f.autores ?? []).map((a) => `${a.nombres ?? ""} ${a.apellidos}`).join(" ");
    value = canonical(`${f.nombre} ${authors} ${f.cita ?? ""} ${f.archivoNombre ?? ""}`);
    haystacks.set(f, value);
  }
  return value;
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Copying is a convenience; a refusal changes nothing.
  }
}

const isTextTarget = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

// ---------------------------------------------------------------- panel

export function SourcesPanel() {
  const open = useStore((s) => s.overlay === "fuentes" && s.current !== null);
  const essayId = useStore((s) => s.current?.id ?? null);
  if (!open || !essayId || typeof document === "undefined") return null;
  return <PanelBody key={essayId} />;
}

type Rejection =
  | { kind: "rejected"; reason: RejectReason }
  | { kind: "duplicate" };

type FailedRow = { id: string; name: string; reason: RejectReason };

function PanelBody() {
  const instant = useStore((s) => s.overlayInstant);
  const setOverlay = useStore((s) => s.setOverlay);
  const flush = useStore((s) => s.flush);
  const sheet = useRef<HTMLDivElement | null>(null);
  const onClose = useCallback(() => {
    // Pending edits are saved before the panel goes.
    void flush();
    setOverlay(null);
  }, [flush, setOverlay]);
  // Staying open when the writer clicks the essay: this is a reference panel.
  useSheetBehavior({ open: true, onClose, sheet, persistent: true });

  const fuentes = useStore((s) => s.current?.fuentes);
  const lecturas = useStore((s) => s.lecturas);
  const updateFuente = useStore((s) => s.updateFuente);
  const removeFuente = useStore((s) => s.removeFuente);
  const restoreFuente = useStore((s) => s.restoreFuente);

  const list = useMemo(() => fuentes ?? [], [fuentes]);

  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Rejection | null>(null);
  const [failed, setFailed] = useState<FailedRow[]>([]);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ index: number } | null>(null);
  const [over, setOver] = useState(false);
  const [removed, setRemoved] = useState<RemovedFuente | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const menuAnchor = useRef<HTMLElement | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  // The zone card goes back to its invitation after a few seconds.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!highlight) return;
    const timer = setTimeout(() => setHighlight(null), 2400);
    return () => clearTimeout(timer);
  }, [highlight]);
  // Undo stays on offer for a while, then the removal is final.
  useEffect(() => {
    if (!removed) return;
    const timer = setTimeout(() => setRemoved(null), 8000);
    return () => clearTimeout(timer);
  }, [removed]);

  // A source that finishes reading lets its citation arrive.
  const [arrived, setArrived] = useState<ReadonlySet<string>>(new Set());
  const wasReading = useRef<Set<string>>(new Set());
  useEffect(() => {
    const now = new Set(Object.keys(lecturas).filter((id) => lecturas[id] === "leyendo"));
    const done = [...wasReading.current].filter((id) => !now.has(id) && lecturas[id] !== "fallo");
    wasReading.current = now;
    if (done.length === 0) return;
    // Reading state comes from the store, so the arrival is staged after this commit.
    const stage = setTimeout(() => setArrived((cur) => new Set([...cur, ...done])), 0);
    const clear = setTimeout(() => setArrived((cur) => new Set([...cur].filter((id) => !done.includes(id)))), 1200);
    return () => {
      clearTimeout(stage);
      clearTimeout(clear);
    };
  }, [lecturas]);

  const needle = canonical(query);
  const shown = useMemo(
    () => (needle ? list.filter((f) => haystack(f).includes(needle)) : list),
    [list, needle],
  );

  const outcomeToNotice = useCallback(
    (outcome: AddSourceOutcome, name: string, several: boolean) => {
      if (outcome.kind === "duplicate") {
        setNotice({ kind: "duplicate" });
        setQuery("");
        setHighlight(outcome.existingId);
        const at = (useStore.getState().current?.fuentes ?? []).findIndex((f) => f.id === outcome.existingId);
        if (at >= 0) setReveal({ index: at });
      } else if (outcome.kind === "rejected") {
        if (several) {
          setFailed((cur) => [...cur, { id: crypto.randomUUID(), name, reason: outcome.reason }]);
        } else {
          setNotice({ kind: "rejected", reason: outcome.reason });
        }
      } else if (outcome.kind === "added") {
        // A new row must not hide behind a search that does not match it.
        setQuery("");
      }
    },
    [],
  );

  const takeFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setNotice(null);
      setFailed([]);
      for (const file of files) {
        const outcome = await importSourceFile(file);
        outcomeToNotice(outcome, file.name, files.length > 1);
      }
    },
    [outcomeToNotice],
  );

  const takeText = useCallback(
    (text: string) => {
      setNotice(null);
      setFailed([]);
      outcomeToNotice(addSource({ text }), "", false);
    },
    [outcomeToNotice],
  );

  // Paste anywhere in the panel that is not a text field.
  const onPaste = (e: ReactClipboardEvent) => {
    if (isTextTarget(e.target)) return;
    // The board and the essay also listen for paste; this one is for sources.
    e.stopPropagation();
    const files = Array.from(e.clipboardData.files);
    if (files.length > 0) {
      e.preventDefault();
      void takeFiles(files);
      return;
    }
    const text = e.clipboardData.getData("text/plain");
    if (text.trim()) {
      e.preventDefault();
      takeText(text);
    }
  };

  const hasFiles = (e: ReactDragEvent) => Array.from(e.dataTransfer.types).includes("Files");
  const onDragOver = (e: ReactDragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setOver(true);
  };
  const onDragLeave = (e: ReactDragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
  };
  const onDrop = (e: ReactDragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    setOver(false);
    void takeFiles(Array.from(e.dataTransfer.files));
  };

  const remove = (id: string) => {
    const taken = removeFuente(id);
    if (taken) setRemoved(taken);
    if (openId === id) setOpenId(null);
  };
  const undo = () => {
    if (!removed) return;
    restoreFuente(removed);
    setRemoved(null);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && removed && !isTextTarget(e.target)) {
      e.preventDefault();
      undo();
    }
  };

  const openSource = openId ? list.find((f) => f.id === openId) : undefined;
  const menuSource = menu ? list.find((f) => f.id === menu) : undefined;

  return createPortal(
    <div
      ref={sheet}
      tabIndex={-1}
      data-testid="fuentes-overlay"
      data-drop-zone
      className={`fixed z-[900] flex flex-col rounded-[16px] bg-sheet font-sans text-ink-1 outline-none ${instant ? "" : "sheet-in"}`}
      style={{
        top: 72,
        right: 12,
        bottom: 12,
        width: 540,
        maxWidth: "calc(100vw - 24px)",
        transformOrigin: "100% 0",
        boxShadow: "0 0 0 1px #1D1B1812, 0 30px 70px -24px #1D1B1859, 0 8px 20px -10px #1D1B1826",
      }}
      onPaste={onPaste}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onKeyDown={onKeyDown}
    >
      <input
        ref={fileInput}
        type="file"
        multiple
        accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown"
        className="hidden"
        data-testid="fuentes-file-input"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void takeFiles(files);
        }}
      />

      {openSource ? (
        <OpenSource
          key={openSource.id}
          source={openSource}
          onBack={() => setOpenId(null)}
          onClose={onClose}
          onChange={(patch) => updateFuente(openSource.id, withReference(openSource, patch))}
        />
      ) : (
        <div className="flex min-h-0 grow flex-col gap-[20px] px-[20px] pb-[32px] pt-[28px]">
          <Header title="Fuentes" onClose={onClose} />

          {list.length === 0 && !notice ? (
            <EmptyZone over={over} onChoose={() => fileInput.current?.click()} />
          ) : (
            <>
              <Zone
                notice={notice}
                over={over}
                onChoose={() => fileInput.current?.click()}
              />
              {list.length === 0 ? (
                <EmptyZone over={over} onChoose={() => fileInput.current?.click()} />
              ) : (
                <>
                  <SearchField value={query} onChange={setQuery} />
                  {failed.length > 0 ? (
                    <div className="-mt-[4px] flex flex-col gap-[2px]">
                      {failed.map((row) => (
                        <FailedRowView
                          key={row.id}
                          row={row}
                          onDismiss={() => setFailed((cur) => cur.filter((r) => r.id !== row.id))}
                        />
                      ))}
                    </div>
                  ) : null}
                  {shown.length === 0 ? (
                    <div className="-mt-[4px] flex grow items-center justify-center px-[12px]">
                      <div className="text-center text-[18px] font-medium leading-[24px] text-ink-1">
                        Nada con «{query.trim()}»
                      </div>
                    </div>
                  ) : (
                    <WindowedList
                      testId="fuentes-list"
                      className="-mt-[4px] min-h-0 grow"
                      items={shown}
                      rowHeight={ROW_HEIGHT}
                      gap={ROW_GAP}
                      reveal={reveal}
                      getKey={(f) => f.id}
                      renderRow={(f) => (
                        <SourceRow
                          source={f}
                          reading={lecturas[f.id]}
                          highlighted={highlight === f.id}
                          arrived={arrived.has(f.id)}
                          onOpen={() => setOpenId(f.id)}
                          onMenu={(anchor) => {
                            menuAnchor.current = anchor;
                            setMenu(f.id);
                          }}
                        />
                      )}
                    />
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      <Popover
        anchor={menuAnchor}
        open={menu !== null && !!menuSource}
        onClose={() => setMenu(null)}
        side="bottom"
        align="end"
        width={264}
        size="compact"
        testId="fuente-menu"
      >
        {menuSource ? (
          <div className="flex flex-col gap-[2px] p-[6px]">
            <MenuItem
              icon={<CopyRefIcon />}
              label="Copiar referencia completa"
              testId="fuente-copy-reference"
              onClick={() => {
                void copyText(menuSource.cita || buildReference(menuSource));
                setMenu(null);
              }}
            />
            <MenuItem
              icon={<OpenIcon />}
              label="Abrir"
              testId="fuente-open"
              onClick={() => {
                setOpenId(menuSource.id);
                setMenu(null);
              }}
            />
            <MenuItem
              icon={<TrashIcon />}
              label="Quitar"
              testId="fuente-remove"
              onClick={() => {
                remove(menuSource.id);
                setMenu(null);
              }}
            />
          </div>
        ) : null}
      </Popover>

      {removed ? (
        <div
          role="status"
          data-testid="fuente-removed"
          className="absolute bottom-[24px] left-1/2 flex h-[44px] -translate-x-1/2 items-center gap-[14px] whitespace-nowrap rounded-full bg-sheet pl-[18px] pr-[6px]"
          style={{ boxShadow: "0 0 0 1px #1D1B1814, 0 10px 24px -10px #3C2D0A24" }}
        >
          <span className="text-[13px] leading-[16px] text-ink-1">Quitaste la fuente</span>
          <Tooltip label="Deshacer" shortcut="⌘Z" side="top">
            <button
              type="button"
              data-testid="fuente-undo"
              onClick={undo}
              className="flex h-[32px] cursor-pointer items-center rounded-full bg-shade px-[14px] text-[13px] font-medium leading-[16px] text-ink-1"
            >
              Deshacer
            </button>
          </Tooltip>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}

/** A change to name, authors or year also rewrites the reference while it is still the builder's own. */
function withReference(current: Fuente, patch: Partial<Omit<Fuente, "id">>): Partial<Omit<Fuente, "id">> {
  if ("cita" in patch) return patch;
  const next = { ...current, ...patch };
  const untouched = !current.cita || current.cita === buildReference(current);
  if (untouched && (next.autores?.length || next.anio)) return { ...patch, cita: buildReference(next) };
  return patch;
}

// ---------------------------------------------------------------- pieces

function Header({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between pl-[12px]">
      <div className="text-[22px] font-semibold leading-[28px] tracking-[-0.01em] text-ink-1">{title}</div>
      <CloseButton onClose={onClose} />
    </div>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <Tooltip label="Cerrar" shortcut="Esc">
      <button
        type="button"
        aria-label="Cerrar"
        data-testid="fuentes-close"
        onClick={onClose}
        className="grid h-[32px] w-[32px] flex-none cursor-pointer place-items-center rounded-[8px] hover:bg-shade"
      >
        <CloseIcon />
      </button>
    </Tooltip>
  );
}

function ZoneTile({ children }: { children: ReactNode }) {
  return (
    <div
      className="grid h-[36px] w-[36px] flex-none place-items-center rounded-[10px] bg-sheet"
      style={{ rotate: "-4deg", boxShadow: "0 1px 2px #1D1B1814" }}
    >
      {children}
    </div>
  );
}

/** The drop zone, or the one card that tells what happened to the last drop. */
function Zone({
  notice,
  over,
  onChoose,
}: {
  notice: Rejection | null;
  over: boolean;
  onChoose: () => void;
}) {
  const text =
    notice?.kind === "rejected"
      ? REJECTION[notice.reason]
      : notice?.kind === "duplicate"
        ? { title: "Ya tienes esta fuente", hint: "" }
        : { title: "Suelta PDFs o archivos", hint: "o pega el texto" };
  const idle = !notice;
  return (
    <div
      data-drop-zone
      data-over={over}
      data-testid={idle ? "fuentes-zone" : "fuentes-notice"}
      role={idle ? "button" : "status"}
      tabIndex={idle ? 0 : undefined}
      onClick={idle ? onChoose : undefined}
      onKeyDown={idle ? (e) => (e.key === "Enter" || e.key === " " ? onChoose() : undefined) : undefined}
      className={`material-zone flex flex-none items-center gap-[14px] rounded-[14px] px-[18px] py-[16px] ${idle ? "cursor-pointer" : ""}`}
      style={{ border: "1.5px dashed #1D1B1829" }}
    >
      <ZoneTile>{notice?.kind === "rejected" ? <WarnIcon size={18} /> : <DocLinesIcon />}</ZoneTile>
      <div className="flex min-w-0 grow flex-col gap-[2px]">
        <div className="text-[15px] font-medium leading-[20px] text-ink-1">{text.title}</div>
        {text.hint ? <div className="text-[13px] leading-[18px] text-ink-3">{text.hint}</div> : null}
      </div>
    </div>
  );
}

/** Nothing saved yet: the zone takes the whole panel. */
function EmptyZone({ over, onChoose }: { over: boolean; onChoose: () => void }) {
  return (
    <div
      data-drop-zone
      data-over={over}
      data-testid="fuentes-empty"
      className="material-zone flex grow flex-col items-center justify-center gap-[32px] rounded-[14px] p-[40px]"
      style={{ border: "1.5px dashed #1D1B1829" }}
    >
      <div className="flex items-center gap-[22px]" aria-hidden>
        <div
          className="relative flex h-[150px] w-[118px] flex-none flex-col gap-[9px] rounded-[6px] bg-sheet px-[16px] py-[22px]"
          style={{ rotate: "-3deg", boxShadow: "0 1px 1px #3C2D0A14, 0 12px 24px -10px #3C2D0A4D" }}
        >
          <span className="h-[6px] w-[70px] flex-none rounded-[3px]" style={{ background: "#1D1B1838" }} />
          <span className="h-[5px] w-[86px] flex-none rounded-[3px]" style={{ background: "#1D1B181A" }} />
          <span className="h-[5px] w-[80px] flex-none rounded-[3px]" style={{ background: "#1D1B181A" }} />
          <span className="h-[5px] w-[60px] flex-none rounded-[3px]" style={{ background: "#E8B42173" }} />
          <span className="h-[5px] w-[84px] flex-none rounded-[3px]" style={{ background: "#1D1B181A" }} />
          <span className="h-[5px] w-[74px] flex-none rounded-[3px]" style={{ background: "#9670E066" }} />
          <span className="h-[5px] w-[50px] flex-none rounded-[3px]" style={{ background: "#1D1B181A" }} />
          <span
            className="absolute left-[28px] top-[-9px] h-[18px] w-[62px]"
            style={{ rotate: "4deg", transformOrigin: "0 0", background: "#FFFDF5BD", boxShadow: "0 1px 3px #3C2D0A29" }}
          />
        </div>
        <svg width="36" height="20" viewBox="0 0 36 20" className="flex-none">
          <path d="M2 12c8-8 20-8 30-2" fill="none" stroke={ink3} strokeWidth="1.5" strokeLinecap="round" />
          <path d="M27 5l5.5 5-6.5 2.5" fill="none" stroke={ink3} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="flex flex-col gap-[10px]" style={{ rotate: "1.5deg" }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-[10px] rounded-[8px] bg-sheet px-[10px] py-[8px]" style={{ boxShadow: "0 1px 2px #1D1B1814" }}>
              <span className="h-[6px] w-[58px] flex-none rounded-[3px]" style={{ background: "#1D1B1838" }} />
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col items-center gap-[18px]">
        <div className="w-[260px] text-center text-[17px] font-medium leading-[24px] text-ink-1">
          Suelta PDFs o archivos, o pega el texto
        </div>
        <button
          type="button"
          data-testid="fuentes-add-file"
          onClick={onChoose}
          className="flex h-[34px] flex-none cursor-pointer items-center gap-[8px] rounded-[10px] bg-sheet pl-[12px] pr-[14px] text-[13px] font-medium leading-[16px] text-ink-1"
          style={{ boxShadow: "0 0 0 1px #1D1B181A, 0 1px 2px #1D1B180F" }}
        >
          <UploadIcon />
          Elegir archivos
        </button>
      </div>
    </div>
  );
}

function SearchField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex h-[36px] flex-none items-center gap-[8px] rounded-[10px] bg-shade px-[12px]">
      <SearchIcon />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Buscar por título o autor"
        aria-label="Buscar por título o autor"
        data-testid="fuentes-search"
        className="min-w-0 grow bg-transparent text-[13px] leading-[16px] text-ink-1 outline-none placeholder:text-ink-3"
      />
      {value ? (
        <button
          type="button"
          aria-label="Borrar búsqueda"
          onClick={() => onChange("")}
          className="grid h-[18px] w-[18px] flex-none cursor-pointer place-items-center rounded-[9px] bg-shade"
        >
          <CloseIcon size={10} color={ink2} />
        </button>
      ) : null}
    </div>
  );
}

function FailedRowView({ row, onDismiss }: { row: FailedRow; onDismiss: () => void }) {
  return (
    <div className="flex items-center gap-[12px] rounded-[12px] p-[12px]" data-testid="fuente-failed">
      <span className="grid h-[20px] w-[20px] flex-none place-items-center">
        <DocIcon />
      </span>
      <div className="min-w-0 grow truncate text-[15px] font-medium leading-[20px] text-ink-1">{row.name}</div>
      <div className="flex h-[20px] flex-none items-center gap-[6px]">
        <span className="whitespace-nowrap text-[13px] font-medium leading-[18px] text-ink-2">
          {REJECTION_SHORT[row.reason]}
        </span>
        <WarnIcon />
      </div>
      <button
        type="button"
        aria-label="Quitar aviso"
        onClick={onDismiss}
        className="grid h-[28px] w-[28px] flex-none cursor-pointer place-items-center rounded-[8px]"
      >
        <CloseIcon size={14} />
      </button>
    </div>
  );
}

function SourceRow({
  source,
  reading,
  highlighted,
  arrived,
  onOpen,
  onMenu,
}: {
  source: Fuente;
  reading: "leyendo" | "fallo" | undefined;
  highlighted: boolean;
  arrived: boolean;
  onOpen: () => void;
  onMenu: (anchor: HTMLElement) => void;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(timer);
  }, [copied]);

  if (reading === "leyendo") {
    const label = source.archivoNombre ? `Leyendo ${source.archivoNombre}` : "Leyendo el texto";
    return (
      <div data-testid="fuente-row" data-reading="true" className="flex h-full items-center gap-[12px] rounded-[12px] px-[12px]">
        <span className="grid h-[20px] w-[20px] flex-none place-items-center">
          <Spinner />
        </span>
        <div className="flex min-w-0 grow flex-col gap-[8px]">
          <div className="truncate text-[15px] font-medium leading-[20px] text-ink-2">{label}</div>
          <div className="flex items-center gap-[6px]">
            <span className="reading-shimmer h-[8px] w-[120px] flex-none rounded-[4px]" />
            <span className="h-[8px] w-[60px] flex-none rounded-[4px] bg-shade" />
          </div>
        </div>
        <span className="w-[28px] flex-none" />
      </div>
    );
  }

  const hasAuthors = !!source.autores?.length;
  const cite = hasAuthors ? shortCitation(source) : "";
  const warning = reading === "fallo" ? "" : missingLine(missingFields(source));

  return (
    <div
      data-testid="fuente-row"
      data-id={source.id}
      onClick={onOpen}
      className={`group flex h-full cursor-pointer items-center gap-[12px] rounded-[12px] px-[12px] hover:bg-shade ${
        highlighted ? "bg-shade" : ""
      }`}
    >
      <span className={`grid h-[20px] w-[20px] flex-none place-items-center ${arrived ? "doc-icon-in" : ""}`}>
        <DocIcon />
      </span>
      <div className="flex min-w-0 grow flex-col gap-[4px]">
        <div className="truncate text-[15px] font-medium leading-[20px] text-ink-1">{titleOf(source)}</div>
        {cite ? (
          <Tooltip label={copied ? "Copiada" : "Copiar cita"} side="bottom">
            <button
              type="button"
              data-testid="fuente-copy-cite"
              onClick={(e) => {
                e.stopPropagation();
                void copyText(cite);
                setCopied(true);
              }}
              className={`flex h-[18px] max-w-full cursor-pointer items-center gap-[6px] self-start text-left text-[13px] leading-[18px] text-ink-3 group-hover:text-ink-1 ${
                arrived ? "cite-in" : ""
              }`}
            >
              <span className="truncate">{cite}</span>
              <span className="flex-none opacity-0 group-hover:opacity-100">
                <CopyIcon />
              </span>
            </button>
          </Tooltip>
        ) : null}
      </div>
      {reading === "fallo" ? (
        <Tooltip label="No se pudo leer la cita" side="top">
          <button
            type="button"
            data-testid="fuente-retry"
            onClick={(e) => {
              e.stopPropagation();
              retrySourceReading(source.id);
            }}
            className="flex h-[20px] flex-none cursor-pointer items-center gap-[6px] text-[13px] font-medium leading-[18px] text-ink-2"
          >
            Reintentar
            <WarnIcon />
          </button>
        </Tooltip>
      ) : warning ? (
        <Tooltip label={`${warning}, escríbelo o déjalo así`} side="top">
          <span className="flex h-[20px] flex-none items-center gap-[6px] text-[13px] font-medium leading-[18px] text-ink-2" data-testid="fuente-missing">
            <span className="whitespace-nowrap">{warning}</span>
            <WarnIcon />
          </span>
        </Tooltip>
      ) : null}
      <button
        type="button"
        aria-label="Más sobre esta fuente"
        data-testid="fuente-more"
        onClick={(e) => {
          e.stopPropagation();
          onMenu(e.currentTarget);
        }}
        className="grid h-[28px] w-[28px] flex-none cursor-pointer place-items-center rounded-[8px] bg-sheet opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
        style={{ boxShadow: "0 0 0 1px #1D1B1814" }}
      >
        <MoreIcon />
      </button>
    </div>
  );
}

function MenuItem({
  icon,
  label,
  testId,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  testId: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="flex h-[34px] flex-none cursor-pointer items-center gap-[8px] rounded-[8px] px-[10px] text-left text-[13px] font-medium leading-[16px] text-ink-1 hover:bg-shade"
    >
      {icon}
      {label}
    </button>
  );
}

// ---------------------------------------------------------------- open source

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-[12px]">
      <div className="w-[84px] flex-none pt-[0px] text-[13px] leading-[20px] text-ink-3">{label}</div>
      {children}
    </div>
  );
}

const FIELD = "min-w-0 grow bg-transparent text-[15px] text-ink-1 outline-none placeholder:text-ink-3";

/** One source in the panel: its fields and its extracted text, edited in place. */
function OpenSource({
  source,
  onBack,
  onClose,
  onChange,
}: {
  source: Fuente;
  onBack: () => void;
  onClose: () => void;
  onChange: (patch: Partial<Omit<Fuente, "id">>) => void;
}) {
  const [authorsDraft, setAuthorsDraft] = useState<string | null>(null);
  const authorsShown = authorsDraft ?? formatAuthors(source.autores);

  const reference = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = reference.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [source.cita]);

  return (
    <div className="flex min-h-0 grow flex-col gap-[22px] px-[20px] pb-[32px] pt-[28px]">
      <div className="flex items-center justify-between pl-[12px]">
        <button
          type="button"
          data-testid="fuente-back"
          onClick={onBack}
          className="flex h-[32px] cursor-pointer items-center gap-[6px] rounded-[10px] bg-shade pl-[8px] pr-[12px] text-[13px] font-medium leading-[16px] text-ink-1"
        >
          <BackIcon />
          Fuentes
        </button>
        <CloseButton onClose={onClose} />
      </div>

      <div className="flex flex-none flex-col gap-[14px] px-[12px]">
        <input
          type="text"
          value={source.nombre}
          onChange={(e) => onChange({ nombre: e.target.value })}
          placeholder={filenameStem(source.archivoNombre) || "Sin título"}
          aria-label="Título"
          data-testid="fuente-nombre"
          className="min-w-0 bg-transparent text-[22px] font-semibold leading-[28px] tracking-[-0.01em] text-ink-1 outline-none placeholder:text-ink-3"
        />
        <FieldRow label="Autores">
          <input
            type="text"
            value={authorsShown}
            placeholder="Escríbelo"
            aria-label="Autores"
            data-testid="fuente-autores"
            onFocus={() => setAuthorsDraft(formatAuthors(source.autores))}
            onBlur={() => setAuthorsDraft(null)}
            onChange={(e) => {
              setAuthorsDraft(e.target.value);
              const autores = parseAuthors(e.target.value, source.autores);
              onChange({ autores: autores.length > 0 ? autores : undefined });
            }}
            className={`${FIELD} leading-[20px]`}
          />
        </FieldRow>
        <FieldRow label="Año">
          <input
            type="text"
            inputMode="numeric"
            maxLength={4}
            value={source.anio ?? ""}
            placeholder="Escríbelo"
            aria-label="Año"
            data-testid="fuente-anio"
            onChange={(e) => onChange({ anio: e.target.value.replace(/\D/g, "") || undefined })}
            className={`${FIELD} leading-[20px]`}
          />
        </FieldRow>
        <FieldRow label="Referencia">
          <textarea
            ref={reference}
            rows={1}
            value={source.cita ?? ""}
            placeholder="Escríbela"
            aria-label="Referencia"
            data-testid="fuente-cita"
            onChange={(e) => onChange({ cita: e.target.value || undefined })}
            className={`${FIELD} resize-none overflow-hidden leading-[22px]`}
          />
        </FieldRow>
      </div>

      <div className="min-h-0 grow overflow-hidden rounded-[12px] bg-paper px-[16px] pt-[16px]">
        <textarea
          value={source.contenido}
          onChange={(e) => onChange({ contenido: e.target.value })}
          placeholder="Texto de la fuente"
          aria-label="Texto de la fuente"
          data-testid="fuente-contenido"
          className="thin-scroll h-full w-full resize-none bg-transparent pb-[16px] text-[15px] leading-[24px] text-ink-2 outline-none placeholder:text-ink-3"
        />
      </div>
    </div>
  );
}
