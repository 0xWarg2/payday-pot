"use client";

import { useEffect, useRef, useState } from "react";
import { toPotError, type PotError } from "@payday-pot/sdk";

import { GuideLink } from "@/components/onboarding/GuideLink";
import { ShieldWarning } from "@/components/onboarding/ShieldWarning";
import { Button } from "@/components/ui/Button";
import { EncryptedBadge, PublicBadge } from "@/components/ui/Card";
import { ErrorPanel, NoticeBanner } from "@/components/ui/ErrorPanel";
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
 * Bước 6 — sẵn sàng gửi tiền.
 *
 * Ba giao dịch tách rời, cố ý không gộp: nhận test USDC → duyệt cho wrapper →
 * shield. Gộp lại thành một nút "Get ready" nghe gọn hơn, nhưng khi ví từ chối
 * ở giữa thì không ai — kể cả ta — biết đang đứng ở đâu để làm tiếp. §7 nói
 * thẳng: approval, action, confirmation phải là các trạng thái phục hồi được
 * riêng biệt, và R13 gọi tên nhãn "step 1 of 2".
 *
 * Số tiền đã gõ KHÔNG bị xoá khi một bước hỏng. Bắt gõ lại sau khi ví báo lỗi
 * là hình phạt dành cho người đã làm đúng.
 */
export function AssetStep({ onContinue }: { onContinue: () => void }) {
  const wallet = useStore(walletStore);
  const assets = useStore(assetsStore);
  // Ba tx ở màn hình này chỉ đụng USDCMock và cUSDC, cả hai đã sống trên Sepolia
  // độc lập với PayDayPot — nên đừng khoá chúng vì pool chưa deploy.
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
  const shielded = hasShielded(assets);
  const overBalance = parsed !== null && balance !== null && parsed > balance;
  // `?? 1n` khi chưa gõ gì: với hạn mức 0 thì bước kế tiếp *sẽ* là approve, nên
  // hiện sẵn nhãn "step 1 of 2" thay vì để nút đổi tên ngay dưới ngón tay người
  // dùng lúc họ vừa gõ chữ số đầu tiên.
  const needsApproval = (assets.allowance ?? 0n) < (parsed ?? 1n);
  const amountReady = parsed !== null && parsed > 0n && !overBalance;

  async function run(job: Job, fn: () => Promise<void>) {
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
    <div>
      <p className="text-fg-muted max-w-[62ch] text-[16px] leading-relaxed">
        Deposits are encrypted, so they use a shielded token. Two public steps first: get test USDC, then shield it.{" "}
        <GuideLink href="/docs/get-started#steps" />
      </p>

      {assets.blocked ? (
        <div className="mt-6">
          <NoticeBanner
            tone="warning"
            title="The token contract has blocked this address"
            detail="Shielding will be rejected on chain. Try setup again from a different address."
          />
        </div>
      ) : null}

      {/* ---------- 1. test USDC (public) ---------- */}
      <section className="border-border-default mt-8 border-t pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight">1. Test USDC in your wallet</h2>
            <p className="text-fg-muted mt-1 text-[13px]">Play money on Sepolia.</p>
          </div>
          <PublicBadge>Public balance</PublicBadge>
        </div>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <p className="tabular text-[28px] leading-none font-semibold tracking-tight">
            {balance === null ? (
              <Skeleton className="h-[28px] w-[120px]" />
            ) : (
              <>
                {formatAmount(balance)} <span className="text-fg-muted text-[15px] font-normal">USDC</span>
              </>
            )}
          </p>
          <Button
            variant={balance !== null && balance > 0n ? "secondary" : "primary"}
            loading={busy === "faucet"}
            disabled={!gate.ready || busy !== null}
            title={gate.reason ?? undefined}
            onClick={() => account && void run("faucet", () => mintTestUsdc(account))}
          >
            Get 1,000 test USDC
          </Button>
        </div>
      </section>

      {/* ---------- 2. shield (public amount → encrypted from here on) ---------- */}
      <section className="border-border-default mt-8 border-t pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight">2. Shield it</h2>
            <p className="text-fg-muted mt-1 text-[13px]">
              One for one into its confidential twin. This is the last public number.
            </p>
          </div>
          <EncryptedBadge>Shielded balance</EncryptedBadge>
        </div>

        <p className="text-fg-muted mt-4 max-w-[64ch] text-[14px] leading-relaxed">
          {shielded
            ? "You already hold shielded USDC. Its amount is encrypted."
            : "Nothing shielded yet."}
        </p>

        <div className="mt-5 max-w-[320px]">
          <Field
            label="Amount to shield"
            inputRef={inputRef}
            inputMode="decimal"
            placeholder="1000"
            value={amount}
            suffix="USDC"
            error={parseError ?? (overBalance ? "That is more than you hold" : null)}
            hint={
              balance !== null && balance > 0n ? (
                <button
                  type="button"
                  className="underline underline-offset-4"
                  onClick={() => setAmount(formatAmount(balance).replace(/,/g, ""))}
                >
                  Shield all {formatAmount(balance)}
                </button>
              ) : null
            }
            onChange={(e) => setAmount(e.currentTarget.value)}
          />
        </div>

        {/* Cảnh báo NẰM TRÊN nút ký — xem ShieldWarning. */}
        <div className="mt-5">
          <ShieldWarning />
        </div>

        {error ? (
          <div className="mt-5">
            <ErrorPanel error={error} handlers={handlers} onDismiss={() => setError(null)} />
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-3">
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
              ? "Two signatures: allow, then shield."
              : amountReady
                ? "Already approved — one signature left."
                : "Enter an amount to continue."}
          </p>
        </div>
      </section>

      <div className="border-border-default mt-8 border-t pt-5">
        <Button variant={shielded ? "primary" : "secondary"} onClick={onContinue}>
          {shielded ? "Continue" : "Skip for now"}
        </Button>
        <p className="text-fg-muted mt-3 max-w-[62ch] text-[13px] leading-relaxed">
          {shielded
            ? "You are ready to make a deposit."
            : "Come back from the dashboard any time. Deposits need shielded USDC."}
        </p>
      </div>
    </div>
  );
}
