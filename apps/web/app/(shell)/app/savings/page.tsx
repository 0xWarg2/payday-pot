import Link from "next/link";

import { Card, CardHeader, EncryptedBadge } from "@/components/ui/Card";

export const metadata = {
  title: "Savings · PayDay Pot",
  description: "Deposit into the pool, or take your savings back out.",
};

/**
 * Chỗ giữ cho luồng deposit/withdraw/claw (Day 7).
 *
 * Một trang trống thì tệ hơn không có trang: dashboard đã trỏ vào đây bằng ba
 * link, nên chỗ này phải nói được nó sẽ làm gì và — quan trọng hơn — nhắc lại
 * đúng lời hứa mà người dùng đang tin, thay vì để họ đứng trước một màn hình
 * câm và tự hỏi tiền mình đang ở đâu.
 */
export default function SavingsPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight sm:text-[30px]">Savings</h1>
        <p className="text-fg-muted mt-1 max-w-[62ch] text-[15px] leading-relaxed">
          Deposit, withdraw and claim all live here. The transaction flows land with the rest of the money handling.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Not built yet"
          hint="This page is a placeholder in this build."
          action={<EncryptedBadge>Will be encrypted</EncryptedBadge>}
        />
        <ul className="text-fg-muted flex flex-col gap-2 text-[14px] leading-relaxed">
          <li>
            <span className="text-fg font-medium">Deposit</span> — an encrypted amount goes in; the pool credits what
            actually arrived, not what you asked for.
          </li>
          <li>
            <span className="text-fg font-medium">Withdraw everything</span> — available in every stage of every round
            and while the pool is paused. That is a property of the contract, not of this screen.
          </li>
          <li>
            <span className="text-fg font-medium">Claim</span> — moves settled winnings into your balance without
            revealing whether you won.
          </li>
        </ul>
        <Link
          data-cta
          href="/app"
          className="rounded-control border-border-default bg-surface mt-4 inline-flex items-center px-4 text-[14px] font-medium"
        >
          Back to the dashboard
        </Link>
      </Card>
    </div>
  );
}
