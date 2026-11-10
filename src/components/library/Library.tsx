"use client";

// The essay library screen. It picks what to show from the store: the
// skeleton while the list loads, a retry when it cannot, first use only when
// the list loaded and is empty, the desk for a few essays (R1.1) and the
// ruled page past the threshold (R1.3). A query also brings the ruled page,
// whatever the count, because only it shows where the words were found (R1.4).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Spinner } from "@/components/toolbar/toolbar-icons";
import { toRow } from "@/lib/library/rows";
import { searchLibrary } from "@/lib/storage";
import type { SearchHit } from "@/lib/storage/types";
import { useStore } from "@/lib/store";
import { Desk } from "./Desk";
import { FirstUse } from "./FirstUse";
import { Ledger } from "./Ledger";
import { LibraryBar } from "./LibraryBar";

/** With this many essays or fewer the screen is the desk; past it, the ruled page. */
export const DESK_LIMIT = 11;
/** How many recent essays stay as cards above the ruled page (R1.3). */
const RECENT_CARDS = 4;
/** A refresh on window focus never runs more often than this. */
const FOCUS_REFRESH_MS = 1000;
/** The skeleton waits this long, so a fast boot never flashes it. */
const SKELETON_DELAY_MS = 200;
const EMPTY_IDS: ReadonlySet<string> = new Set();

