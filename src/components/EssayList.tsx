"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { useStore } from "@/lib/store";
import type { EssayMeta, EssayMode } from "@/lib/storage/types";

export function EssayList() {
  const list = useStore((s) => s.list);
  const loadList = useStore((s) => s.loadList);
  const newEssay = useStore((s) => s.newEssay);
  const openEssay = useStore((s) => s.openEssay);
  const removeEssay = useStore((s) => s.removeEssay);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  return (
    <div className="relative h-full overflow-y-auto thin-scroll bg-paper">
      <div className="mx-auto max-w-[860px] px-12 pt-20 pb-24">
        <header className="mb-12 flex items-end justify-between gap-6">
          <div>
            <h1 className="font-serif font-medium text-[42px] leading-[1.1] tracking-[-0.015em] text-ink-1">
              Tus <em className="italic text-seal">ensayos</em>
            </h1>
            <p className="font-serif italic text-[16px] text-ink-2 mt-2">
              {list.length === 0
                ? "Aún no hay nada. Empieza uno y el consejo se sentará contigo."
                : `${list.length} ${list.length === 1 ? "ensayo" : "ensayos"}.`}
            </p>
          </div>
          <div className="flex gap-2.5">
            <Button onClick={() => void newEssay("academico")}>
              <span className="font-serif italic">A</span> Nuevo académico
              <span className="kbd ml-1">⌘ N</span>
            </Button>
            <Button variant="dark" onClick={() => void newEssay("blog")}>
              <span className="font-serif italic">B</span> Nuevo blog
            </Button>
          </div>
        </header>

        {list.length === 0 ? (
          <EmptyState onCreate={() => void newEssay("academico")} />
        ) : (
          <ul className="flex flex-col gap-3">
            {list.map((meta) => (
              <EssayRow
                key={meta.id}
                meta={meta}
                onOpen={() => void openEssay(meta.id)}
                onDelete={() => {
                  if (
                    confirm(
                      `¿Borrar "${meta.title || "Sin título"}"? No se puede deshacer.`,
                    )
                  ) {
                    void removeEssay(meta.id);
                  }
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="border border-dashed border-rule-2 rounded-[14px] bg-paper-2/50 px-10 py-16 text-center">
      <p className="font-serif italic text-[20px] text-ink-2 max-w-[44ch] mx-auto leading-snug">
        Cada ensayo aquí es un cuaderno propio: editor a la izquierda, tablero a
        la derecha, y un consejo de cuatro sabios escuchando.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-8 inline-flex items-center gap-2 h-10 px-6 rounded-full bg-seal text-paper-2 border border-seal text-[13px] font-medium hover:brightness-110 cursor-pointer"
      >
        Crear primer ensayo
      </button>
    </div>
  );
}

function EssayRow({
  meta,
  onOpen,
  onDelete,
}: {
  meta: EssayMeta;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const title = meta.title.trim() || "Sin título";
  const dot = (
    <span className="inline-block w-[3px] h-[3px] bg-ink-4 rounded-full" />
  );
  return (
    <li
      onClick={onOpen}
      className="group relative flex items-center gap-5 px-6 py-5 bg-paper-2 border border-rule-1 rounded-[12px] hover:border-rule-3 hover:shadow-(--shadow-soft) cursor-pointer transition-all"
    >
      <ModeStripe mode={meta.mode} />
      <div className="flex-1 min-w-0">
        <h2 className="font-serif font-medium text-[20px] text-ink-1 truncate">
          {title}
        </h2>
        <div className="mt-1.5 flex items-center gap-2.5 font-mono text-[11px] text-ink-3 tracking-[0.04em]">
          <span>{meta.mode}</span>
          {dot}
          <span>{meta.wordCount.toLocaleString("es")} palabras</span>
          {dot}
          <span>edit {relativeTime(meta.updatedAt)}</span>
        </div>
      </div>
      <button
        type="button"
        title="Borrar"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 grid place-items-center text-ink-3 hover:text-err hover:bg-paper-3 rounded cursor-pointer"
      >
        ×
      </button>
    </li>
  );
}

function ModeStripe({ mode }: { mode: EssayMode }) {
  const color = mode === "academico" ? "bg-ink-2" : "bg-seal";
  return (
    <span
      className={`flex-none w-[4px] h-12 rounded-full ${color}`}
      aria-hidden
    />
  );
}

function relativeTime(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms)) return "—";
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}
