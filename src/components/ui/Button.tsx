import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "default" | "seal" | "dark";

type ButtonProps = {
  children: ReactNode;
  variant?: Variant;
} & ButtonHTMLAttributes<HTMLButtonElement>;

const variantStyles: Record<Variant, string> = {
  default:
    "bg-paper-2 text-ink-1 border-rule-2 hover:bg-paper-3 hover:border-rule-3 shadow-(--shadow-soft)",
  seal: "bg-seal text-paper-2 border-seal hover:brightness-110",
  dark: "bg-ink-1 text-paper border-ink-1 hover:bg-black",
};

export function Button({
  children,
  variant = "default",
  className = "",
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-2 h-8 px-4 rounded-[8px] font-sans text-[12.5px] font-medium border cursor-pointer transition-all whitespace-nowrap flex-none ${variantStyles[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
