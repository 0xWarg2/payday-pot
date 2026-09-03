"use client";

import { Button } from "@/components/ui/Button";
import { EncryptedBadge, PublicBadge } from "@/components/ui/Card";
import { formatAmount, shortAddress } from "@/lib/format";

/**
 * Bước xác nhận — và điều duy nhất nó tồn tại để làm là chia màn hình làm hai:
 * cái gì vẫn riêng tư, cái gì trở thành công khai và có thể lần được.
 *
 * Đây là chỗ dễ tự lừa mình nhất trong cả sản phẩm. Số tiền được mã hoá thật,
 * nhưng **việc bạn vừa gửi một tx vào lúc đó** là công khai vĩnh viễn: địa chỉ,
 * thời điểm, hash, gas. Sản phẩm không "anonymous" và không được để người dùng
 * tự suy ra điều ngược lại từ một chữ "Encrypted" to đùng. Nói trước khi ký,
 * không nói sau.
 *
 * Số tiền hiện ở đây vì nó vẫn đang trong bộ nhớ tab này — nó chưa từng rời
 * khỏi máy dưới dạng plaintext, và sẽ biến mất khỏi state ngay khi tx confirm.
 */
export function ReviewDialog({
  kind,
  amount,
  account,
  onConfirm,
  onCancel,
  busy,
}: {
  kind: "deposit" | "withdraw";
  amount: bigint;
  account: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const isDeposit = kind === "deposit";

  return (
    <div
      data-testid="review-dialog"
      role="group"
      aria-label={isDeposit ? "Review your deposit" : "Review your withdrawal"}
      className="border-border-default bg-surface rounded-card border p-4"
    >
      <p className="text-[15px] font-semibold tracking-tight">
        {isDeposit ? "Review your deposit" : "Review your withdrawal"}
      </p>

      <dl className="mt-4 flex flex-col gap-4 sm:flex-row">
        <div className="border-privacy/30 bg-privacy-subtle rounded-card flex-1 border p-3">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-[13px] font-medium">Stays private</dt>
            <EncryptedBadge />
          </div>
          <dd className="mt-2 flex flex-col gap-1 text-[13px] leading-relaxed">
            <p>
              <span className="tabular font-semibold">{formatAmount(amount)} USDC</span> — encrypted before it leaves
              this tab. It is on chain as a ciphertext handle.
            </p>
            <p className="text-fg-muted">Your balance in the pool, your weight, and whether you ever win.</p>
          </dd>
        </div>

        <div className="border-warning/30 bg-warning/5 rounded-card flex-1 border p-3">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-[13px] font-medium">Becomes public</dt>
            <PublicBadge>Linkable</PublicBadge>
          </div>
          <dd className="text-fg-muted mt-2 flex flex-col gap-1 text-[13px] leading-relaxed">
            <p>
              That <span className="text-fg font-medium">{account ? shortAddress(account) : "your address"}</span>{" "}
              {isDeposit ? "made a deposit" : "made a withdrawal"} — the address, the timing, the transaction hash and
              the gas paid.
            </p>
            <p>Anyone watching Sepolia can see this transaction happened. They cannot see for how much.</p>
          </dd>
        </div>
      </dl>

      {isDeposit ? (
        <p className="text-fg-muted mt-4 max-w-[70ch] text-[13px] leading-relaxed">
          The pool credits the amount that <span className="text-fg font-medium">actually arrives</span>, not the amount
          you asked for. If it would break a limit, the confidential token hands back zero instead of failing — nothing
          leaves your wallet, and the transaction still succeeds. That is why the next screen reads your balance back
          from the pool rather than showing this number.
        </p>
      ) : (
        <p className="text-fg-muted mt-4 max-w-[70ch] text-[13px] leading-relaxed">
          Withdrawing lowers the weight you have built for this round. Your savings are yours at any time — that is a
          property of the contract, not a favour of this screen.
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button loading={busy} disabled={busy} onClick={onConfirm}>
          {isDeposit ? "Sign and deposit" : "Sign and withdraw"}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onCancel}>
          Back
        </Button>
        <p className="text-fg-muted text-[13px]">
          {busy ? "Confirm in your wallet." : "Nothing is sent until you sign."}
        </p>
      </div>
    </div>
  );
}
