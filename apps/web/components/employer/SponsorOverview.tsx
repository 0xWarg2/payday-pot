"use client";

import { PublicBadge } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatAmount, formatCountdown, shortAddress } from "@/lib/format";
import { potReadsStore } from "@/lib/pot/reads";
import { useStore } from "@/lib/store/external-store";
import { useNow } from "@/lib/use-now";
import { walletStore } from "@/lib/wallet/store";

/**
 * Tình trạng vòng hiện tại, nhìn từ phía nhà tài trợ.
 *
 * Mọi con số ở đây là plaintext onchain, đọc được bởi bất kỳ ai — prize
 * (`prizeAmountOf` là `uint64` công khai, cố ý theo PRIVACY §1), số người tham
 * gia, phase, giờ đóng. Cố tình không có chỗ nào cho một giá trị mã hoá: nếu
 * trang này có một ô "tổng tiết kiệm của nhân viên" thì dù có mask đi, nó vẫn dạy
 * employer rằng ở đâu đó có một quyền xem — và không có quyền đó.
 *
 * `participantCount` là công khai và ta không giấu nó: sản phẩm bảo mật **số
 * tiền**, không hứa che address hay timing, và nói quá lên chỉ là một cách mất
 * uy tín ở vòng chấm.
 */
export function SponsorOverview() {
  const reads = useStore(potReadsStore);
  const wallet = useStore(walletStore);
  const now = useNow(1_000);

  const state = reads.state;
  const config = reads.config;
  const isSponsor =
    config !== null && wallet.address !== null && config.employer.toLowerCase() === wallet.address.toLowerCase();

  return (
    <div className="border-border-default rounded-card border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] font-semibold tracking-tight">
          Round {state === null ? "—" : state.epochId.toString()}
        </p>
        <PublicBadge>Everything on this card is public</PublicBadge>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <dt className="text-fg-muted text-[12px] tracking-wide uppercase">Prize allocated</dt>
          <dd className="tabular mt-1 text-[22px] leading-none font-semibold tracking-tight">
            {state === null ? (
              <Skeleton className="h-[22px] w-[90px]" />
            ) : (
              <>
                {formatAmount(state.prizeAmount)} <span className="text-fg-muted text-[13px] font-normal">USDC</span>
              </>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-fg-muted text-[12px] tracking-wide uppercase">Savers in</dt>
          <dd className="tabular mt-1 text-[22px] leading-none font-semibold tracking-tight">
            {state === null ? <Skeleton className="h-[22px] w-[50px]" /> : state.participantCount}
            {config !== null ? (
              <span className="text-fg-muted text-[13px] font-normal"> / {config.participantCap}</span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-fg-muted text-[12px] tracking-wide uppercase">Stage</dt>
          <dd className="mt-1 text-[15px] font-medium">{state?.phase ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-fg-muted text-[12px] tracking-wide uppercase">Deposits close in</dt>
          <dd className="tabular mt-1 text-[15px] font-medium">
            {state === null || now === null
              ? "—"
              : state.phase !== "Open"
                ? "closed"
                : formatCountdown(Number(state.end) - Math.floor(now / 1000))}
          </dd>
        </div>
      </dl>

      <p className="text-fg-muted mt-4 max-w-[70ch] text-[13px] leading-relaxed">
        Prize money is pulled from your wallet and shielded by the pool the moment you fund it, so the allocated figure
        above <span className="text-fg font-medium">is</span> the money that is there. There is no separate promise to
        reconcile, and no way to allocate a prize that is not backed.
      </p>

      {config !== null ? (
        <p className="text-fg-muted mt-3 text-[13px]">
          Sponsor address for this pool: <span className="text-fg font-medium">{shortAddress(config.employer)}</span>
          {isSponsor ? " — that is this wallet." : " — connect that wallet to fund a prize."}
        </p>
      ) : null}
    </div>
  );
}
