"use client";

import { NoSsr } from "@/components/privacy/NoSsr";
import { HistoryList } from "@/components/tx/HistoryList";
import { Card, CardHeader } from "@/components/ui/Card";

/**
 * Lịch sử — việc gì, lúc nào, hash nào. KHÔNG có số tiền, ở đâu cũng vậy.
 *
 * Đây không phải thiếu sót: danh sách hoạt động là thứ người ta hay chụp màn
 * hình gửi cho nhau (§11.4), và một cột "amount" ở đây sẽ vô hiệu hoá toàn bộ
 * phần còn lại của sản phẩm chỉ bằng một tấm ảnh. Số tiền chỉ sống ở position
 * card, sau một chữ ký, trong năm phút.
 *
 * Hai nguồn: tx trình duyệt này gửi (localStorage) và tx của ví đọc từ chain
 * (`lib/tx/chain-history.ts`) — không backend, không index của riêng app.
 */
export function PrivateActivityList() {
  return (
    <NoSsr fallback={<Card className="min-h-[160px]" />}>
      <Card className="elev-1">
        <CardHeader title="Your activity" hint="From your wallet's history on chain and this browser." />
        <HistoryList />
      </Card>
    </NoSsr>
  );
}
