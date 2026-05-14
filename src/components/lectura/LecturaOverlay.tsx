"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useStore } from "@/lib/store";
import { interrogate, parsePreguntas } from "@/lib/agents";
import type { Interrogatorio, Sage } from "@/lib/storage/types";

/**
 * Overlay: paste a text, ask a sage to interrogate it, watch the
 * questions stream in, and (optionally) save them onto the current
 * essay.
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
        className="w-[900px] max-w-[95vw] max-h-[90vh] bg-paper-2 border border-rule-2 rounded-[14px] shadow-(--shadow-pop) overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <LecturaInner
          onClose={() => setOverlay(null)}
          onSave={(entry) => {
            addInterrogatorio(entry);
            setOverlay(null);
          }}
          essayTitle={current?.title}
        />
      </div>
    </div>
  );
}

function LecturaInner({
  onClose,
  onSave,
  essayTitle,
}: {
  onClose: () => void;
  onSave: (entry: Interrogatorio) => void;
  essayTitle?: string;
}) {
  const [text, setText] = useState("");
  const [sage] = useState<Sage>("em"); // EM only for now; expand in session 5
  const [streaming, setStreaming] = useState<string>("");
  const [phase, setPhase] = useState<"idle" | "running" | "done" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [costUsd, setCostUsd] = useState<number | undefined>(undefined);
  const streamRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll while tokens stream in.
  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [streaming]);

  const start = async () => {
    if (text.trim().length === 0 || phase === "running") return;
    setPhase("running");
    setStreaming("");
    setError(null);
    setCostUsd(undefined);

    try {
      const { result, costUsd } = await interrogate({
        sage,
        text,
        onUpdate: (u) => {
          if (u.kind === "token") {
            setStreaming((prev) => prev + u.delta);
          }
        },
      });
      setStreaming(result);
      setCostUsd(costUsd);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  };

  const save = () => {
    const preguntas = parsePreguntas(streaming);
    onSave({
      sage,
      preguntas,
      generadoEn: new Date().toISOString(),
      costoUsd: costUsd,
    });
  };

  return (
    <>
      <header className="flex items-center justify-between px-6 py-4 border-b border-rule-1 bg-paper-2">
        <div className="flex items-center gap-3">
          <Avatar sage={sage} initials="EM" size={32} title="El Empirista" />
          <div>
            <h2 className="font-serif italic text-[20px] text-ink-1 leading-none">
              Interrogatorio — el Empirista
            </h2>
            <p className="font-mono text-[10px] text-ink-3 mt-1 tracking-[0.04em]">
              {essayTitle ? `Sobre · ${essayTitle}` : "Sin ensayo abierto"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-8 h-8 grid place-items-center rounded text-ink-3 hover:bg-paper-3 hover:text-ink-1 cursor-pointer"
          title="Cerrar"
        >
          ×
        </button>
      </header>

      <div className="flex-1 grid grid-cols-2 min-h-0">
        {/* Left: input text */}
        <div className="flex flex-col gap-2 p-6 border-r border-rule-1 min-h-0">
          <label className="font-mono text-[10px] font-semibold text-ink-3 uppercase tracking-[0.14em]">
            Texto a interrogar
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Pega aquí un fragmento de tu ensayo, o de un paper que estés leyendo…"
            className="flex-1 min-h-[300px] resize-none p-3 rounded-[8px] border border-rule-2 bg-paper text-ink-1 font-serif text-[14px] leading-[1.55] outline-none focus:border-rule-3"
            disabled={phase === "running"}
          />
          <div className="flex items-center justify-between mt-1">
            <span className="font-mono text-[11px] text-ink-3 tracking-[0.04em]">
              {text.length.toLocaleString("es")} caracteres
            </span>
            <Button
              variant="dark"
              onClick={start}
              disabled={phase === "running" || text.trim().length === 0}
            >
              {phase === "running" ? "El Empirista piensa…" : "Interrogar"}
            </Button>
          </div>
        </div>

        {/* Right: streaming output */}
        <div className="flex flex-col p-6 min-h-0">
          <label className="font-mono text-[10px] font-semibold text-ink-3 uppercase tracking-[0.14em] mb-2">
            Preguntas
          </label>
          <div
            ref={streamRef}
            className="flex-1 overflow-y-auto thin-scroll rounded-[8px] border border-rule-1 bg-paper p-4 font-serif text-[14px] leading-[1.6] text-ink-1 whitespace-pre-wrap"
          >
            {phase === "idle" ? (
              <span className="font-serif italic text-ink-3">
                Las cinco preguntas del Empirista aparecerán aquí, una a una.
              </span>
            ) : phase === "error" ? (
              <div>
                <span className="font-mono text-[11px] text-err tracking-[0.04em]">
                  error · {error}
                </span>
              </div>
            ) : (
              <PreguntasView raw={streaming} live={phase === "running"} />
            )}
          </div>

          {phase === "done" ? (
            <div className="mt-3 flex items-center justify-between">
              <span className="font-mono text-[11px] text-ink-3 tracking-[0.04em]">
                {costUsd !== undefined
                  ? `costo · $${costUsd.toFixed(4)}`
                  : "guardado contra agent sdk credit"}
              </span>
              <Button variant="seal" onClick={save}>
                Guardar al ensayo
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

function PreguntasView({ raw, live }: { raw: string; live: boolean }) {
  // While streaming, just show the raw text + a cursor caret.
  if (live) {
    return (
      <>
        {raw}
        <span className="inline-block w-[8px] h-[14px] bg-ink-2 ml-[2px] align-[-2px] animate-pulse" />
      </>
    );
  }
  const preguntas = parsePreguntas(raw);
  return (
    <ol className="list-none p-0 m-0">
      {preguntas.map((p, i) => (
        <li key={i} className="flex gap-3 mb-3 last:mb-0">
          <span className="font-mono text-[11px] text-em font-semibold mt-1">
            {String(i + 1).padStart(2, "0")}
          </span>
          <span>{p}</span>
        </li>
      ))}
    </ol>
  );
}
