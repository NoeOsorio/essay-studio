import type { SageKey } from "@/components/ui/Avatar";

type PostitVariant = SageKey | "you";

const variantClasses: Record<PostitVariant, { wrap: string; ini: string; tag: string }> = {
  em:  { wrap: "bg-em-bg  text-em-ink  border-[rgba(176,122, 31,0.3)]", ini: "text-em",   tag: "text-em"  },
  sis: { wrap: "bg-sis-bg text-sis-ink border-[rgba( 46,126,114,0.3)]", ini: "text-sis",  tag: "text-sis" },
  pra: { wrap: "bg-pra-bg text-pra-ink border-[rgba(177, 75, 54,0.3)]", ini: "text-pra",  tag: "text-pra" },
  cri: { wrap: "bg-cri-bg text-cri-ink border-[rgba(110, 79,168,0.3)]", ini: "text-cri",  tag: "text-cri" },
  you: { wrap: "bg-paper-2 text-ink-1 border-rule-2",                   ini: "text-ink-2 bg-paper-3", tag: "text-ink-2" },
};

export type PostitProps = {
  variant: PostitVariant;
  initials: string;
  tag: string;
  time: string;
  body: string;
  lifted?: boolean;
};

export function Postit({ variant, initials, tag, time, body, lifted = false }: PostitProps) {
  const v = variantClasses[variant];
  return (
    <div
      className={`postit ${v.wrap} ${lifted ? "postit-lifted" : ""}`}
    >
      <div className="flex items-center gap-2 mb-2.5">
        <span
          className={`w-5 h-5 rounded-full grid place-items-center font-mono text-[9px] font-medium ${v.ini}`}
          style={{ border: "1px solid currentColor" }}
        >
          {initials}
        </span>
        <span className={`font-mono text-[9px] font-semibold tracking-[0.14em] uppercase ${v.tag}`}>
          {tag}
        </span>
        <span className="ml-auto font-mono text-[10px] text-ink-3">{time}</span>
      </div>
      <p className="m-0 text-[13px] leading-[1.5]">{body}</p>
    </div>
  );
}
