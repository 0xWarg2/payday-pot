"use client";

import Link from "next/link";
import { useCallback, useId, useRef, useState } from "react";
import { toPotError, type PotError } from "@payday-pot/sdk";

import { ClaimReviewDialog } from "./ClaimReviewDialog";
import { DrawCard, DrawNotice } from "./DrawSurface";
import { DrawPhaseTimeline } from "./DrawPhaseTimeline";
import { DrawRoomHeader } from "./DrawRoomHeader";
import { FairnessReceipt } from "./FairnessReceipt";
import { KeeperPanel } from "./KeeperPanel";
import { PrivateEntryCard } from "./PrivateEntryCard";
import { SealedResultCard } from "./SealedResultCard";
import { ErrorPanel, NoticeBanner } from "@/components/ui/ErrorPanel";
import { SEPOLIA_CHAIN_ID } from "@/lib/chain/rpc";
import { claimGate, drawTimeline, sealedResult } from "@/lib/draw/room";
import { useEpochView } from "@/lib/draw/use-epoch";
import { potReadsStore, refreshPotReads } from "@/lib/pot/reads";
import type { RevealTarget } from "@/lib/reveal/reveal";
import { useConfidentialView, useRevealController } from "@/lib/reveal/use-reveal";
import { submitClaim } from "@/lib/savings/actions";
import { useStore } from "@/lib/store/external-store";
import { useNow } from "@/lib/use-now";
import { connectWallet, switchToSepolia } from "@/lib/wallet/connect";
import { useWriteGate } from "@/lib/wallet/use-write-gate";
import { walletStore } from "@/lib/wallet/store";

/**
 * Draw Room.
 *
 * **Không có state cục bộ nào ở đây mô tả tiến độ của vòng.** Con số duy nhất
 * mà màn hình này biết đến là con số vừa đọc từ chain: `useEpochView` lấy từ
 * `potReadsStore` (poll 15s) hoặc đọc thẳng cho vòng cũ. Giết keeper giữa
 * chừng, F5, và mọi thứ quay lại đúng chỗ cũ — không phải vì ta khôi phục
 * được, mà vì chưa từng có gì để mất.
 *
 * State cục bộ ở đây chỉ có ba thứ, và không thứ nào là dữ liệu: tab đang mở,
 * dialog claim đang mở, và lỗi của lần bấm gần nhất.
 */
export function DrawRoom({ epochId }: { epochId: bigint | null }) {
  const load = useEpochView(epochId);
  const now = useNow();
  const nowSeconds = now === null ? null : BigInt(Math.floor(now / 1000));
  const address = useStore(walletStore).address;
  const retryRead = useCallback(() => void refreshPotReads(address, SEPOLIA_CHAIN_ID), [address]);

  if (load.kind === "loading") {
    return (
      <p className="text-draw-fg-muted text-[14px]" data-testid="draw-loading">
        Reading this round from the chain…
      </p>
    );
  }

  if (load.kind === "not-deployed") {
    return (
      <DrawNotice title="No pool on this network yet">
        This build has no pool deployed, so there is no round to watch. Everything else on the site still works.
      </DrawNotice>
    );
  }

  if (load.kind === "mismatch") {
    return (
      <DrawNotice tone="warning" title="This page and the pool disagree">
        The site was built against a different version of the pool than the one on chain, so its numbers are not
        trustworthy enough to show.
      </DrawNotice>
    );
  }

  if (load.kind === "not-found") {
    return (
      <DrawNotice tone="warning" title={`There is no round ${load.requested.toString()}`}>
        Rounds run from 1 to {load.currentEpochId.toString()}.{" "}
        <Link href="/app/draws/current" className="text-draw-fg underline underline-offset-4">
          Go to the current round
        </Link>
        .
      </DrawNotice>
    );
  }

  if (load.kind === "error") {
    return <ErrorPanel surface="draw" error={load.error} handlers={{ retry: retryRead }} />;
  }

  return <Room load={load} now={nowSeconds} />;
}

