"use client";

import { useRef, useState } from "react";
import { toPotError, type PotError } from "@payday-pot/sdk";

import { Button } from "@/components/ui/Button";
import { ErrorPanel, NoticeBanner } from "@/components/ui/ErrorPanel";
import { submitWithdrawAll } from "@/lib/savings/actions";
import { useStore } from "@/lib/store/external-store";
import { connectWallet, switchToSepolia } from "@/lib/wallet/connect";
import { useWriteGate } from "@/lib/wallet/use-write-gate";
import { walletStore } from "@/lib/wallet/store";

/**
 * Rút hết — đường thoát, và nó phải là đường ngắn nhất trên cả sản phẩm.
 *
 * Không mã hoá, không reveal, không chờ mười giây, không quan tâm pool đang ở
 * phase nào hay có đang pause hay không. Contract lấy chính handle principal của
 * bạn làm số tiền, nên UI không cần biết con số — và vì không cần biết, nó không
 * được đòi. Mỗi precondition thêm vào đây là một cách để tiền của người khác bị
 * giữ lại vì một bug ở tầng trình bày (non-negotiable #1).
 *
 * Có một bước xác nhận, không phải để cản mà vì "rút hết" là không thể sửa lại
 * bằng một cú bấm: trọng số đã tích cho vòng này biến mất cùng nó.
 */
export function WithdrawAllPanel() {
  const wallet = useStore(walletStore);
  const gate = useWriteGate();
  const account = wallet.address;

  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<PotError | null>(null);
  const lastRun = useRef<(() => void) | null>(null);

  function run(): void {
    if (!account) return;
    lastRun.current = run;
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        await submitWithdrawAll(account, { onHash: setTxHash });
        setDone(true);
        setConfirming(false);
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

  if (done) {
    return (
      <div className="border-success/30 bg-success/5 rounded-card border p-4">
        <p className="text-[14px] font-semibold">Everything is on its way back to your wallet</p>
        <p className="text-fg-muted mt-2 max-w-[68ch] text-[13px] leading-relaxed">
          Your savings left the pool as confidential USDC. The amount stayed encrypted the whole way — this screen never
          learned it, and did not need to.
        </p>
      </div>
    );
  }

  return (
    <div className="border-border-default rounded-card border p-4">
      <p className="text-[15px] font-semibold tracking-tight">Withdraw everything</p>
      <p className="text-fg-muted mt-2 max-w-[68ch] text-[13px] leading-relaxed">
        Available in every stage of every round, and while the pool is paused. No amount to type, no encryption to wait
        for, and no reveal needed — the pool already holds the encrypted number and uses it directly.
      </p>

      {busy && txHash ? (
        <div className="mt-4">
          <NoticeBanner
            tone="privacy"
            title="Confirming on Sepolia"
            detail="The transaction is on chain and waiting for a block. You can leave this page — it will appear in your transactions."
          />
        </div>
      ) : null}

      {error ? (
        <div className="mt-4">
          <ErrorPanel error={error} handlers={handlers} onDismiss={() => setError(null)} />
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {confirming ? (
          <>
            <Button
              variant="danger"
              loading={busy}
              disabled={!gate.ready || busy}
              title={gate.reason ?? undefined}
              onClick={run}
            >
              Yes, withdraw everything
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>
              Keep my savings in
            </Button>
          </>
        ) : (
          <Button
            variant="secondary"
            disabled={!gate.ready}
            title={gate.reason ?? undefined}
            onClick={() => setConfirming(true)}
          >
            Withdraw everything
          </Button>
        )}
        <p className="text-fg-muted text-[13px]">
          {confirming
            ? "This also gives up the weight you have built for this round."
            : "One signature. Works even if the pool is paused."}
        </p>
      </div>
    </div>
  );
}
