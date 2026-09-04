"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
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
      ? "After a round settles."
      : reads.account.pendingPrize === HIDDEN_HANDLE
        ? "Nothing settled to this wallet yet."
        : "Recorded — reveal to see it.";

  return (
    <Card className="elev-1 h-full">
      <CardHeader title="Actions" />

      <ul className="flex flex-col gap-2">
        <Action n={0} href="/app/savings" primary title="Deposit" detail="Earns weight right away." />
        <Action
          n={1}
          href="/app/savings#withdraw"
          title="Withdraw everything"
          detail="Any time, even while paused."
        />
        <Action
          n={2}
          href="/app/savings#claim"
          title="Claim your winnings"
          detail={claim}
        />
      </ul>
    </Card>
  );
}

function Action({
  n,
  href,
  title,
  detail,
  primary = false,
}: {
  n: number;
  href: string;
  title: string;
  detail: ReactNode;
  primary?: boolean;
}) {
  return (
    <li className="in-item" style={{ "--n": n } as CSSProperties}>
      <Link
        href={href}
        className={`rounded-control flex flex-col justify-center gap-0.5 px-4 py-3 transition-colors duration-(--duration-hover) ${
          primary ? "bg-action text-on-action hover:bg-action-hover" : "border-border-default border hover:bg-subtle"
        }`}
      >
        <span className="text-body font-medium">{title}</span>
        <span className={`text-caption leading-relaxed ${primary ? "opacity-80" : "text-fg-muted"}`}>{detail}</span>
      </Link>
    </li>
  );
}
