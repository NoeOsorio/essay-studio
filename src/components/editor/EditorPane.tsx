import { GripDots } from "@/components/ui/icons";

export function EditorPane() {
  return (
    <div className="relative overflow-y-auto thin-scroll bg-paper px-[88px] pt-16 pb-[100px]">
      <h1 className="font-serif font-medium text-[46px] tracking-[-0.015em] text-ink-1 leading-[1.08] mb-2.5">
        La <em className="italic text-seal">paradoja</em> de la psicología segura en equipos remotos
      </h1>

      <DocMeta />

      {/* Block 1 */}
      <Block>
        <p className="m-0 text-ink-2">
          Edmondson definió la <a className="cite" href="#">seguridad psicológica</a> como la
          creencia compartida de que el equipo es seguro para tomar riesgos interpersonales. En remoto,
          los rituales que la sostienen{" "}
          <span
            className="anno anno-cri"
            data-by="CR"
            title="El Crítico · ¿estás generalizando? Especifica el contexto."
          >
            —el café, la mirada, el silencio cómodo después de una pregunta—
          </span>{" "}
          se erosionan por defecto.
        </p>
      </Block>

      {/* Block 2 — H2 */}
      <Block>
        <h2 className="font-serif font-medium text-[28px] tracking-[-0.005em] leading-[1.25] mt-8 mb-2">
          Lo observable engaña
        </h2>
      </Block>

      {/* Block 3 */}
      <Block>
        <p className="m-0 text-ink-2">
          <a className="cite" href="#">Schein</a> añadiría que lo observable —Slack educado,
          cámaras encendidas— puede ocultar el supuesto básico de que{" "}
          <em className="italic text-ink-1">disentir cuesta</em>. Aquí la herramienta no es la
          videollamada: es{" "}
          <span
            className="anno anno-sis"
            data-by="SI"
            title="El Sistémico · conecta con el loop voz→silencio→silencio del bloque anterior."
          >
            la práctica deliberada de pedir el desacuerdo
          </span>
          .
        </p>
      </Block>

      {/* Block 4 — quote */}
      <div className="quote-block relative max-w-[62ch]">
        <span className="absolute left-[-12px] top-2 hidden hover:flex" aria-hidden>
          <GripDots />
        </span>
        «Los equipos seguros no son los que asienten. Son los que pueden contradecirse sin que el
        viernes pese más.»
        <cite>— SI · Sistémico, mesa redonda 2:14</cite>
      </div>

      {/* Block 5 — H3 */}
      <Block>
        <h3 className="font-serif font-medium text-[21px] leading-[1.3] mt-6 mb-1.5">
          Tres prácticas medibles
        </h3>
      </Block>

      {/* Block 6 */}
      <Block>
        <p className="m-0 text-ink-2">
          Lo que se puede contar, no se puede esquivar:{" "}
          <span
            className="anno anno-emp"
            data-by="EM"
            title="El Empirista · ¿N mínima? ¿qué instrumento? cita un estudio."
          >
            tasa de objeción explícita por reunión
          </span>
          , latencia entre desacuerdo privado y público, y ratio de retros sin un solo «paso por
          aquí». No reemplazan la encuesta de Edmondson —la complementan con señales de campo.
        </p>
      </Block>

      {/* Selection popover (visual demo, no listener yet) */}
      <SelectionPopover />

      {/* Marginalia gutter — annotation markers */}
      <Marginalia />

      {/* Slash hint */}
      <SlashHint />
    </div>
  );
}

function DocMeta() {
  const dot = <span className="w-[3px] h-[3px] bg-ink-4 rounded-full" />;
  return (
    <div className="font-mono text-[11px] text-ink-3 mb-12 tracking-[0.04em] flex gap-3 items-center">
      <span>v3</span>
      {dot}
      <span>1,840 palabras</span>
      {dot}
      <span>académico</span>
      {dot}
      <span>edit 2m</span>
      {dot}
      <span>3 anotaciones inline</span>
    </div>
  );
}

function Block({ children }: { children: React.ReactNode }) {
  return (
    <div className="group relative font-serif text-[18px] leading-[1.75] text-ink-1 py-2 max-w-[62ch] [&+&]:mt-3.5">
      <span className="absolute -left-[30px] top-2 hidden group-hover:flex w-[18px] h-[22px] rounded items-center justify-center text-ink-4 hover:bg-paper-3 hover:text-ink-2 cursor-grab">
        <GripDots />
      </span>
      {children}
    </div>
  );
}

function SelectionPopover() {
  return (
    <div
      className="absolute z-[5] flex gap-0.5 p-1.5 bg-paper-2 border border-rule-2 rounded-[8px] shadow-(--shadow-pop)"
      style={{ left: 230, top: 240 }}
    >
      <PopBtn title="Comentar">💬</PopBtn>
      <PopBtn title="Anotar como CR" className="text-cri">
        <b>CR</b>
      </PopBtn>
      <PopBtn title="Anotar como EM" className="text-em">
        <b>EM</b>
      </PopBtn>
      <span className="w-px bg-rule-1 mx-0.5 my-1" />
      <PopBtn title="Mover al tablero">↗</PopBtn>
      <PopBtn title="Cita">&quot;</PopBtn>
    </div>
  );
}

function PopBtn({
  children,
  className = "",
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      className={`w-7 h-7 rounded-[5px] border-0 bg-transparent text-ink-2 font-serif text-[13px] font-medium cursor-pointer grid place-items-center hover:bg-paper-3 hover:text-ink-1 ${className}`}
    >
      {children}
    </button>
  );
}

function Marginalia() {
  return (
    <div
      className="absolute right-8 w-1.5 pointer-events-none"
      style={{ top: 140, bottom: 80 }}
      aria-hidden
    >
      <Mark sage="cri" n="01" topPct={14} />
      <Mark sage="sis" n="02" topPct={46} />
      <Mark sage="emp" n="03" topPct={78} />
    </div>
  );
}

function Mark({
  sage,
  n,
  topPct,
}: {
  sage: "emp" | "sis" | "pra" | "cri";
  n: string;
  topPct: number;
}) {
  const colors: Record<typeof sage, string> = {
    emp: "bg-em",
    sis: "bg-sis",
    pra: "bg-pra",
    cri: "bg-cri",
  };
  return (
    <span
      className={`absolute left-0 w-1.5 h-7 rounded-[3px] opacity-80 ${colors[sage]}`}
      style={{ top: `${topPct}%` }}
    >
      <span
        className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-[9px] font-semibold text-ink-3 tracking-[0.08em]"
      >
        {n}
      </span>
    </span>
  );
}

function SlashHint() {
  return (
    <div
      className="absolute font-mono text-[11px] text-ink-3 tracking-[0.04em] flex items-center gap-2.5"
      style={{ left: 88, bottom: 32 }}
    >
      <span className="kbd">/</span> insertar bloque
      <span className="text-ink-4">·</span>
      <span className="kbd">⌘ K</span> mover al tablero
      <span className="text-ink-4">·</span>
      <span className="kbd">⌘ ⇧ V</span> dictar
    </div>
  );
}
