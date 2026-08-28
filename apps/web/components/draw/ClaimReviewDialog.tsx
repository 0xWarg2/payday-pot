"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

import { DrawButton, DrawNotice } from "./DrawSurface";
import { shortAddress } from "@/lib/format";

/**
 * Cái người dùng đọc TRƯỚC khi ký claim.
 *
 * Hai việc, và việc thứ hai mới là lý do màn hình này tồn tại:
 *
 * 1. Nói ra chính xác cái gì sắp được gọi, ở địa chỉ nào. Ví hiện `0x1e83a1f9`
 *    và một con số gas; nó không nói được "cái này chuyển tiền thắng của bạn
 *    vào số dư mã hoá".
 *
 * 2. **Cảnh báo linkage, và nói thật.** Bản thân tx claim là không phân biệt
 *    được: contract cho winner và non-winner đi cùng một code path với gas bằng
 *    nhau (748,032 / 369,000 / 396,250 — đo ở Day 5), nên không ai đọc calldata
 *    hay gas mà suy ra được gì. Nhưng nếu chỉ người thắng mới buồn bấm nút, thì
 *    *hành động bấm* trở thành tín hiệu — và địa chỉ với thời điểm thì công
 *    khai. Nói "claim của bạn riêng tư" ở đây là nói dối bằng cách bỏ sót.
 *
 * Cách giảm linkage cũng phải nói ra, nếu không thì cảnh báo chỉ là lời doạ:
 * claim khi không có gì để claim là hợp lệ, tốn đúng bằng ấy gas, và màn hình
 * Savings để nó mở cho tất cả mọi người chính vì lý do đó.
 */
export function ClaimReviewDialog({
  open,
  potAddress,
  account,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  potAddress: string | null;
  account: string | null;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    // `showModal()` chứ không phải `open` attribute: chỉ modal thật mới có bẫy
    // focus, Escape và `inert` cho phần còn lại của trang — ba thứ mà một div
    // `role="dialog"` phải tự dựng lại và thường dựng sai.
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      data-testid="claim-review"
      aria-labelledby="claim-review-title"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onClose={onCancel}
      className="rounded-sheet border-draw-border bg-draw-surface text-draw-fg m-auto w-[min(560px,calc(100vw-2rem))] border p-0 backdrop:bg-black/70"
    >
      <div className="p-5 sm:p-6">
        <h2 id="claim-review-title" className="text-[17px] font-semibold tracking-tight">
          Review this claim
        </h2>

        <dl className="border-draw-border mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-y py-4 text-[13px]">
          <dt className="text-draw-fg-muted">Function</dt>
          <dd className="font-mono">claim()</dd>
          <dt className="text-draw-fg-muted">Contract</dt>
          <dd className="font-mono break-all">{potAddress ? shortAddress(potAddress) : "—"}</dd>
          <dt className="text-draw-fg-muted">From</dt>
          <dd className="font-mono break-all">{account ? shortAddress(account) : "—"}</dd>
          <dt className="text-draw-fg-muted">Moves</dt>
          <dd>Your settled winnings into your encrypted balance</dd>
        </dl>

        <p className="text-draw-fg-muted mt-4 max-w-[62ch] text-[13px] leading-relaxed">
          The amount stays encrypted the whole way. Nothing in this transaction carries a number that anyone else can
          read.
        </p>

        <div className="mt-4">
          <DrawNotice tone="warning" title="What this does reveal" data-testid="linkage-warning">
            Your address, the time you send it, and the transaction hash are public — they always are, on any chain. The
            transaction itself is indistinguishable: winners and non-winners call the same function and pay the same
            gas. But if only winners bother to send it, then sending it is itself a hint. Claiming when you have nothing
            to claim is valid and costs the same, which is why the{" "}
            <Link href="/app/savings" className="text-draw-fg underline underline-offset-4">
              Savings screen
            </Link>{" "}
            leaves it open to everyone.
          </DrawNotice>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <DrawButton variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </DrawButton>
          <DrawButton loading={busy} onClick={onConfirm} data-testid="claim-confirm">
            Claim
          </DrawButton>
        </div>
      </div>
    </dialog>
  );
}
