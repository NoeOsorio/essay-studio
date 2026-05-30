"use client";

import { useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useStore } from "@/lib/store";
import { interrogate, parsePreguntas } from "@/lib/agents";
import { ALL_SAGES, defaultSagesForMode } from "@/lib/sages";
import type {
  EssayLanguage,
  EssayMode,
  Fuente,
  Interrogatorio,
  Sage,
} from "@/lib/storage/types";

/** Static per-sage descriptors used by the overlay header + selector. */
const SAGE_META: Record<
  Sage,
  { initials: string; name: string; tagline: string }
> = {
  em: {
    initials: "EM",
    name: "el Empirista",
    tagline: "Calidad de la evidencia, métodos, replicación",
  },
  sis: {
    initials: "SI",
    name: "el Sistémico",
    tagline: "Loops, niveles, leverage points",
  },
  pra: {
    initials: "PR",
    name: "el Práctico",
    tagline: "¿Qué cambia el lunes? Aplicación real",
  },
  cri: {
    initials: "CR",
    name: "el Crítico",
    tagline: "Steelman, lo no dicho, análisis de poder",
  },
};

/**
 * Overlay: paste a text (or load a file), have one sage or the whole
 * council interrogate it, then pick the questions you want to keep
 * via checkboxes. Selected questions persist into the essay's
 * interrogatorios and land on the board as sage-coloured post-its.
 *
 * Council mode is selective by default: which sages run depends on
 * the essay mode (academico → EM/SI/CR, blog → SI/PR/CR). The user
 * can toggle individual sages via the avatar-checkboxes in the header.
 */
export function LecturaOverlay() {
  const overlay = useStore((s) => s.overlay);
  const setOverlay = useStore((s) => s.setOverlay);
  const addInterrogatorio = useStore((s) => s.addInterrogatorio);
  const current = useStore((s) => s.current);

  if (overlay !== "lectura") return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink-1/30 backdrop-blur-[2px]"
      onClick={() => setOverlay(null)}
    >
      <div
        className="w-[1080px] max-w-[96vw] max-h-[92vh] bg-paper-2 border border-rule-2 rounded-[14px] shadow-(--shadow-pop) overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <LecturaInner
          onClose={() => setOverlay(null)}
          onSave={(entries) => {
            for (const entry of entries) addInterrogatorio(entry);
            setOverlay(null);
          }}
          essayTitle={current?.title}
          essayMode={current?.mode ?? "academico"}
          essayLanguage={current?.language ?? "es"}
          fuentes={current?.fuentes ?? []}
        />
      </div>
    </div>
  );
}

type SagePane = {
  sage: Sage;
  phase: "idle" | "running" | "done" | "error";
  raw: string;
  error: string | null;
  costUsd?: number;
  /** Per-pregunta checkbox state, by question index, default true. */
  checked: Record<number, boolean>;
};

function makePane(sage: Sage): SagePane {
  return { sage, phase: "idle", raw: "", error: null, checked: {} };
}

