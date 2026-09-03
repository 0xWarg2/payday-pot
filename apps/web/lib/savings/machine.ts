"use client";

import type { PotError } from "@payday-pot/sdk";
import type { EncryptedAmount } from "@payday-pot/sdk";

/**
 * Máy trạng thái của một lần chuyển tiền — dùng cho cả deposit và withdraw.
 *
 * Vì sao là một reducer thuần chứ không phải mấy cái `useState` rải trong
 * component: bốn ràng buộc dưới đây là ràng buộc về SẢN PHẨM, không phải về
 * trình bày, nên chúng phải test được mà không cần dựng DOM.
 *
 * 1. **Huỷ được cho tới khi ví mở ra, và không sau đó.** Trước `submitting`,
 *    chưa có tx nào — chưa mất gì, và UI phải nói ra đúng câu đó. Từ
 *    `confirming` trở đi thì tx đã nằm trên chain và một nút "Cancel" ở đó là
 *    lời hứa không giữ được.
 *
 * 2. **Draft amount CHẾT khi tx confirm.** `CONFIRMED` xoá `draft` và
 *    `encrypted` khỏi state. Đây là non-negotiable #2 được cài vào cấu trúc:
 *    ERC-7984 clamp về encrypted zero thay vì revert, nên số vừa nhập KHÔNG
 *    phải bằng chứng về số dư mới — và cách chắc chắn nhất để không echo nó ra
 *    là không còn giữ nó nữa. Muốn biết số dư mới thì đọc lại handle rồi reveal
 *    tươi, đó là việc của `syncing`.
 *
 * 3. **Draft không bao giờ rời khỏi bộ nhớ.** Không có nhánh nào trong file này
 *    ghi ra storage; `pdp.tx.v1` chỉ nhận `{chainId, action, txHash, epochId?,
 *    createdAt}` và việc ghi nằm ở `lib/tx/store.ts`. Test pin cả hai.
 *
 * 4. **Không double-submit.** `SUBMIT` chỉ có tác dụng từ `review`. Bấm hai lần
 *    trong lúc `submitting` là no-op, không phải hai tx.
 */

export type TransferStage =
  /** Đang gõ số. */
  | "form"
  /** Đang đọc các sự thật công khai (pre-flight) trước khi tiêu 10 giây encrypt. */
  | "checking"
  /** Pre-flight nói không. Không có gì được gửi. */
  | "blocked"
  /** Relayer đang mã hoá — bước chậm nhất, ~10 giây. */
  | "encrypting"
  /** Đã có handle. Người dùng xác nhận cái gì riêng tư, cái gì công khai. */
  | "review"
  /** Ví đang mở, chờ ký. */
  | "submitting"
  /** Đã có hash, đang chờ vào block. */
  | "confirming"
  /** Đã vào block. Đang đọc lại handle từ chain — KHÔNG echo số đã nhập. */
  | "syncing"
  /** Xong. Không còn giữ số nào. */
  | "done";

export interface TransferState {
  stage: TransferStage;
  /** Số người dùng đã nhập, base unit. CHỈ trong bộ nhớ, và biến mất ở `CONFIRMED`. */
  draft: bigint | null;
  encrypted: EncryptedAmount | null;
  txHash: string | null;
  error: PotError | null;
  /** Vì sao đang không ở `form` — dùng cho câu "chưa mất gì" ở nút Cancel. */
  cancellable: boolean;
}

export type TransferEvent =
  | { type: "EDIT" }
  | { type: "CHECK"; draft: bigint }
  | { type: "BLOCK"; error: PotError }
  | { type: "ENCRYPT" }
  | { type: "ENCRYPTED"; encrypted: EncryptedAmount }
  | { type: "SUBMIT" }
  | { type: "HASH"; txHash: string }
  | { type: "CONFIRMED" }
  | { type: "SYNCED" }
  | { type: "FAIL"; error: PotError }
  | { type: "CANCEL" }
  | { type: "RESET" };

export const INITIAL_TRANSFER_STATE: TransferState = Object.freeze({
  stage: "form",
  draft: null,
  encrypted: null,
  txHash: null,
  error: null,
  cancellable: false,
});

/** Các stage mà "Cancel" còn là một lời hứa giữ được. */
const CANCELLABLE: readonly TransferStage[] = ["checking", "encrypting", "review"];

