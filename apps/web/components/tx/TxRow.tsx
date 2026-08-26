"use client";

import { formatRelativeTime, shortHash } from "@/lib/format";
import type { TxAction, TxRecord, TxStatus } from "@/lib/tx/store";

export const EXPLORER = "https://sepolia.etherscan.io";

const ACTION_LABELS: Record<TxAction, string> = {
  "faucet-mint": "Got test USDC",
  approve: "Approved the wrapper",
  wrap: "Shielded USDC",
  deposit: "Deposited",
  unwrap: "Requested an unwrap",
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

/**
 * Một dòng lịch sử: việc gì, lúc nào, hash nào. KHÔNG có số tiền — không phải
 * vì quên, mà vì lịch sử là thứ người ta hay chụp màn hình gửi đi (§11.4). Số
 * tiền chỉ sống ở position card, sau một chữ ký, trong năm phút.
 */
export function TxRow({ record, status, now }: { record: TxRecord; status: TxStatus; now: number | null }) {
  const state = STATUS_COPY[status];
  return (
    <li className="border-border-default flex items-center justify-between gap-3 border-b py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate text-[14px] font-medium">{ACTION_LABELS[record.action]}</p>
        <p className="text-fg-muted text-[12px]">
          {now === null ? "" : formatRelativeTime(record.createdAt, now)}
          {record.epochId ? ` · round ${record.epochId}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="text-fg-muted flex items-center gap-1.5 text-[12px]">
          <span aria-hidden="true" className={`size-1.5 rounded-full ${state.dot}`} />
          {state.label}
        </span>
        <a
          href={`${EXPLORER}/tx/${record.txHash}`}
          target="_blank"
          rel="noreferrer"
          className="text-fg-muted font-mono text-[12px] underline underline-offset-4"
        >
          {shortHash(record.txHash)}
        </a>
      </div>
    </li>
  );
}
