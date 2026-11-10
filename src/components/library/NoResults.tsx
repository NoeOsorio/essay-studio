"use client";

// Nothing matched (Paper R1.4, «sin resultados»). Says what was asked in a
// few words and offers to drop what narrowed it.

import { activeFilterLabel, type Revision, type Tipo } from "@/lib/library/ledger";

type Props = {
  query: string;
  tipo: Tipo;
  revision: Revision;
  /** Drops the filters; without filters, clears the search. */
  onClear: () => void;
};

export function NoResults({ query, tipo, revision, onClear }: Props) {
  const q = query.trim();
  const filters = activeFilterLabel(tipo, revision);
  const hasFilter = filters !== null;
  const text =
    q && filters ? `Nada con «${q}» en ${filters}` : q ? `Nada con «${q}»` : `Nada en ${filters ?? "esta lista"}`;
  const action = hasFilter ? (tipo && revision ? "Quitar filtros" : "Quitar filtro") : "Borrar búsqueda";
  return (
    <div data-testid="library-no-results" className="flex flex-col items-center gap-[18px] pt-[225px]">
      <div className="max-w-[900px] truncate font-sans text-[22px] font-medium leading-[28px] tracking-[-0.01em] text-ink-1">
        {text}
      </div>
      <button
        type="button"
        data-testid="library-no-results-clear"
        onClick={onClear}
        className="flex h-[36px] items-center rounded-[10px] bg-shade px-[16px] press cursor-pointer font-sans text-[13px] font-medium leading-[16px] text-ink-1"
      >
        {action}
      </button>
    </div>
  );
}
