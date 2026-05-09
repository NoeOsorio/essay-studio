import { Badge } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/IconButton";
import {
  ArrowIcon,
  CursorIcon,
  GroupDashedIcon,
  GroupIcon,
  MicIcon,
  StickyIcon,
  ZoomFit,
  ZoomMinus,
  ZoomPlus,
} from "@/components/ui/icons";
import { Postit, type PostitProps } from "@/components/canvas/Postit";

type BoardColumn = {
  title: string;
  count: number;
  dotColor: string;
  postits: PostitProps[];
};

const COLUMNS: BoardColumn[] = [
  {
    title: "Conceptos",
    count: 6,
    dotColor: "bg-rule-3",
    postits: [
      {
        variant: "you",
        initials: "TÚ",
        tag: "DEFINICIÓN",
        time: "8m",
        body: "Seguridad psicológica = riesgo interpersonal sin castigo social.",
      },
      {
        variant: "sis",
        initials: "SI",
        tag: "PATRÓN",
        time: "5m",
        body: "Loop: voz → silencio → más silencio. Cuesta el doble retomarlo.",
      },
    ],
  },
  {
    title: "Preguntas",
    count: 5,
    dotColor: "bg-pra",
    postits: [
      {
        variant: "pra",
        initials: "PR",
        tag: "CASO",
        time: "just now",
        body: "Equipo de 8 ingenieros remotos, retro semanal: ¿cómo lo medirías sin encuesta?",
      },
      {
        variant: "you",
        initials: "TÚ",
        tag: "PREGUNTA",
        time: "9m",
        body: "¿La seguridad escala con el tamaño del equipo o se rompe en los nodos?",
      },
    ],
  },
  {
    title: "Conexiones",
    count: 4,
    dotColor: "bg-sis",
    postits: [
      {
        variant: "sis",
        initials: "SI",
        tag: "VINCULA",
        time: "4s",
        body: "Edmondson 1999 ↔ Schein nivel 3 (supuestos). El nivel 1 es ruido si el 3 está cerrado.",
        lifted: true,
      },
      {
        variant: "you",
        initials: "TÚ",
        tag: "PUENTE",
        time: "11m",
        body: "Servicial vs transformacional: el primero baja el costo de hablar; el segundo sube el techo.",
      },
    ],
  },
  {
    title: "Citas",
    count: 5,
    dotColor: "bg-seal",
    postits: [
      {
        variant: "em",
        initials: "EM",
        tag: "EVIDENCIA",
        time: "2m",
        body: "Edmondson (1999), N=51 cirugía, r=.41 entre seguridad psicológica y aprendizaje.",
      },
      {
        variant: "you",
        initials: "TÚ",
        tag: "CITA",
        time: "17m",
        body: "«Cultura es lo que hace el equipo cuando nadie está mirando.» — Schein, 2010.",
      },
    ],
  },
  {
    title: "Críticas",
    count: 3,
    dotColor: "bg-cri",
    postits: [
      {
        variant: "cri",
        initials: "CR",
        tag: "OBJECIÓN",
        time: "12m",
        body: "Tu argumento se cae si cambio la muestra a equipos >20. Demuéstrame que no es coincidencia.",
      },
      {
        variant: "cri",
        initials: "CR",
        tag: "CONTRA",
        time: "18m",
        body: "«Práctica deliberada» suena bonito; ¿quién la ejecuta cuando el manager está en pánico?",
      },
    ],
  },
];

