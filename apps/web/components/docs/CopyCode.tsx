"use client";

import { useEffect, useState } from "react";

/**
 * Khối mã sao chép được — địa chỉ, hash, lệnh shell.
 *
 * `break-all` là bắt buộc: một địa chỉ 42 ký tự không có chỗ ngắt, và ở 320px
 * nó là thứ duy nhất trên trang có thể đẩy body tràn ngang.
 */
export function CopyCode({ code, label, href, hrefLabel }: { code: string; label?: string; href?: string; hrefLabel?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // Clipboard bị chặn (iframe, quyền) — người dùng vẫn bôi đen chép tay được.
    }
  }

  return (
    <div className="border-border-default bg-subtle rounded-control mt-4 border">
      {(label || href) && (
        <div className="border-border-default flex items-center gap-3 border-b px-4 py-2">
          {label && <span className="text-fg-muted font-mono text-[11px] tracking-[0.08em] uppercase">{label}</span>}
          {href && (
            <a href={href} target="_blank" rel="noreferrer" className="ml-auto text-[13px] underline underline-offset-4">
              {hrefLabel ?? "Open"}
            </a>
          )}
        </div>
      )}
      <div className="flex items-start gap-3 px-4 py-3">
        <pre className="min-w-0 flex-1 font-mono text-[13px] leading-relaxed break-all whitespace-pre-wrap">{code}</pre>
        <button
          type="button"
          onClick={copy}
          className="rounded-control border-border-default bg-surface hover:bg-canvas shrink-0 border px-2.5 py-1 text-[12px] font-medium transition-colors duration-(--duration-hover) ease-(--ease-ui)"
        >
          <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
    </div>
  );
}
