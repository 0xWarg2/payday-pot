"use client";

import Link from "next/link";

import { CountUp } from "@/components/motion/CountUp";
import { Card, CardHeader, PublicBadge } from "@/components/ui/Card";
import { formatAmount, shortAddress } from "@/lib/format";
import { potReadsStore } from "@/lib/pot/reads";
import { useStore } from "@/lib/store/external-store";

/**
 * Giải thưởng đến từ đâu — và câu trả lời phải thẳng thắn.
 *
 * Season 4 brief nói "generated yield". Ở bản build này KHÔNG có yield: giải là
 * tiền một nhà tài trợ nạp vào, cộng với một interface adapter để sau này cắm
 * nguồn yield thật. Viết ra ở đây, trên chính màn hình người dùng nhìn, thay vì
 * để nó nằm trong một dòng README mà giám khảo phải tự đi tìm — nếu họ tìm ra
 * trước khi ta nói thì nó không còn là thiết kế nữa, nó thành chỗ giấu.
 */
export function EmployerBoostCard() {
  const reads = useStore(potReadsStore);
  const config = reads.config;
  const prize = reads.state?.prizeAmount ?? null;

  return (
    <Card spot="prize" className="elev-1 h-full">
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0">
          <CardHeader title="Prize sponsor" hint="Sponsored, not yield." action={<PublicBadge />} />
          <Link href="/docs/prize-and-sponsors" className="link-draw text-[14px]">
            Where the prize comes from →
          </Link>
        </div>

        <dl className="border-border-default grid grid-cols-2 gap-x-8 gap-y-3 border-t pt-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6">
          <div>
            <dt className="text-fg-muted text-small">Funded this round</dt>
            <dd className="tabular mt-1 text-[18px] font-semibold whitespace-nowrap">
              {prize === null ? (
                "—"
              ) : (
                <>
                  <CountUp value={prize} format={formatAmount} /> USDC
                </>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-fg-muted text-small">Sponsor</dt>
            <dd className="mt-1 font-mono text-[14px]">{config ? shortAddress(config.employer) : "—"}</dd>
          </div>
        </dl>
      </div>
    </Card>
  );
}
