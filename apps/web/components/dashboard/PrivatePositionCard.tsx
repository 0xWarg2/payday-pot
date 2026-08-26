"use client";

import Link from "next/link";
import { HIDDEN_HANDLE, type PotError } from "@payday-pot/sdk";

import { ConfidentialValue, RevealPhaseLine } from "@/components/privacy/ConfidentialValue";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, EncryptedBadge } from "@/components/ui/Card";
import { ErrorPanel, NoticeBanner } from "@/components/ui/ErrorPanel";
import { SEPOLIA_CHAIN_ID } from "@/lib/chain/rpc";
import { potReadsStore, refreshPotReads } from "@/lib/pot/reads";
import { useConfidentialView, useRevealController } from "@/lib/reveal/use-reveal";
import type { RevealTarget } from "@/lib/reveal/reveal";
import { useStore } from "@/lib/store/external-store";
import { connectWallet } from "@/lib/wallet/connect";
import { walletStore } from "@/lib/wallet/store";

/**
 * Vị thế của chính bạn — màn hình mà cả sản phẩm này tồn tại để phục vụ.
 *
 * Ba giá trị, MỘT chữ ký. Principal, TWAB và tiền thắng luôn được xem cùng nhau,
 * nên tách chúng thành ba lần ký là dạy người dùng thói quen bấm "Sign" mà không
 * đọc — thói quen đắt nhất trong web3. `revealHandles` tự lọc handle chưa khởi
 * tạo, nên số cặp gửi đi là "tối đa ba", không phải "luôn ba".
 *
 * Ba trạng thái hiển thị KHÔNG được gộp (non-negotiable #8):
 *   - chưa có gì onchain → "Not available yet" kèm đường đi tiếp
 *   - có, chưa mở        → •••••• kèm nút Reveal
 *   - đã mở              → con số thật, sống trong tab, có TTL đang chạy
 * Không nhánh nào ra `0`. Một số 0 trên màn hình này chỉ có thể là số 0 đã được
 * decrypt — tức là sự thật, không phải trạng thái thiếu dữ liệu.
 */
export function PrivatePositionCard() {
  const wallet = useStore(walletStore);
  const reads = useStore(potReadsStore);
  const { flight, notice, reveal, hide, busy, dismissNotice } = useRevealController();

  const account = reads.account;
  const principalView = useConfidentialView(account?.principal);
  const twabView = useConfidentialView(account?.twabArea);
  const prizeView = useConfidentialView(account?.pendingPrize);

  const connected = wallet.status === "connected" && wallet.address !== null;
  const retryRead = (): void => void refreshPotReads(wallet.address, SEPOLIA_CHAIN_ID);
  const anyRevealed =
    principalView.kind === "revealed" || twabView.kind === "revealed" || prizeView.kind === "revealed";

  // Chưa deposit lần nào ⇒ contract chưa từng ghi handle nào cho ví này.
  const nothingOnChain =
    account !== null &&
    account.principal === HIDDEN_HANDLE &&
    account.twabArea === HIDDEN_HANDLE &&
    account.pendingPrize === HIDDEN_HANDLE;

  const targets: RevealTarget[] = account
    ? [
        { handle: account.principal, label: "Your savings" },
        { handle: account.twabArea, label: "Your weight" },
        { handle: account.pendingPrize, label: "Your winnings" },
      ]
    : [];

  return (
    <Card className="h-full">
      <CardHeader
        title="Your position"
        hint="Only this wallet can read these. The pool operator cannot."
        action={<EncryptedBadge />}
      />

      <p className="text-fg-muted text-[13px]">Savings in the pool</p>
      <p className="mt-2">
        <ConfidentialValue view={principalView} label="Your savings" />
        {principalView.kind === "revealed" ? (
          <span className="text-fg-muted ml-2 text-[15px] font-normal">USDC</span>
        ) : null}
      </p>

      {prizeView.kind !== "unavailable" ? (
        <div className="border-border-default mt-5 border-t pt-4">
          <p className="text-fg-muted text-[13px]">Winnings waiting to be claimed</p>
          <p className="mt-1.5">
            <ConfidentialValue view={prizeView} label="Your winnings" size="md" />
            {prizeView.kind === "revealed" ? (
              <span className="text-fg-muted ml-2 text-[14px] font-normal">USDC</span>
            ) : null}
          </p>
        </div>
      ) : null}

      <div className="mt-5">
        {!connected ? (
          <Connect />
        ) : reads.deployment !== "ready" ? (
          <p className="text-fg-muted text-[13px] leading-relaxed">
            There is no pool on chain in this build yet, so there is nothing encrypted to open.
          </p>
        ) : account === null ? (
          <PositionUnknown error={reads.error} onRetry={retryRead} />
        ) : nothingOnChain ? (
          <NothingYet />
        ) : flight ? (
          <RevealPhaseLine phase={flight.phase} />
        ) : anyRevealed ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={hide}>
              Hide
            </Button>
            <p className="text-fg-muted text-[13px]">Visible in this tab only, and not for long.</p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button loading={busy} onClick={() => void reveal(targets)}>
              Reveal my position
            </Button>
            <p className="text-fg-muted text-[13px]">One signature opens all three.</p>
          </div>
        )}
      </div>

      {notice ? (
        <div className="mt-4">
          {notice.error ? (
            <ErrorPanel
              error={notice.error}
              handlers={{ "reveal-again": () => void reveal(targets), retry: () => void reveal(targets) }}
              onDismiss={dismissNotice}
            />
          ) : (
            <NoticeBanner
              tone="privacy"
              title={notice.title}
              detail={notice.detail}
              action={{ label: "Dismiss", onClick: dismissNotice }}
            />
          )}
        </div>
      ) : null}
    </Card>
  );
}

