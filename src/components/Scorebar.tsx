import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

type Meter = {
  label: string;
  value: number;
  color: string;
  weak?: boolean;
};

const METERS: Meter[] = [
  { label: "Claridad",     value: 7.8, color: "var(--color-ink-1)" },
  { label: "Originalidad", value: 6.2, color: "var(--color-cri)" },
  { label: "Evidencia",    value: 5.4, color: "var(--color-em)",  weak: true },
  { label: "Estructura",   value: 8.2, color: "var(--color-sis)" },
  { label: "Voz",          value: 7.4, color: "var(--color-seal)" },
  { label: "Profundidad",  value: 7.1, color: "var(--color-pra)" },
];

const TOTAL = 7.4;
const TARGET = 8.5;
const TOTAL_PCT = 74;

export function Scorebar() {
  return (
    <div
      className="grid items-center gap-9 px-8 py-5 border-t border-rule-2"
      style={{
        gridTemplateColumns: "minmax(220px,auto) 1fr auto",
        background: "linear-gradient(180deg, var(--color-paper-2), var(--color-paper-3))",
      }}
    >
      {/* Left — total ring + delta + target */}
      <div className="flex items-center gap-[18px]">
        <div className="relative w-[84px] h-[84px] flex-none">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 84 84">
            <circle cx="42" cy="42" r="36" fill="none" stroke="var(--color-rule-2)" strokeWidth="5" />
            <circle
              cx="42"
              cy="42"
              r="36"
              fill="none"
              stroke="var(--color-seal)"
              strokeWidth="5"
              strokeLinecap="round"
              pathLength="100"
              strokeDasharray={`${TOTAL_PCT} 100`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
            <b className="font-serif font-medium text-[28px] text-ink-1 tracking-[-0.015em]">
              {TOTAL.toFixed(1)}
            </b>
            <small className="font-mono text-[10px] font-normal text-ink-3 tracking-[0.1em] mt-[3px]">
              DE 10
            </small>
          </div>
        </div>
        <div className="flex flex-col gap-[5px]">
          <span className="font-mono text-[10px] font-semibold text-ink-3 tracking-[0.14em] uppercase">
            v3 · score actual
          </span>
          <span className="font-serif italic font-medium text-[15px] text-ok">↗ +0.6 desde v2</span>
          <span className="font-serif italic text-[13px] text-ink-2">
            objetivo <b className="not-italic font-medium text-ink-1">{TARGET}</b> · faltan{" "}
            <b className="not-italic font-medium text-ink-1">{(TARGET - TOTAL).toFixed(1)}</b>
          </span>
        </div>
      </div>

      {/* Center — 6 dimension meters */}
      <div className="flex items-center justify-center gap-1.5">
        {METERS.map((m) => (
          <MeterRing key={m.label} {...m} />
        ))}
      </div>

      {/* Right — CTA */}
      <div className="flex gap-2.5 items-center">
        <Badge tone="warn">Evidencia: 3 reclamos sin cita</Badge>
        <Button variant="dark">
          Re-benchmark
          <span className="kbd kbd-dark ml-1">⌘ B</span>
        </Button>
      </div>
    </div>
  );
}

function MeterRing({ label, value, color, weak = false }: Meter) {
  const pct = Math.round(value * 10);
  return (
    <div className="flex flex-col items-center gap-2 px-2.5 cursor-pointer group">
      <div className="relative w-14 h-14">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 56 56">
          <circle cx="28" cy="28" r="23" fill="none" stroke="var(--color-rule-2)" strokeWidth="4" />
          <circle
            cx="28"
            cy="28"
            r="23"
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeLinecap="round"
            pathLength="100"
            strokeDasharray={`${pct} 100`}
          />
        </svg>
        <span
          className={`absolute inset-0 grid place-items-center font-serif italic font-medium text-[17px] tracking-[-0.01em] ${
            weak ? "text-warn" : "text-ink-1"
          }`}
        >
          {value.toFixed(1)}
        </span>
      </div>
      <span className="font-mono text-[10px] font-semibold text-ink-3 uppercase tracking-[0.1em] group-hover:text-ink-1">
        {label}
      </span>
    </div>
  );
}
