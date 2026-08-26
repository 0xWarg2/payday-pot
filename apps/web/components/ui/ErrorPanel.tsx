"use client";

import Link from "next/link";
import type { PotError, RecoveryAction } from "@payday-pot/sdk";

import { Button } from "./Button";

/**
 * Một lỗi, một hành động đi tiếp.
 *
 * UI không bao giờ tự chế thông điệp lỗi — nó nhận `PotError` từ
 * `classifyError` và render `title`/`detail`/`action`. Hai luật của
 * ERROR_RECOVERY_MATRIX được thực thi ở đây: (1) không có dead end — thiếu
 * handler thì rơi về link tài liệu chứ không phải một panel cụt; (2) không có
 * số tiền trong thông điệp, việc đó đã được bảo đảm ở tầng taxonomy.
 */
export type RecoveryHandlers = Partial<Record<RecoveryAction["kind"], () => void>>;

const LABELS: Record<RecoveryAction["kind"], string> = {
  retry: "Try again",
  "switch-network": "Switch to Sepolia",
  "connect-wallet": "Connect wallet",
  approve: "Approve token",
  "get-test-assets": "Get test USDC",
  "reveal-again": "Reveal again",
  "continue-draw": "Continue draw",
  "resume-unwrap": "Resume unwrap",
  "edit-amount": "Edit amount",
  "wait-for-epoch": "Back to dashboard",
  docs: "Read the limitations",
};

const KNOWN_LIMITATIONS = "/docs/known-limitations";

export function ErrorPanel({
  error,
  handlers = {},
  onDismiss,
}: {
  error: PotError;
  handlers?: RecoveryHandlers;
  onDismiss?: () => void;
}) {
  const handler = handlers[error.action.kind];
  const href = error.action.kind === "docs" ? error.action.href : KNOWN_LIMITATIONS;

  return (
    <div
      role="alert"
      // Next tự render một `role="alert"` rỗng (route announcer) trong mọi trang,
      // nên `getByRole("alert")` không định vị được panel này. Test hook riêng.
      data-testid="error-panel"
      className="border-danger/30 bg-danger/5 rounded-card flex flex-col gap-3 border p-4 sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="min-w-0">
        <p className="text-[14px] font-semibold">{error.title}</p>
        <p className="text-fg-muted mt-1 text-[13px] leading-relaxed">{error.detail}</p>
        {error.row ? (
          <p className="text-fg-muted mt-2 text-[11px] tracking-wide uppercase">Recovery {error.row}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {onDismiss ? (
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            Dismiss
          </Button>
        ) : null}
        {handler ? (
          <Button size="sm" variant="secondary" onClick={handler}>
            {LABELS[error.action.kind]}
          </Button>
        ) : (
          <Link
            data-cta
            href={href}
            className="rounded-control border-border-default bg-surface inline-flex items-center px-3 text-[14px] font-medium"
          >
            {LABELS["docs"]}
          </Link>
        )}
      </div>
    </div>
  );
}

/** Banner cảnh báo (không phải lỗi): dùng cho sai mạng, SDK chậm, unwrap treo. */
export function NoticeBanner({
  tone = "warning",
  title,
  detail,
  action,
}: {
  tone?: "warning" | "privacy";
  title: string;
  detail: string;
  action?: { label: string; onClick: () => void; loading?: boolean };
}) {
  const palette =
    tone === "warning" ? "border-warning/30 bg-warning/5" : "border-privacy/30 bg-privacy-subtle";
  return (
    <div className={`rounded-card flex flex-col gap-3 border p-4 sm:flex-row sm:items-center sm:justify-between ${palette}`}>
      <div className="min-w-0">
        <p className="text-[14px] font-semibold">{title}</p>
        <p className="text-fg-muted mt-1 text-[13px] leading-relaxed">{detail}</p>
      </div>
      {action ? (
        <Button size="sm" variant="secondary" onClick={action.onClick} loading={action.loading ?? false}>
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
