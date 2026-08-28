"use client";

import Link from "next/link";

import { ConfidentialValue, RevealPhaseLine } from "@/components/privacy/ConfidentialValue";
import { DrawButton, DrawCard, DrawCardHeader, DrawEncryptedBadge } from "./DrawSurface";
import type { ConfidentialView } from "@/lib/format";
import type { RevealFlight } from "@/lib/reveal/store";

/**
 * Vé của bạn trong vòng này — và lối ra.
 *
 * Hai giá trị đều mã hoá, và cả hai đều KHÔNG nói bạn có thắng hay không: số dư
 * và trọng số là thứ bạn tự chọn khi deposit, không phải kết quả. Chúng ở đây
 * để câu "cơ hội tỉ lệ với số tiền × thời gian" kiểm chứng được từ chính màn
 * hình này, bằng số của chính bạn.
 *
 * Lối rút tiền nằm trong card này chứ không nằm ở footer, và đó là chủ ý: khi
 * người ta lo lắng về một vòng đang chạy, thứ họ cần thấy là tiền của mình vẫn
 * lấy ra được — non-negotiable #1 nói `withdrawAll()` chạy ở MỌI phase, kể cả
 * giữa lúc draw và kể cả lúc pause. Một sản phẩm nói điều đó ở trang tài liệu
 * và giấu nút đi thì chưa nói điều đó.
 */
export function PrivateEntryCard({
  principal,
  weight,
  flight,
  revealBusy,
  onReveal,
  onHide,
}: {
  principal: ConfidentialView;
  weight: ConfidentialView;
  flight: RevealFlight | null;
  revealBusy: boolean;
  onReveal: () => void;
  onHide: () => void;
}) {
  const anyRevealed = principal.kind === "revealed" || weight.kind === "revealed";
  const nothingHere = principal.kind === "unavailable" && weight.kind === "unavailable";

  return (
    <DrawCard data-testid="private-entry">
      <DrawCardHeader
        title="Your entry"
        hint="Your chance is proportional to balance × time. Both numbers below are encrypted on chain."
        action={<DrawEncryptedBadge />}
      />

      <dl className="grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-draw-fg-muted text-[13px]">Savings in the pool</dt>
          <dd className="mt-1.5">
            <ConfidentialValue view={principal} label="Your savings" size="md" />
            {principal.kind === "revealed" ? (
              <span className="text-draw-fg-muted ml-2 text-[14px] font-normal">USDC</span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-draw-fg-muted text-[13px]">Weight in this round</dt>
          <dd className="mt-1.5">
            <ConfidentialValue view={weight} label="Your weight" size="md" />
          </dd>
        </div>
      </dl>

      <div className="mt-5">
        {nothingHere ? (
          <p className="text-draw-fg-muted text-[13px] leading-relaxed">
            Nothing is stored for this wallet yet — which is not the same as holding zero.
          </p>
        ) : flight ? (
          <RevealPhaseLine phase={flight.phase} />
        ) : anyRevealed ? (
          <div className="flex flex-wrap items-center gap-3">
            <DrawButton variant="secondary" onClick={onHide}>
              Hide
            </DrawButton>
            <p className="text-draw-fg-muted text-[13px]">Visible in this tab only, and not for long.</p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <DrawButton variant="secondary" loading={revealBusy} onClick={onReveal} data-testid="entry-reveal">
              Reveal my entry
            </DrawButton>
            <p className="text-draw-fg-muted text-[13px]">One signature opens both.</p>
          </div>
        )}
      </div>

      <div className="border-draw-border mt-5 border-t pt-4">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            data-cta
            data-testid="draw-withdraw-link"
            href="/app/savings"
            className="rounded-control border-draw-border bg-draw-surface text-draw-fg focus-visible:outline-draw-fg inline-flex items-center border px-4 text-[14px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Take your savings out
          </Link>
          <p className="text-draw-fg-muted max-w-[44ch] text-[13px] leading-relaxed">
            Works right now, mid-draw, and while the pool is paused. Leaving a round early only forfeits the chance, never
            the savings.
          </p>
        </div>
      </div>
    </DrawCard>
  );
}
