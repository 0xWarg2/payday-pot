"use client";

import { ConfidentialValue } from "@/components/privacy/ConfidentialValue";
import { Card, CardHeader, EncryptedBadge } from "@/components/ui/Card";
import { formatAmount } from "@/lib/format";
import { potReadsStore } from "@/lib/pot/reads";
import { averageBalance, twabAreaView } from "@/lib/pot/twab";
import { useConfidentialView } from "@/lib/reveal/use-reveal";
import { useStore } from "@/lib/store/external-store";
import { useNow } from "@/lib/use-now";

/**
 * Trọng số trong lượt quay — TWAB.
 *
 * Không có nút mở khoá riêng: nó dùng chung chữ ký với "Your position". Nói
 * điều đó ra thành chữ, vì một thẻ mã hoá không có nút bấm mà không giải thích
 * gì trông y hệt một thẻ bị hỏng.
 *
 * Con số hiển thị là **số dư trung bình**, chia client-side sau khi decrypt.
 * Onchain không bao giờ chia: `twabArea` thô chính là trọng số vì phép rút thăm
 * scale-invariant. Chia ở đây thuần tuý để con số đọc được bằng USDC thay vì
 * bằng "USDC × giây" — một đơn vị đúng nhưng không ai hình dung được.
 */
export function TwabCard() {
  const reads = useStore(potReadsStore);
  const now = useNow(10_000);
  const account = reads.account;
  const state = reads.state;

  const rawAreaView = useConfidentialView(account?.twabArea);
  const principalView = useConfidentialView(account?.principal);
  // Lần gửi đầu để `twabArea` chưa init — xem `twabAreaView`. Không đi qua đây
  // thì người vừa gửi tiền xong đọc được "Not available yet" ngay dưới dòng
  // trạng thái "Building", và hai câu đó mâu thuẫn nhau.
  const areaView = twabAreaView(rawAreaView, principalView, account?.lastCheckpoint ?? 0n);

  const average =
    areaView.kind === "revealed" && state !== null && account !== null && now !== null
      ? averageBalance({
          area: areaView.value,
          principal: principalView.kind === "revealed" ? principalView.value : null,
          lastCheckpoint: account.lastCheckpoint,
          epochStart: state.start,
          epochEnd: state.end,
          nowSeconds: BigInt(Math.floor(now / 1000)),
        })
      : null;

  const status = state === null ? null : STATUS[state.phase];

  return (
    <Card spot="privacy" className="elev-1 h-full">
      <CardHeader
        title="Your weight"
        hint={status ? `${status.label} — ${status.detail}` : undefined}
        action={<EncryptedBadge />}
      />

      <p className="text-fg-muted text-small">Average balance</p>
      <p className="mt-2">
        {areaView.kind === "revealed" ? (
          average === null ? (
            <span className="text-fg-muted text-[22px] font-normal">Not enough time has passed</span>
          ) : (
            <>
              <span className="tabular text-[22px] leading-none font-semibold tracking-tight">
                {formatAmount(average)}
              </span>
              <span className="text-fg-muted ml-2 text-[14px]">USDC</span>
            </>
          )
        ) : (
          <ConfidentialValue view={areaView} label="Your weight" size="md" />
        )}
      </p>

      <p className="text-fg-muted mt-4 text-caption">Balance × time. Same signature as your position.</p>
    </Card>
  );
}

const STATUS: Record<string, { label: string; detail: string }> = {
  Open: { label: "Building", detail: "grows while your balance stays" },
  Snapshotting: { label: "Freezing", detail: "being locked for this round" },
  Drawing: { label: "Locked", detail: "in use by the draw" },
  Settled: { label: "Spent", detail: "resets next round" },
};
