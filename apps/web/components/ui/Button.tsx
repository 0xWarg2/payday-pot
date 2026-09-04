import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "sm";

/**
 * `surface` chứ không phải `dark`.
 *
 * Draw Room không phải dark mode của app (xem globals.css) — nó là bối cảnh thứ
 * hai, và nút phải biết mình đang đứng ở bối cảnh nào vì `bg-surface`/`text-fg`
 * là màu sáng cố định. Đặt lựa chọn đó ở đây, một lần, thay vì để mỗi component
 * trong phòng tối tự chế lại một cái nút: nhân bản nút là cách nhanh nhất để
 * đường đi bằng bàn phím có hai kiểu focus ring khác nhau, và một trong hai sẽ
 * là kiểu vô hình.
 */
export type ButtonSurface = "shell" | "draw";

const VARIANTS: Record<ButtonSurface, Record<Variant, string>> = {
  shell: {
    // Chartreuse = hành động chính, và CHỈ hành động chính (§14.2). Dùng nó làm
    // trang trí là cách làm hỏng khả năng chỉ đường của nó.
    primary: "bg-action text-on-action hover:bg-action-hover active:bg-action-active",
    secondary: "bg-surface text-fg border border-border-default hover:bg-subtle",
    ghost: "bg-transparent text-fg hover:bg-subtle",
    danger: "bg-transparent text-danger border border-danger/40 hover:bg-danger/5",
  },
  draw: {
    primary: "bg-action text-on-action hover:bg-action-hover active:bg-action-active",
    // Fill sáng hơn thẻ chứa nó: nút phụ cùng màu thẻ thì không còn là nút.
    secondary: "bg-draw-border/40 text-draw-fg border-draw-border-strong hover:bg-draw-border border",
    ghost: "text-draw-fg-muted hover:text-draw-fg hover:bg-draw-border/40 bg-transparent",
    // `--color-danger` trên nền phòng tối chỉ đạt ~3.4:1, dưới ngưỡng chữ AA.
    // Viền giữ màu để vẫn đọc ra là cảnh báo, chữ dùng màu sáng của phòng.
    danger: "text-draw-fg border-danger/50 hover:bg-danger/10 border bg-transparent",
  },
};

const FOCUS: Record<ButtonSurface, string> = {
  shell: "focus-visible:outline-fg",
  draw: "focus-visible:outline-draw-fg",
};

const SIZES: Record<Size, string> = {
  md: "px-5 text-[15px]",
  sm: "px-3 text-[14px] min-h-[36px]",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  surface?: ButtonSurface;
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  surface = "shell",
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
        FOCUS[surface],
        "focus-visible:outline-2 focus-visible:outline-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[surface][variant],
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
