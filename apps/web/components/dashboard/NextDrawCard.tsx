"use client";

import Link from "next/link";
import { useCallback } from "react";
import type { PotError, PotState } from "@payday-pot/sdk";

import { Card, CardHeader, PublicBadge } from "@/components/ui/Card";
import { ErrorPanel } from "@/components/ui/ErrorPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import { SEPOLIA_CHAIN_ID } from "@/lib/chain/rpc";
import { keeperState } from "@/lib/draw/room";
import { formatAbsolute, formatAmount, formatCountdown } from "@/lib/format";
import { potReadsStore, refreshPotReads, type DeploymentStatus } from "@/lib/pot/reads";
import { useStore } from "@/lib/store/external-store";
import { useNow } from "@/lib/use-now";
import { walletStore } from "@/lib/wallet/store";

/**
 * Vòng hiện tại — phần CÔNG KHAI của sản phẩm, và cố ý công khai.
 *
 * Tiền giải là tiền của nhà tài trợ, không phải của ai trong pool, nên nó là
 * plaintext onchain (PRIVACY §1). Nói thẳng ra bằng một nhãn "Public" quan trọng
 * hơn là nó trông đẹp: người dùng cần học được rằng cái gì mã hoá và cái gì
 * không, và cách duy nhất để dạy điều đó là ghi nhãn nhất quán ở mọi nơi.
 *
 * Đếm ngược LUÔN đi kèm giờ tuyệt đối. Một cái đồng hồ đang chạy mà không kiểm
 * chứng được với đồng hồ nào khác thì không phải là thông tin, nó là áp lực.
 */
export function NextDrawCard() {
  const reads = useStore(potReadsStore);
  const address = useStore(walletStore).address;
  const now = useNow();
  const state = reads.state;

  const retry = useCallback(() => void refreshPotReads(address, SEPOLIA_CHAIN_ID), [address]);

  return (
    <Card className="h-full">
      <CardHeader
        title={state ? `Round ${state.epochId}` : "This round"}
        hint="Everything on this card is public on chain."
        action={<PublicBadge />}
      />

      {state === null ? (
        <Empty deployment={reads.deployment} error={reads.error} onRetry={retry} />
      ) : (
        <Live state={state} now={now} />
      )}
    </Card>
  );
}

/**
 * Chưa có state — và ba lý do khác nhau, hiển thị khác nhau.
 *
 * Cái skeleton chỉ được phép nghĩa là "đang tải". Nếu đọc hỏng mà vẫn để
 * skeleton chạy, màn hình sẽ nói dối bằng cách im lặng mãi mãi — người dùng ngồi
 * chờ một thứ không bao giờ tới, và cách duy nhất họ biết là bỏ cuộc. Lỗi phải
 * hiện ra kèm đúng một đường đi tiếp.
 */
function Empty({
  deployment,
  error,
  onRetry,
}: {
  deployment: DeploymentStatus;
  error: PotError | null;
  onRetry: () => void;
}) {
  if (deployment === "not-deployed") {
    return (
      <p className="text-fg-muted text-[14px] leading-relaxed">
        No round is running because no pool is deployed in this build yet.
      </p>
    );
  }
  if (deployment === "mismatch") {
    return (
      <p className="text-fg-muted text-[14px] leading-relaxed">
        This page was built against a different version of the pool than the one on chain, so its numbers are not
        trustworthy enough to show.
      </p>
    );
  }
  if (error) return <ErrorPanel error={error} handlers={{ retry: onRetry }} />;
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-[36px] w-[180px]" />
      <Skeleton className="h-[16px] w-[240px]" />
    </div>
  );
}

