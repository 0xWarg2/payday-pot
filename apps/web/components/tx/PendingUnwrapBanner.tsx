"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toPotError, type PotError } from "@payday-pot/sdk";

import { formatAmount } from "@/lib/format";
import { useStore } from "@/lib/store/external-store";
import { findPendingUnwraps, resumeUnwrap, type PendingUnwrap } from "@/lib/tx/pending-unwrap";
import { connectWallet, switchToSepolia } from "@/lib/wallet/connect";
import { useWriteGate } from "@/lib/wallet/use-write-gate";
import { walletStore } from "@/lib/wallet/store";
import { Button } from "@/components/ui/Button";
import { ErrorPanel } from "@/components/ui/ErrorPanel";
import { EXPLORER } from "./TxRow";

/**
 * R1 — unwrap hai bước bị bỏ dở, và cách tự thoát ra.
 *
 * `unwrap` trên cUSDC không trả tiền ngay: nó tạo một yêu cầu (tiền đã burn,
 * nằm chờ ở token contract), rồi ai đó phải gọi `finalizeUnwrap`. Đóng tab giữa
 * hai bước là chuyện rất dễ xảy ra — và hậu quả trông giống hệt "tiền bốc hơi"
 * nếu app im lặng.
 *
 * Banner này phát hiện bằng LOG TRÊN CHAIN (không phải localStorage), nên nó
 * thấy cả những unwrap được tạo ở ngoài app này — vốn là trường hợp phổ biến
 * nhất — và thấy được trên máy chưa từng mở app. Nút hoàn tất là thật, đã chạy
 * trên Sepolia, không phải nút bấm vào rồi không có gì xảy ra.
 */
const EMPTY: PendingUnwrap[] = [];

type Done = { amount: bigint; txHash: string };

export function PendingUnwrapBanner() {
  const wallet = useStore(walletStore);
  const gate = useWriteGate({ requiresPot: false });
  const account = wallet.address;

  const [pending, setPending] = useState<PendingUnwrap[]>(EMPTY);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState<PotError | null>(null);
  const lastRun = useRef<(() => void) | null>(null);

  const check = useCallback(async () => {
    if (!account) {
      setPending((prev) => (prev.length === 0 ? prev : EMPTY));
      return;
    }
    setChecking(true);
    try {
      const found = await findPendingUnwraps(account);
      // Giữ nguyên reference khi kết quả không đổi: banner poll lại mỗi lần ví
      // đổi trạng thái, và một mảng mới cùng nội dung vẫn làm cả cây render.
      setPending((prev) => (sameUnwraps(prev, found) ? prev : found));
    } finally {
      setChecking(false);
    }
  }, [account]);

  useEffect(() => {
    void check();
  }, [check]);

  function finish(target: PendingUnwrap): void {
    lastRun.current = () => finish(target);
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        const result = await resumeUnwrap(target);
        setDone({ amount: result.amount, txHash: result.txHash });
        await check();
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
  };

  // Báo số THẬT, kể cả 0. Unwrap từ ví không có cUSDC không revert — nó clamp về
  // encrypted zero rồi finalize chuyển 0 (cùng ngữ nghĩa với deposit clamp).
  // Hiện "xong rồi" mà không nói số là dựng đúng cái bẫy mà R1 sinh ra để tránh.
  if (done) {
    const zero = done.amount === 0n;
    return (
      <div
        data-testid="unwrap-finalized"
        data-amount-zero={zero ? "true" : "false"}
        className={`rounded-card border p-4 ${zero ? "border-warning/30 bg-warning/5" : "border-success/30 bg-success/5"}`}
      >
        <p className="text-[14px] font-semibold">
          {zero ? "The unwrap settled, but it moved 0 USDC" : `${formatAmount(done.amount)} USDC landed in your wallet`}
        </p>
        <p className="text-fg-muted mt-2 max-w-[68ch] text-[13px] leading-relaxed">
          {zero
            ? "The request was for more than the wallet held in confidential USDC, so the token contract capped it at zero instead of failing. Nothing was lost — but nothing arrived either. Wrap some USDC first, then unwrap again."
            : "The second step went through. This was the plain amount all along: finishing an unwrap requires the token contract to learn the number, which is why the exit is the one place a value stops being confidential."}{" "}
          <a
            href={`${EXPLORER}/tx/${done.txHash}`}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4"
          >
            View the transaction
          </a>
        </p>
      </div>
    );
  }

  if (pending.length === 0) return null;
  const first = pending[0];
  if (!first) return null;

  return (
    <div
      data-testid="pending-unwrap"
      className="border-warning/30 bg-warning/5 rounded-card flex flex-col gap-3 border p-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold">
            {pending.length === 1
              ? "An unwrap is waiting to finish"
              : `${pending.length} unwraps are waiting to finish`}
          </p>
          <p className="text-fg-muted mt-1 max-w-[68ch] text-[13px] leading-relaxed">
            Unwrapping runs in two steps. The first one went through; the second has not settled yet, so the USDC has
            not landed in your wallet. Nothing is lost — the request stays open on the token contract, and anyone can
            finish it.{" "}
            <a
              href={`${EXPLORER}/tx/${first.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4"
            >
              View the request
            </a>
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link
            data-cta
            href="/docs/known-limitations#unwrap"
            className="rounded-control border-border-default bg-surface inline-flex items-center px-3 text-[14px] font-medium"
          >
            What to do
          </Link>
          <Button
            size="sm"
            variant="secondary"
            loading={checking}
            onClick={() => void check()}
            data-testid="unwrap-recheck"
          >
            Check again
          </Button>
          <Button
            size="sm"
            loading={busy}
            disabled={!gate.ready}
            {...(gate.reason ? { title: gate.reason } : {})}
            onClick={() => finish(first)}
            data-testid="unwrap-finalize"
          >
            Finish it now
          </Button>
        </div>
      </div>
      {error ? <ErrorPanel error={error} handlers={handlers} /> : null}
    </div>
  );
}

function sameUnwraps(a: readonly PendingUnwrap[], b: readonly PendingUnwrap[]): boolean {
  return a.length === b.length && a.every((item, i) => item.requestId === b[i]?.requestId);
}