function Connect() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={() => void connectWallet().catch(() => {})}>Connect wallet</Button>
      <p className="text-fg-muted text-[13px]">Reading your own balance needs your signature.</p>
    </div>
  );
}

/**
 * "Chưa biết" là trạng thái thứ tư, và nó không thuộc `ConfidentialValue`.
 *
 * Ba trạng thái kia đều là phát biểu VỀ MỘT GIÁ TRỊ — không có, đang khoá, đã
 * mở. Trước khi `readAccount` trả lời thì ta chưa có handle nào, nên không câu
 * nào trong ba câu đó đúng. Để nó rơi vào nhánh cuối thì nút "Reveal my
 * position" sáng lên với `targets` rỗng, và bấm vào chỉ nhận được một lời khẳng
 * định sai về một thứ ta chưa đọc.
 *
 * Read lỗi thì phải NÓI là lỗi. Một dòng "đang đọc" không bao giờ dứt là đúng
 * cái ngõ cụt mà exit gate Day 6 cấm — và `reads.error` hiện không được hiện ở
 * bất kỳ đâu khác trên dashboard.
 */
function PositionUnknown({ error, onRetry }: { error: PotError | null; onRetry: () => void }) {
  // Chỉ nối `retry`: read đi qua RPC Sepolia cố định nên đọc lại là hành động
  // đúng cho R7. Action nào khác thì ErrorPanel tự rơi về link tài liệu, chứ
  // không phải một nút giả vờ sửa được thứ nó không sửa được.
  if (error) return <ErrorPanel error={error} handlers={{ retry: onRetry }} />;
  return (
    <p className="text-fg-muted text-[13px] leading-relaxed" data-testid="position-loading">
      Reading your position from the chain…
    </p>
  );
}

function NothingYet() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link
        data-cta
        href="/app/savings"
        className="rounded-control bg-action text-on-action inline-flex items-center px-5 text-[15px] font-medium"
      >
        Make your first deposit
      </Link>
      <p className="text-fg-muted max-w-[38ch] text-[13px] leading-relaxed">
        Nothing is stored for this wallet yet — that is different from holding zero.
      </p>
    </div>
  );
}
