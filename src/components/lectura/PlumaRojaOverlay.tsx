"use client";

import { useMemo, useState } from "react";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useStore } from "@/lib/store";
import {
  buildAnotacion,
  critique,
  parseAnotaciones,
  type RawAnotacion,
} from "@/lib/agents";
import { defaultPasesForMode } from "@/lib/sages";
import type {
  Anotacion,
  Criterio,
  EssayLanguage,
  EssayMode,
  Fuente,
  Pase,
  Rubrica,
  Sage,
} from "@/lib/storage/types";

/** Static pase descriptors. Estilo's sage is dynamic on mode. */
const PASE_META: {
  pase: Pase;
  label: string;
  sage: (mode: EssayMode) => Sage;
  hint: string;
  /** When true, only included if the toggle is on AND mode=academico. */
  optional?: boolean;
}[] = [
  {
    pase: "coherencia",
    label: "Coherencia",
    sage: () => "sis",
    hint: "estructura, niveles, loops",
  },
  {
    pase: "estilo",
    label: "Estilo",
    // Académico → Empirista (rigor, evidencia); Blog → Práctico
    // (claridad, aterrizar). The persona that owns the register
    // adjusts with the mode of the essay.
    sage: (mode) => (mode === "blog" ? "pra" : "em"),
    hint: "registro, voz, precisión",
  },
  {
    pase: "argumento",
    label: "Argumento",
    sage: () => "cri",
    hint: "steelman, supuestos, retórica",
  },
  {
    pase: "apa",
    label: "APA",
    sage: () => "em",
    hint: "citas y referencias",
    optional: true,
  },
];

const SAGE_META: Record<Sage, { initials: string; name: string }> = {
  em: { initials: "EM", name: "el Empirista" },
  sis: { initials: "SI", name: "el Sistémico" },
  pra: { initials: "PR", name: "el Práctico" },
  cri: { initials: "CR", name: "el Crítico" },
};

const SEV_TONE: Record<"alta" | "media" | "baja", string> = {
  alta: "bg-seal",
  media: "bg-em",
  baja: "bg-sis",
};

type PasePane = {
  pase: Pase;
  sage: Sage;
  phase: "idle" | "running" | "done" | "error";
  raw: string;
  anotaciones: RawAnotacion[];
  /** Per-index checkbox state, default true. */
  checked: Record<number, boolean>;
  error: string | null;
  costUsd?: number;
};

function emptyPane(pase: Pase, sage: Sage): PasePane {
  return {
    pase,
    sage,
    phase: "idle",
    raw: "",
    anotaciones: [],
    checked: {},
    error: null,
  };
}

/**
 * Overlay that runs the three Pluma Roja passes (coherencia / estilo
 * / argumento) in parallel over the current essay's plain text and
 * lets the user pick which anotaciones to apply.
 */
export function PlumaRojaOverlay() {
  const overlay = useStore((s) => s.overlay);
  const setOverlay = useStore((s) => s.setOverlay);
  const current = useStore((s) => s.current);

  if (overlay !== "pluma") return null;
  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink-1/30 backdrop-blur-[2px]"
      onClick={() => setOverlay(null)}
      data-testid="pluma-overlay"
    >
      <div
        className="w-[1180px] max-w-[96vw] max-h-[92vh] bg-paper-2 border border-rule-2 rounded-[14px] shadow-(--shadow-pop) overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <PlumaInner
          mode={current.mode}
          language={current.language ?? "es"}
          rubrica={current.rubrica}
          fuentes={current.fuentes}
          essayTitle={current.title}
          essayText={extractPlainText(current.content)}
          onClose={() => setOverlay(null)}
          onApply={(applied, pasadasCubiertas) => {
            window.dispatchEvent(
              new CustomEvent("pluma-roja:apply", {
                detail: { anotaciones: applied, pasadasCubiertas },
              }),
            );
            setOverlay(null);
          }}
        />
      </div>
    </div>
  );
}

