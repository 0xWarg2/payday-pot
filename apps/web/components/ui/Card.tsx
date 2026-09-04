import type { ReactNode } from "react";

import { Typed } from "@/components/motion/Typed";
import { Words } from "@/components/motion/Words";

import { Spotlight, type SpotlightHue } from "./Spotlight";

export function Card({
  children,
  className = "",
  as: Tag = "section",
  spot,
}: {
  /** Optional: một Card rỗng là placeholder giữ chỗ hợp lệ lúc chưa mount. */
  children?: ReactNode;
  className?: string;
  as?: "section" | "div" | "article" | "aside";
  /**
   * Viền sáng theo con trỏ (depth kit #02). Màu là ngữ nghĩa: `privacy` cho
   * card giữ dữ liệu mã hoá, `prize` cho card tiền thưởng/công khai. Bỏ trống
   * thì card tĩnh như cũ — DOM y hệt, chỉ thiếu class `spot`.
   */
  spot?: SpotlightHue;
}) {
  const base = `border-border-default bg-surface rounded-card border p-5 sm:p-6 ${className}`;
  if (spot) {
    return (
      <Spotlight as={Tag} hue={spot} className={base}>
        {children}
      </Spotlight>
    );
  }
  return <Tag className={base}>{children}</Tag>;
}

export function CardHeader({ title, hint, action }: { title: ReactNode; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-body font-semibold tracking-tight">{typeof title === "string" ? <Words>{title}</Words> : title}</h2>
        {hint ? <p className="fade text-fg-muted mt-1 text-small">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

/*
 * Badge dùng mono (§14.3 + depth kit): nhãn trạng thái dữ liệu là "metadata",
 * và mono tách nó khỏi nội dung bằng hình chữ chứ không cần thêm màu.
 */
const BADGE = "inline-flex items-center rounded-full px-2.5 py-1 font-mono text-[11px] font-medium tracking-[0.04em]";

/**
 * Nhãn "encrypted". Màu privacy (cyan) nghĩa là "đây là dữ liệu mã hoá" —
 * KHÔNG phải success. Nhầm hai cái đó là cách nhanh nhất khiến người dùng tưởng
 * một giá trị đã được mở khoá (§14.2).
 */
export function EncryptedBadge({ children = "Encrypted" }: { children?: ReactNode }) {
  return (
    <span className={`${BADGE} bg-privacy-subtle text-fg gap-1.5`}>
      <span aria-hidden="true" className="bg-privacy size-1.5 rounded-full" />
      {typeof children === "string" ? <Typed>{children}</Typed> : children}
    </span>
  );
}

export function PublicBadge({ children = "Public" }: { children?: ReactNode }) {
  return (
    <span className={`${BADGE} border-border-default text-fg-muted border`}>
      {typeof children === "string" ? <Typed>{children}</Typed> : children}
    </span>
  );
}

/**
 * Nhãn "tiền thưởng do nhà tài trợ nạp". Vàng chỉ xuất hiện ở đúng chỗ này và ở
 * số prize — không phải màu trang trí, và tuyệt đối không phải màu nút.
 */
export function PrizeBadge({ children = "Sponsored" }: { children?: ReactNode }) {
  return (
    <span className={`${BADGE} bg-prize-soft text-fg border-prize/60 gap-1.5 border`}>
      <span aria-hidden="true" className="bg-prize size-1.5 rounded-full" />
      {typeof children === "string" ? <Typed>{children}</Typed> : children}
    </span>
  );
}
