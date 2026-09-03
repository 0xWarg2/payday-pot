"use client";

import { ConfidentialValue, RevealPhaseLine } from "@/components/privacy/ConfidentialValue";
import { DrawButton, DrawCard, DrawCardHeader, DrawEncryptedBadge, DrawNotice } from "./DrawSurface";
import type { ClaimGate, SealedResult } from "@/lib/draw/room";
import type { ConfidentialView } from "@/lib/format";
import type { RevealFlight } from "@/lib/reveal/store";

/**
 * Kết quả niêm phong — cái card mà cả exit gate Day 8 xoay quanh.
 *
 * **Người thắng và người thua phải thấy y hệt nhau trước khi reveal.** Không
 * phải "gần giống": giống đến mức `innerHTML` bằng nhau, vì bất kỳ khác biệt
 * nào — một skeleton dài hơn, một badge thừa, một `data-*` khác — đều đọc được
 * từ DevTools và từ ảnh chụp màn hình của người ngồi cạnh.
 *
 * Cách giữ tính chất đó ở tầng code là chặn từ chữ ký hàm: card này nhận
 * `SealedResult` (đã bỏ hết dấu vết giá trị) và một `ConfidentialView`. Nó
 * KHÔNG BAO GIỜ render `result.handle` — handle của mỗi ví mỗi khác, nên in nó
 * ra là tự tạo một dấu vân tay ổn định ngay trong DOM, dù bản thân handle không
 * nói ai thắng.
 *
 * Điều làm chuyện này khả thi nằm ở contract: `_scanParticipant` cộng
 * `FHE.select(hit, prize, 0)` vào `pendingPrize` của MỌI người được quét, nên
 * sau khi settle thì ai cũng có handle. "Có handle" không phải tin tức.
 *
 * Sau reveal thì hai màn hình khác nhau — đúng như vậy. Con số đó sống trong bộ
 * nhớ tab của chính chủ, có TTL, và không đi đâu khác.
 */
export function SealedResultCard({
  result,
  view,
  gate,
  flight,
  revealBusy,
  onReveal,
  onHide,
  onReviewClaim,
  claimDisabledReason,
}: {
  result: SealedResult;
  view: ConfidentialView;
  gate: ClaimGate;
  flight: RevealFlight | null;
  revealBusy: boolean;
  onReveal: () => void;
  onHide: () => void;
  onReviewClaim: () => void;
  claimDisabledReason: string | null;
}) {
  return (
    <DrawCard data-testid="sealed-result">
      <DrawCardHeader
        title="Your result"
        hint="Sealed on chain. Only this wallet can open it — not the sponsor, not the pool operator, not us."
        action={<DrawEncryptedBadge>Sealed</DrawEncryptedBadge>}
      />

      <div data-testid="sealed-state" data-state={result.kind}>
        {result.kind === "no-position" ? (
          <p className="text-draw-fg-muted text-[13px] leading-relaxed">
            This wallet has no position in the pool, so there is no result sealed for it.
          </p>
        ) : result.kind === "pending" ? (
          <p className="text-draw-fg-muted text-[13px] leading-relaxed">
            This round has not finished scanning yet. When it does, a result is sealed for every saver in it — including
            the ones who did not win.
          </p>
        ) : result.kind === "not-in-round" ? (
          <p className="text-draw-fg-muted text-[13px] leading-relaxed">
            You joined after this round&rsquo;s weights were frozen, so you were not in the scan. Your deposit counts
            toward the next round.
          </p>
        ) : (
          <Sealed
            view={view}
            gate={gate}
            flight={flight}
            revealBusy={revealBusy}
            onReveal={onReveal}
            onHide={onHide}
            onReviewClaim={onReviewClaim}
            claimDisabledReason={claimDisabledReason}
          />
        )}
      </div>
    </DrawCard>
  );
}

