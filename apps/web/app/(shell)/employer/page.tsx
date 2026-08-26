import Link from "next/link";

import { RoleGate } from "@/components/guards/RoleGate";
import { Card, CardHeader, PublicBadge } from "@/components/ui/Card";

export const metadata = {
  title: "Sponsor · PayDay Pot",
  description: "Fund the prize for a round without seeing anyone's balance.",
};

/**
 * Góc nhìn nhà tài trợ. Placeholder cho tới khi luồng fundPrize được dựng.
 *
 * `RoleGate` ở đây là một cách xem, KHÔNG phải một quyền: quyền thật nằm ở
 * `EMPLOYER` trong contract, và không vai trò nào ở client mở được dữ liệu của
 * ai. Cổng này chỉ để màn hình khỏi nói chuyện với sai người, nên nó luôn có nút
 * đi tiếp thay vì chặn cứng.
 */
export default function EmployerPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight sm:text-[30px]">Sponsor a round</h1>
        <p className="text-fg-muted mt-1 max-w-[62ch] text-[15px] leading-relaxed">
          You put up the prize. You never see who deposited how much — including in your own pool.
        </p>
      </div>

      <RoleGate role="employer">
        <Card>
          <CardHeader
            title="Not built yet"
            hint="Funding a prize lands with the sponsor flow."
            action={<PublicBadge>Prize is public</PublicBadge>}
          />
          <p className="text-fg-muted max-w-[60ch] text-[14px] leading-relaxed">
            The prize amount is deliberately public: it is your money, not anyone&rsquo;s savings, and a prize nobody can
            verify is not much of a prize. What stays encrypted is everything on the other side — balances, weights, and
            which address ends up winning.
          </p>
          <p className="text-fg-muted mt-3 max-w-[60ch] text-[14px] leading-relaxed">
            Being the sponsor grants no read access to any of it. The contract gives you no ACL over a saver&rsquo;s
            principal, weight or winnings.
          </p>
          <Link
            data-cta
            href="/app"
            className="rounded-control border-border-default bg-surface mt-4 inline-flex items-center px-4 text-[14px] font-medium"
          >
            Back to the dashboard
          </Link>
        </Card>
      </RoleGate>
    </div>
  );
}
