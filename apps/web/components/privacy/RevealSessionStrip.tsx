"use client";

import { formatCountdown } from "@/lib/format";
import { useRevealController } from "@/lib/reveal/use-reveal";
import { useNow } from "@/lib/use-now";
import { Button } from "@/components/ui/Button";

/**
 * Thanh trạng thái của phiên reveal: còn bao lâu, và một nút tắt ngay.
 *
 * Đồng hồ đếm ngược ở đây không phải trang trí — nó là lời hứa TTL 5 phút được
 * viết ra thành thứ nhìn thấy được. Nếu người dùng không thấy nó chạy, họ không
 * có cách nào biết rằng số tiền đang hiện trên màn hình sẽ tự biến mất, và cái
 * "tự biến mất" đó sẽ bị đọc là bug thay vì là tính năng.
 */
export function RevealSessionStrip() {
  const { expiresAt, hasOpenReveals, hide } = useRevealController();
  const now = useNow();

  if (!hasOpenReveals || expiresAt === null || now === null) return null;

  const secondsLeft = Math.max(0, Math.ceil((expiresAt - now) / 1000));

  return (
    <div className="border-privacy/30 bg-privacy-subtle rounded-card flex flex-wrap items-center justify-between gap-3 border px-4 py-3">
      <p className="text-[13px]">
        <span className="font-medium">Values are visible in this tab only.</span>{" "}
        <span className="text-fg-muted">
          They hide again in <span className="tabular font-medium">{formatCountdown(secondsLeft)}</span>, or when you
          switch account, network or tab.
        </span>
      </p>
      <Button size="sm" variant="secondary" onClick={hide}>
        Hide now
      </Button>
    </div>
  );
}
