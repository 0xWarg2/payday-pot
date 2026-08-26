"use client";

import { useState } from "react";

import { SEPOLIA_CHAIN_ID } from "@/lib/chain/rpc";
import { useStore } from "@/lib/store/external-store";
import { txRecordsFor, txStore } from "@/lib/tx/store";
import { useNow } from "@/lib/use-now";
import { NoSsr } from "@/components/privacy/NoSsr";
import { TxRow } from "./TxRow";

/**
 * Trung tâm giao dịch — mọi tx app này từng gửi từ trình duyệt của bạn.
 *
 * Sống ở shell chứ không nằm trong từng màn hình, vì một tx được gửi ở
 * onboarding vẫn phải theo dõi được từ dashboard. Danh sách chỉ đọc từ
 * localStorage của chính tab này: không có backend, không có index, và vì thế
 * không có nơi nào ngoài máy người dùng biết họ đã làm gì.
 */
export function TxCenter() {
  return (
    <NoSsr>
      <TxCenterInner />
    </NoSsr>
  );
}

function TxCenterInner() {
  const snapshot = useStore(txStore);
  const now = useNow(30_000);
  const [open, setOpen] = useState(false);

  const records = txRecordsFor(snapshot, SEPOLIA_CHAIN_ID);
  if (records.length === 0) return null;

  const pending = records.filter((r) => (snapshot.status.get(r.txHash) ?? "unknown") === "pending").length;

  return (
    <div className="fixed right-4 bottom-4 z-40 w-[min(380px,calc(100vw-2rem))]">
      {open ? (
        <div className="border-border-default bg-surface rounded-card mb-2 border p-4 shadow-lg">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-[14px] font-semibold">Your transactions</h2>
            <span className="text-fg-muted text-[12px]">this browser only</span>
          </div>
          <p className="text-fg-muted mb-2 text-[12px]">Amounts are never recorded here.</p>
          <ul className="max-h-[45vh] overflow-y-auto">
            {records.map((record) => (
              <TxRow
                key={record.txHash}
                record={record}
                status={snapshot.status.get(record.txHash) ?? "unknown"}
                now={now}
              />
            ))}
          </ul>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="rounded-control border-border-default bg-surface ml-auto flex items-center gap-2 border px-4 text-[14px] font-medium shadow-sm"
      >
        {pending > 0 ? (
          <span aria-hidden="true" className="bg-warning size-2 animate-pulse rounded-full" />
        ) : null}
        {pending > 0 ? `${pending} pending` : "Transactions"}
      </button>
    </div>
  );
}
