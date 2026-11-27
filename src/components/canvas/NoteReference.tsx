"use client";

// The reference of a note, in the three places it shows: the quiet line on the
// board, the full card (hover popover and reading view), and the picker that
// NoteBar opens. The full reference is never printed on the board note.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
import type { Editor, TLNoteShape } from "tldraw";
import { GlyphLibro } from "@/components/ui/icons";
import { Popover } from "@/components/ui/Popover";
import { copyText } from "@/lib/clipboard";
import {
  metaWithReference,
  referenceFromSource,
  referenceOf,
  resolveReference,
  type NoteReference,
  type ResolvedReference,
} from "@/lib/canvas/note-reference";
import { filenameStem } from "@/lib/materials/apa";
import { canonical, haystack } from "@/lib/materials/source-search";
import { useStore } from "@/lib/store";
import type { Fuente } from "@/lib/storage/types";

/** Height of the line on the board: Geist 12/16. */
export const REFERENCE_LINE = 16;

const HOVER_OPEN_MS = 280;
const HOVER_CLOSE_MS = 220;
const CONFIRM_MS = 1500;
const MAX_ROWS = 40;

// One primary (ink), quieter secondaries (shade), navigation as a text link,
// and a confirmation that is a state, never a button (DESIGN.md, Components).
const BUTTON =
  "h-[28px] px-[10px] rounded-[8px] bg-shade font-sans text-[13px] font-medium leading-[16px] text-ink-1 cursor-pointer whitespace-nowrap transition-colors duration-[120ms] hover:bg-[#1D1B181A] press";
const PRIMARY =
  "h-[28px] px-[12px] rounded-[8px] bg-ink-1 font-sans text-[13px] font-medium leading-[16px] text-white cursor-pointer whitespace-nowrap transition-colors duration-[120ms] hover:bg-[#3A3631] disabled:cursor-default disabled:bg-[#B9B3A8] press";
const LINK =
  "ml-auto flex h-[28px] items-center gap-[4px] font-sans text-[13px] font-medium leading-[16px] text-ink-2 cursor-pointer whitespace-nowrap hover:text-ink-1";

function Copied() {
  return (
    <span role="status" className="flex h-[28px] items-center gap-[5px] px-[2px] font-sans text-[13px] leading-[16px] text-ink-3 whitespace-nowrap">
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 7.4l2.6 2.6L11 4.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      Copiada
    </span>
  );
}

export function useResolvedReference(reference: NoteReference): ResolvedReference {
  const fuentes = useStore((s) => s.current?.fuentes);
  return useMemo(() => resolveReference(reference, fuentes), [reference, fuentes]);
}

/** Three actions: copy the reference, copy the in-text citation, open the source. */
export function ReferenceActions({
  resolved,
  onOpenSource,
}: {
  resolved: ResolvedReference;
  onOpenSource?: () => void;
}) {
  const [copied, setCopied] = useState<"apa" | "inText" | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );
  const copy = (kind: "apa" | "inText") => {
    void copyText(kind === "apa" ? resolved.apa : resolved.inText).then((ok) => {
      if (!ok) return;
      setCopied(kind);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(null), CONFIRM_MS);
    });
  };
  return (
    <div className="flex flex-wrap items-center gap-[6px]">
      {copied === "apa" ? (
        <Copied />
      ) : (
        <button type="button" data-testid="reference-copy-apa" className={PRIMARY} onClick={() => copy("apa")}>
          Copiar referencia
        </button>
      )}
      {copied === "inText" ? (
        <Copied />
      ) : (
        <button type="button" data-testid="reference-copy-intext" className={BUTTON} onClick={() => copy("inText")}>
          Copiar cita
        </button>
      )}
      {resolved.source && onOpenSource ? (
        <button type="button" data-testid="reference-open-source" className={LINK} onClick={onOpenSource}>
          Ver en Fuentes
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5L8 6l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      ) : null}
    </div>
  );
}

/** Full reference in Newsreader with its actions. Used by the popover. */
function ReferenceCard({ resolved, onOpenSource }: { resolved: ResolvedReference; onOpenSource: () => void }) {
  return (
    <div className="flex flex-col gap-[12px] p-[14px]">
      <p data-testid="reference-apa" className="m-0 font-serif text-[15px] leading-[22px] text-ink-1">
        {resolved.apa}
      </p>
      <ReferenceActions resolved={resolved} onOpenSource={onOpenSource} />
    </div>
  );
}