/**
 * Nhánh duy nhất mà người thắng và người thua cùng đi vào.
 *
 * Mọi nhánh con bên trong chỉ rẽ theo `view.kind` (chưa mở / đã mở) và
 * `gate.kind` — cả hai đều giống nhau cho hai bên cho tới đúng khoảnh khắc
 * người dùng tự ký để mở giá trị của mình.
 */
function Sealed({
  view,
  gate,
  flight,
  revealBusy,
  onReveal,
  onHide,
  onReviewClaim,
  claimDisabledReason,
}: {
  view: ConfidentialView;
  gate: ClaimGate;
  flight: RevealFlight | null;
  revealBusy: boolean;
  onReveal: () => void;
  onHide: () => void;
  onReviewClaim: () => void;
  claimDisabledReason: string | null;
}) {
  return (
    <>
      <p className="text-draw-fg-muted text-[13px]">Unclaimed winnings</p>
      <p className="mt-2">
        <ConfidentialValue view={view} label="Your unclaimed winnings" />
        {view.kind === "revealed" ? (
          <span className="text-draw-fg-muted ml-2 text-[15px] font-normal">USDC</span>
        ) : null}
      </p>
      <p className="text-draw-fg-muted mt-2 max-w-[62ch] text-[13px] leading-relaxed">
        This is your running total across every round, not just this one. Claiming moves it into your encrypted balance.
      </p>

      <div className="mt-5">
        {flight ? (
          <RevealPhaseLine phase={flight.phase} />
        ) : view.kind === "revealed" ? (
          <div className="flex flex-wrap items-center gap-3">
            <DrawButton variant="secondary" onClick={onHide}>
              Hide
            </DrawButton>
            <p className="text-draw-fg-muted text-[13px]">Visible in this tab only, and not for long.</p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <DrawButton loading={revealBusy} onClick={onReveal} data-testid="sealed-reveal">
              Open my result
            </DrawButton>
            <p className="text-draw-fg-muted text-[13px]">One signature, decrypted inside your browser.</p>
          </div>
        )}
      </div>

      <div className="border-draw-border mt-5 border-t pt-4">
        <div className="flex flex-wrap items-center gap-3">
          <DrawButton
            variant="secondary"
            // Claim chỉ mở khi vòng đã settle VÀ chính người dùng đã mở khoá và
            // thấy một con số dương. Vế thứ hai không phải kiểm tra bảo mật —
            // `claim()` trên contract cố ý không có phase gate để không ai bị
            // kẹt tiền. Nó là để không ai ký một tx mà họ chưa biết nó làm gì:
            // `NothingToClaim` sau khi đã trả gas là câu trả lời tệ nhất có thể
            // cho câu hỏi "tôi có thắng không".
            disabled={gate.kind !== "open" || claimDisabledReason !== null}
            title={claimDisabledReason ?? undefined}
            onClick={onReviewClaim}
            data-testid="claim-open-review"
          >
            Review claim
          </DrawButton>
          <p className="text-draw-fg-muted max-w-[46ch] text-[13px] leading-relaxed" data-testid="claim-gate">
            {gate.kind === "open" ? (claimDisabledReason ?? "You will see exactly what gets signed first.") : gate.reason}
          </p>
        </div>
      </div>

      {view.kind === "revealed" && view.value === 0n ? (
        <div className="mt-4">
          {/*
           * Số 0 ở đây là một số 0 ĐÃ ĐƯỢC DECRYPT — tức là sự thật, không phải
           * trạng thái thiếu dữ liệu (non-negotiable #8). Nói rõ ra, vì đây là
           * chỗ duy nhất trong app mà một số 0 được phép xuất hiện, và người
           * dùng cần biết mình đang nhìn cái nào.
           */}
          <DrawNotice title="Nothing waiting right now" data-testid="revealed-zero">
            You opened your own result and it is zero. That is a real number read from the chain, not a value the screen
            failed to load. Your savings are untouched — no-loss means exactly that.
          </DrawNotice>
        </div>
      ) : null}
    </>
  );
}
