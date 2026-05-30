"use client";

import { useRef } from "react";

import { Button } from "@/components/ui/Button";
import { useStore } from "@/lib/store";
import type { Fuente } from "@/lib/storage/types";

/**
 * Library of sources for the current essay. Stored on the essay so
 * they persist across sessions and are available to both Lectura
 * (pick one to interrogate) and Pluma Roja (auto-injected as
 * REFERENCIAS DEL AUTOR in the critique prompt).
 *
 * No drafts — every keystroke commits via the debounced store action.
 */
export function FuentesOverlay() {
  const overlay = useStore((s) => s.overlay);
  const setOverlay = useStore((s) => s.setOverlay);
  const current = useStore((s) => s.current);
  const flush = useStore((s) => s.flush);
  const addFuente = useStore((s) => s.addFuente);
  const updateFuente = useStore((s) => s.updateFuente);
  const removeFuente = useStore((s) => s.removeFuente);

  if (overlay !== "fuentes") return null;
  if (!current) return null;

  const fuentes = current.fuentes ?? [];

  const close = () => {
    // Flush any pending debounced edit so we don't lose work.
    void flush();
    setOverlay(null);
  };

  const addEmpty = () => {
    addFuente({
      id: crypto.randomUUID(),
      nombre: "",
      contenido: "",
      origen: "texto",
      agregadoEn: new Date().toISOString(),
    });
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink-1/30 backdrop-blur-[2px]"
      onClick={close}
    >
      <div
        className="w-[860px] max-w-[96vw] max-h-[92vh] bg-paper-2 border border-rule-2 rounded-[14px] shadow-(--shadow-pop) overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        data-testid="fuentes-overlay"
      >
        <header className="flex items-center justify-between px-6 py-4 border-b border-rule-1 bg-paper-2">
          <div className="min-w-0">
            <h2 className="font-serif italic text-[20px] text-ink-1 leading-tight truncate">
              Fuentes — {current.title || "sin título"}
            </h2>
            <p className="font-mono text-[10px] text-ink-3 mt-1 tracking-[0.04em]">
              La biblioteca queda con el ensayo. El consejo la usa al revisar; en Lectura las eliges como punto de partida.
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            className="w-8 h-8 grid place-items-center rounded text-ink-3 hover:bg-paper-3 hover:text-ink-1 cursor-pointer flex-none"
            title="Cerrar"
          >
            ×
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto thin-scroll p-6 flex flex-col gap-3">
          {fuentes.length === 0 ? (
            <div className="text-center py-12 text-ink-3 font-serif italic text-[13px]">
              Sin fuentes aún. Añade los textos en que apoyas tu ensayo: capítulos, papers, notas. El consejo los usará para juzgar con contexto.
            </div>
          ) : (
            fuentes.map((f, i) => (
              <FuenteRow
                key={f.id}
                index={i}
                fuente={f}
                onChange={(patch) => updateFuente(f.id, patch)}
                onRemove={() => removeFuente(f.id)}
              />
            ))
          )}
        </div>

        <footer className="flex items-center justify-between px-6 py-3 border-t border-rule-1 bg-paper-2">
          <span className="font-mono text-[11px] text-ink-3 tracking-[0.04em]">
            {fuentes.length} fuente{fuentes.length === 1 ? "" : "s"}
            {fuentes.length > 0
              ? ` · ${totalWordCount(fuentes).toLocaleString("es")} palabras`
              : ""}
          </span>
          <div className="flex gap-2">
            <FileAddButton
              onAdd={(name, contenido) => {
                addFuente({
                  id: crypto.randomUUID(),
                  nombre: name.replace(/\.[^.]+$/, ""),
                  contenido,
                  origen: "archivo",
                  archivoNombre: name,
                  agregadoEn: new Date().toISOString(),
                });
              }}
            />
            <Button onClick={addEmpty} data-testid="fuentes-add">
              + Añadir manual
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function FuenteRow({
  index,
  fuente,
  onChange,
  onRemove,
}: {
  index: number;
  fuente: Fuente;
  onChange: (patch: Partial<Omit<Fuente, "id">>) => void;
  onRemove: () => void;
}) {
  const wc = wordCount(fuente.contenido);
  return (
    <div
      className="grid grid-cols-[28px_1fr_auto] gap-3 items-start p-3 rounded-[8px] border border-rule-2 bg-paper"
      data-testid="fuente-row"
    >
      <div className="text-ink-3 font-mono text-[11px] tracking-[0.04em] pt-1.5">
        {String(index + 1).padStart(2, "0")}
      </div>
      <div className="flex flex-col gap-2 min-w-0">
        <input
          type="text"
          value={fuente.nombre}
          onChange={(e) => onChange({ nombre: e.target.value })}
          placeholder="Título corto de la fuente"
          aria-label="Nombre de la fuente"
          className="font-serif text-[15px] text-ink-1 bg-transparent outline-none border-b border-rule-1 focus:border-rule-3 pb-1"
          data-testid="fuente-nombre"
        />
        <input
          type="text"
          value={fuente.cita ?? ""}
          onChange={(e) => onChange({ cita: e.target.value || undefined })}
          placeholder="Cita en formato APA (opcional)"
          aria-label="Cita APA"
          className="font-mono text-[11px] text-ink-2 bg-transparent outline-none border-b border-rule-1 focus:border-rule-3 pb-1 tracking-[0.02em]"
          data-testid="fuente-cita"
        />
        <textarea
          value={fuente.contenido}
          onChange={(e) => onChange({ contenido: e.target.value })}
          placeholder="Texto completo de la fuente."
          aria-label="Contenido de la fuente"
          rows={4}
          className="font-serif text-[12.5px] text-ink-1 bg-paper-2 outline-none resize-y leading-[1.55] p-2 border border-rule-1 rounded"
          data-testid="fuente-contenido"
        />
        <div className="flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-3">
          <span>{fuente.origen === "archivo" ? `archivo · ${fuente.archivoNombre ?? ""}` : "manual"}</span>
          <span>·</span>
          <span>{wc.toLocaleString("es")} palabras</span>
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        title="Eliminar fuente"
        aria-label={`Eliminar ${fuente.nombre || "fuente"}`}
        className="font-mono text-[14px] text-ink-3 hover:text-seal cursor-pointer w-7 h-7 grid place-items-center"
        data-testid="fuente-remove"
      >
        ×
      </button>
    </div>
  );
}

function FileAddButton({
  onAdd,
}: {
  onAdd: (name: string, contenido: string) => void;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept=".txt,.md,text/plain,text/markdown"
        className="hidden"
        data-testid="fuentes-file-input"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const lower = f.name.toLowerCase();
          if (
            lower.endsWith(".pdf") ||
            lower.endsWith(".docx") ||
            lower.endsWith(".doc")
          ) {
            alert(
              "PDF / Word soon. Por ahora pega el texto a mano en una fuente manual.",
            );
            if (ref.current) ref.current.value = "";
            return;
          }
          const text = await f.text();
          onAdd(f.name, text);
          if (ref.current) ref.current.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="inline-flex items-center gap-1.5 h-[28px] px-3 rounded-full border border-rule-1 bg-paper-3 text-ink-2 hover:text-ink-1 hover:bg-paper-2 font-sans text-[12px] cursor-pointer"
        data-testid="fuentes-add-file"
      >
        + Subir .txt / .md
      </button>
    </>
  );
}

function wordCount(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

function totalWordCount(fuentes: Fuente[]): number {
  return fuentes.reduce((acc, f) => acc + wordCount(f.contenido), 0);
}