function LecturaInner({
  onClose,
  onSave,
  essayTitle,
  essayMode,
  essayLanguage,
  fuentes,
}: {
  onClose: () => void;
  onSave: (entries: Interrogatorio[]) => void;
  essayTitle?: string;
  essayMode: EssayMode;
  essayLanguage: EssayLanguage;
  fuentes: Fuente[];
}) {
  const sage = useStore((s) => s.lecturaSage);
  const setLecturaSage = useStore((s) => s.setLecturaSage);
  const mode = useStore((s) => s.lecturaMode);
  const setLecturaMode = useStore((s) => s.setLecturaMode);
  const addFuente = useStore((s) => s.addFuente);
  const initialText = useStore.getState().lecturaPrefill;

  const [text, setText] = useState(initialText);
  const [activeFuenteId, setActiveFuenteId] = useState<string | null>(null);
  // Council-mode sage selection: defaults adapt to the essay mode
  // (academico → EM/SI/CR; blog → SI/PR/CR). Lives only in the modal
  // — each open reapplies the defaults.
  const [selectedSages, setSelectedSages] = useState<Sage[]>(() =>
    defaultSagesForMode(essayMode),
  );
  const [panes, setPanes] = useState<Record<Sage, SagePane>>({
    em: makePane("em"),
    sis: makePane("sis"),
    pra: makePane("pra"),
    cri: makePane("cri"),
  });

  // The set of sages whose stream we should render right now.
  //  - council mode → the user's selection (subset of the 4)
  //  - single mode  → the chosen one
  const activeSages: Sage[] = mode === "council" ? selectedSages : [sage];

  const anyRunning = activeSages.some((s) => panes[s].phase === "running");
  const anyDone = activeSages.some((s) => panes[s].phase === "done");

  const setPane = (s: Sage, patch: Partial<SagePane>) => {
    setPanes((prev) => ({ ...prev, [s]: { ...prev[s], ...patch } }));
  };

  const start = async () => {
    if (text.trim().length === 0 || anyRunning) return;

    // Reset the panes we're about to fill so a re-run replaces
    // previous output instead of stacking.
    setPanes((prev) => {
      const next = { ...prev };
      for (const s of activeSages) next[s] = { ...makePane(s), phase: "running" };
      return next;
    });

    await Promise.all(
      activeSages.map(async (s) => {
        try {
          const { result, costUsd } = await interrogate({
            sage: s,
            text,
            language: essayLanguage,
            onUpdate: (u) => {
              if (u.kind === "token") {
                setPanes((prev) => ({
                  ...prev,
                  [s]: { ...prev[s], raw: prev[s].raw + u.delta },
                }));
              }
            },
          });
          // Default every parsed question to checked.
          const preguntas = parsePreguntas(result);
          const checked: Record<number, boolean> = {};
          for (let i = 0; i < preguntas.length; i++) checked[i] = true;
          setPane(s, { phase: "done", raw: result, costUsd, checked });
        } catch (err) {
          setPane(s, {
            phase: "error",
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }),
    );
  };

  const save = () => {
    const entries: Interrogatorio[] = [];
    const materialize: { sage: Sage; preguntas: string[] }[] = [];
    const generadoEn = new Date().toISOString();

    for (const s of activeSages) {
      const pane = panes[s];
      if (pane.phase !== "done") continue;
      const all = parsePreguntas(pane.raw);
      const kept = all.filter((_, i) => pane.checked[i] !== false);
      if (kept.length === 0) continue;
      entries.push({
        sage: s,
        preguntas: kept,
        generadoEn,
        costoUsd: pane.costUsd,
      });
      materialize.push({ sage: s, preguntas: kept });
    }
    if (entries.length === 0) {
      onClose();
      return;
    }
    onSave(entries);

    // Materialize on the board. The board listener handles layout
    // (cascade for single sage, columns when multiple sages arrive
    // in the same dispatch).
    window.dispatchEvent(
      new CustomEvent("sage:materialize-preguntas", {
        detail: { batches: materialize },
      }),
    );
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".pdf") || lower.endsWith(".docx") || lower.endsWith(".doc")) {
      alert(
        "PDF / Word soon. Por ahora copia el texto al portapapeles y pégalo en el cuadro.",
      );
      return;
    }
    const buf = await file.text();
    setText(buf);
    // Persist into the essay's library so the user doesn't have to
    // re-upload next time. Pluma Roja also picks it up automatically.
    const fuente: Fuente = {
      id: crypto.randomUUID(),
      nombre: file.name.replace(/\.[^.]+$/, ""),
      contenido: buf,
      origen: "archivo",
      archivoNombre: file.name,
      agregadoEn: new Date().toISOString(),
    };
    addFuente(fuente);
    setActiveFuenteId(fuente.id);
  };

  const pickFuente = (f: Fuente) => {
    setText(f.contenido);
    setActiveFuenteId(f.id);
  };

  return (
    <>
      <header className="flex items-center justify-between px-6 py-4 border-b border-rule-1 bg-paper-2">
        <div className="flex items-center gap-4 min-w-0">
          <Avatar
            sage={mode === "single" ? sage : "em"}
            initials={mode === "single" ? SAGE_META[sage].initials : "C"}
            size={36}
            title={mode === "single" ? SAGE_META[sage].name : "El consejo"}
          />
          <div className="min-w-0">
            <h2 className="font-serif italic text-[20px] text-ink-1 leading-tight truncate">
              {mode === "single"
                ? `Interrogatorio — ${SAGE_META[sage].name}`
                : "Interrogatorio — el consejo"}
            </h2>
            <p className="font-mono text-[10px] text-ink-3 mt-1 tracking-[0.04em] truncate">
              {mode === "single"
                ? SAGE_META[sage].tagline
                : `${selectedSages.length} ${
                    selectedSages.length === 1 ? "voz" : "voces"
                  } sobre el mismo texto`}
              {essayTitle ? ` · sobre ${essayTitle}` : ""}
            </p>
          </div>
        </div>

        <ModeAndSageControls
          mode={mode}
          sage={sage}
          selectedSages={selectedSages}
          disabled={anyRunning}
          onModeChange={(m) => setLecturaMode(m)}
          onSageChange={(s) => setLecturaSage(s)}
          onSagesChange={(next) => setSelectedSages(next)}
        />

        <button
          type="button"
          onClick={onClose}
          className="w-8 h-8 grid place-items-center rounded text-ink-3 hover:bg-paper-3 hover:text-ink-1 cursor-pointer flex-none"
          title="Cerrar"
        >
          ×
        </button>
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-[360px_1fr]">
        {/* Left: source */}
        <div className="flex flex-col gap-2 p-6 border-r border-rule-1 min-h-0">
          <div className="flex items-center justify-between">
            <label className="font-mono text-[10px] font-semibold text-ink-3 uppercase tracking-[0.14em]">
              Fuente
            </label>
            <FileInput onFile={onFile} disabled={anyRunning} />
          </div>
          {fuentes.length > 0 ? (
            <FuenteChipRow
              fuentes={fuentes}
              activeId={activeFuenteId}
              disabled={anyRunning}
              onPick={pickFuente}
            />
          ) : null}
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              // User edited the loaded fuente → it's no longer "the
              // active fuente as-is", so unhighlight the chip.
              if (activeFuenteId) setActiveFuenteId(null);
            }}
            placeholder={
              fuentes.length > 0
                ? "Pega un fragmento, o elige una fuente arriba."
                : "Pega aquí un fragmento, o sube un .txt / .md desde el botón."
            }
            className="flex-1 min-h-[280px] resize-none p-3 rounded-[8px] border border-rule-2 bg-paper text-ink-1 font-serif text-[14px] leading-[1.55] outline-none focus:border-rule-3"
            disabled={anyRunning}
          />
          <div className="flex items-center justify-between mt-1">
            <span className="font-mono text-[11px] text-ink-3 tracking-[0.04em]">
              {text.length.toLocaleString("es")} caracteres
            </span>
            <Button
              variant="dark"
              onClick={start}
              disabled={
                anyRunning ||
                text.trim().length === 0 ||
                (mode === "council" && selectedSages.length === 0)
              }
              data-testid="lectura-interrogar"
            >
              {anyRunning
                ? mode === "council"
                  ? "El consejo piensa…"
                  : `${SAGE_META[sage].name.replace(/^el /, "El ")} piensa…`
                : "Interrogar"}
            </Button>
          </div>
        </div>

        {/* Right: per-sage output.
            Layout adapts to the number of selected sages:
              1 → single column (full width)
              2 → two columns
              3 → three columns
              4 → 2×2 grid (preserves the original council layout) */}
        <div
          className={`min-h-0 grid gap-3 p-6 ${
            activeSages.length === 4
              ? "grid-cols-2 grid-rows-2"
              : activeSages.length === 3
                ? "grid-cols-3"
                : activeSages.length === 2
                  ? "grid-cols-2"
                  : "grid-cols-1"
          }`}
        >
          {activeSages.map((s) => (
            <SagePaneView
              key={s}
              pane={panes[s]}
              onToggle={(idx) =>
                setPanes((prev) => ({
                  ...prev,
                  [s]: {
                    ...prev[s],
                    checked: {
                      ...prev[s].checked,
                      [idx]: !(prev[s].checked[idx] ?? true),
                    },
                  },
                }))
              }
            />
          ))}
        </div>
      </div>

      {anyDone ? (
        <footer className="flex items-center justify-between px-6 py-3 border-t border-rule-1 bg-paper-2">
          <span className="font-mono text-[11px] text-ink-3 tracking-[0.04em]">
            {summarize(panes, activeSages)}
          </span>
          <Button variant="seal" onClick={save} disabled={anyRunning}>
            Guardar seleccionadas
          </Button>
        </footer>
      ) : null}
    </>
  );
}

