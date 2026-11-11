"use client";

// The ruled page (Paper R1.3, R1.4). One scroller holds the recents strip,
// the filter row and the page. The page is a stack of fixed 36 px lines of
// which only the visible ones (plus a margin) are mounted, so 1000 essays
// scroll like 20. The windowing lives here on purpose; spec 008 builds its own.

import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Stamp } from "@/components/review/Stamp";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  buildLedger,
  currentMonth,
  isDateOrder,
  LINE_H,
  monthIndex,
  windowRange,
  type LedgerItem,
  type Orden,
  type Revision,
  type Tipo,
} from "@/lib/library/ledger";
import { formatCount, type LibraryRow } from "@/lib/library/rows";
import type { Segment, SearchHit } from "@/lib/storage/types";
import { EssayRowMenu } from "./EssayRowMenu";
import { AcademicIcon, BlogIcon } from "./icons";
import { LedgerFilters } from "./LedgerFilters";
import { MonthJump } from "./MonthJump";
import { NoResults } from "./NoResults";
import { Recents, RECENTS_H } from "./Recents";

export type LedgerProps = {
  /** Every essay, newest first. */
  rows: LibraryRow[];
  /** The essays the recents strip shows, left out of the lines below. */
  deskIds: ReadonlySet<string>;
  onOpen: (id: string) => void;
  query: string;
  /** Results for the latest query that has answered; null before the first. */
  hits: SearchHit[] | null;
  /** True once `hits` answers the current query. */
  hitsCurrent: boolean;
  tipo: Tipo;
  revision: Revision;
  /** The order in effect: «relevantes» only while a query exists. */
  orden: Orden;
  onTipo: (v: Tipo) => void;
  onRevision: (v: Revision) => void;
  onOrden: (v: Orden) => void;
  onClearNarrowing: () => void;
  initialScrollTop: number;
  onScrollTop: (top: number) => void;
};

/** The filter row is as tall as in Paper and stays under the window bar. */
const FILTER_H = 44;

function Marked({ segments, hitClass }: { segments: Segment[]; hitClass: string }) {
  return (
    <>
      {segments.map((s, i) =>
        s.hit ? (
          <span key={i} className={hitClass}>
            {s.text}
          </span>
        ) : (
          <Fragment key={i}>{s.text}</Fragment>
        ),
      )}
    </>
  );
}

const Chevron = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="flex-none">
    <path d="M3 4.5L6 7.5L9 4.5" fill="none" stroke="var(--color-ink-3)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const EssayLine = memo(function EssayLine({
  row,
  titleSegments,
  top,
  onOpen,
}: {
  row: LibraryRow;
  titleSegments?: Segment[];
  top: number;
  onOpen: (id: string) => void;
}) {
  const { entry } = row;
  const academic = entry.mode === "academico";
  const untitled = entry.title.trim().length === 0;
  const titleColor = untitled ? "text-ink-3" : titleSegments ? "text-ink-2" : "text-ink-1";
  const title = (
    <span className={`min-w-0 flex-1 truncate font-serif text-[18px] leading-[24px] ${titleColor}`}>
      {titleSegments ? <Marked segments={titleSegments} hitClass="font-semibold text-ink-1" /> : row.displayTitle}
    </span>
  );
  return (
    <EssayRowMenu
      id={entry.id}
      title={row.displayTitle}
      placement="row"
      onOpen={() => onOpen(entry.id)}
      testId="ledger-row"
      className="flex items-end pl-[88px] pr-[48px] pb-[3px] hover:bg-[#F1EEE666]"
      style={{ position: "absolute", top, left: 0, right: 0, height: LINE_H }}
    >
      <div className="flex w-[34px] flex-none pb-[3px]">
        <Tooltip label={academic ? "Académico" : "Blog"}>
          <span className="flex">{academic ? <AcademicIcon /> : <BlogIcon />}</span>
        </Tooltip>
      </div>
      {row.displayTitle.length > 70 ? (
        <Tooltip label={row.displayTitle} className="flex min-w-0 flex-1">
          {title}
        </Tooltip>
      ) : (
        title
      )}
      <span className="w-[120px] flex-none text-right font-sans text-[13px] leading-[20px] text-ink-3">
        {entry.wordCount > 0 ? `${formatCount(entry.wordCount)} ${entry.wordCount === 1 ? "palabra" : "palabras"}` : ""}
      </span>
      <span className="w-[72px] flex-none text-right font-sans text-[13px] leading-[20px] text-ink-3">
        {row.minutes ? `${row.minutes} min` : ""}
      </span>
      <span className="flex w-[64px] flex-none justify-end">
        {row.score ? (
          <span data-testid="ledger-stamp" className="flex">
            <Stamp result={row.score} size="ledger" tiltSeed={entry.id} />
          </span>
        ) : null}
      </span>
    </EssayRowMenu>
  );
});

