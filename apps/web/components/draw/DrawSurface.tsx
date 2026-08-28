import type { ReactNode } from "react";

import { Button, type ButtonProps } from "@/components/ui/Button";

/**
 * Nguyên liệu của phòng tối.
 *
 * `Card` của shell không dùng lại được: nó bind cứng `bg-surface` (#ffffff) và
 * đặt lên `--color-draw-canvas` sẽ ra một cái thẻ trắng chọc thủng phòng tối.
 * Nút thì ngược lại — nó nhận `surface="draw"` và dùng chung một
 * implementation, vì hai cái nút riêng biệt là hai focus ring riêng biệt và
 * sớm muộn một trong hai sẽ vô hình.
 */

export function DrawCard({
  children,
  className = "",
  as: Tag = "section",
  ...rest
}: {
  children?: ReactNode;
  className?: string;
  as?: "section" | "div" | "article" | "aside";
} & { "data-testid"?: string }) {
  return (
    <Tag
      {...rest}
      className={`border-draw-border bg-draw-surface rounded-card border p-5 sm:p-6 ${className}`}
    >
      {children}
    </Tag>
  );
}

export function DrawCardHeader({ title, hint, action }: { title: ReactNode; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {hint ? <p className="text-draw-fg-muted mt-1 text-[13px] leading-relaxed">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** Nhãn "công khai" — nhắc rằng cái gì đọc được từ ngoài thì ai cũng đọc được. */
export function DrawPublicBadge({ children = "Public" }: { children?: ReactNode }) {
  return (
    <span className="border-draw-border text-draw-fg-muted inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[12px] font-medium">
      {children}
    </span>
  );
}

export function DrawEncryptedBadge({ children = "Encrypted" }: { children?: ReactNode }) {
  return (
    <span className="text-privacy inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--color-privacy)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-privacy)_12%,transparent)] px-2.5 py-1 text-[12px] font-medium">
      <span aria-hidden="true" className="bg-privacy size-1.5 rounded-full" />
      {children}
    </span>
  );
}

/** `Button` của shell, khoá sẵn vào bối cảnh phòng tối. Một implementation, hai palette. */
export function DrawButton(props: Omit<ButtonProps, "surface">) {
  return <Button {...props} surface="draw" />;
}

/** Panel thông tin trong phòng tối. `tone` không bao giờ mang nghĩa "bạn thắng". */
export function DrawNotice({
  tone = "neutral",
  title,
  children,
  ...rest
}: {
  tone?: "neutral" | "privacy" | "warning";
  title?: ReactNode;
  children: ReactNode;
} & { "data-testid"?: string }) {
  const border =
    tone === "privacy"
      ? "border-[color-mix(in_srgb,var(--color-privacy)_35%,transparent)]"
      : tone === "warning"
        ? "border-[color-mix(in_srgb,var(--color-warning)_55%,transparent)]"
        : "border-draw-border";
  return (
    <div {...rest} className={`rounded-card border ${border} bg-draw-canvas/60 p-4`}>
      {title ? <p className="text-[13px] font-semibold">{title}</p> : null}
      <div className="text-draw-fg-muted mt-1 max-w-[68ch] text-[13px] leading-relaxed">{children}</div>
    </div>
  );
}
