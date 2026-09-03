"use client";

import { useEffect, useRef, useState } from "react";
import { toPotError, type PotError } from "@payday-pot/sdk";

import { Button } from "@/components/ui/Button";
import { PublicBadge } from "@/components/ui/Card";
import { ErrorPanel, NoticeBanner } from "@/components/ui/ErrorPanel";
import { Field } from "@/components/ui/Field";
import { approvePotForPrize, checkFundPrize, submitFundPrize } from "@/lib/employer/fund";
import { formatAmount, parseAmount } from "@/lib/format";
import { potReadsStore } from "@/lib/pot/reads";
import { refreshAssets, assetsStore } from "@/lib/tokens/assets";
import { useStore } from "@/lib/store/external-store";
import { connectWallet, switchToSepolia } from "@/lib/wallet/connect";
import { useWriteGate } from "@/lib/wallet/use-write-gate";
import { walletStore } from "@/lib/wallet/store";

type Job = "approve" | "fund";

/**
 * Nạp prize — hai chữ ký, và cả hai công khai.
 *
 * Bước 1 approve UNDERLYING cho **POT**, không cho wrapper: `fundPrize` làm
 * `safeTransferFrom(msg.sender → pot)` rồi mới tự wrap. Người dùng không thể
 * nhìn thấy khác biệt đó, nên UI phải không bao giờ bắt họ đoán — hai nút, nhãn
 * "step 1 of 2" và "step 2 of 2", số đã gõ không bị xoá khi một bước hỏng (R13).
 *
 * Và đây là màn hình duy nhất trong sản phẩm mà số tiền **cố ý** công khai. Nói
 * ra trước khi ký, ngay cạnh ô nhập — một người vừa đi qua sáu màn hình về mã hoá
 * sẽ mặc định cho rằng số này cũng được che, và họ sẽ sai.
 */
export function FundPrizePanel() {
  const wallet = useStore(walletStore);
  const reads = useStore(potReadsStore);
  const assets = useStore(assetsStore);
  const gate = useWriteGate();
  const account = wallet.address;

  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<Job | null>(null);
  const [needsApproval, setNeedsApproval] = useState(false);
  const [error, setError] = useState<PotError | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [funded, setFunded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastJob = useRef<(() => void) | null>(null);

  useEffect(() => {
    void refreshAssets(account);
  }, [account]);

  let parsed: bigint | null = null;
  let parseError: string | null = null;
  try {
    if (amount.trim() !== "") parsed = parseAmount(amount);
  } catch (e) {
    parseError = (e as Error).message;
  }

  const rate = reads.config?.rate ?? 1n;
  const ready = parsed !== null && parsed > 0n;

  /** Pre-flight rồi đi bước tiếp theo. Đọc tươi — allowance có thể vừa đổi ở tab khác. */
  function start(draft: bigint): void {
    if (!account) return;
    lastJob.current = () => start(draft);
    setBusy("fund");
    setError(null);
    setFunded(false);
    void (async () => {
      try {
        const verdict = await checkFundPrize({ account, amount: draft });
        if (verdict !== null && "needsApproval" in verdict) {
          // Không phải lỗi: đây là bước 1 trong 2, và nhãn phải nói đúng thế.
          setNeedsApproval(true);
          setBusy(null);
          return;
        }
        if (verdict !== null) {
          setError(verdict);
          setBusy(null);
          return;
        }
        setNeedsApproval(false);
        await submitFundPrize(account, draft, { onHash: setTxHash });
        setFunded(true);
        setAmount("");
      } catch (e) {
        setError(toPotError(e));
      } finally {
        setBusy(null);
      }
    })();
  }

  function approve(draft: bigint): void {
    lastJob.current = () => approve(draft);
    setBusy("approve");
    setError(null);
    void (async () => {
      try {
        await approvePotForPrize(draft, rate, { onHash: setTxHash });
        await refreshAssets(account);
        setNeedsApproval(false);
      } catch (e) {
        setError(toPotError(e));
      } finally {
        setBusy(null);
      }
    })();
  }

  const handlers = {
    retry: () => lastJob.current?.(),
    approve: () => parsed !== null && approve(parsed),
    "edit-amount": () => inputRef.current?.focus(),
    "switch-network": () => void switchToSepolia().catch(() => {}),
    "connect-wallet": () => void connectWallet().catch(() => {}),
    "get-test-assets": () => {
      window.location.href = "/app/savings#assets";
    },
    "wait-for-epoch": () => {
      window.location.href = "/app";
    },
  };

  return (
    <div className="border-border-default rounded-card border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] font-semibold tracking-tight">Fund the prize</p>
        <PublicBadge>This amount is public</PublicBadge>
      </div>
      <p className="text-fg-muted mt-2 max-w-[70ch] text-[13px] leading-relaxed">
        The prize is announced in plain text on chain so every saver can see what they are playing for. Everything on
        the other side stays encrypted — who deposited, how much, and who ends up winning it.
      </p>

      <div className="mt-4 max-w-[300px]">
        <Field
          label="Prize for this round"
          inputRef={inputRef}
          inputMode="decimal"
          placeholder="500"
          value={amount}
          suffix="USDC"
          error={parseError}
          hint={
            assets.underlying !== null
              ? `You hold ${formatAmount(assets.underlying)} test USDC.`
              : "Funding pulls test USDC from this wallet."
          }
          onChange={(e) => setAmount(e.currentTarget.value)}
        />
      </div>

      {busy === "fund" && txHash ? (
        <div className="mt-4">
          <NoticeBanner
            tone="warning"
            title="Confirming on Sepolia"
            detail="The prize is being pulled from your wallet and shielded by the pool."
          />
        </div>
      ) : null}

      {error ? (
        <div className="mt-4">
          <ErrorPanel error={error} handlers={handlers} onDismiss={() => setError(null)} />
        </div>
      ) : null}

      {funded ? (
        <div className="border-success/30 bg-success/5 rounded-card mt-4 border p-3">
          <p className="text-[13px] font-medium">Prize funded</p>
          <p className="text-fg-muted mt-1 max-w-[64ch] text-[13px] leading-relaxed">
            The allocated prize above has gone up by that amount, and the money is in the pool — allocation and funding
            are the same act here, so there is nothing left to reconcile.
          </p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {needsApproval ? (
          <Button
            loading={busy === "approve"}
            disabled={!gate.ready || !ready || busy !== null}
            title={gate.reason ?? undefined}
            onClick={() => parsed !== null && approve(parsed)}
          >
            Approve — step 1 of 2
          </Button>
        ) : (
          <Button
            loading={busy === "fund"}
            disabled={!gate.ready || !ready || busy !== null}
            title={gate.reason ?? undefined}
            onClick={() => parsed !== null && start(parsed)}
          >
            {`Fund the prize${busy === null && ready ? " — step 2 of 2" : ""}`}
          </Button>
        )}
        <p className="text-fg-muted text-[13px]">
          {needsApproval
            ? "Two signatures: first you allow the pool to take that amount, then you fund it."
            : "Prizes can only be added while the round is still open for deposits."}
        </p>
      </div>
    </div>
  );
}