function Live({ state, now }: { state: PotState; now: number | null }) {
  const nowSeconds = now === null ? null : BigInt(Math.floor(now / 1000));
  const secondsLeft = nowSeconds === null ? null : Number(state.end - nowSeconds);
  // Cùng một hàm mà Draw Room dùng, không phải bản sao của cùng luật. Hai màn
  // hình nói khác nhau về "đang chờ việc gì" là kiểu sai không ai thấy: card
  // này giục bấm trong khi phòng kia nói bị pause chặn, và người dùng tin cái
  // nào cũng thua.
  const keeper = keeperState(state, nowSeconds);

  return (
    <div>
      <p className="text-fg-muted text-[13px]">Prize for this round</p>
      <p className="mt-2">
        <span className="tabular text-[32px] leading-none font-semibold tracking-tight sm:text-[36px]">
          {formatAmount(state.prizeAmount)}
        </span>
        <span className="text-fg-muted ml-2 text-[15px]">USDC</span>
      </p>
      {state.prizeAmount === 0n ? (
        <p className="text-fg-muted mt-2 text-[13px] leading-relaxed">
          No sponsor has funded this round yet. Deposits still earn weight, and nothing is at risk either way.
        </p>
      ) : null}

      <dl className="border-border-default mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t pt-4">
        <div>
          <dt className="text-fg-muted text-[13px]">Deposits close in</dt>
          <dd className="tabular mt-1 text-[18px] font-semibold">
            {secondsLeft === null ? (
              <Skeleton className="h-[18px] w-[100px]" />
            ) : secondsLeft > 0 ? (
              formatCountdown(secondsLeft)
            ) : (
              "Closed"
            )}
          </dd>
          <dd className="text-fg-muted mt-1 text-[12px]">{formatAbsolute(state.end)}</dd>
        </div>
        <div>
          <dt className="text-fg-muted text-[13px]">Savers in this round</dt>
          <dd className="tabular mt-1 text-[18px] font-semibold">{state.participantCount}</dd>
          <dd className="text-fg-muted mt-1 text-[12px]">Addresses are public; balances are not.</dd>
        </div>
      </dl>

      <div className="border-border-default mt-4 border-t pt-4">
        <p className="text-fg-muted text-[13px]">Stage</p>
        <p className="mt-1 text-[15px] font-medium">{PHASE_LABEL[state.phase]}</p>
        {keeper.kind === "ready" ? (
          <p className="text-fg-muted mt-1.5 max-w-[52ch] text-[13px] leading-relaxed">
            {keeper.detail}
            {keeper.progress ? ` ${keeper.progress.done} of ${keeper.progress.total} done.` : ""} Anyone can run it —
            it is not gated on an operator.
          </p>
        ) : null}

        {/*
          Câu trên nói "ai chạy cũng được" — nên phải có đường tới chỗ chạy nó,
          nếu không thì đó là một lời mời dẫn vào tường. Nhãn lấy đúng từ
          `keeper.label`, tức là đúng chữ trên cái nút trong phòng: người dùng
          đọc "Freeze the next batch" ở đây rồi thấy đúng "Freeze the next
          batch" ở kia thì không phải đoán mình có tới đúng chỗ không.
          Không có việc (đang đếm ngược, hoặc bị pause chặn) thì link vẫn còn
          nhưng không hứa hẹn gì — phòng vẫn xem được, và lý do pause đã nằm ở
          khối dưới.
        */}
        <Link
          href="/app/draws/current"
          data-testid="dashboard-draw-link"
          data-keeper={keeper.kind}
          className="rounded-control border-border-default hover:bg-subtle mt-3 inline-flex items-center gap-2 border px-4 py-2.5 text-[14px] font-medium transition-colors duration-(--duration-hover)"
        >
          {keeper.kind === "ready" ? `${keeper.label} in the draw room` : "Open the draw room"}
          <span aria-hidden="true">→</span>
        </Link>
      </div>

      {state.paused ? (
        <p className="border-warning/40 bg-warning/5 rounded-card text-fg-muted mt-4 border p-3 text-[13px] leading-relaxed">
          <span className="text-fg font-semibold">New rounds are paused.</span> Withdrawing and claiming keep working —
          pause can never hold your money.
        </p>
      ) : null}
    </div>
  );
}

const PHASE_LABEL: Record<PotState["phase"], string> = {
  Open: "Open — deposits count toward this round",
  Snapshotting: "Closing — weights are being frozen",
  Drawing: "Drawing — the winner is being picked",
  Settled: "Settled — waiting for the next round to open",
};
