import Link from "next/link";
import type { EpochView } from "@payday-pot/sdk";

import { EncryptedDrawOrb } from "./EncryptedDrawOrb";
import { DrawPublicBadge } from "./DrawSurface";
import { formatAbsolute, formatAmount } from "@/lib/format";

const PHASE_LABEL: Record<EpochView["phase"], string> = {
  Open: "Open — deposits count toward this round",
  Snapshotting: "Closing — weights are being frozen",
  Drawing: "Drawing — the pool is being scanned",
  Settled: "Settled — the result is sealed",
};

/**
 * Đầu phòng: số vòng, giai đoạn, tiền giải, và một cái orb.
 *
 * Tiền giải hiện ra dưới nhãn "Public" chứ không phải "Encrypted", và điều đó
 * là cố ý ở mọi màn hình: nó là tiền của nhà tài trợ, không phải của ai trong
 * pool, nên nó plaintext onchain (PRIVACY §1). Ghi nhãn nhất quán là cách duy
 * nhất người dùng học được ranh giới giữa cái được mã hoá và cái không — và một
 * chỗ ghi sai thì cả bài học hỏng.
 *
 * Framing của giải thưởng cũng nói thẳng ở đây: **sponsored**, không phải lợi
 * suất tự sinh. Sản phẩm này chưa nối vào một nguồn yield thật; nói vòng vo về
 * chuyện đó là để giám khảo tự phát hiện, và đó là cách tệ nhất để họ phát hiện.
 */
export function DrawRoomHeader({
  view,
  isCurrent,
  paused,
}: {
  view: EpochView;
  isCurrent: boolean;
  paused: boolean;
}) {
  const previous = view.epochId > 1n ? view.epochId - 1n : null;

  return (
    <header className="flex flex-col gap-5 sm:flex-row sm:items-center">
      <EncryptedDrawOrb phase={view.phase} progress={progressOf(view)} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[26px] font-semibold tracking-tight sm:text-[30px]">Round {view.epochId.toString()}</h1>
          {isCurrent ? null : (
            <span className="border-draw-border text-draw-fg-muted rounded-full border px-2.5 py-1 text-[12px] font-medium">
              Past round
            </span>
          )}
          {paused && isCurrent ? (
            <span className="border-warning/50 text-draw-fg rounded-full border px-2.5 py-1 text-[12px] font-medium">
              New rounds paused
            </span>
          ) : null}
        </div>

        <p className="text-draw-fg-muted mt-1 text-[15px]" data-testid="draw-phase">
          {PHASE_LABEL[view.phase]}
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3">
          <div>
            <p className="text-draw-fg-muted flex items-center gap-2 text-[13px]">
              Sponsored prize <DrawPublicBadge />
            </p>
            <p className="mt-1">
              <span className="tabular text-[28px] leading-none font-semibold tracking-tight">
                {formatAmount(view.prizeAmount)}
              </span>
              <span className="text-draw-fg-muted ml-2 text-[15px]">USDC</span>
            </p>
          </div>
          <p className="text-draw-fg-muted text-[12px]">Deposits closed {formatAbsolute(view.end)}</p>
        </div>

        <p className="text-draw-fg-muted mt-3 max-w-[64ch] text-[13px] leading-relaxed">
          The prize is funded by an employer sponsor, not by yield the pool generated. Nobody&rsquo;s savings pay for it,
          and nobody&rsquo;s savings are at risk in the draw.
        </p>

        {previous !== null ? (
          <p className="mt-3 text-[13px]">
            <Link
              href={`/app/draws/${previous.toString()}`}
              className="text-draw-fg-muted hover:text-draw-fg underline underline-offset-4"
            >
              ← Round {previous.toString()}
            </Link>
            {isCurrent ? null : (
              <>
                <span aria-hidden="true" className="text-draw-fg-muted mx-2">
                  ·
                </span>
                <Link href="/app/draws/current" className="text-draw-fg-muted hover:text-draw-fg underline underline-offset-4">
                  Current round →
                </Link>
              </>
            )}
          </p>
        ) : null}
      </div>
    </header>
  );
}

/**
 * Tiến độ tổng của cả vòng, cho orb.
 *
 * Snapshot và select mỗi cái chiếm một nửa: chúng là hai lần quét toàn bộ pool,
 * và ghép chúng thành một thanh duy nhất sẽ làm nửa sau trông như đứng yên rồi
 * nhảy vọt. Con số này chỉ để vẽ hình — hai cursor thật vẫn hiện nguyên vẹn ở
 * timeline ngay bên dưới.
 */
function progressOf(view: EpochView): number {
  if (view.phase === "Settled") return 1;
  if (view.phase === "Open") return 0;
  const snap = view.snapshot.total > 0 ? view.snapshot.cursor / view.snapshot.total : 0;
  const sel = view.draw.total > 0 ? view.draw.cursor / view.draw.total : 0;
  return view.phase === "Snapshotting" ? snap * 0.5 : 0.5 + sel * 0.5;
}
