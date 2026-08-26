"use client";

import { NoSsr } from "@/components/privacy/NoSsr";
import { TxRow } from "@/components/tx/TxRow";
import { Card, CardHeader } from "@/components/ui/Card";
import { SEPOLIA_CHAIN_ID } from "@/lib/chain/rpc";
import { useStore } from "@/lib/store/external-store";
import { txRecordsFor, txStore } from "@/lib/tx/store";
import { useNow } from "@/lib/use-now";

/**
 * Lịch sử — việc gì, lúc nào, hash nào. KHÔNG có số tiền, ở đâu cũng vậy.
 *
 * Đây không phải thiếu sót: danh sách hoạt động là thứ người ta hay chụp màn
 * hình gửi cho nhau (§11.4), và một cột "amount" ở đây sẽ vô hiệu hoá toàn bộ
 * phần còn lại của sản phẩm chỉ bằng một tấm ảnh. Số tiền chỉ sống ở position
 * card, sau một chữ ký, trong năm phút.
 *
 * Nguồn dữ liệu là localStorage của chính tab này — không backend, không index,
 * nên không nơi nào ngoài máy người dùng biết danh sách này tồn tại. Đổi lại,
 * nó không theo ví: đó là đánh đổi có chủ đích và được nói ra ngay trên thẻ.
 */
export function PrivateActivityList() {
  return (
    <NoSsr fallback={<Card className="min-h-[160px]" />}>
      <Inner />
    </NoSsr>
  );
}

function Inner() {
  const snapshot = useStore(txStore);
  const now = useNow(30_000);
  const records = txRecordsFor(snapshot, SEPOLIA_CHAIN_ID);

  return (
    <Card>
      <CardHeader title="Your activity" hint="Recorded in this browser only, never with an amount." />

      {records.length === 0 ? (
        <p className="text-fg-muted text-[14px] leading-relaxed">
          Nothing yet. Transactions you send from this browser show up here so you can follow them while they confirm.
        </p>
      ) : (
        <ul>
          {records.map((record) => (
            <TxRow
              key={record.txHash}
              record={record}
              status={snapshot.status.get(record.txHash) ?? "unknown"}
              now={now}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}