/** The «Referencia» section under the text in the reading view. */
export function ReferenceSection({ reference, onOpenSource }: { reference: NoteReference; onOpenSource: () => void }) {
  const resolved = useResolvedReference(reference);
  return (
    <section data-testid="note-reading-reference" className="mt-[18px] flex flex-col gap-[8px]">
      <h3 className="m-0 font-sans text-[12px] font-semibold leading-[16px] opacity-70">Referencia</h3>
      <p data-testid="reference-apa" className="m-0 font-serif text-[17px] leading-[26px]">
        {resolved.apa}
      </p>
      <ReferenceActions resolved={resolved} onOpenSource={onOpenSource} />
    </section>
  );
}

function openInSources(sourceId: string) {
  useStore.getState().showFuente(sourceId);
}

/** The quiet line on the board note: a book and the short label. Hover or click opens the card. */
export function ReferenceLine({ editor, reference }: { editor: Editor; reference: NoteReference }) {
  const resolved = useResolvedReference(reference);
  const button = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const pinned = useRef(false);
  const timer = useRef<number | null>(null);

  const clear = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);
  const later = (fn: () => void, ms: number) => {
    clear();
    timer.current = window.setTimeout(fn, ms);
  };
  const close = () => {
    clear();
    pinned.current = false;
    setOpen(false);
  };

  return (
    <div style={{ marginTop: "auto", paddingTop: 8, minWidth: 0 }}>
      <button
        ref={button}
        type="button"
        data-testid="note-reference-line"
        aria-label={`Referencia: ${resolved.label}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={undefined}
        className="flex h-[16px] max-w-full cursor-pointer items-center gap-[6px] font-sans text-[12px] leading-[16px] text-ink-3 transition-colors duration-[120ms] hover:text-ink-1"
        onPointerDown={(e) => {
          editor.markEventAsHandled(e);
          e.stopPropagation();
        }}
        onPointerEnter={() => later(() => setOpen(true), HOVER_OPEN_MS)}
        onPointerLeave={() => {
          if (!pinned.current) later(() => setOpen(false), HOVER_CLOSE_MS);
          else clear();
        }}
        onClick={(e) => {
          e.stopPropagation();
          clear();
          if (open && pinned.current) close();
          else {
            pinned.current = true;
            setOpen(true);
          }
        }}
      >
        <span className="flex-none">
          <GlyphLibro size={14} />
        </span>
        <span data-testid="note-reference-label" className="truncate">
          {resolved.label}
        </span>
      </button>
      <Popover
        anchor={button}
        open={open}
        onClose={close}
        side="bottom"
        align="start"
        keepFocus
        size="compact"
        width={384}
        testId="note-reference-popover"
      >
        <div
          // The popover is a portal, but React still bubbles its events to the note and the board.
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onPointerEnter={clear}
          onPointerLeave={() => {
            if (!pinned.current) later(() => setOpen(false), HOVER_CLOSE_MS);
          }}
        >
          <ReferenceCard
            resolved={resolved}
            onOpenSource={() => {
              close();
              if (resolved.source) openInSources(resolved.source.id);
            }}
          />
        </div>
      </Popover>
    </div>
  );
}

// ------------------------------------------------------------ the picker

const titleOf = (f: Fuente) => f.nombre.trim() || filenameStem(f.archivoNombre) || "Sin título";

/** Content of the NoteBar popover: pick a source, or paste a reference by hand. */
export function ReferencePicker({
  editor,
  note,
  anchor,
  open,
  onClose,
}: {
  editor: Editor;
  note: TLNoteShape;
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Popover
      anchor={anchor}
      open={open}
      onClose={onClose}
      side="bottom"
      align="start"
      size="compact"
      width={320}
      testId="note-reference-picker"
    >
      <PickerBody editor={editor} note={note} onClose={onClose} />
    </Popover>
  );
}

function PickerBody({ editor, note, onClose }: { editor: Editor; note: TLNoteShape; onClose: () => void }) {
  const fuentes = useStore((s) => s.current?.fuentes);
  const list = useMemo(() => fuentes ?? [], [fuentes]);
  const current = referenceOf(note.meta);
  const [mode, setMode] = useState<"pick" | "paste">(current && !current.sourceId ? "paste" : "pick");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState(current && !current.sourceId ? current.apa ?? "" : "");
  const [locator, setLocator] = useState(current?.locator ?? "");

  const needle = canonical(query);
  const matches = useMemo(() => (needle ? list.filter((f) => haystack(f).includes(needle)) : list), [list, needle]);
  const shown = matches.slice(0, MAX_ROWS);

  const write = (next: NoteReference | null, mark: string) => {
    editor.markHistoryStoppingPoint(mark);
    // tldraw merges meta and rejects undefined, so the whole record is replaced.
    editor.run(() => {
      const live = editor.getShape<TLNoteShape>(note.id);
      if (live) editor.store.put([{ ...live, meta: metaWithReference(live.meta, next) }]);
    });
  };

  const pick = (source: Fuente) => {
    write(referenceFromSource(source, locator), "note reference");
    onClose();
  };
  const savePaste = () => {
    const apa = draft.trim();
    if (apa === "") return;
    write({ apa, ...(locator.trim() ? { locator: locator.trim() } : {}) }, "note reference");
    onClose();
  };
  const changeLocator = (value: string) => {
    setLocator(value);
    if (!current) return;
    const { locator: _old, ...rest } = current;
    void _old;
    editor.updateShape<TLNoteShape>({
      id: note.id,
      type: "note",
      meta: { reference: value.trim() ? { ...rest, locator: value.trim() } : rest },
    });
  };

  // Keys here belong to the field, not to the board.
  const keys = (e: ReactKeyboardEvent) => {
    e.stopPropagation();
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) editor.redo();
      else editor.undo();
    }
  };

  const field =
    "w-full rounded-[10px] bg-shade px-[12px] font-sans text-[13px] leading-[16px] text-ink-1 outline-none placeholder:text-ink-3";

  return (
    <div className="flex flex-col gap-[10px] p-[12px]" onMouseDown={(e) => e.stopPropagation()}>
      {mode === "pick" ? (
        <>
          <div className="font-sans text-[13px] font-semibold leading-[16px] text-ink-1">Elige una fuente</div>
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={keys}
            placeholder="Buscar fuentes"
            aria-label="Buscar fuentes"
            data-testid="reference-search"
            className={`${field} h-[34px]`}
          />
          <div className="flex max-h-[220px] flex-col overflow-auto" data-testid="reference-sources">
            {shown.map((f) => (
              <button
                key={f.id}
                type="button"
                data-testid="reference-source-option"
                data-id={f.id}
                aria-pressed={current?.sourceId === f.id}
                onClick={() => pick(f)}
                className={`flex flex-col gap-[2px] rounded-[8px] px-[10px] py-[7px] text-left cursor-pointer hover:bg-shade ${
                  current?.sourceId === f.id ? "bg-shade" : ""
                }`}
              >
                <span className="truncate font-sans text-[13px] font-medium leading-[16px] text-ink-1">{titleOf(f)}</span>
                {f.cita || f.autores?.length ? (
                  <span className="truncate font-sans text-[12px] leading-[16px] text-ink-3">
                    {resolveReference({ sourceId: f.id }, [f]).label}
                  </span>
                ) : null}
              </button>
            ))}
            {shown.length === 0 ? (
              <div className="px-[10px] py-[8px] font-sans text-[13px] leading-[16px] text-ink-3">
                {list.length === 0 ? "Aún no tienes fuentes" : `Nada con «${query.trim()}»`}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            data-testid="reference-paste-toggle"
            onClick={() => setMode("paste")}
            className="self-start font-sans text-[13px] font-medium leading-[16px] text-ink-2 cursor-pointer hover:text-ink-1"
          >
            Pegar a mano
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            data-testid="reference-pick-toggle"
            onClick={() => setMode("pick")}
            className="self-start font-sans text-[13px] font-semibold leading-[16px] text-ink-1 cursor-pointer"
          >
            Elige una fuente
          </button>
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              keys(e);
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) savePaste();
            }}
            rows={4}
            aria-label="Referencia"
            data-testid="reference-paste"
            className={`${field} resize-none py-[8px] font-serif text-[15px] leading-[22px]`}
          />
        </>
      )}
      <input
        type="text"
        value={locator}
        onChange={(e) => changeLocator(e.target.value)}
        onFocus={() => editor.markHistoryStoppingPoint("note reference locator")}
        onKeyDown={keys}
        placeholder="p. 12"
        aria-label="Página o lugar"
        data-testid="reference-locator"
        className={`${field} h-[34px]`}
      />
      <div className="flex items-center justify-between gap-[8px]">
        {current ? (
          <button
            type="button"
            data-testid="reference-remove"
            onClick={() => {
              write(null, "note reference remove");
              onClose();
            }}
            className="font-sans text-[13px] font-medium leading-[16px] text-ink-2 cursor-pointer hover:text-ink-1"
          >
            Quitar referencia
          </button>
        ) : (
          <span />
        )}
        {mode === "paste" ? (
          <button type="button" data-testid="reference-paste-save" className={PRIMARY} onClick={savePaste} disabled={draft.trim() === ""}>
            Guardar
          </button>
        ) : null}
      </div>
    </div>
  );
}