function ModeAndSageControls({
  mode,
  sage,
  selectedSages,
  disabled,
  onModeChange,
  onSageChange,
  onSagesChange,
}: {
  mode: "single" | "council";
  sage: Sage;
  selectedSages: Sage[];
  disabled: boolean;
  onModeChange: (m: "single" | "council") => void;
  onSageChange: (s: Sage) => void;
  onSagesChange: (next: Sage[]) => void;
}) {
  return (
    <div className="flex items-center gap-3 mx-4">
      <div
        role="tablist"
        aria-label="Modo de interrogación"
        className="inline-flex p-[3px] bg-paper-3 border border-rule-1 rounded-full"
      >
        <ModeTab
          label="Consejo"
          active={mode === "council"}
          onClick={() => onModeChange("council")}
          disabled={disabled}
        />
        <ModeTab
          label="Un sabio"
          active={mode === "single"}
          onClick={() => onModeChange("single")}
          disabled={disabled}
        />
      </div>

      {mode === "single" ? (
        <div
          className="flex items-center gap-1.5"
          role="tablist"
          aria-label="Elegir sabio"
        >
          {ALL_SAGES.map((s) => {
            const active = s === sage;
            const m = SAGE_META[s];
            return (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={m.name}
                title={m.name}
                onClick={() => onSageChange(s)}
                disabled={disabled}
                className={`p-0.5 rounded-full cursor-pointer transition-all ${
                  active
                    ? "ring-2 ring-ink-2 ring-offset-1 ring-offset-paper-2"
                    : "opacity-60 hover:opacity-100"
                } disabled:cursor-not-allowed disabled:opacity-40`}
              >
                <Avatar sage={s} initials={m.initials} size={24} title={m.name} />
              </button>
            );
          })}
        </div>
      ) : (
        <div
          className="flex items-center gap-1.5"
          aria-label="Sabios que participan"
          data-testid="lectura-sage-selector"
        >
          {ALL_SAGES.map((s) => {
            const active = selectedSages.includes(s);
            const m = SAGE_META[s];
            return (
              <button
                key={s}
                type="button"
                role="checkbox"
                aria-checked={active}
                aria-label={`${active ? "Desactivar" : "Activar"} ${m.name}`}
                title={`${active ? "Desactivar" : "Activar"} ${m.name}`}
                onClick={() => {
                  if (active) {
                    onSagesChange(selectedSages.filter((x) => x !== s));
                  } else {
                    // Re-insert in canonical EM/SI/PR/CR order so the
                    // UI ordering is stable as the user toggles.
                    onSagesChange(
                      ALL_SAGES.filter(
                        (x) => x === s || selectedSages.includes(x),
                      ),
                    );
                  }
                }}
                disabled={disabled}
                data-testid={`lectura-sage-toggle-${s}`}
                data-active={active}
                className={`p-0.5 rounded-full cursor-pointer transition-all ${
                  active
                    ? "ring-2 ring-ink-2 ring-offset-1 ring-offset-paper-2"
                    : "opacity-35 hover:opacity-70 grayscale"
                } disabled:cursor-not-allowed disabled:opacity-25`}
              >
                <Avatar sage={s} initials={m.initials} size={24} title={m.name} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ModeTab({
  label,
  active,
  onClick,
  disabled,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      disabled={disabled}
      className={`h-[24px] px-3 rounded-full text-[11.5px] font-medium font-sans cursor-pointer transition-all ${
        active
          ? "bg-paper text-ink-1 shadow-(--shadow-soft)"
          : "bg-transparent text-ink-3 hover:text-ink-1"
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {label}
    </button>
  );
}

function FuenteChipRow({
  fuentes,
  activeId,
  disabled,
  onPick,
}: {
  fuentes: Fuente[];
  activeId: string | null;
  disabled: boolean;
  onPick: (f: Fuente) => void;
}) {
  return (
    <div
      className="flex flex-wrap gap-1.5 pb-1"
      data-testid="lectura-fuente-chips"
    >
      {fuentes.map((f) => {
        const active = f.id === activeId;
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => onPick(f)}
            disabled={disabled}
            title={f.cita ?? f.nombre}
            data-testid="lectura-fuente-chip"
            className={`inline-flex items-center gap-1 px-2 h-[22px] rounded-full border font-mono text-[10.5px] tracking-[0.04em] cursor-pointer transition-all ${
              active
                ? "border-rule-3 bg-paper text-ink-1 shadow-(--shadow-soft)"
                : "border-rule-2 bg-paper-3 text-ink-3 hover:text-ink-1 hover:bg-paper-2"
            } disabled:cursor-not-allowed disabled:opacity-40`}
          >
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] opacity-70">
              {f.origen === "archivo" ? "doc" : "txt"}
            </span>
            <span className="max-w-[180px] truncate">
              {f.nombre || "sin título"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function FileInput({
  onFile,
  disabled,
}: {
  onFile: (file: File | null) => void;
  disabled: boolean;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept=".txt,.md,text/plain,text/markdown"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          void onFile(f);
          if (ref.current) ref.current.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={disabled}
        className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3 hover:text-ink-1 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
      >
        Subir .txt / .md
      </button>
    </>
  );
}

function SagePaneView({
  pane,
  onToggle,
}: {
  pane: SagePane;
  onToggle: (idx: number) => void;
}) {
  const meta = SAGE_META[pane.sage];
  return (
    <div className="flex flex-col rounded-[8px] border border-rule-1 bg-paper min-h-0 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-rule-1 bg-paper-2 flex-none">
        <Avatar
          sage={pane.sage}
          initials={meta.initials}
          size={20}
          title={meta.name}
        />
        <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-2">
          {meta.name}
        </span>
        <span className="ml-auto font-mono text-[9px] text-ink-3 tracking-[0.06em]">
          {phaseLabel(pane)}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto thin-scroll p-3 text-[13px] leading-[1.55] font-serif text-ink-1">
        <PaneBody pane={pane} onToggle={onToggle} />
      </div>
    </div>
  );
}

function PaneBody({
  pane,
  onToggle,
}: {
  pane: SagePane;
  onToggle: (idx: number) => void;
}) {
  if (pane.phase === "idle") {
    return (
      <span className="font-serif italic text-ink-3 text-[12px]">
        En espera.
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
      <span className="whitespace-pre-wrap">
        {pane.raw}
        <span className="inline-block w-[7px] h-[12px] bg-ink-2 ml-[2px] align-[-1px] animate-pulse" />
      </span>
    );
  }
  // done — parsed questions with checkboxes
  const preguntas = parsePreguntas(pane.raw);
  return (
    <ol className="list-none p-0 m-0">
      {preguntas.map((p, i) => {
        const isOn = pane.checked[i] !== false;
        return (
          <li key={i} className="flex gap-2 mb-2 last:mb-0 items-start">
            <input
              type="checkbox"
              checked={isOn}
              onChange={() => onToggle(i)}
              aria-label={`Pregunta ${i + 1}`}
              className="mt-[3px] accent-ink-1 cursor-pointer"
            />
            <span className={isOn ? "" : "text-ink-3 line-through opacity-60"}>
              {p}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function phaseLabel(pane: SagePane): string {
  switch (pane.phase) {
    case "idle":
      return "espera";
    case "running":
      return "pensando…";
    case "done":
      return pane.costUsd !== undefined
        ? `done · $${pane.costUsd.toFixed(4)}`
        : "done";
    case "error":
      return "error";
  }
}

function summarize(
  panes: Record<Sage, SagePane>,
  active: Sage[],
): string {
  let kept = 0;
  let total = 0;
  for (const s of active) {
    const pane = panes[s];
    if (pane.phase !== "done") continue;
    const all = parsePreguntas(pane.raw);
    total += all.length;
    for (let i = 0; i < all.length; i++) {
      if (pane.checked[i] !== false) kept += 1;
    }
  }
  return `${kept} de ${total} preguntas seleccionadas`;
}
