"use client";

import { useRef, useState } from "react";
import { toPotError, type PotError, type PotState } from "@payday-pot/sdk";

import { DrawButton, DrawCard, DrawCardHeader, DrawNotice, DrawPublicBadge } from "./DrawSurface";
import { ErrorPanel, NoticeBanner } from "@/components/ui/ErrorPanel";
import { runDrawStep } from "@/lib/draw/actions";
import { keeperState } from "@/lib/draw/room";
import { formatAbsolute, formatCountdown } from "@/lib/format";
import { connectWallet, switchToSepolia } from "@/lib/wallet/connect";
import { useWriteGate } from "@/lib/wallet/use-write-gate";
import { walletStore } from "@/lib/wallet/store";
import { useStore } from "@/lib/store/external-store";

/**
 * Nút chạy vòng — và bất kỳ ai cũng bấm được.
 *
 * Đó không phải một tiện ích, nó là một tuyên bố về kiến trúc: nếu chỉ chủ dự
 * án chạy được draw thì cả pool phụ thuộc vào việc chủ dự án còn sống. Cả năm
 * bước đều `external` không modifier quyền, nên panel này hiện ra y hệt cho mọi
 * ví — và câu "Anyone can send this" là sự thật kiểm chứng được bằng cách bấm
 * nó từ một ví lạ, không phải một lời quảng cáo.
 *
 * Ba thứ panel này KHÔNG có:
 *   - state cục bộ về tiến độ. Sau tx, đường duy nhất để con số mới lên màn
 *     hình là `refreshPotReads`. Giết tab giữa chừng, mở lại, ra đúng chỗ cũ.
 *   - nút cho bước đang bị pause chặn. `requestRandom` là hàm draw duy nhất có
 *     `whenNotPaused`; render nút cho nó lúc pause chỉ để thu về một revert.
 *   - bất cứ thứ gì suy ra được từ ví đang xem. Panel này không đọc `account`.
 */
export function KeeperPanel({ state, now }: { state: PotState; now: bigint | null }) {
  const gate = useWriteGate();
  const address = useStore(walletStore).address;
  const keeper = keeperState(state, now);

  const [busy, setBusy] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<PotError | null>(null);
  const lastRun = useRef<(() => void) | null>(null);

  function run(): void {
    if (keeper.kind !== "ready") return;
    const step = keeper.step;
    lastRun.current = run;
    setBusy(true);
    setError(null);
    setTxHash(null);
    void (async () => {
      try {
        await runDrawStep(step, state.epochId, { account: address, onHash: setTxHash });
      } catch (e) {
        setError(toPotError(e));
      } finally {
        setBusy(false);
      }
    })();
  }

  const handlers = {
    retry: () => lastRun.current?.(),
    "switch-network": () => void switchToSepolia().catch(() => {}),
    "connect-wallet": () => void connectWallet().catch(() => {}),
    "continue-draw": () => lastRun.current?.(),
  };

  return (
    <DrawCard data-testid="keeper-panel">
      <DrawCardHeader
        title="Run this round"
        hint="Every step below is permissionless. Any wallet can send it — the pool does not wait on an operator."
        action={<DrawPublicBadge />}
      />

      <div data-testid="keeper-state" data-state={keeper.kind}>
        {keeper.kind === "counting-down" ? (
          <Countdown endsAt={keeper.endsAt} now={now} />
        ) : keeper.kind === "idle" ? (
          <p className="text-draw-fg-muted text-[13px] leading-relaxed">{keeper.detail}</p>
        ) : keeper.kind === "blocked-paused" ? (
          <DrawNotice tone="warning" title={`${keeper.label} is on hold`}>
            {keeper.detail}
          </DrawNotice>
        ) : (
          <>
            <p className="text-[15px] font-medium">{keeper.label}</p>
            <p className="text-draw-fg-muted mt-1 max-w-[62ch] text-[13px] leading-relaxed">{keeper.detail}</p>
            {keeper.progress ? (
              <p className="tabular text-draw-fg-muted mt-2 text-[13px]" data-testid="keeper-progress">
                {keeper.progress.done} of {keeper.progress.total} done. This transaction continues from the cursor on
                chain, not from anything this page remembers.
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <DrawButton
                loading={busy}
                disabled={!gate.ready || busy}
                title={gate.reason ?? undefined}
                onClick={run}
                data-testid="keeper-run"
              >
                {keeper.label}
              </DrawButton>
              <p className="text-draw-fg-muted text-[13px]">
                {gate.ready ? "One signature. You pay only gas." : gate.reason}
              </p>
            </div>
          </>
        )}
      </div>

      {/*
       * R5 — seed đã rút thì vĩnh viễn không rút lại.
       *
       * Đây là chỗ hay bị hiểu sai nhất khi một batch select revert: phản xạ tự
       * nhiên là "chạy lại từ đầu", mà chạy lại từ đầu ở đây nghĩa là rút seed
       * mới, tức là chọn lại người thắng. Contract không cho (`AlreadyDrawn`),
       * nhưng nếu màn hình không nói ra thì người bấm sẽ nghĩ nó hỏng thay vì
       * hiểu rằng nó đang bảo vệ họ. Nên câu này hiện SUỐT giai đoạn Drawing,
       * không phải chỉ khi có lỗi.
       */}
      {state.draw.drawn && state.phase !== "Settled" ? (
        <div className="mt-4">
          <DrawNotice tone="privacy" title="The seed is locked for this round" data-testid="seed-locked">
            Randomness was drawn once and cannot be drawn again — not by us, not by anyone. If a scan transaction fails,
            the fix is to send it again; it picks up at the same cursor and produces the same result.
          </DrawNotice>
        </div>
      ) : null}

      {busy && txHash ? (
        <div className="mt-4">
          <NoticeBanner
            surface="draw"
            tone="privacy"
            title="Confirming on Sepolia"
            detail="The transaction is on chain and waiting for a block. You can close this tab — the cursor lives on chain, not here."
          />
        </div>
      ) : null}

      {error ? (
        <div className="mt-4">
          <ErrorPanel surface="draw" error={error} handlers={handlers} onDismiss={() => setError(null)} />
        </div>
      ) : null}
    </DrawCard>
  );
}

/**
 * Đếm ngược LUÔN kèm giờ tuyệt đối — giống mọi chỗ khác trong app.
 *
 * Một cái đồng hồ đang chạy mà không đối chiếu được với đồng hồ nào khác thì
 * không phải thông tin, nó là áp lực.
 */
function Countdown({ endsAt, now }: { endsAt: bigint; now: bigint | null }) {
  const left = now === null ? null : Number(endsAt - now);
  return (
    <div>
      <p className="text-draw-fg-muted text-[13px]">Nothing to run yet — deposits are still open.</p>
      <p className="tabular mt-2 text-[22px] font-semibold" data-testid="keeper-countdown">
        {left === null ? "—" : left > 0 ? formatCountdown(left) : "Closing now"}
      </p>
      <p className="text-draw-fg-muted mt-1 text-[12px]">Closes {formatAbsolute(endsAt)}</p>
    </div>
  );
}
