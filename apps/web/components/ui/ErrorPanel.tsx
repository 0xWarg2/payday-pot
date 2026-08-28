"use client";

import Link from "next/link";
import type { PotError, RecoveryAction } from "@payday-pot/sdk";

import { Button, type ButtonSurface } from "./Button";

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

/**
 * Panel lỗi phải đọc được ở CẢ HAI bối cảnh.
 *
 * Không phải chuyện thẩm mỹ: `text-fg-muted` (#66706c) trên nền phòng tối chỉ
 * đạt ~2.4:1, tức là dòng giải thích cách thoát khỏi lỗi sẽ gần như biến mất
 * đúng lúc người ta cần đọc nó nhất. Và Draw Room dùng lại nguyên xi taxonomy
 * lỗi của phần còn lại (Day 7: `toPotError()` là cửa DUY NHẤT vào đây), nên
 * cách sửa không thể là viết một panel thứ hai.
 */
const PANEL_SURFACE: Record<ButtonSurface, { shell: string; body: string; docsLink: string }> = {
  shell: {
    shell: "border-danger/30 bg-danger/5",
    body: "text-fg-muted",
    docsLink: "border-border-default bg-surface",
  },
  draw: {
    shell: "border-danger/45 bg-draw-canvas/70",
    body: "text-draw-fg-muted",
    docsLink: "border-draw-border bg-draw-surface text-draw-fg",
  },
};

export function ErrorPanel({
  error,
  handlers = {},
  onDismiss,
  surface = "shell",
}: {
  error: PotError;
  handlers?: RecoveryHandlers;
  onDismiss?: () => void;
  surface?: ButtonSurface;
}) {
  const handler = handlers[error.action.kind];
  const href = error.action.kind === "docs" ? error.action.href : KNOWN_LIMITATIONS;
  const palette = PANEL_SURFACE[surface];

  return (
    <div
      role="alert"
      // Next tự render một `role="alert"` rỗng (route announcer) trong mọi trang,
      // nên `getByRole("alert")` không định vị được panel này. Test hook riêng.
      data-testid="error-panel"
      className={`rounded-card flex flex-col gap-3 border p-4 sm:flex-row sm:items-start sm:justify-between ${palette.shell}`}
    >
      <div className="min-w-0">
        <p className="text-[14px] font-semibold">{error.title}</p>
        <p className={`mt-1 text-[13px] leading-relaxed ${palette.body}`}>{error.detail}</p>
        {error.row ? (
          <p className={`mt-2 text-[11px] tracking-wide uppercase ${palette.body}`}>Recovery {error.row}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {onDismiss ? (
          <Button size="sm" variant="ghost" surface={surface} onClick={onDismiss}>
            Dismiss
          </Button>
        ) : null}
        {handler ? (
          <Button size="sm" variant="secondary" surface={surface} onClick={handler}>
            {LABELS[error.action.kind]}
          </Button>
        ) : (
          <Link
            data-cta
            href={href}
            className={`rounded-control inline-flex items-center border px-3 text-[14px] font-medium ${palette.docsLink}`}
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
  surface = "shell",
}: {
  tone?: "warning" | "privacy";
  title: string;
  detail: string;
  action?: { label: string; onClick: () => void; loading?: boolean };
  surface?: ButtonSurface;
}) {
  const palette =
    surface === "draw"
      ? tone === "warning"
        ? "border-warning/50 bg-draw-canvas/70"
        : "border-privacy/40 bg-draw-canvas/70"
      : tone === "warning"
        ? "border-warning/30 bg-warning/5"
        : "border-privacy/30 bg-privacy-subtle";
  return (
    <div className={`rounded-card flex flex-col gap-3 border p-4 sm:flex-row sm:items-center sm:justify-between ${palette}`}>
      <div className="min-w-0">
        <p className="text-[14px] font-semibold">{title}</p>
        <p className={`mt-1 text-[13px] leading-relaxed ${surface === "draw" ? "text-draw-fg-muted" : "text-fg-muted"}`}>
          {detail}
        </p>
      </div>
      {action ? (
        <Button size="sm" variant="secondary" surface={surface} onClick={action.onClick} loading={action.loading ?? false}>
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