function PlumaInner({
  mode,
  language,
  rubrica,
  fuentes,
  essayTitle,
  essayText,
  onClose,
  onApply,
}: {
  mode: EssayMode;
  language: EssayLanguage;
  rubrica?: Rubrica;
  fuentes?: Fuente[];
  essayTitle: string;
  essayText: string;
  onClose: () => void;
  onApply: (anotaciones: Anotacion[], pasadasCubiertas: Pase[]) => void;
}) {
  // Which pasadas to run. Defaults adapt to the essay mode:
  //   academico → coherencia + estilo + argumento + APA
  //   blog      → coherencia + estilo + argumento  (APA n/a)
  // The user can toggle individual pasadas; state lives only in the
  // open modal (each fresh open reapplies the defaults).
  const [selectedPases, setSelectedPases] = useState<Pase[]>(() =>
    defaultPasesForMode(mode),
  );

  // The full set of pasadas the modal *could* offer for this mode.
  // APA is hidden entirely in blog (the persona is academico-only).
  const availablePases = useMemo<Pase[]>(
    () =>
      mode === "blog"
        ? ["coherencia", "estilo", "argumento"]
        : ["coherencia", "estilo", "argumento", "apa"],
    [mode],
  );

  const passes = useMemo(() => {
    const all = PASE_META.map((m) => ({ ...m, sageKey: m.sage(mode) }));
    return all.filter(
      (p) => availablePases.includes(p.pase) && selectedPases.includes(p.pase),
    );
  }, [mode, availablePases, selectedPases]);

  const [panes, setPanes] = useState<Record<Pase, PasePane>>(() => ({
    coherencia: emptyPane("coherencia", "sis"),
    estilo: emptyPane("estilo", mode === "blog" ? "pra" : "em"),
    argumento: emptyPane("argumento", "cri"),
    apa: emptyPane("apa", "em"),
  }));

  const criterios: Criterio[] | undefined = rubrica?.criterios;

  const anyRunning = passes.some((p) => panes[p.pase].phase === "running");
  const anyDone = passes.some((p) => panes[p.pase].phase === "done");

  const updatePane = (pase: Pase, patch: Partial<PasePane>) => {
    setPanes((prev) => ({ ...prev, [pase]: { ...prev[pase], ...patch } }));
  };

  const start = async () => {
    if (essayText.trim().length === 0 || anyRunning) return;

    setPanes((prev) => {
      const next = { ...prev };
      for (const p of passes) {
        next[p.pase] = {
          ...emptyPane(p.pase, p.sageKey),
          phase: "running",
        };
      }
      return next;
    });

    await Promise.all(
      passes.map(async (p) => {
        try {
          const { result, costUsd } = await critique({
            sage: p.sageKey,
            pase: p.pase,
            text: essayText,
            rubrica: criterios,
            fuentes,
            language,
            onUpdate: (u) => {
              if (u.kind === "token") {
                setPanes((prev) => ({
                  ...prev,
                  [p.pase]: {
                    ...prev[p.pase],
                    raw: prev[p.pase].raw + u.delta,
                  },
                }));
              }
            },
          });
          const anotaciones = parseAnotaciones(result);
          const checked: Record<number, boolean> = {};
          for (let i = 0; i < anotaciones.length; i++) checked[i] = true;
          updatePane(p.pase, {
            phase: "done",
            raw: result,
            anotaciones,
            checked,
            costUsd,
          });
        } catch (err) {
          updatePane(p.pase, {
            phase: "error",
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }),
    );
  };

  const apply = () => {
    const generadoEn = new Date().toISOString();
    const out: Anotacion[] = [];
    for (const p of passes) {
      const pane = panes[p.pase];
      if (pane.phase !== "done") continue;
      pane.anotaciones.forEach((raw, i) => {
        if (pane.checked[i] === false) return;
        out.push(buildAnotacion(raw, p.sageKey, p.pase, generadoEn, criterios));
      });
    }
    // Always notify — even with 0 anotaciones. That's a legitimate
    // outcome ("the council found nothing to flag") and the Scorebar
    // needs to distinguish it from "never evaluated".
    onApply(
      out,
      passes.filter((p) => panes[p.pase].phase === "done").map((p) => p.pase),
    );
  };

  return (
    <>
      <header className="flex items-center justify-between px-6 py-4 border-b border-rule-1 bg-paper-2">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-9 h-9 rounded-full bg-seal text-paper grid place-items-center font-serif italic text-[16px] flex-none">
            ✎
          </div>
          <div className="min-w-0">
            <h2 className="font-serif italic text-[20px] text-ink-1 leading-tight truncate">
              Evaluar — {essayTitle || "sin título"}
            </h2>
            <p className="font-mono text-[10px] text-ink-3 mt-1 tracking-[0.04em]">
              {selectedPases.length === 0
                ? "Sin pasadas seleccionadas"
                : `${selectedPases.length} ${
                    selectedPases.length === 1 ? "pasada" : "pasadas"
                  } en paralelo sobre el ensayo completo.`}{" "}
              {essayText.length.toLocaleString("es")} caracteres ·{" "}
              {wordCount(essayText)} palabras
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {criterios && criterios.length > 0 ? (
            <span
              className="inline-flex items-center gap-1.5 px-2 h-[22px] rounded-full border border-rule-2 bg-paper font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-3"
              title={`Aplicando rúbrica con ${criterios.length} criterios`}
              data-testid="pluma-rubrica-indicator"
            >
              <span className="w-[7px] h-[7px] rounded-full bg-sis" />
              Rúbrica · {criterios.length}
            </span>
          ) : null}
          {fuentes && fuentes.length > 0 ? (
            <span
              className="inline-flex items-center gap-1.5 px-2 h-[22px] rounded-full border border-rule-2 bg-paper font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-3"
              title={`Inyectando ${fuentes.length} fuentes al consejo`}
              data-testid="pluma-fuentes-indicator"
            >
              <span className="w-[7px] h-[7px] rounded-full bg-em" />
              Fuentes · {fuentes.length}
            </span>
          ) : null}
          <Button
            variant="dark"
            onClick={start}
            disabled={
              anyRunning ||
              essayText.trim().length === 0 ||
              selectedPases.length === 0
            }
            data-testid="pluma-start"
          >
            {anyRunning ? "El consejo revisa…" : anyDone ? "Volver a revisar" : "Iniciar revisión"}
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 grid place-items-center rounded text-ink-3 hover:bg-paper-3 hover:text-ink-1 cursor-pointer flex-none"
            title="Cerrar"
          >
            ×
          </button>
        </div>
      </header>

      <PaseSelector
        available={availablePases}
        selected={selectedPases}
        getSageFor={(p) => PASE_META.find((m) => m.pase === p)!.sage(mode)}
        disabled={anyRunning}
        onChange={(next) => setSelectedPases(next)}
      />

      <div
        className="flex-1 min-h-0 grid gap-3 p-6 overflow-hidden"
        style={{
          gridTemplateColumns:
            passes.length > 0
              ? `repeat(${passes.length}, minmax(0, 1fr))`
              : "1fr",
        }}
      >
        {passes.length === 0 ? (
          <div className="col-span-full grid place-items-center text-ink-3 font-serif italic text-[13px] py-12">
            Selecciona al menos una pasada arriba para empezar.
          </div>
        ) : (
          passes.map((p) => (
            <PasePaneView
              key={p.pase}
              label={p.label}
              hint={p.hint}
              pane={panes[p.pase]}
              criterios={criterios}
              onToggle={(idx) =>
                setPanes((prev) => ({
                  ...prev,
                  [p.pase]: {
                    ...prev[p.pase],
                    checked: {
                      ...prev[p.pase].checked,
                      [idx]: !(prev[p.pase].checked[idx] ?? true),
                    },
                  },
                }))
              }
            />
          ))
        )}
      </div>

      {anyDone ? (
        <footer className="flex items-center justify-between px-6 py-3 border-t border-rule-1 bg-paper-2">
          <span className="font-mono text-[11px] text-ink-3 tracking-[0.04em]">
            {summarize(panes, passes)}
          </span>
          <Button
            variant="seal"
            onClick={apply}
            disabled={anyRunning}
            data-testid="pluma-apply"
          >
            Aplicar al ensayo
          </Button>
        </footer>
      ) : null}
    </>
  );
}

function PaseSelector({
  available,
  selected,
  getSageFor,
  disabled,
  onChange,
}: {
  available: Pase[];
  selected: Pase[];
  getSageFor: (p: Pase) => Sage;
  disabled: boolean;
  onChange: (next: Pase[]) => void;
}) {
  return (
    <div
      className="flex items-center gap-2 px-6 py-2.5 border-b border-rule-1 bg-paper-3"
      data-testid="pluma-pase-selector"
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 mr-1">
        Pasadas
      </span>
      {available.map((p) => {
        const meta = PASE_META.find((m) => m.pase === p)!;
        const sage = getSageFor(p);
        const active = selected.includes(p);
        return (
          <button
            key={p}
            type="button"
            role="checkbox"
            aria-checked={active}
            disabled={disabled}
            onClick={() => {
              if (active) {
                onChange(selected.filter((x) => x !== p));
              } else {
                // Re-insert in the canonical pasada order so the UI
                // stays stable as the user toggles.
                onChange(available.filter((x) => x === p || selected.includes(x)));
              }
            }}
            title={`${active ? "Desactivar" : "Activar"} pasada ${meta.label} (${SAGE_META[sage].name})`}
            data-testid={`pluma-pase-toggle-${p}`}
            data-active={active}
            className={`inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-full border font-mono text-[10.5px] uppercase tracking-[0.12em] cursor-pointer transition-all ${
              active
                ? "border-rule-3 bg-paper text-ink-1 shadow-(--shadow-soft)"
                : "border-rule-2 bg-transparent text-ink-3 hover:text-ink-1 hover:bg-paper-2 opacity-70"
            } disabled:cursor-not-allowed disabled:opacity-40`}
          >
            <Avatar
              sage={sage}
              initials={SAGE_META[sage].initials}
              size={16}
              title={SAGE_META[sage].name}
            />
            <span className="normal-case tracking-normal font-sans text-[12px] font-medium">
              {meta.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PasePaneView({
  label,
  hint,
  pane,
  criterios,
  onToggle,
}: {
  label: string;
  hint: string;
  pane: PasePane;
  criterios?: Criterio[];
  onToggle: (idx: number) => void;
}) {
  const meta = SAGE_META[pane.sage];
  return (
    <div
      className="flex flex-col rounded-[8px] border border-rule-1 bg-paper min-h-0 overflow-hidden"
      data-testid={`pluma-pase-${pane.pase}`}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-rule-1 bg-paper-2 flex-none">
        <Avatar
          sage={pane.sage}
          initials={meta.initials}
          size={20}
          title={meta.name}
        />
        <div className="flex flex-col leading-tight">
          <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink-2">
            {label}
          </span>
          <span className="font-mono text-[8.5px] text-ink-3 tracking-[0.04em]">
            {meta.name} · {hint}
          </span>
        </div>
        <span className="ml-auto font-mono text-[9px] text-ink-3 tracking-[0.06em]">
          {phaseLabel(pane)}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto thin-scroll p-3 text-[13px] leading-[1.5] font-serif text-ink-1">
        <PaneBody pane={pane} criterios={criterios} onToggle={onToggle} />
      </div>
    </div>
  );
}

function PaneBody({
  pane,
  criterios,
  onToggle,
}: {
  pane: PasePane;
  criterios?: Criterio[];
  onToggle: (idx: number) => void;
}) {
  if (pane.phase === "idle") {
    return (
      <span className="font-serif italic text-ink-3 text-[12px]">
        En espera. Pulsa “Iniciar revisión”.
      </span>
    );
  }
  if (pane.phase === "error") {
    return (
      <span className="font-mono text-[11px] text-err tracking-[0.04em]">
        error · {pane.error ?? "desconocido"}
      </span>
    );
  }
  if (pane.phase === "running") {
    return (
      <span className="font-mono text-[10.5px] text-ink-3 tracking-[0.04em] whitespace-pre-wrap break-words">
        {pane.raw}
        <span className="inline-block w-[7px] h-[12px] bg-ink-2 ml-[2px] align-[-1px] animate-pulse" />
      </span>
    );
  }
  if (pane.anotaciones.length === 0) {
    return (
      <span className="font-serif italic text-ink-3 text-[12.5px]">
        Sin anotaciones en esta pasada.
      </span>
    );
  }
  return (
    <ul className="list-none p-0 m-0 flex flex-col gap-2">
      {pane.anotaciones.map((a, i) => {
        const isOn = pane.checked[i] !== false;
        const criterio =
          a.criterioId && criterios
            ? criterios.find((c) => c.id === a.criterioId)
            : undefined;
        return (
          <li
            key={i}
            className={`p-2 rounded-[6px] border border-rule-2 bg-paper-2 ${
              isOn ? "" : "opacity-50"
            }`}
            data-testid="pluma-anotacion"
          >
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={isOn}
                onChange={() => onToggle(i)}
                aria-label={`Anotación ${i + 1}`}
                className="mt-[3px] accent-ink-1 cursor-pointer"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                  <span
                    className={`w-[7px] h-[7px] rounded-full ${SEV_TONE[a.severidad]}`}
                  />
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-3">
                    {a.severidad}
                  </span>
                  {criterio ? (
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-[1px] rounded bg-paper border border-rule-2 font-mono text-[8.5px] uppercase tracking-[0.12em] text-ink-3"
                      title={criterio.descripcion}
                      data-testid="anotacion-criterio"
                    >
                      <span>criterio</span>
                      <span className="text-ink-1 normal-case tracking-normal font-sans font-medium">
                        {criterio.nombre}
                      </span>
                    </span>
                  ) : null}
                </div>
                <div className="font-serif italic text-[11.5px] text-ink-2 mb-1.5 leading-snug border-l-2 border-rule-2 pl-2">
                  “{a.cita}”
                </div>
                <div className="text-[12.5px] leading-[1.5] text-ink-1">
                  {a.mensaje}
                </div>
                {a.reemplazo ? (
                  <div className="mt-1.5 pt-1.5 border-t border-rule-1">
                    <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-3 mb-0.5">
                      Reemplazar por
                    </div>
                    <div className="font-serif text-[12px] text-ink-1 leading-[1.45]">
                      “{a.reemplazo}”
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function phaseLabel(pane: PasePane): string {
  switch (pane.phase) {
    case "idle":
      return "espera";
    case "running":
      return "pensando…";
    case "done":
      return pane.costUsd !== undefined
        ? `${pane.anotaciones.length} · $${pane.costUsd.toFixed(4)}`
        : `${pane.anotaciones.length}`;
    case "error":
      return "error";
  }
}

function summarize(
  panes: Record<Pase, PasePane>,
  passes: { pase: Pase }[],
): string {
  let kept = 0;
  let total = 0;
  for (const p of passes) {
    const pane = panes[p.pase];
    if (pane.phase !== "done") continue;
    total += pane.anotaciones.length;
    for (let i = 0; i < pane.anotaciones.length; i++) {
      if (pane.checked[i] !== false) kept += 1;
    }
  }
  return `${kept} de ${total} anotaciones seleccionadas`;
}

function wordCount(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

/** Flatten a TipTap JSON document down to plain text for the sages. */
function extractPlainText(content: unknown): string {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const n = node as { type?: string; text?: string; content?: unknown[] };
    if (typeof n.text === "string") {
      out.push(n.text);
    }
    if (Array.isArray(n.content)) {
      for (const child of n.content) walk(child);
      // Block-level boundary → newline so paragraphs stay separated in
      // the prompt sent to the sage.
      if (n.type && BLOCK_NODES.has(n.type)) out.push("\n");
    }
  };
  walk(content);
  return out
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const BLOCK_NODES = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "bulletList",
  "orderedList",
  "listItem",
  "codeBlock",
  "horizontalRule",
]);