export function isCancellable(stage: TransferStage): boolean {
  return CANCELLABLE.includes(stage);
}

export function transferReducer(state: TransferState, event: TransferEvent): TransferState {
  switch (event.type) {
    case "EDIT":
      // Gõ lại thì proof cũ vô giá trị — nó bind vào một số khác. Giữ lại là
      // cách để gửi đi số mà người dùng vừa sửa khỏi.
      return state.stage === "form" || state.stage === "blocked"
        ? { ...INITIAL_TRANSFER_STATE, stage: "form" }
        : state;

    case "CHECK":
      if (state.stage !== "form" && state.stage !== "blocked") return state;
      return { ...INITIAL_TRANSFER_STATE, stage: "checking", draft: event.draft, cancellable: true };

    case "BLOCK":
      if (state.stage !== "checking") return state;
      // Giữ `draft`: người dùng sẽ sửa số chứ không gõ lại từ đầu (R13/R2).
      return { ...state, stage: "blocked", error: event.error, encrypted: null, cancellable: false };

    case "ENCRYPT":
      if (state.stage !== "checking") return state;
      return { ...state, stage: "encrypting", error: null, cancellable: true };

    case "ENCRYPTED":
      if (state.stage !== "encrypting") return state;
      return { ...state, stage: "review", encrypted: event.encrypted, cancellable: true };

    case "SUBMIT":
      // Chỉ từ `review`. Đây là chỗ chặn double-submit.
      if (state.stage !== "review") return state;
      return { ...state, stage: "submitting", error: null, cancellable: false };

    case "HASH":
      if (state.stage !== "submitting") return state;
      return { ...state, stage: "confirming", txHash: event.txHash, cancellable: false };

    case "CONFIRMED":
      if (state.stage !== "confirming" && state.stage !== "submitting") return state;
      // Số đã nhập chết ở đây. Xem đầu file, luật 2.
      return { ...state, stage: "syncing", draft: null, encrypted: null, cancellable: false };

    case "SYNCED":
      if (state.stage !== "syncing") return state;
      return { ...state, stage: "done", draft: null, encrypted: null, cancellable: false };

    case "FAIL":
      // Từ bất kỳ đâu. `txHash` được giữ nguyên nếu đã có: một tx đã gửi mà
      // hỏng ở bước chờ thì vẫn phải tra được trên explorer (R11).
      return { ...state, stage: "blocked", error: event.error, encrypted: null, cancellable: false };

    case "CANCEL":
      if (!isCancellable(state.stage)) return state;
      return { ...INITIAL_TRANSFER_STATE, stage: "form" };

    case "RESET":
      return { ...INITIAL_TRANSFER_STATE };
  }
}

/**
 * Câu nói cho từng stage. Ở đây chứ không rải trong JSX vì đây là nội dung
 * phải khớp với ERROR_RECOVERY_MATRIX, không phải nhãn trang trí.
 *
 * Chú ý hai câu về "chưa mất gì": chúng chỉ xuất hiện ở các stage trước
 * `submitting`, và đó là khẳng định đúng theo cấu trúc — trước đó chưa có lời
 * gọi nào tới ví.
 */
export const STAGE_COPY: Record<TransferStage, { label: string; detail: string }> = {
  form: { label: "Enter an amount", detail: "Nothing is sent until you review and sign." },
  checking: {
    label: "Checking the pool",
    detail: "Reading the public state of the round before anything is encrypted.",
  },
  blocked: { label: "Stopped before signing", detail: "Nothing was sent and nothing left your wallet." },
  encrypting: {
    label: "Encrypting your amount",
    detail:
      "This runs in your browser and takes about ten seconds. No transaction exists yet — cancelling now costs nothing.",
  },
  review: {
    label: "Ready to send",
    detail: "Check what stays private and what becomes public, then sign in your wallet.",
  },
  submitting: { label: "Waiting for your signature", detail: "Confirm in your wallet to send the transaction." },
  confirming: { label: "Confirming on Sepolia", detail: "The transaction is on chain and waiting for a block." },
  syncing: {
    label: "Reading your new position",
    detail: "Your balance is read back from the pool encrypted — this screen never echoes the number you typed.",
  },
  done: {
    label: "Done",
    detail: "Your position is encrypted again. Reveal it on the dashboard to see the new value.",
  },
};
