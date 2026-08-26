"use client";

import { ConfidentialValue } from "@/components/privacy/ConfidentialValue";
import { Card, CardHeader, EncryptedBadge } from "@/components/ui/Card";
import { formatAmount, formatRelativeTime } from "@/lib/format";
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
    <Card className="h-full">
      <CardHeader
        title="Your weight in the draw"
        hint={status ? `${status.label} — ${status.detail}` : undefined}
        action={<EncryptedBadge />}
      />

      <p className="text-fg-muted text-[13px]">Average balance this round</p>
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

      <p className="text-fg-muted mt-4 max-w-[46ch] text-[13px] leading-relaxed">
        {areaView.kind === "revealed"
          ? "Your odds are this number against the pool total. Money that sat here all round counts more than money that arrived yesterday."
          : "Weight is balance multiplied by how long it stayed. It opens with the same signature as your position."}
      </p>

      {areaView.kind === "revealed" && account !== null && now !== null && account.lastCheckpoint > 0n ? (
        <p className="text-fg-muted mt-2 text-[12px]">
          Last recorded on chain {formatRelativeTime(Number(account.lastCheckpoint) * 1000, now)}; the figure above
          extends it to right now.
        </p>
      ) : null}
    </Card>
  );
}

const STATUS: Record<string, { label: string; detail: string }> = {
  Open: { label: "Building", detail: "it grows every second your balance stays" },
  Snapshotting: { label: "Freezing", detail: "weights are being locked for this round" },
  Drawing: { label: "Locked", detail: "the draw is using this number now" },
  Settled: { label: "Spent", detail: "it resets when the next round opens" },
};
