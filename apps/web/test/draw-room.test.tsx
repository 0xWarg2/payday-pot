/**
 * Day 8 — Draw Room, kiểm bằng máy.
 *
 * Ba tính chất được pin ở đây, và cả ba đều thuộc loại "hỏng mà màn hình vẫn
 * trông bình thường":
 *
 *  1. **Cursor onchain là sự thật.** View model không có bộ nhớ. Giết keeper
 *     giữa chừng rồi reload phải ra đúng con số cũ, và cách duy nhất để bảo đảm
 *     điều đó là không có state cục bộ nào để mất (exit gate Day 8).
 *  2. **Người thắng và người thua giống hệt nhau trước khi reveal** — giống đến
 *     mức `innerHTML` bằng nhau. Đây là dòng exit gate dễ trượt nhất: một
 *     skeleton dài hơn cũng đủ rò rỉ.
 *  3. **Không đọc được ≠ 0** (non-negotiable #8), kể cả ở cổng claim.
 */

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HIDDEN_HANDLE, MAX_BATCH_STEPS, type EpochView, type PotState } from "@payday-pot/sdk";

import { KeeperPanel } from "@/components/draw/KeeperPanel";
import { SealedResultCard } from "@/components/draw/SealedResultCard";
import { claimGate, drawTimeline, keeperState, sealedResult, type DrawStageId } from "@/lib/draw/room";
import type { ConfidentialView } from "@/lib/format";

const START = 1_800_000_000n;
const END = START + 604_800n; // 7 ngày

function epoch(over: Partial<EpochView> = {}): EpochView {
  return {
    epochId: 3n,
    start: START,
    end: END,
    phase: "Open",
    prizeAmount: 25_000_000n,
    snapshot: { cursor: 0, total: 0 },
    draw: { drawn: false, cursor: 0, total: 0 },
    ...over,
  };
}

function pot(over: Partial<PotState> = {}): PotState {
  return { ...epoch(), paused: false, participantCount: 0, ...over };
}

function statusOf(stages: ReturnType<typeof drawTimeline>, id: DrawStageId) {
  return stages.find((s) => s.id === id)!.status;
}

/* ------------------------------------------------------------------ */

