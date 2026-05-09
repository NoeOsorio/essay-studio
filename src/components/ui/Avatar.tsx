import type { HTMLAttributes } from "react";

export type SageKey = "em" | "sis" | "pra" | "cri";

const sageClasses: Record<SageKey, { text: string; bg: string; activityBg: string }> = {
  em:  { text: "text-em",  bg: "bg-em-bg",  activityBg: "bg-em"  },
  sis: { text: "text-sis", bg: "bg-sis-bg", activityBg: "bg-sis" },
  pra: { text: "text-pra", bg: "bg-pra-bg", activityBg: "bg-pra" },
  cri: { text: "text-cri", bg: "bg-cri-bg", activityBg: "bg-cri" },
};

type AvatarProps = {
  sage: SageKey;
  initials: string;
  active?: boolean;
  size?: number;
  title?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, "title">;

export function Avatar({
  sage,
  initials,
  active = false,
  size = 30,
  title,
  className = "",
  ...rest
}: AvatarProps) {
  const { text, bg, activityBg } = sageClasses[sage];
  return (
    <div
      title={title}
      className={`relative grid place-items-center rounded-full font-serif text-[11px] font-medium tracking-[0.04em] cursor-pointer ${text} ${bg} ${className}`}
      style={{
        width: size,
        height: size,
        border: "1.5px solid currentColor",
      }}
      {...rest}
    >
      {initials}
      {active ? (
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full sage-pulse ${activityBg}`}
          style={{ border: "2px solid var(--color-paper-2)" }}
        />
      ) : null}
    </div>
  );
}
