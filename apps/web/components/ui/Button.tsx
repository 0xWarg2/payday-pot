import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "sm";

const VARIANTS: Record<Variant, string> = {
  // Chartreuse = hành động chính, và CHỈ hành động chính (§14.2). Dùng nó làm
  // trang trí là cách làm hỏng khả năng chỉ đường của nó.
  primary: "bg-action text-on-action hover:bg-action-hover active:bg-action-active",
  secondary: "bg-surface text-fg border border-border-default hover:bg-subtle",
  ghost: "bg-transparent text-fg hover:bg-subtle",
  danger: "bg-transparent text-danger border border-danger/40 hover:bg-danger/5",
};

const SIZES: Record<Size, string> = {
  md: "px-5 text-[15px]",
  sm: "px-3 text-[14px] min-h-[36px]",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      className={[
        "rounded-control inline-flex items-center justify-center gap-2 font-medium",
        "transition-colors duration-(--duration-hover) ease-(--ease-ui)",
        "focus-visible:outline-fg focus-visible:outline-2 focus-visible:outline-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className,
      ].join(" ")}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="size-[14px] animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}
