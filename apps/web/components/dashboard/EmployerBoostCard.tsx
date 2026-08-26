"use client";

import Link from "next/link";

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
    <Card className="h-full">
      <CardHeader
        title="Where the prize comes from"
        hint="Sponsored, not earned as yield."
        action={<PublicBadge />}
      />

      <p className="text-fg-muted max-w-[56ch] text-[14px] leading-relaxed">
        An employer funds the prize for each round out of their own pocket. Nobody&rsquo;s deposit is ever spent on it,
        which is what makes losing a round cost you nothing.
      </p>

      <dl className="border-border-default mt-4 grid grid-cols-1 gap-3 border-t pt-4 sm:grid-cols-2">
        <div>
          <dt className="text-fg-muted text-[13px]">Funded so far this round</dt>
          <dd className="tabular mt-1 text-[18px] font-semibold">
            {prize === null ? "—" : `${formatAmount(prize)} USDC`}
          </dd>
        </div>
        <div>
          <dt className="text-fg-muted text-[13px]">Sponsor</dt>
          <dd className="mt-1 font-mono text-[14px]">
            {config ? shortAddress(config.employer) : "—"}
          </dd>
        </div>
      </dl>

      <p className="text-fg-muted mt-4 max-w-[56ch] text-[13px] leading-relaxed">
        The contract takes prize funding through an adapter interface, so a real yield source could pay the prize
        instead. None is connected in this build.{" "}
        <Link href="/docs/known-limitations" className="underline underline-offset-4">
          What else is simulated
        </Link>
      </p>
    </Card>
  );
}
