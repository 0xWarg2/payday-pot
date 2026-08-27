/**
 * Day 7 — luồng tiền, kiểm bằng máy.
 *
 * Bốn nhóm dưới đây không kiểm "component render được". Chúng pin những tính
 * chất mà nếu hỏng thì màn hình vẫn trông bình thường:
 *
 *  1. Máy trạng thái: số đã nhập chết khi tx confirm, không double-submit, huỷ
 *     chỉ hứa khi giữ được.
 *  2. Pre-flight: thứ tự phán đoán, và "cần approve" KHÔNG phải một lỗi.
 *  3. Persistence: một draft không có đường nào tới localStorage.
 *  4. Copy: employer đọc được đúng bốn câu phủ định; claim phân biệt 3 case mà
 *     không nói ai thắng.
 */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { preflightDeposit, preflightFundPrize, type DepositFacts, type FundFacts } from "@payday-pot/sdk";

import { NegativePermissionNotice } from "@/components/employer/NegativePermissionNotice";
import { ReviewDialog } from "@/components/savings/ReviewDialog";
import {
  INITIAL_TRANSFER_STATE,
  STAGE_COPY,
  isCancellable,
  transferReducer,
  type TransferEvent,
  type TransferStage,
  type TransferState,
} from "@/lib/savings/machine";
import { ALLOWED_STORAGE_KEYS } from "@/lib/storage";
import { TX_SERVER_SNAPSHOT, recordTx, txStore } from "@/lib/tx/store";

const ENCRYPTED = { handle: `0x${"11".repeat(32)}`, inputProof: "0xbeef", boundTo: `0x${"22".repeat(20)}` };
const A_HASH = `0x${"ab".repeat(32)}`;

function drive(events: readonly TransferEvent[]): TransferState {
  return events.reduce(transferReducer, INITIAL_TRANSFER_STATE);
}

const TO_REVIEW: readonly TransferEvent[] = [
  { type: "CHECK", draft: 100_000_000n },
  { type: "ENCRYPT" },
  { type: "ENCRYPTED", encrypted: ENCRYPTED },
];

describe("transfer machine", () => {
  it("walks form → review → confirmed → done", () => {
    const state = drive([...TO_REVIEW, { type: "SUBMIT" }, { type: "HASH", txHash: A_HASH }, { type: "CONFIRMED" }, { type: "SYNCED" }]);
    expect(state.stage).toBe("done");
  });

  it("drops the typed amount the moment the transaction confirms (non-negotiable #2)", () => {
    const submitted = drive([...TO_REVIEW, { type: "SUBMIT" }, { type: "HASH", txHash: A_HASH }]);
    expect(submitted.draft).toBe(100_000_000n);

    // Sau CONFIRMED thì không còn gì để echo — kể cả nếu UI muốn. Đây là vế trình
    // bày của "accounting dùng số thực sự chuyển", vì clamp có thể đã chuyển 0.
    const confirmed = transferReducer(submitted, { type: "CONFIRMED" });
    expect(confirmed.draft).toBeNull();
    expect(confirmed.encrypted).toBeNull();
    expect(transferReducer(confirmed, { type: "SYNCED" }).draft).toBeNull();
  });

  it("ignores a second SUBMIT — one review, one transaction", () => {
    const first = drive([...TO_REVIEW, { type: "SUBMIT" }]);
    expect(transferReducer(first, { type: "SUBMIT" })).toBe(first);
  });

  it("only submits from review — no shortcut past the private/public split", () => {
    const checking = drive([{ type: "CHECK", draft: 1n }]);
    expect(transferReducer(checking, { type: "SUBMIT" }).stage).toBe("checking");
  });

  it("invalidates a proof when the amount is edited", () => {
    const edited = transferReducer(drive(TO_REVIEW), { type: "EDIT" });
    // `review` không nhận EDIT — nhưng từ `blocked` thì có, và proof phải mất.
    const fromBlocked = transferReducer(
      transferReducer(drive([{ type: "CHECK", draft: 1n }]), {
        type: "BLOCK",
        error: { code: "invalid-amount", row: null, title: "t", detail: "d", action: { kind: "edit-amount" }, retryable: false },
      }),
      { type: "EDIT" },
    );
    expect(edited.encrypted).not.toBeNull();
    expect(fromBlocked.encrypted).toBeNull();
    expect(fromBlocked.stage).toBe("form");
  });

  it("cancels only while cancelling is still honest", () => {
    const cancellable: TransferStage[] = ["checking", "encrypting", "review"];
    const sealed: TransferStage[] = ["submitting", "confirming", "syncing", "done"];
    expect(cancellable.every(isCancellable)).toBe(true);
    expect(sealed.some(isCancellable)).toBe(false);

    const confirming = drive([...TO_REVIEW, { type: "SUBMIT" }, { type: "HASH", txHash: A_HASH }]);
    expect(transferReducer(confirming, { type: "CANCEL" })).toBe(confirming);
  });

  it("keeps the hash when a sent transaction fails, so it stays traceable (R11)", () => {
    const failed = transferReducer(drive([...TO_REVIEW, { type: "SUBMIT" }, { type: "HASH", txHash: A_HASH }]), {
      type: "FAIL",
      error: { code: "unknown", row: null, title: "t", detail: "d", action: { kind: "retry" }, retryable: true },
    });
    expect(failed.txHash).toBe(A_HASH);
  });

  it("never puts a number in the stage copy", () => {
    // Nhãn trạng thái bị đọc to bởi screen reader và bị chụp màn hình. Một chữ
    // số ở đây chỉ có thể là số tiền của ai đó.
    for (const copy of Object.values(STAGE_COPY)) {
      expect(`${copy.label} ${copy.detail}`).not.toMatch(/\d/);
    }
  });
});