function Room({
  load,
  now,
}: {
  load: Extract<ReturnType<typeof useEpochView>, { kind: "current" } | { kind: "past" }>;
  now: bigint | null;
}) {
  const [tab, setTab] = useState<"draw" | "receipt">("draw");
  const reads = useStore(potReadsStore);
  const isCurrent = load.kind === "current";
  const view = load.view;

  return (
    <div className="flex flex-col gap-6">
      <DrawRoomHeader view={view} isCurrent={isCurrent} paused={isCurrent ? load.state.paused : false} />

      <Tabs value={tab} onChange={setTab} />

      {tab === "draw" ? (
        <div className="flex flex-col gap-5">
          <DrawCard data-testid="draw-timeline-card">
            <h2 className="mb-4 text-[15px] font-semibold tracking-tight">How this round runs</h2>
            <DrawPhaseTimeline stages={drawTimeline(view, now)} />
          </DrawCard>

          {isCurrent ? (
            <>
              <KeeperPanel state={load.state} now={now} />
              <YourSide phase={view.phase} />
            </>
          ) : (
            <DrawNotice title="This round is in the past">
              Your own position and result always live on the current round, because the pool keeps one running total
              per wallet rather than a copy per round.{" "}
              <Link href="/app/draws/current" className="text-draw-fg underline underline-offset-4">
                Open the current round
              </Link>
              .
            </DrawNotice>
          )}
        </div>
      ) : (
        <FairnessReceipt view={view} potAddress={reads.config?.address ?? null} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Tabs
 * ------------------------------------------------------------------ */

/**
 * Tab thật, không phải hai cái nút trông giống tab.
 *
 * `role="tablist"` cộng roving tabindex nghĩa là Tab đưa focus vào nhóm rồi mũi
 * tên chuyển giữa các tab — đúng cái mà người dùng bàn phím kỳ vọng khi phần tử
 * tự gọi mình là tab. Nếu chỉ dán role mà không xử lý phím, ta vừa hứa một hành
 * vi vừa không thực hiện nó, và điều đó tệ hơn hai cái nút bình thường.
 */
function Tabs({ value, onChange }: { value: "draw" | "receipt"; onChange: (v: "draw" | "receipt") => void }) {
  const base = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const order = ["draw", "receipt"] as const;

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    const i = order.indexOf(value);
    const next =
      e.key === "ArrowRight" ? order[(i + 1) % order.length]
      : e.key === "ArrowLeft" ? order[(i - 1 + order.length) % order.length]
      : e.key === "Home" ? order[0]
      : e.key === "End" ? order[order.length - 1]
      : null;
    if (!next) return;
    e.preventDefault();
    onChange(next);
    refs.current[next]?.focus();
  }

  return (
    <div role="tablist" aria-label="Draw room sections" onKeyDown={onKeyDown} className="flex gap-2">
      {order.map((key) => {
        const selected = value === key;
        return (
          <button
            key={key}
            ref={(el) => {
              refs.current[key] = el;
            }}
            role="tab"
            id={`${base}-${key}`}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(key)}
            data-testid={`draw-tab-${key}`}
            className={`rounded-control focus-visible:outline-draw-fg inline-flex items-center px-4 text-[14px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 ${
              selected ? "bg-draw-border text-draw-fg" : "text-draw-fg-muted hover:bg-draw-border/40"
            }`}
          >
            {key === "draw" ? "Draw" : "Fairness receipt"}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Phần của riêng bạn
 * ------------------------------------------------------------------ */

/**
 * Entry + kết quả + claim, cho ví đang kết nối.
 *
 * Tách khỏi `Room` vì đây là toàn bộ phần đọc dữ liệu của ví, và giữ nó trong
 * một component giúp câu "phần công khai của Draw Room không biết gì về bạn"
 * kiểm tra được bằng mắt: `Room` ở trên không gọi `useConfidentialView` lần nào.
 */
function YourSide({ phase }: { phase: "Open" | "Snapshotting" | "Drawing" | "Settled" }) {
  const reads = useStore(potReadsStore);
  const wallet = useStore(walletStore);
  const gate = useWriteGate();
  const { flight, notice, reveal, hide, busy, dismissNotice } = useRevealController();

  const account = reads.account;
  const principalView = useConfidentialView(account?.principal);
  const twabView = useConfidentialView(account?.twabArea);
  const prizeView = useConfidentialView(account?.pendingPrize);

  const [reviewing, setReviewing] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<PotError | null>(null);
  const [claimed, setClaimed] = useState(false);

  const result = sealedResult({
    phase,
    registered: account?.registered ?? false,
    pendingPrize: account?.pendingPrize ?? "0x",
  });
  const claim = claimGate(result, prizeView);

  const entryTargets: RevealTarget[] = account
    ? [
        { handle: account.principal, label: "Your savings" },
        { handle: account.twabArea, label: "Your weight" },
      ]
    : [];
  const resultTargets: RevealTarget[] = account
    ? [{ handle: account.pendingPrize, label: "Your unclaimed winnings" }]
    : [];

  function confirmClaim(): void {
    if (!wallet.address) return;
    setClaiming(true);
    setClaimError(null);
    void (async () => {
      try {
        await submitClaim(wallet.address!);
        setClaimed(true);
        setReviewing(false);
      } catch (e) {
        setClaimError(toPotError(e));
      } finally {
        setClaiming(false);
      }
    })();
  }

  if (wallet.status !== "connected" || !wallet.address) {
    return (
      <DrawCard data-testid="draw-connect">
        <h2 className="text-[15px] font-semibold tracking-tight">Your side of this round</h2>
        <p className="text-draw-fg-muted mt-1 max-w-[62ch] text-[13px] leading-relaxed">
          Everything above is public and needs no wallet. Your own entry and result are encrypted to your address, so
          reading them needs your signature.
        </p>
        <div className="mt-4">
          <button
            onClick={() => void connectWallet().catch(() => {})}
            className="rounded-control bg-action text-on-action focus-visible:outline-draw-fg inline-flex items-center px-5 text-[15px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Connect wallet
          </button>
        </div>
      </DrawCard>
    );
  }

  return (
    <>
      <PrivateEntryCard
        principal={principalView}
        weight={twabView}
        flight={flight}
        revealBusy={busy}
        onReveal={() => void reveal(entryTargets)}
        onHide={hide}
      />

      <SealedResultCard
        result={result}
        view={prizeView}
        gate={claim}
        flight={flight}
        revealBusy={busy}
        onReveal={() => void reveal(resultTargets)}
        onHide={hide}
        onReviewClaim={() => setReviewing(true)}
        claimDisabledReason={gate.reason}
      />

      {claimed ? (
        <DrawNotice tone="privacy" title="Claim confirmed" data-testid="claim-done">
          Your winnings are now part of your encrypted balance. This screen is not told how much moved — open your
          result again to see for yourself.
        </DrawNotice>
      ) : null}

      {claimError ? (
        <ErrorPanel
          surface="draw"
          error={claimError}
          handlers={{
            retry: confirmClaim,
            "switch-network": () => void switchToSepolia().catch(() => {}),
            "connect-wallet": () => void connectWallet().catch(() => {}),
          }}
          onDismiss={() => setClaimError(null)}
        />
      ) : null}

      {notice ? (
        notice.error ? (
          <ErrorPanel
            surface="draw"
            error={notice.error}
            handlers={{
              "reveal-again": () => void reveal(resultTargets),
              retry: () => void reveal(resultTargets),
            }}
            onDismiss={dismissNotice}
          />
        ) : (
          <NoticeBanner
            surface="draw"
            tone="privacy"
            title={notice.title}
            detail={notice.detail}
            action={{ label: "Dismiss", onClick: dismissNotice }}
          />
        )
      ) : null}

      <ClaimReviewDialog
        open={reviewing}
        potAddress={reads.config?.address ?? null}
        account={wallet.address}
        busy={claiming}
        onConfirm={confirmClaim}
        onCancel={() => {
          if (!claiming) setReviewing(false);
        }}
      />
    </>
  );
}