export function Library() {
  const list = useStore((s) => s.list);
  const listStatus = useStore((s) => s.listStatus);
  const loadList = useStore((s) => s.loadList);
  const newEssay = useStore((s) => s.newEssay);
  const openEssay = useStore((s) => s.openEssay);
  const query = useStore((s) => s.library.query);
  const tipo = useStore((s) => s.library.tipo);
  const revision = useStore((s) => s.library.revision);
  const storedOrden = useStore((s) => s.library.orden);
  const setLibrary = useStore((s) => s.setLibrary);

  const rows = useMemo(() => {
    return list.map((entry) => toRow(entry)).sort((a, b) => b.effectiveMs - a.effectiveMs);
  }, [list]);

  // Results as he types. Each request gets a number; an answer that is not
  // the latest is dropped, so a slow early query never overwrites a later one.
  const trimmed = query.trim();
  const [found, setFound] = useState<{ q: string; hits: SearchHit[] } | null>(null);
  const requestNo = useRef(0);
  useEffect(() => {
    if (!trimmed) {
      requestNo.current += 1;
      return;
    }
    const no = ++requestNo.current;
    searchLibrary(trimmed)
      .then((hits) => {
        if (no === requestNo.current) setFound({ q: trimmed, hits });
      })
      .catch(() => {
        if (no === requestNo.current) setFound({ q: trimmed, hits: [] });
      });
  }, [trimmed, list]);

  // Relevance is the order while a query exists, until he picks another.
  const searching = trimmed.length > 0;
  const [picked, setPicked] = useState(false);
  const [wasSearching, setWasSearching] = useState(searching);
  if (wasSearching !== searching) {
    setWasSearching(searching);
    setPicked(false);
  }
  const orden =
    storedOrden === "relevantes" || (searching && storedOrden === "recientes" && !picked)
      ? searching
        ? "relevantes"
        : "recientes"
      : storedOrden;

  const deskIds = useMemo(
    () => new Set(rows.slice(0, RECENT_CARDS).map((r) => r.entry.id)),
    [rows],
  );

  // Essays can change on disk while the app is in the background.
  useEffect(() => {
    let last = Date.now();
    const onFocus = () => {
      if (useStore.getState().listStatus !== "ready") return;
      if (Date.now() - last < FOCUS_REFRESH_MS) return;
      last = Date.now();
      void loadList();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadList]);

  const open = useCallback((id: string) => void openEssay(id), [openEssay]);

  let body: React.ReactNode;
  if (listStatus === "loading") {
    body = <Building />;
  } else if (listStatus === "error" && list.length === 0) {
    body = <LoadFailed onRetry={() => void loadList()} />;
  } else if (rows.length === 0) {
    return (
      <div data-testid="library" className="flex flex-col flex-1 min-h-0 bg-paper">
        <LibraryBar showTools={false} />
        <FirstUse onCreate={(mode) => void newEssay(mode)} />
      </div>
    );
  } else if (rows.length > DESK_LIMIT || searching) {
    // The ruled page owns its scroller, so the windowing sees the real one.
    return (
      <div data-testid="library" className="flex flex-col flex-1 min-h-0 bg-paper">
        <LibraryBar />
        <div className="flex-1 min-h-0">
          <Ledger
            rows={rows}
            deskIds={rows.length > DESK_LIMIT ? deskIds : EMPTY_IDS}
            onOpen={open}
            query={query}
            hits={found?.hits ?? null}
            hitsCurrent={found?.q === trimmed}
            tipo={tipo}
            revision={revision}
            orden={orden}
            onTipo={(v) => setLibrary({ tipo: v })}
            onRevision={(v) => setLibrary({ revision: v })}
            onOrden={(v) => {
              setPicked(true);
              setLibrary({ orden: v });
            }}
            onClearNarrowing={() =>
              tipo || revision ? setLibrary({ tipo: null, revision: null }) : setLibrary({ query: "" })
            }
            initialScrollTop={useStore.getState().library.scrollTop}
            onScrollTop={(top) => setLibrary({ scrollTop: top })}
          />
        </div>
      </div>
    );
  } else {
    body = <Desk rows={rows} onOpen={open} />;
  }

  return (
    <div data-testid="library" className="flex flex-col flex-1 min-h-0 bg-paper">
      <LibraryBar />
      <div className="flex-1 min-h-0 overflow-y-auto thin-scroll">{body}</div>
    </div>
  );
}

/** The index is still loading: five blank sheets and one line (Paper «Biblioteca, armándose»). */
function Building() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), SKELETON_DELAY_MS);
    return () => clearTimeout(t);
  }, []);
  if (!visible) return null;

  const bar = (w: number, h: number, light = false) => (
    <div className={`rounded-[6px] ${light ? "bg-[#F1EEE6B3]" : "bg-shade"}`} style={{ width: w, height: h }} />
  );
  const shadow = "0 0 0 1px #1D1B180F, 0 2px 4px #3C2D0A1A, 0 20px 32px -16px #3C2D0A33";
  const card = (cream: boolean, rot: number) => (
    <div
      className={`flex h-[248px] flex-col gap-[10px] rounded-[4px] px-[30px] pt-[34px] ${cream ? "paper-cream" : "bg-sheet"}`}
      style={{ boxShadow: shadow, rotate: `${rot}deg` }}
    >
      {bar(280, 26)}
      {bar(190, 22)}
    </div>
  );
  return (
    <div data-testid="library-building" className="relative">
      <div aria-hidden className="grid grid-cols-3 content-start gap-x-[56px] gap-y-[60px] px-[56px] pt-[30px] pb-[72px]">
        <div
          className="col-span-2 flex h-[420px] flex-col gap-[14px] rounded-[14px] bg-sheet px-[64px] pt-[56px]"
          style={{ boxShadow: "0 0 0 1px #1D1B180F, 0 2px 4px #3C2D0A1A, 0 24px 40px -18px #3C2D0A33", rotate: "-0.6deg" }}
        >
          {bar(520, 32)}
          {bar(400, 32)}
          <div className="h-[6px]" />
          {bar(640, 14, true)}
          {bar(610, 14, true)}
        </div>
        {card(false, 1.2)}
        {card(false, -1.4)}
        {card(true, 1.2)}
        {card(false, -0.8)}
      </div>
      <div
        role="status"
        className="fixed bottom-[14px] left-1/2 flex h-[38px] -translate-x-1/2 items-center gap-[10px] rounded-full bg-sheet pl-[14px] pr-[18px] shadow-[0_0_0_1px_#1D1B1814,0_1px_2px_#1D1B180F]"
      >
        <Spinner size={16} />
        <span className="font-sans text-[13px] leading-[16px] text-ink-1">Ordenando tus ensayos</span>
      </div>
    </div>
  );
}

function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div data-testid="library-failed" className="flex h-full flex-col items-center justify-center gap-[18px] pb-[80px]">
      <svg width="28" height="28" viewBox="0 0 16 16" aria-hidden>
        <path d="M8 2.2l6.2 11a.6.6 0 0 1-.5.9H2.3a.6.6 0 0 1-.5-.9z" fill="none" stroke="var(--color-err)" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M8 6.3v3.4" fill="none" stroke="var(--color-err)" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="8" cy="11.8" r=".8" fill="var(--color-err)" />
      </svg>
      <div className="flex flex-col items-center gap-[6px]">
        <div className="font-sans text-[18px] font-medium leading-[24px] text-ink-1">No pude abrir tu biblioteca</div>
        <div className="font-sans text-[15px] leading-[20px] text-ink-2">Tus ensayos siguen guardados</div>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="flex h-[36px] items-center rounded-[10px] bg-sheet px-[16px] press cursor-pointer font-sans text-[13px] font-medium leading-[16px] text-ink-1 shadow-[0_0_0_1px_#1D1B181A,0_1px_2px_#1D1B180F]"
      >
        Reintentar
      </button>
    </div>
  );
}
