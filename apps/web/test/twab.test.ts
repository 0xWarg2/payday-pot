/**
 * Phép chia duy nhất trong cả hệ thống.
 *
 * Onchain không bao giờ chia — `FHE.div` với divisor mã hoá không tồn tại, và
 * draw dùng thẳng `twabArea` vì nó scale-invariant. Nghĩa là con số "average
 * balance" người dùng nhìn thấy KHÔNG có bản đối chiếu nào onchain: nếu nó sai,
 * không có gì mâu thuẫn với nó, không có test contract nào bắt được, và người
 * dùng chỉ thấy một trọng số trông là lạ.
 */

import { describe, expect, it } from "vitest";

import type { ConfidentialView } from "@/lib/format";
import { averageBalance, liveArea, twabAreaView, twabWindowSeconds, type TwabInputs } from "@/lib/pot/twab";

const START = 1_000_000n;
const END = START + 172_800n; // epoch 2 ngày
const M = 1_000_000n; // 6 decimals

function inputs(patch: Partial<TwabInputs> = {}): TwabInputs {
  return {
    area: 0n,
    principal: 0n,
    lastCheckpoint: START,
    epochStart: START,
    epochEnd: END,
    nowSeconds: START,
    ...patch,
  };
}

describe("liveArea", () => {
  it("extends the stored area up to now with the formula the contract will use next", () => {
    // Contract chỉ cộng dồn khi principal đổi, nên area đã lưu chỉ tính tới
    // `lastCheckpoint`. Hiện đúng con số đó ra sẽ đọc như "trọng số của tôi
    // ngừng tăng" với người gửi tiền tuần trước rồi không đụng gì nữa.
    const area = liveArea(inputs({ area: 0n, principal: 100n * M, nowSeconds: START + 3_600n }));

    expect(area).toBe(100n * M * 3_600n);
  });

  it("adds to what was already accrued rather than replacing it", () => {
    const area = liveArea(inputs({ area: 500n, principal: 2n, lastCheckpoint: START + 10n, nowSeconds: START + 20n }));

    expect(area).toBe(500n + 2n * 10n);
  });

  it("refuses to extrapolate without a principal", () => {
    // `principal === null` nghĩa là người dùng chưa mở nó. Đoán bừa một con số
    // ở đây là bịa ra dữ liệu riêng tư mà ta không có quyền đọc.
    expect(liveArea(inputs({ area: 777n, principal: null, nowSeconds: START + 10_000n }))).toBe(777n);
  });

  it("stops accruing at the end of the epoch", () => {
    // Sau `end` thì contract không cộng thêm nữa. Nếu client vẫn cộng, trọng số
    // hiển thị sẽ trôi mãi và không bao giờ khớp với cái draw thật sự dùng.
    const past = liveArea(inputs({ principal: 5n, nowSeconds: END + 100_000n }));

    expect(past).toBe(5n * (END - START));
  });

  it("never runs the multiplication backwards", () => {
    // `lastCheckpoint` sau `now` là trạng thái không nên xảy ra, nhưng lệch giờ
    // giữa node và trình duyệt thì xảy ra thật — và một số âm chạy vào phép
    // nhân sẽ cho ra area nhỏ hơn cái đã tích được.
    expect(liveArea(inputs({ area: 42n, principal: 5n, lastCheckpoint: START + 500n, nowSeconds: START + 100n }))).toBe(
      42n,
    );
  });

  it("clamps a checkpoint left over from an earlier epoch to the epoch start", () => {
    const area = liveArea(inputs({ area: 0n, principal: 3n, lastCheckpoint: START - 5_000n, nowSeconds: START + 10n }));

    expect(area).toBe(3n * 10n);
  });
});

describe("twabWindowSeconds", () => {
  it("measures the whole elapsed epoch, not how long the user was present", () => {
    // Lựa chọn có chủ đích: người vào giữa chừng THẬT SỰ có trọng số thấp hơn
    // người ở từ đầu — đó là cơ chế của giải, không phải thiệt thòi cần che.
    // Chia cho khoảng thời gian họ có mặt sẽ cho ra con số đẹp hơn nhưng không
    // còn so sánh được với ai, và làm "gửi sớm ăn nhiều hơn" trở nên vô hình.
    const lateJoiner = inputs({ lastCheckpoint: START + 86_400n, nowSeconds: START + 100_000n });

    expect(twabWindowSeconds(lateJoiner)).toBe(100_000n);
  });

  it("stops at the epoch end", () => {
    expect(twabWindowSeconds(inputs({ nowSeconds: END + 50_000n }))).toBe(END - START);
  });

  it("is zero, not negative, before the first second has passed", () => {
    expect(twabWindowSeconds(inputs({ nowSeconds: START }))).toBe(0n);
    expect(twabWindowSeconds(inputs({ nowSeconds: START - 10n }))).toBe(0n);
  });
});

