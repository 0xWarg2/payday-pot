"use client";

import { useEffect, useRef, useState } from "react";
import { toPotError, type PotError } from "@payday-pot/sdk";

import { ShieldWarning } from "@/components/onboarding/ShieldWarning";
import { Button } from "@/components/ui/Button";
import { EncryptedBadge, PublicBadge } from "@/components/ui/Card";
import { ErrorPanel } from "@/components/ui/ErrorPanel";
import { Field } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatAmount, parseAmount } from "@/lib/format";
import { useStore } from "@/lib/store/external-store";
import { approveWrapper, assetsStore, hasShielded, mintTestUsdc, refreshAssets, shieldUsdc } from "@/lib/tokens/assets";
import { connectWallet, switchToSepolia } from "@/lib/wallet/connect";
import { useWriteGate } from "@/lib/wallet/use-write-gate";
import { walletStore } from "@/lib/wallet/store";

type Job = "faucet" | "approve" | "shield";

/**
 * Faucet + shield, ngay tại chỗ cần đến.
 *
 * Onboarding đã có bước này, nhưng ai cũng chỉ đi qua onboarding một lần và hết
 * tiền thì xảy ra mãi mãi. Recovery action của R14 là **một nút trong app**, chứ
 * không phải một link ra faucet ngoài — làm được vì `USDCMock.mint` là faucet mở,
 * không owner-gated (quirk #21). Bắt người đang dở một deposit đi tìm faucet của
 * bên thứ ba là chỗ họ rời đi và không quay lại.
 *
 * `ShieldWarning` nằm **trên** nút ký, không phải dưới: `wrap` nhận amount
 * plaintext và con số đó ở lại trong calldata mãi mãi. Cảnh báo sau khi ký thì
 * không còn là cảnh báo.
 */
export function AssetsHelper() {
  const wallet = useStore(walletStore);
  const assets = useStore(assetsStore);
  const gate = useWriteGate({ requiresPot: false });
  const account = wallet.address;

  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<Job | null>(null);
  const [error, setError] = useState<PotError | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastJob = useRef<(() => Promise<void>) | null>(null);

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

  const balance = assets.underlying;
  const overBalance = parsed !== null && balance !== null && parsed > balance;
  const needsApproval = (assets.allowance ?? 0n) < (parsed ?? 1n);
  const amountReady = parsed !== null && parsed > 0n && !overBalance;

  async function run(job: Job, fn: () => Promise<void>): Promise<void> {
    lastJob.current = () => run(job, fn);
    setBusy(job);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(toPotError(e));
    } finally {
      setBusy(null);
    }
  }

  const handlers = {
    retry: () => void lastJob.current?.(),
    "get-test-assets": () => account && void run("faucet", () => mintTestUsdc(account)),
    "switch-network": () => void switchToSepolia().catch(() => {}),
    "connect-wallet": () => void connectWallet().catch(() => {}),
    "edit-amount": () => inputRef.current?.focus(),
    approve: () => account && parsed !== null && void run("approve", () => approveWrapper(account, parsed)),
  };

  return (
    <div id="assets" className="border-border-default rounded-card border p-4 scroll-mt-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] font-semibold tracking-tight">Need shielded USDC?</p>
        {hasShielded(assets) ? <EncryptedBadge>You hold shielded USDC</EncryptedBadge> : <PublicBadge>Public steps</PublicBadge>}
      </div>
      <p className="text-fg-muted mt-2 max-w-[68ch] text-[13px] leading-relaxed">
        Deposits are made in the confidential token, so it has to be shielded first. Both steps below are public and
        happen outside the pool — nothing here says anything about your position in it.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <div>
          <p className="text-fg-muted text-[12px] tracking-wide uppercase">Test USDC in your wallet</p>
          <p className="tabular mt-1 text-[22px] leading-none font-semibold tracking-tight">
            {balance === null ? (
              <Skeleton className="h-[22px] w-[100px]" />
            ) : (
              <>
                {formatAmount(balance)} <span className="text-fg-muted text-[13px] font-normal">USDC</span>
              </>
            )}
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          loading={busy === "faucet"}
          disabled={!gate.ready || busy !== null}
          title={gate.reason ?? undefined}
          onClick={() => account && void run("faucet", () => mintTestUsdc(account))}
        >
          Get 1,000 test USDC
        </Button>
      </div>

      <div className="mt-5 max-w-[300px]">
        <Field
          label="Amount to shield"
          inputRef={inputRef}
          inputMode="decimal"
          placeholder="1000"
          value={amount}
          suffix="USDC"
          error={parseError ?? (overBalance ? "That is more than you hold" : null)}
          onChange={(e) => setAmount(e.currentTarget.value)}
        />
      </div>

      <div className="mt-4">
        <ShieldWarning />
      </div>

      {error ? (
        <div className="mt-4">
          <ErrorPanel error={error} handlers={handlers} onDismiss={() => setError(null)} />
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {needsApproval ? (
          <Button
            loading={busy === "approve"}
            disabled={!gate.ready || !amountReady || busy !== null}
            title={gate.reason ?? undefined}
            onClick={() => account && parsed !== null && void run("approve", () => approveWrapper(account, parsed))}
          >
            Approve — step 1 of 2
          </Button>
        ) : (
          <Button
            loading={busy === "shield"}
            disabled={!gate.ready || !amountReady || busy !== null || assets.blocked}
            title={gate.reason ?? undefined}
            onClick={() => account && parsed !== null && void run("shield", () => shieldUsdc(account, parsed))}
          >
            Shield — step 2 of 2
          </Button>
        )}
        <p className="text-fg-muted text-[13px]">
          {needsApproval
            ? "Two signatures: allow the shielded token to take that amount, then shield it."
            : amountReady
              ? "Already approved for this amount — one signature left."
              : "Enter an amount to continue."}
        </p>
      </div>
    </div>
  );
}
