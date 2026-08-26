import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
  as: Tag = "section",
}: {
  /** Optional: một Card rỗng là placeholder giữ chỗ hợp lệ lúc chưa mount. */
  children?: ReactNode;
  className?: string;
  as?: "section" | "div" | "article" | "aside";
}) {
  return (
    <Tag className={`border-border-default bg-surface rounded-card border p-5 sm:p-6 ${className}`}>{children}</Tag>
  );
}

export function CardHeader({ title, hint, action }: { title: ReactNode; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {hint ? <p className="text-fg-muted mt-1 text-[13px]">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

/**
 * Nhãn "encrypted". Màu privacy (cyan) nghĩa là "đây là dữ liệu mã hoá" —
 * KHÔNG phải success. Nhầm hai cái đó là cách nhanh nhất khiến người dùng tưởng
 * một giá trị đã được mở khoá (§14.2).
 */
export function EncryptedBadge({ children = "Encrypted" }: { children?: ReactNode }) {
  return (
    <span className="bg-privacy-subtle text-fg inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium">
      <span aria-hidden="true" className="bg-privacy size-1.5 rounded-full" />
      {children}
    </span>
  );
}

export function PublicBadge({ children = "Public" }: { children?: ReactNode }) {
  return (
    <span className="border-border-default text-fg-muted inline-flex items-center rounded-full border px-2.5 py-1 text-[12px] font-medium">
      {children}
    </span>
  );
}
