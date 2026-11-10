"use client";

// Tipo, Revisión and order (Paper R1.3 filter row, and the Slice 0 menus).
// Three small buttons, each opening a Popover. A chosen filter shows its
// value and a ring; choosing the same value again clears it.

import { useRef, useState, type ReactNode } from "react";
import { Popover } from "@/components/ui/Popover";
import type { Orden, Revision, Tipo } from "@/lib/library/ledger";
import { AcademicIcon, BlogIcon } from "./icons";

type Props = {
  tipo: Tipo;
  revision: Revision;
  /** The order in effect: «relevantes» only while a search runs. */
  orden: Orden;
  searching: boolean;
  onTipo: (v: Tipo) => void;
  onRevision: (v: Revision) => void;
  onOrden: (v: Orden) => void;
};

const REVISION_LABEL: Record<NonNullable<Revision>, string> = {
  revisados: "Revisados",
  "sin-revisar": "Sin revisar",
  desactualizados: "Desactualizados",
};

const ORDEN_LABEL: Record<Orden, string> = {
  relevantes: "Más relevantes",
  recientes: "Más recientes",
  antiguos: "Más antiguos",
  nota: "Mejor nota",
  titulo: "Título",
};

function Chevron() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="flex-none">
      <path d="M3 4.5L6 7.5L9 4.5" fill="none" stroke="var(--color-ink-2)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Chip({
  label,
  active,
  open,
  onToggle,
  chipRef,
  testId,
}: {
  label: string;
  active: boolean;
  open: boolean;
  onToggle: () => void;
  chipRef: React.RefObject<HTMLButtonElement | null>;
  testId: string;
}) {
  return (
    <button
      ref={chipRef}
      type="button"
      data-testid={testId}
      data-active={active}
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={onToggle}
      className={`flex items-center gap-[6px] h-[30px] pl-[12px] pr-[9px] rounded-[8px] cursor-pointer press whitespace-nowrap font-sans text-[13px] leading-[16px] ${
        active
          ? "bg-sheet font-semibold text-ink-1 shadow-[0_0_0_1.2px_var(--color-ink-3)]"
          : "bg-shade font-medium text-ink-2"
      }`}
    >
      {label}
      <Chevron />
    </button>
  );
}

function Item({
  selected,
  onClick,
  testId,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  testId: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      data-testid={testId}
      onClick={onClick}
      className={`flex items-center gap-[8px] h-[34px] pl-[10px] pr-[18px] rounded-[8px] cursor-pointer text-left whitespace-nowrap font-sans text-[13px] leading-[16px] text-ink-1 hover:bg-shade ${
        selected ? "bg-shade font-semibold" : "font-medium"
      }`}
    >
      {children}
    </button>
  );
}

type Which = "tipo" | "revision" | "orden" | null;

export function LedgerFilters({ tipo, revision, orden, searching, onTipo, onRevision, onOrden }: Props) {
  const [open, setOpen] = useState<Which>(null);
  const tipoRef = useRef<HTMLButtonElement | null>(null);
  const revRef = useRef<HTMLButtonElement | null>(null);
  const ordRef = useRef<HTMLButtonElement | null>(null);
  const toggle = (w: Exclude<Which, null>) => setOpen((cur) => (cur === w ? null : w));
  const close = () => setOpen(null);

  const ordenes: Orden[] = searching
    ? ["relevantes", "recientes", "antiguos", "nota", "titulo"]
    : ["recientes", "antiguos", "nota", "titulo"];

  return (
    <div className="flex items-center gap-[6px]" data-testid="ledger-filters">
      <Chip
        label={tipo ? (tipo === "academico" ? "Académico" : "Blog") : "Tipo"}
        active={tipo !== null}
        open={open === "tipo"}
        onToggle={() => toggle("tipo")}
        chipRef={tipoRef}
        testId="filter-tipo"
      />
      <Chip
        label={revision ? REVISION_LABEL[revision] : "Revisión"}
        active={revision !== null}
        open={open === "revision"}
        onToggle={() => toggle("revision")}
        chipRef={revRef}
        testId="filter-revision"
      />
      <Chip
        label={ORDEN_LABEL[orden]}
        active={false}
        open={open === "orden"}
        onToggle={() => toggle("orden")}
        chipRef={ordRef}
        testId="filter-orden"
      />

      <Popover anchor={tipoRef} open={open === "tipo"} onClose={close} align="start" testId="filter-tipo-menu">
        <div className="flex flex-col gap-[2px] p-[6px]">
          <Item selected={tipo === "academico"} testId="filter-tipo-academico" onClick={() => { onTipo(tipo === "academico" ? null : "academico"); close(); }}>
            <AcademicIcon />
            Académico
          </Item>
          <Item selected={tipo === "blog"} testId="filter-tipo-blog" onClick={() => { onTipo(tipo === "blog" ? null : "blog"); close(); }}>
            <BlogIcon />
            Blog
          </Item>
        </div>
      </Popover>

      <Popover anchor={revRef} open={open === "revision"} onClose={close} align="start" testId="filter-revision-menu">
        <div className="flex flex-col gap-[2px] p-[6px]">
          {(["revisados", "sin-revisar", "desactualizados"] as const).map((v) => (
            <Item
              key={v}
              selected={revision === v}
              testId={`filter-revision-${v}`}
              onClick={() => {
                onRevision(revision === v ? null : v);
                close();
              }}
            >
              {REVISION_LABEL[v]}
            </Item>
          ))}
        </div>
      </Popover>

      <Popover anchor={ordRef} open={open === "orden"} onClose={close} align="start" testId="filter-orden-menu">
        <div className="flex flex-col gap-[2px] p-[6px]">
          {ordenes.map((v) => (
            <Item
              key={v}
              selected={orden === v}
              testId={`filter-orden-${v}`}
              onClick={() => {
                onOrden(v);
                close();
              }}
            >
              {ORDEN_LABEL[v]}
            </Item>
          ))}
        </div>
      </Popover>
    </div>
  );
}
