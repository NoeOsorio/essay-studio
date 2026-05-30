import type { ButtonHTMLAttributes, ReactNode } from "react";

type IconButtonProps = {
  children: ReactNode;
  size?: "sm" | "md";
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function IconButton({
  children,
  size = "md",
  className = "",
  ...rest
}: IconButtonProps) {
  const dim =
    size === "sm" ? "w-[26px] h-[26px] rounded-[4px]" : "w-8 h-8 rounded-[8px]";
  return (
    <button
      type="button"
      className={`${dim} flex-none grid place-items-center bg-transparent text-ink-2 border border-transparent hover:bg-paper-3 hover:text-ink-1 hover:border-rule-1 transition-colors cursor-pointer ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