describe("twabAreaView", () => {
  const UNAVAILABLE: ConfidentialView = { kind: "unavailable" };
  const HIDDEN: ConfidentialView = { kind: "hidden" };
  const revealed = (value: bigint): ConfidentialView => ({ kind: "revealed", value });

  it("reads a never-registered account as unavailable", () => {
    // Chưa từng gửi ⇒ `lastCheckpoint == 0` ⇒ thật sự không có gì. Đây là màn
    // hình persona "fresh incognito" phải thấy.
    expect(twabAreaView(UNAVAILABLE, UNAVAILABLE, 0n)).toEqual({ kind: "unavailable" });
  });

  it("treats an uninitialized area as a real zero once the position is open", () => {
    // Đường đi của MỌI người gửi lần đầu: `_checkpoint` bỏ qua phép nhân khi
    // `lastCheckpoint == 0`, nên area còn là zero-handle suốt epoch đầu.
    expect(twabAreaView(UNAVAILABLE, revealed(1_000n), 12_345n)).toEqual({ kind: "revealed", value: 0n });
  });

  it("says hidden — never zero — while the principal is still locked", () => {
    // Chỗ #8 sống hay chết. Người này CÓ tiền trong pot; hiện "0 USDC" cho họ
    // chỉ vì họ chưa ký là đúng cái non-negotiable #8 cấm.
    expect(twabAreaView(UNAVAILABLE, HIDDEN, 12_345n)).toEqual({ kind: "hidden" });
  });

  it("never overrides an area the user already opened", () => {
    expect(twabAreaView(revealed(999n), HIDDEN, 0n)).toEqual({ kind: "revealed", value: 999n });
  });

  it("leaves a plain hidden area hidden", () => {
    expect(twabAreaView(HIDDEN, revealed(1n), 12_345n)).toEqual({ kind: "hidden" });
  });

  it("keeps the three states distinguishable in every combination", () => {
    // Bất biến bao trùm: không tổ hợp nào rơi ra ngoài union, và không tổ hợp
    // nào biến `unavailable` thành `revealed` mà thiếu bằng chứng đăng ký.
    for (const area of [UNAVAILABLE, HIDDEN, revealed(5n)]) {
      for (const principal of [UNAVAILABLE, HIDDEN, revealed(5n)]) {
        for (const checkpoint of [0n, 12_345n]) {
          const view = twabAreaView(area, principal, checkpoint);
          expect(["unavailable", "hidden", "revealed"]).toContain(view.kind);
          if (view.kind === "revealed" && area.kind !== "revealed") {
            expect(checkpoint).toBeGreaterThan(0n);
            expect(principal.kind).toBe("revealed");
          }
        }
      }
    }
  });
});

describe("averageBalance", () => {
  it("returns null rather than zero when no time has passed", () => {
    // Đây là non-negotiable #8 ở dạng số học: chia cho 0 giây không ra "0 USDC",
    // nó không ra gì cả. Trả 0n ở đây là hiện số dư sai cho một người vừa gửi.
    expect(averageBalance(inputs({ area: 0n, principal: 100n * M, nowSeconds: START }))).toBeNull();
  });

  it("gives back the steady balance of someone who deposited at the start", () => {
    const avg = averageBalance(inputs({ area: 0n, principal: 100n * M, nowSeconds: START + 86_400n }));

    expect(avg).toBe(100n * M);
  });

  it("halves the average of someone who joined halfway through", () => {
    const half = (END - START) / 2n;
    const avg = averageBalance(
      inputs({ area: 0n, principal: 100n * M, lastCheckpoint: START + half, nowSeconds: END }),
    );

    expect(avg).toBe(50n * M);
  });

  it("truncates instead of rounding, the same way integer division does everywhere else", () => {
    const avg = averageBalance(inputs({ area: 10n, principal: null, nowSeconds: START + 3n }));

    expect(avg).toBe(3n);
  });
});
