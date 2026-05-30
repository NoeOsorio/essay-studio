"use client";

import { useEffect } from "react";

import { Avatar, type SageKey } from "@/components/ui/Avatar";
import type {
  AppliedAnotacion,
  CriterioBreakdown,
} from "@/lib/benchmark/score";

/**
 * Slide-up panel that opens above the Scorebar when the user clicks
 * a criterio ring. Lists every anotación tagged to that criterio.
 * Closes the diagnostic→action loop:
 *   - Click an anotación → scroll its mark into view + flash
 *   - Click "Descartar" → remove the mark; the Scorebar recomputes
 *
 * Dismissals reuse the same TipTap command (`removeAnnotationById`)
 * the editor popover already uses, so the same code path stays
 * authoritative for "what's on the doc".
 */

const SAGE_INITIALS: Record<SageKey, string> = {
  em: "EM",
  sis: "SI",
  pra: "PR",
  cri: "CR",
};

const SAGE_NAME: Record<SageKey, string> = {
  em: "el Empirista",
  sis: "el Sistémico",
  pra: "el Práctico",
  cri: "el Crítico",
};

const PASE_LABEL: Record<string, string> = {
  coherencia: "coherencia",
  estilo: "estilo",
  argumento: "argumento",
  apa: "APA",
};

const SEV_TONE: Record<string, string> = {
  alta: "bg-seal",
  media: "bg-em",
  baja: "bg-sis",
};

export function BenchmarkDrilldown({
  breakdown,
  general,
  onClose,
}: {
  breakdown: CriterioBreakdown | null;
  general: AppliedAnotacion[] | null;
  onClose: () => void;
}) {
  // Esc to close. Pin to window so it works without focus inside.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const title = breakdown
    ? breakdown.criterio.nombre || "Sin nombre"
    : "Anotaciones sin criterio";
  const anotaciones: AppliedAnotacion[] = breakdown
    ? breakdown.anotaciones
    : general ?? [];
  const scoreLabel = breakdown ? `${breakdown.score.toFixed(1)} / 10` : null;

  return (
    <div
      className="absolute bottom-full left-0 right-0 bg-paper-2 border-t border-rule-2 shadow-(--shadow-pop) max-h-[40vh] overflow-y-auto thin-scroll"
      role="dialog"
      aria-modal="false"
      aria-label={`Anotaciones para ${title}`}
      data-testid="benchmark-drilldown"
    >
      <header className="flex items-center justify-between px-8 py-3 border-b border-rule-1 bg-paper-2 sticky top-0">
        <div className="flex items-baseline gap-3 min-w-0">
          <h3 className="font-serif italic text-[16px] text-ink-1 truncate">
            {title}
          </h3>
          {scoreLabel ? (
            <span className="font-mono text-[11px] font-semibold tracking-[0.06em] text-ink-2">
              {scoreLabel}
            </span>
          ) : null}
          <span className="font-mono text-[10px] text-ink-3 tracking-[0.04em]">
            {anotaciones.length}{" "}
            {anotaciones.length === 1 ? "anotación" : "anotaciones"}
            {breakdown ? " atadas a este criterio" : " sin criterio"}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-7 h-7 grid place-items-center rounded text-ink-3 hover:bg-paper-3 hover:text-ink-1 cursor-pointer"
          title="Cerrar"
          aria-label="Cerrar"
        >
          ×
        </button>
      </header>

      {anotaciones.length === 0 ? (
        <div className="px-8 py-6 text-ink-3 font-serif italic text-[13px]">
          Sin anotaciones — este criterio quedó intacto en la última revisión.
        </div>
      ) : (
        <ul className="px-8 py-3 list-none m-0 flex flex-col gap-2">
          {anotaciones.map((a) => (
            <AnotacionCard key={a.id} a={a} />
          ))}
        </ul>
      )}
    </div>
  );
}

function AnotacionCard({ a }: { a: AppliedAnotacion }) {
  const sage = (a.sage ?? "em") as SageKey;
  const focusInEditor = () => {
    if (!a.id) return;
    const el = document.querySelector<HTMLElement>(
      `[data-anno-id="${cssEscape(a.id)}"]`,
    );
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("anno-flash");
    window.setTimeout(() => el.classList.remove("anno-flash"), 1600);
  };

  const dismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!a.id) return;
    // EditorPane listens for `pluma-roja:dismiss` and calls
    // `removeAnnotationById`. Same dispatch pattern as the popover.
    window.dispatchEvent(
      new CustomEvent("pluma-roja:dismiss", { detail: { id: a.id } }),
    );
  };

  const apply = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!a.id || !a.sugerencia) return;
    // EditorPane listens for `pluma-roja:apply-suggestion` and calls
    // `applyAnnotationSuggestion(id, sugerencia)`. If the mark crosses
    // block boundaries, the editor surfaces a toast.
    window.dispatchEvent(
      new CustomEvent("pluma-roja:apply-suggestion", {
        detail: { id: a.id, sugerencia: a.sugerencia },
      }),
    );
  };

  return (
    <li
      className="p-2.5 rounded-[6px] border border-rule-2 bg-paper cursor-pointer hover:bg-paper-2 transition-colors"
      onClick={focusInEditor}
      data-testid="drilldown-anotacion"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          focusInEditor();
        }
      }}
    >
      <div className="flex items-start gap-2.5">
        <Avatar
          sage={sage}
          initials={SAGE_INITIALS[sage]}
          size={20}
          title={SAGE_NAME[sage]}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span
              className={`w-[7px] h-[7px] rounded-full ${
                SEV_TONE[a.severidad] ?? "bg-ink-3"
              }`}
            />
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-3">
              {a.severidad}
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-3">
              · {PASE_LABEL[a.pase ?? ""] ?? a.pase}
            </span>
          </div>
          <div className="text-[13px] leading-[1.5] text-ink-1 font-serif">
            {a.mensaje}
          </div>
          {a.sugerencia ? (
            <div className="mt-1 font-serif italic text-[12px] text-ink-2 leading-[1.45]">
              → {a.sugerencia}
            </div>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-none">
          {a.sugerencia ? (
            <button
              type="button"
              onClick={apply}
              title="Reemplazar el texto subrayado con la sugerencia"
              aria-label="Aplicar sugerencia"
              data-testid="drilldown-apply"
              className="font-mono text-[10px] uppercase tracking-[0.14em] font-semibold text-paper bg-ink-1 hover:bg-ink-2 px-2.5 py-1 rounded cursor-pointer"
            >
              Aplicar
            </button>
          ) : null}
          <button
            type="button"
            onClick={dismiss}
            title="Descartar"
            aria-label="Descartar anotación"
            data-testid="drilldown-dismiss"
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 hover:text-seal cursor-pointer"
          >
            Descartar
          </button>
        </div>
      </div>
    </li>
  );
}

/** Minimal CSS.escape polyfill — selector-safe quoting of the anno id. */
function cssEscape(s: string): string {
  // UUIDs only have hex chars and hyphens — but cover edge cases.
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(s);
  }
  return s.replace(/(["\\#.:[\]()*+,~^$=|/])/g, "\\$1");
}
