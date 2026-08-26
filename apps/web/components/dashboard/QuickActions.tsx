"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { HIDDEN_HANDLE } from "@payday-pot/sdk";

import { Card, CardHeader } from "@/components/ui/Card";
import { potReadsStore } from "@/lib/pot/reads";
import { useStore } from "@/lib/store/external-store";

/**
 * Ba việc người dùng thật sự làm ở đây.
 *
 * "Withdraw everything" KHÔNG BAO GIỜ bị vô hiệu hoá và không bao giờ bị giấu —
 * non-negotiable #1. Nó khả dụng ở mọi phase, kể cả giữa lúc đang quay, kể cả
 * khi pool bị pause. Đó là lời hứa nền của sản phẩm "no-loss", và một lời hứa
 * chỉ đáng tin khi cái nút thực hiện nó có mặt ở mọi trạng thái — nói ra trong
 * README thì ai cũng nói được.
 */
export function QuickActions() {
  const reads = useStore(potReadsStore);

  // Ba trạng thái, không phải hai (non-negotiable #8). "Chưa có gì được chia cho
  // ví này" là một khẳng định về dữ liệu riêng tư — chỉ nói được khi đã ĐỌC ví đó
  // và thấy handle chưa khởi tạo. Chưa nối ví thì không biết, và "không biết"
  // phải nghe ra là không biết, chứ không được thu về thành "không có".
  const claim =
    reads.account === null
      ? "Winnings show up here once a round has been drawn and settled."
      : reads.account.pendingPrize === HIDDEN_HANDLE
        ? "Nothing has been settled to this wallet yet. It appears here after a round is drawn."
        : "You have a claimable balance recorded. Its amount is encrypted — reveal your position to see it.";

  return (
    <Card className="h-full">
      <CardHeader title="What you can do" hint="Every one of these is a transaction you sign yourself." />

      <ul className="flex flex-col gap-2">
        <Action href="/app/savings" primary title="Deposit" detail="Adds to your savings and starts earning weight." />
        <Action
          href="/app/savings#withdraw"
          title="Withdraw everything"
          detail="Works in every stage of every round, including while a draw is running or the pool is paused."
        />
        <Action
          href="/app/savings#claim"
          title="Claim your winnings"
          detail={claim}
        />
      </ul>
    </Card>
  );
}

function Action({
  href,
  title,
  detail,
  primary = false,
}: {
  href: string;
  title: string;
  detail: ReactNode;
  primary?: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        className={`rounded-control flex flex-col justify-center gap-0.5 px-4 py-3 transition-colors duration-(--duration-hover) ${
          primary ? "bg-action text-on-action hover:bg-action-hover" : "border-border-default border hover:bg-subtle"
        }`}
      >
        <span className="text-[15px] font-medium">{title}</span>
        <span className={`text-[12px] leading-relaxed ${primary ? "opacity-80" : "text-fg-muted"}`}>{detail}</span>
      </Link>
    </li>
  );
}
