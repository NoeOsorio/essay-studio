"use client";

import { AGENT_COPY, identityOf, type AgentId, type AgentExample } from "@/lib/agent-identity";

function Sentence({ ex, dot }: { ex: AgentExample; dot: string }) {
  const at = ex.sentence.indexOf(ex.marked);
  if (at < 0) return <>{ex.sentence}</>;
  return (
    <>
      {ex.sentence.slice(0, at)}
      <span
        style={{
          textDecoration: "underline",
          textDecorationColor: dot,
          textDecorationThickness: 2,
          textUnderlinePosition: "from-font",
        }}
      >
        {ex.marked}
      </span>
      {ex.sentence.slice(at + ex.marked.length)}
    </>
  );
}

/** Read-only account of a built-in agent. Fixed copy, never the prompt. */
export function BuiltinAgentView({ id }: { id: AgentId }) {
  const a = identityOf(id);
  const copy = AGENT_COPY[id];
  const Icon = a.Icon;
  return (
    <div
      className="flex h-full flex-col overflow-auto font-sans"
      style={{ padding: "28px 36px 24px", gap: 28 }}
      data-testid="builtin-agent-view"
    >
      <div className="flex flex-col gap-[14px]">
        <div className="flex items-center gap-[14px]">
          <span
            className="grid h-[44px] w-[44px] flex-none place-items-center rounded-[12px]"
            style={{ background: a.note, color: a.ink }}
          >
            <Icon size={22} />
          </span>
          <h3 className="text-[22px] font-semibold leading-[28px] tracking-[-0.01em] text-ink-1">{a.name}</h3>
        </div>
        <p className="max-w-[520px] text-[15px] leading-[22px] text-ink-2">{copy.description}</p>
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-[13px] font-medium leading-[16px] text-ink-2">Así te corrige</span>
        {copy.examples.map((ex) => (
          <div key={ex.sentence} className="flex flex-col gap-[10px] rounded-[12px] bg-paper" style={{ padding: "16px 18px" }}>
            <p className="font-serif text-[17px] leading-[26px] text-ink-1">
              <Sentence ex={ex} dot={a.dot} />
            </p>
            <p className="text-[14px] leading-[20px] text-ink-2">{ex.comment}</p>
            {ex.replacement ? (
              <span
                className="self-start rounded-[8px] bg-sheet font-serif text-[15px] leading-[20px] text-ink-1"
                style={{ padding: "6px 10px" }}
              >
                {ex.replacement}
              </span>
            ) : null}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-[6px]">
        <span className="text-[13px] font-medium leading-[16px] text-ink-2">Cuándo entra</span>
        <p className="text-[14px] leading-[20px] text-ink-1">{copy.whenItRuns}</p>
      </div>
    </div>
  );
}
