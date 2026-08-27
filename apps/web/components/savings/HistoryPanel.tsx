"use client";

import { NoSsr } from "@/components/privacy/NoSsr";
import { TxRow } from "@/components/tx/TxRow";
import { SEPOLIA_CHAIN_ID } from "@/lib/chain/rpc";
import { useStore } from "@/lib/store/external-store";
import { txRecordsFor, txStore } from "@/lib/tx/store";
import { useNow } from "@/lib/use-now";

/**
 * Lịch sử — và cố ý là một lịch sử KÉM đầy đủ.
 *
 * Không có số tiền, không có chỉ báo bạn thắng hay không, không có gì mà một ảnh
 * chụp màn hình gửi cho người khác có thể tiết lộ (§11.4). Nó cũng không đến từ
 * một backend: chỉ những gì tab này từng tự gửi, đọc từ localStorage. Không có
 * index nào ở đâu biết ví của bạn đã làm gì.
 *
 * `NoSsr` không phải để tránh warning: render localStorage ở server là không thể,
 * và một danh sách nhấp nháy giữa rỗng và có dữ liệu ở màn hình tiền bạc thì
 * trông như vừa mất một giao dịch.
 */
export function HistoryPanel() {
  return (
    <NoSsr>
      <HistoryInner />
    </NoSsr>
  );
}

function HistoryInner() {
  const snapshot = useStore(txStore);
  const now = useNow(30_000);
  const records = txRecordsFor(snapshot, SEPOLIA_CHAIN_ID);

  return (
    <div className="border-border-default rounded-card border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[15px] font-semibold tracking-tight">This browser&rsquo;s transactions</p>
        <span className="text-fg-muted text-[12px]">no amounts recorded</span>
      </div>

      {records.length === 0 ? (
        <p className="text-fg-muted mt-3 max-w-[68ch] text-[13px] leading-relaxed">
          Nothing yet. Transactions you send from this browser show up here with what they did and when — never with how
          much. Clearing your browser data clears this list; it does not change anything in the pool.
        </p>
      ) : (
        <>
          <ul className="mt-2">
            {records.map((record) => (
              <TxRow
                key={record.txHash}
                record={record}
                status={snapshot.status.get(record.txHash) ?? "unknown"}
                now={now}
              />
            ))}
          </ul>
          <p className="text-fg-muted mt-3 max-w-[68ch] text-[13px] leading-relaxed">
            Statuses are rebuilt from the chain every time this page loads, so closing the tab mid-transaction loses
            nothing. <span className="text-fg font-medium">Pending</span> means no block has included it yet;
            <span className="text-fg font-medium"> Unknown</span> means this browser could not reach Sepolia to ask.
            Either way the hash still opens on the explorer.
          </p>
        </>
      )}
    </div>
  );
}