export function BoardPane() {
  return (
    <div className="board-grid relative overflow-hidden board-fade">
      {/* Head */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-paper-2 border-b border-rule-1">
        <div className="font-serif italic text-[16px] text-ink-1">
          Tablero ·{" "}
          <em className="italic">paradoja-seguridad-remota</em>
        </div>
        <div className="flex items-center gap-2">
          <Badge dotColor="bg-sis">23 notas</Badge>
          <Badge dotColor="bg-ink-3">4 conexiones</Badge>
          <IconButton title="Agrupar">
            <GroupIcon />
          </IconButton>
        </div>
      </div>

      {/* Toolbar (left) */}
      <div className="absolute left-3.5 top-[60px] z-[3] flex flex-col gap-1 bg-paper-2 border border-rule-1 rounded-[8px] p-1 shadow-(--shadow-soft)">
        <ToolButton active title="seleccionar">
          <CursorIcon />
        </ToolButton>
        <ToolButton title="post-it">
          <StickyIcon />
        </ToolButton>
        <ToolButton title="flecha / conexión">
          <ArrowIcon />
        </ToolButton>
        <ToolButton title="grupo">
          <GroupDashedIcon />
        </ToolButton>
        <hr className="border-0 border-t border-rule-1 my-1 w-[80%]" />
        <ToolButton title="micro · dictar">
          <MicIcon />
        </ToolButton>
      </div>

      {/* Zoom (right) */}
      <div className="absolute right-3.5 top-[60px] z-[3] inline-flex items-center gap-0 bg-paper-2 border border-rule-1 rounded-[8px] shadow-(--shadow-soft) p-0.5">
        <button
          type="button"
          title="zoom-out"
          className="w-[26px] h-[26px] rounded grid place-items-center bg-transparent text-ink-2 hover:bg-paper-3 cursor-pointer"
        >
          <ZoomMinus />
        </button>
        <span className="font-mono text-[11px] font-medium text-ink-2 px-2 tracking-[0.04em]">86%</span>
        <button
          type="button"
          title="zoom-in"
          className="w-[26px] h-[26px] rounded grid place-items-center bg-transparent text-ink-2 hover:bg-paper-3 cursor-pointer"
        >
          <ZoomPlus />
        </button>
        <button
          type="button"
          title="ajustar"
          className="w-[26px] h-[26px] rounded grid place-items-center bg-transparent text-ink-2 hover:bg-paper-3 cursor-pointer"
        >
          <ZoomFit />
        </button>
      </div>

      {/* Toast */}
      <Toast />

      {/* Columns (horizontal scroll) */}
      <div
        className="absolute thin-scroll grid grid-flow-col gap-[18px] overflow-x-auto overflow-y-hidden pr-[60px]"
        style={{
          left: 60,
          right: 24,
          top: 96,
          bottom: 24,
          gridAutoColumns: "240px",
          scrollSnapType: "x proximity",
        }}
      >
        {COLUMNS.map((col) => (
          <div
            key={col.title}
            className="flex flex-col gap-[18px] min-w-0"
            style={{ scrollSnapAlign: "start" }}
          >
            <div className="flex items-center gap-2 px-3 py-2 bg-paper-2 border border-rule-1 rounded-full font-mono text-[11px] font-medium tracking-[0.1em] uppercase text-ink-3 shadow-(--shadow-soft)">
              <span className={`w-1.5 h-1.5 rounded-full ${col.dotColor}`} />
              {col.title}
              <span className="ml-auto font-mono text-[11px] font-medium text-ink-3 bg-paper-3 rounded-full px-[7px] py-px">
                {col.count}
              </span>
            </div>
            {col.postits.map((p, i) => (
              <Postit key={i} {...p} />
            ))}
          </div>
        ))}
      </div>

      {/* Connection arrow (visual demo) */}
      <svg
        className="absolute pointer-events-none"
        style={{ left: 60, top: 190, width: "calc(100% - 120px)", height: 60 }}
        viewBox="0 0 600 60"
        preserveAspectRatio="none"
      >
        <path
          d="M5 30 C 120 5, 280 55, 410 22"
          fill="none"
          stroke="var(--color-rule-3)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
        <text x="180" y="22" className="font-mono" fill="var(--color-ink-3)" fontSize="10" letterSpacing=".06em">
          supuesto base
        </text>
        <path
          d="M403 17 L 411 22 L 405 28"
          fill="none"
          stroke="var(--color-rule-3)"
          strokeWidth={1.5}
        />
      </svg>
    </div>
  );
}

function ToolButton({
  children,
  active = false,
  title,
}: {
  children: React.ReactNode;
  active?: boolean;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      className={`w-[30px] h-[30px] rounded-[5px] border-0 cursor-pointer grid place-items-center ${
        active
          ? "bg-ink-1 text-paper"
          : "bg-transparent text-ink-2 hover:bg-paper-3 hover:text-ink-1"
      }`}
    >
      {children}
    </button>
  );
}

function Toast() {
  return (
    <div
      className="absolute z-[4] flex items-center gap-2.5 bg-paper-2 border border-rule-2 rounded-full pl-1.5 pr-3.5 py-1.5 shadow-(--shadow-pop) font-serif italic text-[13px] text-ink-2"
      style={{ right: 18, top: 18 }}
    >
      <div
        className="w-6 h-6 rounded-full grid place-items-center font-mono text-[9px] font-medium text-sis bg-sis-bg"
        style={{ border: "1.5px solid currentColor" }}
      >
        SI
      </div>
      El{" "}
      <b className="font-serif font-medium not-italic text-ink-1">Sistémico</b>{" "}
      movió <em className="italic">«Edmondson 1999»</em> a Conexiones · 4s
      <button
        type="button"
        title="cerrar"
        className="ml-1.5 text-ink-3 bg-transparent border-0 text-[14px] cursor-pointer leading-none px-1 py-0.5"
      >
        ×
      </button>
    </div>
  );
}
