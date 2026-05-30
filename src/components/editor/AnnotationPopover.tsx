"use client";

import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/core";

import { Avatar, type SageKey } from "@/components/ui/Avatar";
import { useStore } from "@/lib/store";

type Open = {
  rect: DOMRect;
  id: string;
  sage: SageKey;
  pase: string;
  severidad: string;
  mensaje: string;
  sugerencia: string | null;
  criterioId: string | null;
};

const SAGE_NAME: Record<SageKey, string> = {
  em: "el Empirista",
  sis: "el Sistémico",
  pra: "el Práctico",
  cri: "el Crítico",
};

const SAGE_INITIALS: Record<SageKey, string> = {
  em: "EM",
  sis: "SI",
  pra: "PR",
  cri: "CR",
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

/**
 * Floating panel that opens when the user clicks an `.anno` span in
 * the editor. Reads the mark's data-* attrs out of the DOM (no extra
 * state plumbing), and lets the user dismiss the annotation. Suggestion
 * text is shown read-only — auto-apply ships in phase B.
 */
export function AnnotationPopover({ editor }: { editor: Editor | null }) {
  const [open, setOpen] = useState<Open | null>(null);
  const rubrica = useStore((s) => s.current?.rubrica);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const el = target.closest<HTMLElement>("[data-anno-id]");
      if (!el) {
        setOpen(null);
        return;
      }
      const id = el.dataset.annoId;
      const sage = el.dataset.sage as SageKey | undefined;
      const pase = el.dataset.pase;
      const severidad = el.dataset.severidad;
      const mensaje = el.dataset.mensaje;
      const sugerencia = el.dataset.sugerencia ?? null;
      const criterioId = el.dataset.criterioId ?? null;
      if (!id || !sage || !pase || !severidad || !mensaje) return;
      e.preventDefault();
      e.stopPropagation();
      setOpen({
        rect: el.getBoundingClientRect(),
        id,
        sage,
        pase,
        severidad,
        mensaje,
        sugerencia,
        criterioId,
      });
    };

    dom.addEventListener("click", onClick);
    return () => dom.removeEventListener("click", onClick);
  }, [editor]);

  // Close when the user clicks anywhere outside the popover or scrolls.
  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-anno-popover]")) return;
      if (target?.closest("[data-anno-id]")) return;
      setOpen(null);
    };
    const onScroll = () => setOpen(null);
    window.addEventListener("mousedown", onOutside, true);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("mousedown", onOutside, true);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  if (!open || !editor) return null;

  const dismiss = () => {
    editor.commands.removeAnnotationById(open.id);
    setOpen(null);
  };

  const applySugerencia = () => {
    if (!open.sugerencia) return;
    const applied = editor.commands.applyAnnotationSuggestion(
      open.id,
      open.sugerencia,
    );
    if (!applied) {
      // Multi-block range — refuse and tell the user.
      window.alert(
        "La sugerencia cruza varios bloques (párrafo/heading). Aplícala manualmente seleccionando el texto y reemplazándolo.",
      );
      return;
    }
    setOpen(null);
  };

  // Clamp the popover to the viewport. We anchor below the span; if
  // there's no room we flip above.
  const W = 320;
  const margin = 8;
  let left = open.rect.left + open.rect.width / 2 - W / 2;
  left = Math.max(margin, Math.min(window.innerWidth - W - margin, left));
  const below = open.rect.bottom + 6;
  const fitsBelow = below + 220 < window.innerHeight;
  const top = fitsBelow ? below : Math.max(margin, open.rect.top - 220);

  return (
    <div
      data-anno-popover
      style={{ position: "fixed", left, top, width: W, zIndex: 70 }}
      className="bg-paper-2 border border-rule-2 rounded-[10px] shadow-(--shadow-pop) overflow-hidden"
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-rule-1 bg-paper">
        <Avatar
          sage={open.sage}
          initials={SAGE_INITIALS[open.sage]}
          size={20}
          title={SAGE_NAME[open.sage]}
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-2 font-semibold">
          {SAGE_NAME[open.sage]} · {PASE_LABEL[open.pase] ?? open.pase}
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5">
          <span
            className={`w-[7px] h-[7px] rounded-full ${
              SEV_TONE[open.severidad] ?? "bg-ink-3"
            }`}
          />
          <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-3">
            {open.severidad}
          </span>
        </span>
      </div>

      <div className="px-3 py-2.5 text-[13px] leading-[1.5] font-serif text-ink-1">
        {open.criterioId
          ? (() => {
              const c = rubrica?.criterios.find((x) => x.id === open.criterioId);
              return c ? (
                <div
                  className="inline-flex items-center gap-1 px-1.5 py-[1px] rounded bg-paper border border-rule-2 mb-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-3"
                  data-testid="popover-criterio-chip"
                >
                  <span>criterio</span>
                  <span className="text-ink-1 normal-case tracking-normal font-sans font-medium">
                    {c.nombre}
                  </span>
                </div>
              ) : null;
            })()
          : null}
        <div>{open.mensaje}</div>
      </div>

      {open.sugerencia ? (
        <div className="px-3 py-2.5 border-t border-rule-1 bg-paper">
          <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-3 mb-1">
            Sugerencia
          </div>
          <div className="font-serif text-[12.5px] leading-[1.5] text-ink-2 italic">
            {open.sugerencia}
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-3 px-3 py-2 border-t border-rule-1 bg-paper-2">
        <button
          type="button"
          onClick={dismiss}
          data-testid="popover-dismiss"
          className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 hover:text-seal cursor-pointer"
        >
          Descartar
        </button>
        {open.sugerencia ? (
          <button
            type="button"
            onClick={applySugerencia}
            data-testid="popover-apply"
            title="Reemplaza el texto subrayado con la sugerencia del sabio"
            className="font-mono text-[10px] uppercase tracking-[0.14em] font-semibold text-paper bg-ink-1 hover:bg-ink-2 px-2.5 py-1 rounded cursor-pointer"
          >
            Aplicar sugerencia
          </button>
        ) : null}
      </div>
    </div>
  );
}
