"use client";

import { useEffect, useRef, useState } from "react";

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
  surface = "shell",
}: {
  view: ConfidentialView;
  label: string;
  size?: "lg" | "md" | "sm";
  /** Phòng tối có token chữ riêng; `text-fg` của shell trên `draw-surface` là 1.05:1 — vô hình. */
  surface?: "shell" | "draw";
}) {
  const tone = TONE[surface];
  const display = formatConfidential(view, label);
  const frame = useDecryptScramble(view.kind, display.text);
  const scale =
    size === "lg" ? "text-[32px] sm:text-[36px]" : size === "md" ? "text-[22px]" : "text-[16px]";

  return (
    <span
      data-testid="confidential-value"
      data-state={view.kind}
      data-surface={surface}
      className={`${scale} leading-none font-semibold tracking-tight ${
        display.isPlain ? `tabular ${tone.fg}` : view.kind === "unavailable" ? `${tone.muted} font-normal` : tone.fg
      }`}
    >
      <span aria-hidden="true" className={frame === null ? undefined : "scrambling"}>
        {frame ?? display.text}
      </span>
      <span className="sr-only">{display.announce}</span>
    </span>
  );
}

const TONE = {
  shell: { fg: "text-fg", muted: "text-fg-muted" },
  draw: { fg: "text-draw-fg", muted: "text-draw-fg-muted" },
} as const;

const SCRAMBLE_GLYPHS = "▪▫◆◇◈●○◐◑░▒▓";
const SCRAMBLE_MS = 500;

/**
 * Khoảnh khắc mở khoá (depth kit #04): •••••• → glyph ngẫu nhiên → con số, trong
 * 500ms, mở dần từ trái sang phải.
 *
 * Chỉ chạy khi giá trị ĐÃ decrypt xong và chuyển từ `hidden` sang `revealed` —
 * tức là chủ ví vừa ký và con số này là của họ. Không chạy khi mount thẳng ở
 * `revealed` (không có gì để "mở"), và không chạy chiều ngược lại: ẩn đi là tức
 * thời, vì che một con số phải nhanh hơn hiện nó.
 *
 * Glyph thay chỗ là ký hiệu hình học, KHÔNG BAO GIỜ là chữ số — một chữ số giả
 * trong 200ms vẫn là một chữ số sai trên màn hình về tiền. Ký tự phân cách
 * (`.` `,`) giữ nguyên để hình dạng con số không nhảy.
 *
 * `prefers-reduced-motion` ⇒ không có frame nào, con số hiện ngay.
 */
function useDecryptScramble(kind: ConfidentialView["kind"], text: string): string | null {
  const [frame, setFrame] = useState<string | null>(null);
  const previous = useRef(kind);

  useEffect(() => {
    const was = previous.current;
    previous.current = kind;

    if (!(was === "hidden" && kind === "revealed")) {
      setFrame((f) => (f === null ? f : null));
      return;
    }
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      typeof window.requestAnimationFrame !== "function"
    ) {
      return;
    }

    const start = performance.now();
    const n = text.length;
    let raf = 0;
    const tick = (now: number): void => {
      const k = Math.min(1, (now - start) / SCRAMBLE_MS);
      const settled = Math.floor(k * n);
      if (k >= 1) {
        setFrame(null);
        return;
      }
      let s = text.slice(0, settled);
      for (let i = settled; i < n; i++) {
        const c = text[i] ?? "";
        s += c === "." || c === "," ? c : SCRAMBLE_GLYPHS[Math.floor(Math.random() * SCRAMBLE_GLYPHS.length)];
      }
      setFrame(s);
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(raf);
      setFrame((f) => (f === null ? f : null));
    };
  }, [kind, text]);

  return frame;
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

export function RevealPhaseLine({
  phase,
  surface = "shell",
}: {
  phase: Exclude<RevealPhase, "MASKED" | "REVEALED">;
  surface?: "shell" | "draw";
}) {
  return (
    <p role="status" className={`${TONE[surface].muted} flex items-center gap-2 text-[13px]`}>
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
