import type { HTMLAttributes, ReactNode } from "react";

type BadgeTone = "neutral" | "ok" | "warn";

type BadgeProps = {
  children: ReactNode;
  tone?: BadgeTone;
  dotColor?: string;
} & HTMLAttributes<HTMLSpanElement>;

const toneStyles: Record<BadgeTone, string> = {
  neutral: "bg-paper text-ink-2 border-rule-2",
  ok:      "bg-[#E5EFE3] text-ok border-[rgba(63,127,74,0.30)]",
  warn:    "bg-[#F4E9CB] text-warn border-[rgba(154,114,32,0.30)]",
};

const dotByTone: Record<BadgeTone, string> = {
  neutral: "bg-rule-3",
  ok:      "bg-ok",
  warn:    "bg-warn",
};

export function Badge({
  children,
  tone = "neutral",
  dotColor,
  className = "",
  ...rest
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 h-[22px] px-2.5 rounded-full font-mono text-[11px] font-medium tracking-[0.04em] border ${toneStyles[tone]} ${className}`}
      {...rest}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${dotColor ?? dotByTone[tone]}`}
      />
      {children}
    </span>
  );
}