const MonthLine = memo(function MonthLine({ label, top }: { label: string; top: number }) {
  return (
    <div
      className="absolute left-0 right-0 flex items-end pl-[88px] pb-[6px]"
      style={{ top, height: LINE_H }}
    >
      <span className="font-sans text-[13px] font-semibold leading-[20px] text-ink-2">{label}</span>
    </div>
  );
});

const ExcerptLine = memo(function ExcerptLine({
  row,
  segments,
  top,
  onOpen,
}: {
  row: LibraryRow;
  segments: Segment[];
  top: number;
  onOpen: (id: string) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid="ledger-excerpt"
      onClick={() => onOpen(row.entry.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(row.entry.id);
      }}
      className="absolute left-0 right-0 flex cursor-pointer items-end pl-[122px] pr-[32px] pb-[4px] outline-none"
      style={{ top, height: LINE_H }}
    >
      <span className="min-w-0 flex-1 truncate font-serif text-[16px] leading-[22px] text-ink-3">
        <Marked segments={segments} hitClass="font-semibold text-ink-1" />
      </span>
    </div>
  );
});

export function Ledger(props: LedgerProps) {
  const {
    rows, deskIds, onOpen, query, hits, hitsCurrent, tipo, revision, orden,
    onTipo, onRevision, onOrden, onClearNarrowing, initialScrollTop, onScrollTop,
  } = props;

  const searching = query.trim().length > 0;
  const model = useMemo(
    () => buildLedger(rows, { query, tipo, revision, orden }, hits, deskIds),
    [rows, query, tipo, revision, orden, hits, deskIds],
  );
  const showRecents = !searching && tipo === null && revision === null && orden === "recientes";
  const recents = useMemo(
    () => (showRecents ? rows.filter((r) => deskIds.has(r.entry.id)) : []),
    [showRecents, rows, deskIds],
  );
  const stripH = showRecents && recents.length > 0 ? RECENTS_H : 0;

  const scroller = useRef<HTMLDivElement | null>(null);
  const [viewH, setViewH] = useState(900);
  // Only what changes what is drawn is state: the line under the top edge
  // and whether the page has reached the filter row.
  const [pos, setPos] = useState({ line: 0, stuck: false });

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const y = el.scrollTop - stripH;
    const line = Math.max(0, Math.floor(y / LINE_H));
    const stuck = y >= 0;
    setPos((p) => (p.line === line && p.stuck === stuck ? p : { line, stuck }));
  }, [stripH]);

  // Saved place: written a moment after scrolling stops and on leaving.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTop = useRef(initialScrollTop);
  const onScrollTopRef = useRef(onScrollTop);
  useEffect(() => {
    onScrollTopRef.current = onScrollTop;
  });
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      onScrollTopRef.current(lastTop.current);
    },
    [],
  );

  const frame = useRef(0);
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    lastTop.current = el.scrollTop;
    if (!frame.current) {
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        measure();
      });
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => onScrollTopRef.current(lastTop.current), 200);
  };
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    setViewH(el.clientHeight);
    const ro = new ResizeObserver(() => setViewH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A new search, filter or order starts at the top; the first mount restores.
  const narrowKey = `${query}|${tipo}|${revision}|${orden}`;
  const prevKey = useRef<string | null>(null);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (prevKey.current === null) el.scrollTop = initialScrollTop;
    else if (prevKey.current !== narrowKey) el.scrollTop = 0;
    prevKey.current = narrowKey;
    lastTop.current = el.scrollTop;
    measure();
    // initialScrollTop is read once, at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narrowKey, measure]);

  const pageH = Math.max(model.items.length * LINE_H + LINE_H, viewH - FILTER_H);
  const range = windowRange(pos.line * LINE_H, viewH - FILTER_H, model.items.length);

  const dated = isDateOrder(orden) && model.months.length > 0;
  const monthIdx = dated ? currentMonth(model, pos.line * LINE_H) : -1;
  const monthNow = monthIdx >= 0 ? model.months[monthIdx] : null;
  const monthHeading = monthNow ? (model.items[monthNow.index] as Extract<LedgerItem, { kind: "month" }>) : null;

  const [jumpOpen, setJumpOpen] = useState(false);
  const headingRef = useRef<HTMLButtonElement | null>(null);
  const years = useMemo(() => monthIndex(model.months), [model.months]);
  const jumpTo = (key: string) => {
    const m = model.months.find((x) => x.key === key);
    const el = scroller.current;
    if (m && el) el.scrollTop = stripH + m.index * LINE_H;
    setJumpOpen(false);
  };

  const empty = model.items.length === 0;
  const settled = !searching || hitsCurrent;

  const rowsOut: React.ReactNode[] = [];
  for (let i = range.start; i < range.end; i++) {
    const it = model.items[i];
    const top = i * LINE_H;
    if (it.kind === "month") rowsOut.push(<MonthLine key={it.key} label={it.label} top={top} />);
    else if (it.kind === "essay")
      rowsOut.push(<EssayLine key={it.key} row={it.row} titleSegments={it.titleSegments} top={top} onOpen={onOpen} />);
    else rowsOut.push(<ExcerptLine key={it.key} row={it.row} segments={it.segments} top={top} onOpen={onOpen} />);
  }

  return (
    <div
      ref={scroller}
      onScroll={onScroll}
      data-testid="library-ledger"
      className="h-full overflow-y-auto thin-scroll"
    >
      {stripH > 0 ? <Recents rows={recents} onOpen={onOpen} /> : null}
      <div
        className="sticky top-0 z-20 flex items-center justify-end bg-paper pl-[144px] pr-[88px]"
        style={{ height: FILTER_H }}
      >
        <LedgerFilters
          tipo={tipo}
          revision={revision}
          orden={orden}
          searching={searching}
          onTipo={onTipo}
          onRevision={onRevision}
          onOrden={onOrden}
        />
      </div>
      <div
        data-testid="ledger-page"
        className={`relative mx-[56px] rounded-t-[14px] ${empty ? "bg-sheet" : "paper-ledger"}`}
        style={{
          height: pageH,
          boxShadow: "#1D1B180F 0 0 0 1px, #3C2D0A1A 0 2px 4px, #3C2D0A26 0 -8px 24px -14px",
        }}
      >
        {empty && settled ? (
          <NoResults query={query} tipo={tipo} revision={revision} onClear={onClearNarrowing} />
        ) : null}
        {monthHeading ? (
          <div
            className="sticky top-[44px] z-10 flex items-center rounded-t-[14px] pl-[80px] paper-ledger"
            style={{
              height: LINE_H,
              marginBottom: -LINE_H,
              boxShadow: pos.stuck ? "#1D1B180F 0 0 0 1px, #3C2D0A1F 0 10px 12px -10px" : undefined,
            }}
          >
            <button
              ref={headingRef}
              type="button"
              data-testid="ledger-month"
              aria-haspopup="menu"
              aria-expanded={jumpOpen}
              onClick={() => setJumpOpen((v) => !v)}
              className={`flex h-[28px] items-center gap-[4px] rounded-[8px] px-[8px] cursor-pointer font-sans text-[13px] font-semibold leading-[20px] text-ink-2 hover:bg-shade ${
                jumpOpen ? "bg-shade" : ""
              }`}
            >
              {monthHeading.label}
              <Chevron />
            </button>
          </div>
        ) : null}
        {rowsOut}
      </div>
      <MonthJump
        anchor={headingRef}
        open={jumpOpen}
        onClose={() => setJumpOpen(false)}
        years={years}
        currentKey={monthNow?.key ?? null}
        onPick={jumpTo}
      />
    </div>
  );
}
