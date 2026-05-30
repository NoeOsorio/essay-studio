"use client";

import { Button } from "@/components/ui/Button";
import { useStore } from "@/lib/store";
import type { Criterio, Rubrica } from "@/lib/storage/types";

/**
 * Rubric editor for the current essay. CRUD over a flat list of
 * criterios — the same list the council reads when running Pluma Roja
 * and later when the Benchmark scores the doc against the rubric.
 *
 * Persistence: every change calls `updateRubrica` which sets the field
 * on the essay and flushes. No staging.
 */
export function RubricaOverlay() {
  const overlay = useStore((s) => s.overlay);
  const setOverlay = useStore((s) => s.setOverlay);
  const current = useStore((s) => s.current);
  const updateRubrica = useStore((s) => s.updateRubrica);
  const flush = useStore((s) => s.flush);

  if (overlay !== "rubrica") return null;
  if (!current) return null;

  const rubrica: Rubrica = current.rubrica ?? { criterios: [] };

  const close = () => {
    // Force-flush any debounced rubric edit so closing the modal
    // doesn't lose pending criterios.
    void flush();
    setOverlay(null);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink-1/30 backdrop-blur-[2px]"
      onClick={close}
    >
      <div
        className="w-[760px] max-w-[96vw] max-h-[92vh] bg-paper-2 border border-rule-2 rounded-[14px] shadow-(--shadow-pop) overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        data-testid="rubrica-overlay"
      >
        <RubricaInner
          essayTitle={current.title}
          rubrica={rubrica}
          onChange={(next) => updateRubrica(next)}
          onClose={close}
        />
      </div>
    </div>
  );
}

function RubricaInner({
  essayTitle,
  rubrica,
  onChange,
  onClose,
}: {
  essayTitle: string;
  rubrica: Rubrica;
  onChange: (rubrica: Rubrica | undefined) => void;
  onClose: () => void;
}) {
  // No local draft — every keystroke commits to the store via
  // `onChange`. The store's `updateRubrica` clears the field entirely
  // when criterios is empty, so we pass `undefined` for empty rubrics.
  const commit = (next: Rubrica) => {
    onChange(next.criterios.length > 0 ? next : undefined);
  };

  const addCriterio = () => {
    const id = crypto.randomUUID();
    commit({
      criterios: [
        ...rubrica.criterios,
        {
          id,
          nombre: "",
          peso: 3,
          descripcion: "",
        },
      ],
    });
  };

  const update = (id: string, patch: Partial<Criterio>) => {
    commit({
      criterios: rubrica.criterios.map((c) =>
        c.id === id ? { ...c, ...patch } : c,
      ),
    });
  };

  const remove = (id: string) => {
    commit({ criterios: rubrica.criterios.filter((c) => c.id !== id) });
  };

  return (
    <>
      <header className="flex items-center justify-between px-6 py-4 border-b border-rule-1 bg-paper-2">
        <div className="min-w-0">
          <h2 className="font-serif italic text-[20px] text-ink-1 leading-tight truncate">
            Rúbrica — {essayTitle || "sin título"}
          </h2>
          <p className="font-mono text-[10px] text-ink-3 mt-1 tracking-[0.04em]">
            Los criterios que tu profesor pide. El consejo los recibe cada vez que corres Evaluar.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-8 h-8 grid place-items-center rounded text-ink-3 hover:bg-paper-3 hover:text-ink-1 cursor-pointer flex-none"
          title="Cerrar"
        >
          ×
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto thin-scroll p-6 flex flex-col gap-3">
        {rubrica.criterios.length === 0 ? (
          <div className="text-center py-12 text-ink-3 font-serif italic text-[13px]">
            Sin criterios aún. Añade los que tu profesor evalúa: claridad del argumento, calidad de la evidencia, etc.
          </div>
        ) : (
          rubrica.criterios.map((c, i) => (
            <CriterioRow
              key={c.id}
              index={i}
              criterio={c}
              onChange={(patch) => update(c.id, patch)}
              onRemove={() => remove(c.id)}
            />
          ))
        )}
      </div>

      <footer className="flex items-center justify-between px-6 py-3 border-t border-rule-1 bg-paper-2">
        <span className="font-mono text-[11px] text-ink-3 tracking-[0.04em]">
          {rubrica.criterios.length} criterio
          {rubrica.criterios.length === 1 ? "" : "s"}
        </span>
        <Button onClick={addCriterio} data-testid="rubrica-add">
          + Añadir criterio
        </Button>
      </footer>
    </>
  );
}

function CriterioRow({
  index,
  criterio,
  onChange,
  onRemove,
}: {
  index: number;
  criterio: Criterio;
  onChange: (patch: Partial<Criterio>) => void;
  onRemove: () => void;
}) {
  return (
    <div
      className="grid grid-cols-[28px_1fr_60px_auto] gap-3 items-start p-3 rounded-[8px] border border-rule-2 bg-paper"
      data-testid="criterio-row"
    >
      <div className="text-ink-3 font-mono text-[11px] tracking-[0.04em] pt-1.5">
        {String(index + 1).padStart(2, "0")}
      </div>
      <div className="flex flex-col gap-2 min-w-0">
        <input
          type="text"
          value={criterio.nombre}
          onChange={(e) => onChange({ nombre: e.target.value })}
          placeholder="Nombre del criterio (p. ej. Claridad del argumento)"
          aria-label="Nombre del criterio"
          className="font-serif text-[15px] text-ink-1 bg-transparent outline-none border-b border-rule-1 focus:border-rule-3 pb-1"
          data-testid="criterio-nombre"
        />
        <textarea
          value={criterio.descripcion}
          onChange={(e) => onChange({ descripcion: e.target.value })}
          placeholder="Qué se ve cuando este criterio se cumple bien."
          aria-label="Descripción del criterio"
          rows={2}
          className="font-serif text-[13px] text-ink-2 bg-transparent outline-none resize-none leading-[1.5]"
          data-testid="criterio-descripcion"
        />
      </div>
      <div className="flex flex-col items-center gap-1">
        <label
          htmlFor={`peso-${criterio.id}`}
          className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-3"
        >
          peso
        </label>
        <select
          id={`peso-${criterio.id}`}
          value={criterio.peso}
          onChange={(e) =>
            onChange({ peso: Math.max(1, Math.min(5, Number(e.target.value))) })
          }
          aria-label={`Peso de ${criterio.nombre || "criterio"}`}
          className="bg-paper-2 border border-rule-2 rounded font-mono text-[12px] text-ink-1 px-1.5 py-0.5 cursor-pointer"
          data-testid="criterio-peso"
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        onClick={onRemove}
        title="Eliminar criterio"
        aria-label={`Eliminar ${criterio.nombre || "criterio"}`}
        className="font-mono text-[14px] text-ink-3 hover:text-seal cursor-pointer w-7 h-7 grid place-items-center"
        data-testid="criterio-remove"
      >
        ×
      </button>
    </div>
  );
}
