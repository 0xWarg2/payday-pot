"use client";

import { MASK_GLYPH, formatConfidential, type ConfidentialView } from "@/lib/format";
import type { RevealPhase } from "@/lib/reveal/store";

/**
 * Chỗ duy nhất một giá trị mã hoá được vẽ ra màn hình.
 *
 * Ba trạng thái, ba cách hiện khác nhau — không có nhánh nào ra `"0"`:
 *   unavailable → "Not available yet" (chưa có gì onchain)
 *   hidden      → •••••• (có, chỉ chưa mở)
 *   revealed    → con số thật, tabular, kèm dấu hiệu đang trong phiên có TTL
 *
 * Screen reader nhận `announce` chứ không nhận dãy chấm: "principal hidden" là
 * thông tin, "chấm chấm chấm chấm" thì không.
 */
export function ConfidentialValue({
  view,
  label,
  size = "lg",
}: {
  view: ConfidentialView;
  label: string;
  size?: "lg" | "md" | "sm";
}) {
  const display = formatConfidential(view, label);
  const scale =
    size === "lg" ? "text-[32px] sm:text-[36px]" : size === "md" ? "text-[22px]" : "text-[16px]";

  return (
    <span
      data-testid="confidential-value"
      data-state={view.kind}
      className={`${scale} leading-none font-semibold tracking-tight ${
        display.isPlain ? "tabular" : view.kind === "unavailable" ? "text-fg-muted font-normal" : "text-fg"
      }`}
    >
      <span aria-hidden="true">{display.text}</span>
      <span className="sr-only">{display.announce}</span>
    </span>
  );
}

const PHASE_COPY: Record<Exclude<RevealPhase, "MASKED" | "REVEALED">, string> = {
  // §12.1: bốn pha này KHÔNG được gộp thành một spinner. "Đang nạp thư viện mã
  // hoá" và "ví đang chờ bạn ký" là hai việc rất khác nhau với người đang nhìn
  // màn hình — gộp lại thì lần nào chậm cũng trông giống nhau và không ai biết
  // có phải mình cần bấm gì không.
  SDK_INITIALIZING: "Starting the encryption service…",
  ACL_CHECKING: "Checking that this value is yours to read…",
  AWAITING_EIP712_SIGNATURE: "Waiting for your signature in the wallet…",
  DECRYPTING: "Decrypting inside your browser…",
};

export function RevealPhaseLine({ phase }: { phase: Exclude<RevealPhase, "MASKED" | "REVEALED"> }) {
  return (
    <p role="status" className="text-fg-muted flex items-center gap-2 text-[13px]">
      <span
        aria-hidden="true"
        className="border-privacy size-3 animate-spin rounded-full border-2 border-t-transparent"
      />
      {PHASE_COPY[phase]}
    </p>
  );
}

/** Dãy chấm dùng ở chỗ chưa có `ConfidentialView` (ví dụ hàng lịch sử). */
export function MaskGlyph({ label }: { label: string }) {
  return (
    <span className="text-fg-muted">
      <span aria-hidden="true">{MASK_GLYPH}</span>
      <span className="sr-only">{label} hidden</span>
    </span>
  );
}