describe("drawTimeline — vẽ lại cursor, không kể chuyện", () => {
  it("mở round: mốc open đang chạy, phần còn lại chưa tới", () => {
    const stages = drawTimeline(epoch(), END - 100n);
    expect(statusOf(stages, "open")).toBe("active");
    expect(["snapshot", "random", "select", "settled"].map((id) => statusOf(stages, id as DrawStageId))).toEqual([
      "upcoming",
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
  });

  it("hết giờ mà chưa ai gọi beginSnapshot: snapshot là việc ĐANG CHỜ, không phải việc tương lai", () => {
    // Đây chính là chỗ nút Trigger phải xuất hiện. Nếu mốc này vẽ "upcoming"
    // thì round hết giờ trông y hệt round còn 3 ngày, và không ai bấm gì cả.
    const stages = drawTimeline(epoch(), END);
    expect(statusOf(stages, "open")).toBe("done");
    expect(statusOf(stages, "snapshot")).toBe("active");
  });

  it("`now === null` không kết luận round đã đóng", () => {
    // Trước khi mount, client chưa có giờ. Đoán bừa chiều nào cũng sai: hoặc
    // báo đóng khi còn mở, hoặc ngược lại. Giữ nguyên trạng thái đang chạy.
    const stages = drawTimeline(epoch(), null);
    expect(statusOf(stages, "open")).toBe("active");
    expect(statusOf(stages, "snapshot")).toBe("upcoming");
  });

  it("progress là số onchain, không phải phần trăm ước lượng", () => {
    const stages = drawTimeline(
      epoch({ phase: "Drawing", snapshot: { cursor: 21, total: 21 }, draw: { drawn: true, cursor: 8, total: 21 } }),
      END + 60n,
    );
    expect(stages.find((s) => s.id === "select")!.progress).toEqual({ done: 8, total: 21 });
    expect(stages.find((s) => s.id === "snapshot")!.progress).toEqual({ done: 21, total: 21 });
    expect(statusOf(stages, "random")).toBe("done");
    expect(statusOf(stages, "select")).toBe("active");
  });

  it("seed chưa rút trong lúc Drawing: random đang chạy, select chưa tới", () => {
    const stages = drawTimeline(
      epoch({ phase: "Drawing", snapshot: { cursor: 4, total: 4 }, draw: { drawn: false, cursor: 0, total: 4 } }),
      END + 60n,
    );
    expect(statusOf(stages, "random")).toBe("active");
    expect(statusOf(stages, "select")).toBe("upcoming");
  });

  it("pool rỗng: nói không có ai, chứ không vẽ ba mốc xong xuôi cho việc chưa từng chạy", () => {
    // `beginSnapshot` settle thẳng trong cùng tx khi không có participant nào —
    // không đi qua Snapshotting/Drawing. Vẽ "21/21 đã quét" ở đây là bịa.
    const stages = drawTimeline(epoch({ phase: "Settled", draw: { drawn: false, cursor: 0, total: 0 } }), END + 60n);
    expect(stages.every((s) => s.status === "done")).toBe(true);
    expect(stages.find((s) => s.id === "select")!.progress).toBeNull();
    expect(stages.find((s) => s.id === "settled")!.detail).toMatch(/rolled over/i);
  });
});

/* ------------------------------------------------------------------ */

describe("keeperState — ai bấm cũng được, và cursor quyết định bấm cái gì", () => {
  it("round còn mở: đếm ngược, không có việc", () => {
    const state = keeperState(pot(), END - 100n);
    expect(state.kind).toBe("counting-down");
  });

  it("hết giờ: việc là đóng round", () => {
    const state = keeperState(pot(), END);
    expect(state).toMatchObject({ kind: "ready", step: { action: "begin-snapshot" } });
  });

  it("giết keeper giữa batch → tiếp đúng từ cursor onchain, kẹp theo trần HCU", () => {
    // Đây là exit gate viết thành assert: state duy nhất là cái đọc từ chain,
    // nên "keeper chết ở người thứ 8" và "vừa reload" là cùng một input.
    const midway = pot({
      phase: "Drawing",
      snapshot: { cursor: 32, total: 32 },
      draw: { drawn: true, cursor: 8, total: 32 },
    });
    const state = keeperState(midway, END + 60n);
    expect(state).toMatchObject({
      kind: "ready",
      step: { action: "select", steps: MAX_BATCH_STEPS }, // 24 người còn lại, kẹp về trần
      progress: { done: 8, total: 32 },
    });

    // Và gọi lại với đúng input đó cho ra đúng kết quả đó — view model không
    // nhớ gì giữa hai lần, nên F5 không thể làm số nhảy.
    expect(keeperState(midway, END + 9_999n)).toEqual(state);
  });

  it("batch cuối chỉ xin đúng số người còn lại", () => {
    const tail = pot({
      phase: "Drawing",
      snapshot: { cursor: 21, total: 21 },
      draw: { drawn: true, cursor: 18, total: 21 },
    });
    expect(keeperState(tail, END + 60n)).toMatchObject({ kind: "ready", step: { action: "select", steps: 3 } });
  });

  it("pause chỉ chặn ĐÚNG bước rút seed, và nói ra thay vì vẽ nút sẽ revert", () => {
    // `requestRandom` là hàm draw duy nhất có `whenNotPaused` (PayDayPot.sol:610).
    const state = keeperState(
      pot({ paused: true, phase: "Drawing", snapshot: { cursor: 2, total: 2 }, draw: { drawn: false, cursor: 0, total: 2 } }),
      END + 60n,
    );
    expect(state.kind).toBe("blocked-paused");
    expect(state.kind === "blocked-paused" && state.detail).toMatch(/withdraw/i);
  });

  it("pause KHÔNG chặn các bước còn lại", () => {
    // Pause để chặn tiền mới vào, không phải để giam một vòng đang chạy dở.
    const snapshotting = pot({
      paused: true,
      phase: "Snapshotting",
      snapshot: { cursor: 0, total: 5 },
      draw: { drawn: false, cursor: 0, total: 5 },
    });
    expect(keeperState(snapshotting, END + 60n)).toMatchObject({ kind: "ready", step: { action: "snapshot" } });

    const settled = pot({ paused: true, phase: "Settled" });
    expect(keeperState(settled, END + 60n)).toMatchObject({ kind: "ready", step: { action: "start-new-epoch" } });
  });

  it("chưa có giờ thì không bịa ra việc để bấm", () => {
    expect(keeperState(pot(), null).kind).toBe("counting-down");
  });
});

/* ------------------------------------------------------------------ */

const WINNER_HANDLE = `0x${"a7".repeat(32)}`;
const LOSER_HANDLE = `0x${"3f".repeat(32)}`;

describe("sealedResult — không nhánh nào biết ai thắng", () => {
  it("chưa có vị thế", () => {
    expect(sealedResult({ phase: "Settled", registered: false, pendingPrize: HIDDEN_HANDLE })).toEqual({
      kind: "no-position",
    });
  });

  it("vòng chưa quét xong", () => {
    expect(sealedResult({ phase: "Drawing", registered: true, pendingPrize: WINNER_HANDLE }).kind).toBe("pending");
  });

  it("vào sau khi snapshot đóng băng: không nằm trong vòng này, và đó KHÔNG phải là thua", () => {
    expect(sealedResult({ phase: "Settled", registered: true, pendingPrize: HIDDEN_HANDLE }).kind).toBe("not-in-round");
  });

  it("người thắng và người thua ra cùng một kind", () => {
    // Contract ghi `pendingPrize` cho MỌI participant được quét
    // (`_scanParticipant` cộng `FHE.select(hit, prize, 0)`), nên "có handle"
    // không phải tin tức. Hàm này chỉ được nhìn thấy đúng chừng đó.
    const winner = sealedResult({ phase: "Settled", registered: true, pendingPrize: WINNER_HANDLE });
    const loser = sealedResult({ phase: "Settled", registered: true, pendingPrize: LOSER_HANDLE });
    expect(winner.kind).toBe("sealed");
    expect(loser.kind).toBe(winner.kind);
  });
});

/* ------------------------------------------------------------------ */

const SEALED = sealedResult({ phase: "Settled", registered: true, pendingPrize: WINNER_HANDLE });

describe("claimGate", () => {
  it("khoá khi vòng chưa settle", () => {
    const gate = claimGate({ kind: "pending" }, { kind: "hidden" });
    expect(gate.kind).toBe("locked-draw");
  });

  it("khoá khi người dùng chưa tự mở khoá con số của mình", () => {
    // Không phải kiểm tra bảo mật — `claim()` trên contract cố ý không có phase
    // gate. Là để không ai ký một tx mà họ chưa biết nó làm gì.
    expect(claimGate(SEALED, { kind: "hidden" }).kind).toBe("locked-hidden");
  });

  it("đọc lỗi thì nói là không đọc được, KHÔNG nói là 0", () => {
    // Non-negotiable #8 ở tầng cổng claim: `unavailable` mà rơi vào nhánh
    // "nothing" là app đang khẳng định một con số nó chưa từng đọc được.
    const gate = claimGate(SEALED, { kind: "unavailable" });
    expect(gate.kind).toBe("locked-hidden");
    expect(gate.kind === "locked-hidden" && gate.reason).not.toMatch(/\b0\b|zero|nothing/i);
  });

  it("mở khi và chỉ khi đã reveal và số dương", () => {
    expect(claimGate(SEALED, { kind: "revealed", value: 25_000_000n }).kind).toBe("open");
    expect(claimGate(SEALED, { kind: "revealed", value: 0n }).kind).toBe("nothing");
  });
});

/* ------------------------------------------------------------------ */

describe("SealedResultCard — winner và loser không phân biệt được trước khi reveal", () => {
  function renderCard(pendingPrize: string, view: ConfidentialView) {
    const result = sealedResult({ phase: "Settled", registered: true, pendingPrize });
    const { container } = render(
      <SealedResultCard
        result={result}
        view={view}
        gate={claimGate(result, view)}
        flight={null}
        revealBusy={false}
        onReveal={() => {}}
        onHide={() => {}}
        onReviewClaim={() => {}}
        claimDisabledReason={null}
      />,
    );
    return container.innerHTML;
  }

  it("hai DOM bằng nhau từng ký tự", () => {
    // Không phải "trông giống": bằng nhau. Một `data-*` lệch, một skeleton dài
    // hơn, một badge thừa — tất cả đều đọc được từ DevTools.
    expect(renderCard(WINNER_HANDLE, { kind: "hidden" })).toBe(renderCard(LOSER_HANDLE, { kind: "hidden" }));
  });

  it("handle không bao giờ vào DOM", () => {
    // Handle mỗi ví mỗi khác. Nó không nói ai thắng, nhưng in ra là tự tạo một
    // dấu vân tay ổn định cho ví đó ngay trong trang.
    const html = renderCard(WINNER_HANDLE, { kind: "hidden" });
    expect(html).not.toContain(WINNER_HANDLE.slice(2));
  });

  it("chưa reveal thì không có chữ số nào trong ô giá trị", () => {
    const { getByTestId } = render(
      <SealedResultCard
        result={SEALED}
        view={{ kind: "hidden" }}
        gate={claimGate(SEALED, { kind: "hidden" })}
        flight={null}
        revealBusy={false}
        onReveal={() => {}}
        onHide={() => {}}
        onReviewClaim={() => {}}
        claimDisabledReason={null}
      />,
    );
    expect(getByTestId("confidential-value").textContent ?? "").not.toMatch(/\d/);
    expect(getByTestId("claim-open-review")).toBeDisabled();
  });

  it("số 0 đã decrypt được nói rõ là số thật, không phải màn hình hỏng", () => {
    const view: ConfidentialView = { kind: "revealed", value: 0n };
    const { getByTestId } = render(
      <SealedResultCard
        result={SEALED}
        view={view}
        gate={claimGate(SEALED, view)}
        flight={null}
        revealBusy={false}
        onReveal={() => {}}
        onHide={() => {}}
        onReviewClaim={() => {}}
        claimDisabledReason={null}
      />,
    );
    expect(getByTestId("revealed-zero").textContent).toMatch(/read from the chain/i);
    expect(getByTestId("claim-open-review")).toBeDisabled();
  });
});

/**
 * R5 — seed đã rút một lần thì thôi.
 *
 * Contract đã chặn từ Day 4 (`AlreadyDrawn`), nên đây không phải test của
 * contract mà là test của câu nói. Khi một `selectBatch` revert, phản xạ của
 * người đang bấm là "chạy lại từ đầu" — mà từ đầu nghĩa là rút seed mới, tức
 * chọn lại người thắng. Màn hình phải nói ra điều đó TRƯỚC khi có lỗi, không
 * phải sau; nếu chỉ hiện lúc lỗi thì nó đọc như một lời chống chế.
 */
describe("seed locked (R5)", () => {
  const drawing = pot({
    phase: "Drawing",
    snapshot: { cursor: 4, total: 4 },
    draw: { drawn: true, cursor: 1, total: 4 },
    participantCount: 4,
  });

  it("nói ra suốt giai đoạn Drawing, không đợi tới lúc một batch fail", () => {
    const { getByTestId } = render(<KeeperPanel state={drawing} now={END + 10n} />);
    const notice = getByTestId("seed-locked");

    expect(notice.textContent).toMatch(/cannot be drawn again/i);
    // "not by us, not by anyone" — quan trọng vì nghi ngờ mặc định của người
    // dùng là chủ pool quay lại tới khi ra kết quả mình thích.
    expect(notice.textContent).toMatch(/not by anyone/i);
    // Và nó phải chỉ ra đường đi tiếp, chứ không chỉ nói "không được".
    expect(notice.textContent).toMatch(/same cursor|send it again/i);
  });

  it("chưa rút seed thì không có gì để khoá", () => {
    const before = pot({ phase: "Snapshotting", snapshot: { cursor: 2, total: 4 }, participantCount: 4 });
    expect(render(<KeeperPanel state={before} now={END + 10n} />).queryByTestId("seed-locked")).toBeNull();
  });

  it("vòng đã settle thì câu đó hết việc — nó nói về vòng đang chạy", () => {
    const settled = pot({
      phase: "Settled",
      snapshot: { cursor: 4, total: 4 },
      draw: { drawn: true, cursor: 4, total: 4 },
      participantCount: 4,
    });
    expect(render(<KeeperPanel state={settled} now={END + 10n} />).queryByTestId("seed-locked")).toBeNull();
  });
});
