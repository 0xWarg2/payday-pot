"use client";

import { formatRelativeTime, shortHash } from "@/lib/format";
import type { HistoryAction, HistoryItem } from "@/lib/tx/history";
import type { TxRecord, TxStatus } from "@/lib/tx/store";

export const EXPLORER = "https://sepolia.etherscan.io";

const ACTION_LABELS: Record<HistoryAction, string> = {
  "faucet-mint": "Got test USDC",
  approve: "Approved the wrapper",
  wrap: "Shielded USDC",
  register: "Joined the round",
  deposit: "Deposited",
  "finalize-unwrap": "Finished an unwrap",
  claim: "Claimed",
  withdraw: "Withdrew",
  "fund-prize": "Funded the prize",
  "begin-snapshot": "Closed the round",
  snapshot: "Snapshotted balances",
  "request-random": "Requested randomness",
  select: "Scanned for the winner",
  "start-new-epoch": "Opened a new round",
};

const STATUS_COPY: Record<TxStatus, { label: string; dot: string }> = {
  pending: { label: "Pending", dot: "bg-warning" },
  success: { label: "Confirmed", dot: "bg-success" },
  reverted: { label: "Failed", dot: "bg-danger" },
  unknown: { label: "Unknown", dot: "bg-border-default" },
};

/** Một record của trình duyệt, chưa gộp với chain — cho TxCenter. */
export function localItem(record: TxRecord, status: TxStatus, blockNumber?: number): HistoryItem {
  return {
    txHash: record.txHash,
    action: record.action,
    epochId: record.epochId,
    createdAt: record.createdAt,
    blockNumber,
    status,
    source: "browser",
  };
}

/**
 * Một dòng lịch sử: việc gì, lúc nào (hoặc block nào), hash nào. KHÔNG có số
 * tiền — không phải vì quên, mà vì lịch sử là thứ người ta hay chụp màn hình
 * gửi đi (§11.4). Số tiền chỉ sống ở position card, sau một chữ ký, trong năm phút.
 *
 * Hàng đọc từ chain không có "lúc mấy giờ" (lấy timestamp là thêm một RPC mỗi
 * hàng) nên in số block; hàng từ trình duyệt in thời gian tương đối như cũ.
 */
export function TxRow({ item, now }: { item: HistoryItem; now: number | null }) {
  const state = STATUS_COPY[item.status];
  const when =
    item.createdAt !== undefined
      ? now === null
        ? ""
        : formatRelativeTime(item.createdAt, now)
      : item.blockNumber !== undefined
        ? `block ${item.blockNumber.toLocaleString("en-US")}`
        : "";
  const round = item.epochId ? `round ${item.epochId}` : "";
  return (
    <li className="border-border-default flex items-center justify-between gap-3 border-b py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate text-[14px] font-medium">{ACTION_LABELS[item.action]}</p>
        <p className="text-fg-muted text-[12px]">
          {[when, round].filter(Boolean).join(" · ")}
          {item.source === "browser" ? (
            <span className="font-mono text-[11px] tracking-[0.04em]"> · this browser</span>
          ) : (
            <span className="font-mono text-[11px] tracking-[0.04em]"> · on chain</span>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="text-fg-muted flex items-center gap-1.5 text-[12px]">
          <span aria-hidden="true" className={`size-1.5 rounded-full ${state.dot}`} />
          {state.label}
        </span>
        <a
          href={`${EXPLORER}/tx/${item.txHash}`}
          target="_blank"
          rel="noreferrer"
          className="text-fg-muted font-mono text-[12px] underline underline-offset-4"
        >
          {shortHash(item.txHash)}
        </a>
      </div>
    </li>
  );
}