describe("deposit pre-flight", () => {
  const base: DepositFacts = {
    amount: 100_000_000n,
    perUserCap: 1_000_000_000n,
    shieldedHandle: `0x${"33".repeat(32)}`,
    blocked: false,
    paused: false,
    phase: "Open",
    epochEnd: 2_000n,
    now: 1_000n,
    participantCount: 3,
    participantCap: 32,
    registered: false,
  };

  it("lets a healthy deposit through", () => {
    expect(preflightDeposit(base)).toBeNull();
  });

  it("reports a blocked address before anything is signed (R3)", () => {
    expect(preflightDeposit({ ...base, blocked: true })?.row).toBe("R3");
  });

  it("reports pause and a closed round as withdraw-still-works cases (R10)", () => {
    expect(preflightDeposit({ ...base, paused: true })?.row).toBe("R10");
    expect(preflightDeposit({ ...base, now: 3_000n })?.row).toBe("R10");
    expect(preflightDeposit({ ...base, phase: "Snapshotting" })?.row).toBe("R10");
  });

  it("stops a deposit over the per-wallet cap instead of letting it clamp to zero (R2)", () => {
    const over = preflightDeposit({ ...base, amount: 2_000_000_000n });
    expect(over?.row).toBe("R2");
    // Thông điệp không được chứa số tiền — nó bị chụp màn hình và bị log.
    expect(`${over?.title} ${over?.detail}`).not.toMatch(/\d/);
  });

  it("points at the in-app faucet when there is nothing shielded (R14)", () => {
    const empty = preflightDeposit({ ...base, shieldedHandle: `0x${"00".repeat(32)}` });
    expect(empty?.row).toBe("R14");
    expect(empty?.action.kind).toBe("get-test-assets");
  });

  it("checks the blocked address first — a blocked wallet is told the truth even when the round is closed", () => {
    expect(preflightDeposit({ ...base, blocked: true, paused: true, now: 9_000n })?.row).toBe("R3");
  });

  it("refuses a full pool without pretending it is the user's fault", () => {
    expect(preflightDeposit({ ...base, participantCount: 32 })?.code).toBe("pool-full");
    // Đã tham gia rồi thì pool đầy không liên quan.
    expect(preflightDeposit({ ...base, participantCount: 32, registered: true })).toBeNull();
  });
});

describe("fund-prize pre-flight", () => {
  const base: FundFacts = {
    amount: 500_000_000n,
    paused: false,
    phase: "Open",
    isEmployer: true,
    underlyingBalance: 1_000_000_000n,
    allowanceToPot: 1_000_000_000n,
    rate: 1n,
  };

  it("lets a funded, approved sponsor through", () => {
    expect(preflightFundPrize(base)).toBeNull();
  });

  it("treats a missing allowance as step 1 of 2, not as an error (R13)", () => {
    const verdict = preflightFundPrize({ ...base, allowanceToPot: 0n });
    expect(verdict).toEqual({ needsApproval: true });
  });

  it("says a prize can only be added while the round is open (R12)", () => {
    const verdict = preflightFundPrize({ ...base, phase: "Snapshotting" });
    expect(verdict && "row" in verdict ? verdict.row : null).toBe("R12");
  });

  it("checks solvency before allowance — approving money you do not have is a wasted signature", () => {
    const verdict = preflightFundPrize({ ...base, underlyingBalance: 0n, allowanceToPot: 0n });
    expect(verdict && "row" in verdict ? verdict.row : null).toBe("R12");
  });

  it("refuses a wallet that is not the sponsor", () => {
    const verdict = preflightFundPrize({ ...base, isEmployer: false });
    expect(verdict && "code" in verdict ? verdict.code : null).toBe("not-employer");
  });
});

describe("a draft amount never reaches persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    txStore.set(TX_SERVER_SNAPSHOT);
  });

  it("writes only the five public fields for a deposit", () => {
    recordTx({ chainId: 11155111, action: "deposit", txHash: A_HASH, epochId: "1", createdAt: 1_700_000_000_000 });
    const raw = localStorage.getItem("pdp.tx.v1") ?? "";
    expect(JSON.parse(raw)).toEqual([
      { chainId: 11155111, action: "deposit", txHash: A_HASH, epochId: "1", createdAt: 1_700_000_000_000 },
    ]);
    // Số tiền duy nhất trong test này là 100000000; nó không được xuất hiện ở đâu.
    expect(raw).not.toContain("100000000");
  });

  it("uses only the three approved storage keys", () => {
    recordTx({ chainId: 11155111, action: "fund-prize", txHash: A_HASH, createdAt: 1 });
    for (const key of Object.keys(localStorage)) {
      expect(ALLOWED_STORAGE_KEYS).toContain(key);
    }
  });
});

describe("review dialog", () => {
  it("separates what stays private from what becomes public and linkable", () => {
    render(
      <ReviewDialog
        kind="deposit"
        amount={100_000_000n}
        account={`0x${"cd".repeat(20)}`}
        busy={false}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    const node = screen.getByTestId("review-dialog");
    expect(node.textContent).toContain("Stays private");
    expect(node.textContent).toContain("Becomes public");
    // Không hứa ẩn danh: address và timing công khai, và phải nói ra.
    expect(node.textContent).toMatch(/timing/i);
    expect(node.textContent ?? "").not.toMatch(/anonymous/i);
  });
});

describe("employer negative permissions", () => {
  it("states all four things sponsoring does not grant", () => {
    render(<NegativePermissionNotice />);
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/cannot read any employee.s balance/i);
    expect(text).toMatch(/cannot read anyone.s odds/i);
    expect(text).toMatch(/cannot see who won/i);
    expect(text).toMatch(/cannot pick the winner/i);
  });
});
