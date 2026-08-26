/**
 * Hàm thuần của `@payday-pot/sdk` — nhập qua TÊN GÓI, không qua đường dẫn source.
 *
 * Web ăn `dist/` và không có `transpilePackages`, nên nhập theo tên gói là cách
 * duy nhất test đúng cái consumer thật sự nhận được. Đổi lại: phải `pnpm -r build`
 * trước khi chạy, y như luồng workspace đã ghi trong CLAUDE.md.
 *
 * `pendingWork` là thứ đáng test nhất ở đây. Nó là nguồn duy nhất cho Draw Room,
 * và #7 nói draw phải permissionless — nếu nó trả `none` sai một nhịp thì cái nút
 * Continue biến mất và vòng quay đứng lại vĩnh viễn, chờ một keeper không tồn tại.
 */

import {
  EPOCH_PHASES,
  HIDDEN_HANDLE,
  MAX_BATCH_STEPS,
  isUninitialized,
  pendingWork,
  phaseFromUint8,
  type PotState,
} from "@payday-pot/sdk";
import { describe, expect, it } from "vitest";

const END = 1_787_917_344n;

function state(patch: Partial<PotState> = {}): PotState {
  return {
    epochId: 1n,
    start: 1_787_744_544n,
    end: END,
    phase: "Open",
    paused: false,
    participantCount: 0,
    prizeAmount: 0n,
    snapshot: { cursor: 0, total: 0 },
    draw: { drawn: false, cursor: 0, total: 0 },
    ...patch,
  };
}

describe("phaseFromUint8", () => {
  it.each(EPOCH_PHASES.map((name, i) => [i, name] as const))("maps %i to %s", (i, name) => {
    expect(phaseFromUint8(i)).toBe(name);
    expect(phaseFromUint8(BigInt(i))).toBe(name);
  });

  it("throws instead of guessing when the enum grows", () => {
    // Im lặng trả về "Open" cho một phase lạ sẽ làm UI hiện "deposits are open"
    // trong lúc contract đang quay số. Thà nổ ở ranh giới đọc.
    expect(() => phaseFromUint8(4)).toThrow(RangeError);
    expect(() => phaseFromUint8(-1)).toThrow(RangeError);
  });
});

describe("isUninitialized", () => {
  it("recognises a handle that was never written", () => {
    expect(isUninitialized(HIDDEN_HANDLE)).toBe(true);
  });

  it("does not treat a real handle as empty", () => {
    expect(isUninitialized(`0x${"0".repeat(63)}1`)).toBe(false);
  });

  it("compares exactly, so callers must normalise casing themselves", () => {
    // Handle zero không có chữ cái nào nên hoa/thường không đổi kết quả ở đây,
    // nhưng `0X` thì có. Pin lại hành vi thật thay vì giả định nó khoan dung:
    // mọi handle trong app đi thẳng từ ethers ra, luôn lowercase `0x`.
    expect(isUninitialized(HIDDEN_HANDLE.replace("0x", "0X"))).toBe(false);
  });
});

describe("pendingWork", () => {
  it("has nothing to do while the round is still open", () => {
    expect(pendingWork(state(), END - 1n)).toEqual({ kind: "none" });
  });

  it("asks to close the round the instant the clock runs out", () => {
    // Đúng mốc `end` đã là hết giờ, không phải một giây sau. Lệch một nhịp ở
    // đây nghĩa là có một giây mà UI nói "vẫn mở" còn contract đã từ chối nhận.
    expect(pendingWork(state(), END)).toEqual({ kind: "begin-snapshot" });
    expect(pendingWork(state(), END + 1n)).toEqual({ kind: "begin-snapshot" });
  });

  it("reports snapshot progress in batches the pool can actually afford", () => {
    const work = pendingWork(state({ phase: "Snapshotting", snapshot: { cursor: 4, total: 32 } }), END);

    expect(work).toEqual({ kind: "snapshot", done: 4, total: 32, steps: MAX_BATCH_STEPS });
  });

  it("shrinks the last snapshot batch to what is left", () => {
    const work = pendingWork(state({ phase: "Snapshotting", snapshot: { cursor: 30, total: 32 } }), END);

    // Gửi thừa step trên pool đầy là revert (HCU 20M global / 5M sequential).
    expect(work).toEqual({ kind: "snapshot", done: 30, total: 32, steps: 2 });
  });

  it("moves on to randomness once every participant is snapshotted", () => {
    expect(pendingWork(state({ phase: "Snapshotting", snapshot: { cursor: 32, total: 32 } }), END)).toEqual({
      kind: "request-random",
    });
  });

  it("treats an empty pool as already snapshotted", () => {
    expect(pendingWork(state({ phase: "Snapshotting", snapshot: { cursor: 0, total: 0 } }), END)).toEqual({
      kind: "request-random",
    });
  });

  it("still asks for randomness while drawing has not produced any", () => {
    expect(pendingWork(state({ phase: "Drawing", draw: { drawn: false, cursor: 0, total: 32 } }), END)).toEqual({
      kind: "request-random",
    });
  });

  it("scans for the winner in batches once randomness exists", () => {
    const work = pendingWork(state({ phase: "Drawing", draw: { drawn: true, cursor: 0, total: 32 } }), END);

    expect(work).toEqual({ kind: "select", done: 0, total: 32, steps: MAX_BATCH_STEPS });
  });

  it("has nothing left to do when the scan finished", () => {
    expect(pendingWork(state({ phase: "Drawing", draw: { drawn: true, cursor: 32, total: 32 } }), END)).toEqual({
      kind: "none",
    });
  });

  it("offers to open the next round once settled", () => {
    expect(pendingWork(state({ phase: "Settled" }), END)).toEqual({ kind: "start-new-epoch" });
  });

  it("never leaves the pool without a next move outside the two idle states", () => {
    // Bất biến thật sự của #7: mọi trạng thái đều có một việc ai cũng bấm được,
    // trừ đúng hai chỗ nghỉ hợp lệ (đang mở, và đã chọn xong người thắng).
    const busy: PotState[] = [
      state({ phase: "Open" }),
      state({ phase: "Snapshotting", snapshot: { cursor: 1, total: 32 } }),
      state({ phase: "Drawing", draw: { drawn: false, cursor: 0, total: 32 } }),
      state({ phase: "Settled" }),
    ];
    for (const s of busy) {
      expect(pendingWork(s, END).kind, `${s.phase} had no next move`).not.toBe("none");
    }
  });

  it("does not let pause hide the work queue", () => {
    // Pause chặn vòng mới, không chặn việc đang dở — và chắc chắn không chặn
    // withdraw/claim (non-negotiable #1). Nếu pause làm `pendingWork` im lặng
    // thì một vòng đang quay dở sẽ mắc kẹt cho tới khi ai đó unpause.
    expect(pendingWork(state({ phase: "Settled", paused: true }), END)).toEqual({ kind: "start-new-epoch" });
  });
});
