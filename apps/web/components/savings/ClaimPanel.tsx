"use client";

import { useRef, useState } from "react";
import { HIDDEN_HANDLE, toPotError, type PotError } from "@payday-pot/sdk";

import { Button } from "@/components/ui/Button";
import { EncryptedBadge } from "@/components/ui/Card";
import { ErrorPanel, NoticeBanner } from "@/components/ui/ErrorPanel";
import { potReadsStore } from "@/lib/pot/reads";
import { submitClaim } from "@/lib/savings/actions";
import { useStore } from "@/lib/store/external-store";
import { connectWallet, switchToSepolia } from "@/lib/wallet/connect";
import { useWriteGate } from "@/lib/wallet/use-write-gate";
import { walletStore } from "@/lib/wallet/store";

/**
 * Claim — ba tình huống khác nhau, ba câu khác nhau, và KHÔNG câu nào nói ai đã
 * thắng (R9).
 *
 * Ba tình huống phân biệt được bằng state **công khai**, không cần biết gì về
 * tiền của ai:
 *   1. vòng chưa quét xong winner → chưa có gì để claim, đây là dữ kiện công khai
 *   2. ví này chưa từng tham gia  → không có handle nào
 *   3. đã settle                  → claim được, và kết quả vẫn mã hoá
 *
 * Trường hợp 3 là chỗ dễ rò rỉ nhất. Contract cố ý làm winner và non-winner đi
 * **cùng một code path với HCU/gas bằng nhau tuyệt đối** (748,032 / 369,000 /
 * 396,250 — đo ở Day 5), nên nhìn từ ngoài không phân biệt được. UI phải giữ
 * đúng tính chất đó: cùng một nút, cùng một câu, cùng một màn hình sau khi xong.
 * Một dòng "Chúc mừng bạn đã thắng!" ở đây sẽ phá bỏ toàn bộ công đó — và nó
 * cũng sai, vì màn hình này không biết.
 */
export function ClaimPanel() {
  const wallet = useStore(walletStore);
  const reads = useStore(potReadsStore);
  const gate = useWriteGate();
  const account = wallet.address;

  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<PotError | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const lastRun = useRef<(() => void) | null>(null);

  const state = reads.state;
  const settled = state !== null && state.draw.drawn && state.draw.cursor >= state.draw.total;
  const neverParticipated = reads.account !== null && reads.account.pendingPrize === HIDDEN_HANDLE;

  function run(): void {
    if (!account) return;
    lastRun.current = run;
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        await submitClaim(account, { onHash: setTxHash });
        setDone(true);
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
    "continue-draw": () => {
      window.location.href = "/app/draw";
    },
    "wait-for-epoch": () => {
      window.location.href = "/app";
    },
  };

  return (
    <div className="border-border-default rounded-card border p-4" data-testid="claim-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] font-semibold tracking-tight">Claim winnings</p>
        <EncryptedBadge>Result stays encrypted</EncryptedBadge>
      </div>

      {/* Case 1 — dữ kiện công khai về vòng, không nói gì về ví này. */}
      {!settled ? (
        <p data-testid="claim-state" data-state="not-settled" className="text-fg-muted mt-2 max-w-[68ch] text-[13px] leading-relaxed">
          This round has not been settled yet, so there is nothing to claim — for anyone. Whether a round has finished
          scanning is public information; who won is not.
        </p>
      ) : neverParticipated ? (
        /* Case 2 — không có handle nào cho ví này. Không phải "bạn không thắng". */
        <p data-testid="claim-state" data-state="no-position" className="text-fg-muted mt-2 max-w-[68ch] text-[13px] leading-relaxed">
          This wallet has never deposited into the pool, so it has no winnings slot to claim from. Deposit into a round
          to take part in the next draw.
        </p>
      ) : (
        /* Case 3 — claim được. Cùng một câu cho mọi người, cố ý. */
        <p data-testid="claim-state" data-state="claimable" className="text-fg-muted mt-2 max-w-[68ch] text-[13px] leading-relaxed">
          The round is settled and you can claim. Claiming moves any settled winnings into your balance and costs exactly
          the same whether you won or not — so nobody watching, including us, can tell from this transaction which one
          happened. Reveal your position afterwards to see for yourself.
        </p>
      )}

      {busy && txHash ? (
        <div className="mt-4">
          <NoticeBanner
            tone="privacy"
            title="Confirming on Sepolia"
            detail="The transaction is on chain and waiting for a block."
          />
        </div>
      ) : null}

      {error ? (
        <div className="mt-4">
          <ErrorPanel error={error} handlers={handlers} onDismiss={() => setError(null)} />
        </div>
      ) : null}

      {done ? (
        <div className="border-success/30 bg-success/5 rounded-card mt-4 border p-3">
          <p className="text-[13px] font-medium">Claim confirmed</p>
          <p className="text-fg-muted mt-1 max-w-[64ch] text-[13px] leading-relaxed">
            If there were winnings, they are now part of your encrypted balance. This screen is not told which case
            applied — reveal your position on the dashboard to find out.
          </p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          loading={busy}
          // Không có action mù (R9): nút chỉ sống khi claim thực sự hợp lệ.
          disabled={!gate.ready || busy || !settled || neverParticipated || done}
          title={gate.reason ?? undefined}
          onClick={run}
        >
          Claim
        </Button>
        <p className="text-fg-muted text-[13px]">
          {settled && !neverParticipated ? "One signature. Same cost for everyone." : "Nothing to claim right now."}
        </p>
      </div>
    </div>
  );
}
