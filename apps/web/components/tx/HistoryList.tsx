"use client";

import { EXPLORER, TxRow } from "@/components/tx/TxRow";
import { retryChainHistory } from "@/lib/tx/chain-history";
import { useMergedHistory } from "@/lib/tx/use-history";
import { useNow } from "@/lib/use-now";

/**
 * Danh sách lịch sử dùng chung cho dashboard và tab Savings.
 *
 * Hai nguồn, một danh sách: tx trình duyệt này đã gửi (localStorage, có giờ)
 * và tx của ví đọc từ chain (có block, ở máy nào cũng thấy). KHÔNG có số tiền
 * ở bất kỳ hàng nào — xem `TxRow`.
 *
 * Bảng trạng thái — hàng local LUÔN hiện, bất kể chain đang ở trạng thái gì:
 *   chưa ví            → hàng local + mời kết nối để thấy thêm lịch sử on-chain
 *   loading, 0 hàng    → skeleton + "Reading…"        (KHÔNG "Nothing yet")
 *   loading, có hàng   → list + "Checking the chain…"
 *   ready, 0           → "Nothing yet."
 *   ready, >0          → list + nguồn
 *   unavailable, 0     → cảnh báo + Try again + link explorer + hàng local (nếu có)
 *   unavailable, >0    → list + "couldn't be refreshed" + Try again
 */
export function HistoryList({ dense = false }: { dense?: boolean }) {
  const { items, chain, address } = useMergedHistory();
  const now = useNow(30_000);
  const note = `text-fg-muted ${dense ? "mt-2 text-[12px]" : "mt-3 text-[13px]"} max-w-[68ch] leading-relaxed`;

  const list =
    items.length > 0 ? (
      <ul className={dense ? "mt-1" : "mt-2"}>
        {items.map((item) => (
          <TxRow key={item.txHash} item={item} now={now} />
        ))}
      </ul>
    ) : null;

  if (address === null || chain.key === null) {
    return (
      <>
        {list}
        <p className={note}>
          {items.length === 0 ? "Nothing yet from this browser. " : ""}
          Connect a wallet to also see its on-chain activity.
        </p>
      </>
    );
  }

  const retry = (
    <button
      type="button"
      onClick={() => void retryChainHistory(address)}
      className="text-fg rounded-control border-border-default hover:bg-subtle ml-2 inline-flex min-h-[32px] items-center border px-2.5 text-[12px] font-medium"
    >
      Try again
    </button>
  );

  if (chain.status === "loading") {
    return (
      <>
        {list ?? (
          <div aria-hidden="true" className="mt-2 flex flex-col gap-2">
            <div className="bg-subtle motion-reduce:animate-none h-10 animate-pulse rounded-[8px]" />
            <div className="bg-subtle motion-reduce:animate-none h-10 animate-pulse rounded-[8px]" />
          </div>
        )}
        <p className={note} role="status">
          {list ? "Checking the chain for older activity…" : "Reading your history from the chain…"}
        </p>
      </>
    );
  }

  if (chain.status === "unavailable") {
    return (
      <>
        {list}
        <div
          role="status"
          className={`border-warning/40 bg-warning/5 rounded-control mt-3 flex flex-wrap items-center gap-y-2 border px-3 py-2 ${dense ? "text-[12px]" : "text-[13px]"} leading-relaxed`}
        >
          <span className="text-fg">
            {list
              ? "Chain history couldn't be refreshed — showing what loaded earlier."
              : "Couldn't read your history from the chain right now."}
            {!list ? " Transactions sent from this browser still appear here; the full list is on the explorer." : ""}
          </span>
          {retry}
          <a
            href={`${EXPLORER}/address/${address}`}
            target="_blank"
            rel="noreferrer"
            className="text-fg-muted ml-2 font-mono text-[12px] underline underline-offset-4"
          >
            explorer
          </a>
        </div>
      </>
    );
  }

  if (items.length === 0) return <p className={note}>Nothing yet.</p>;

  return (
    <>
      {list}
      <p className={note}>From your wallet&rsquo;s history on chain and this browser. No amounts, ever.</p>
    </>
  );
}
