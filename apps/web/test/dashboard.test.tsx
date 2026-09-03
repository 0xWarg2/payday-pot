/**
 * Dashboard → Draw Room: một câu mời và một cánh cửa phải khớp nhau.
 *
 * Card "vòng này" nói ra một câu rất mạnh — *anyone can run it* — nên nó nợ
 * người đọc đúng hai thứ, và cả hai đều hỏng theo kiểu không ai thấy:
 *
 *  1. **Một đường đi tới chỗ chạy.** Câu mời không có link là lời mời dẫn vào
 *     tường; ma trận lỗi cấm đúng hình dạng đó ở chiều ngược lại (nút dẫn tới
 *     ngõ cụt), và chiều này cũng chẳng khá hơn.
 *  2. **Không mời khi không có việc.** Round còn đang đếm ngược, hoặc bước duy
 *     nhất đang bị pause chặn, mà card vẫn giục bấm thì người dùng đi qua phòng
 *     và gặp một cái nút không bấm được — hoặc tệ hơn, gửi một tx sẽ revert.
 *
 * Nhãn của link được so với `keeperState().label`, chứ không so với một chuỗi
 * gõ tay trong test. Hai màn hình đọc chung một hàm là điều kiện để chúng không
 * nói khác nhau; test này chỉ có nghĩa khi nó cũng đọc chung hàm đó.
 */

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { PotConfig, PotState } from "@payday-pot/sdk";

import { NextDrawCard } from "@/components/dashboard/NextDrawCard";
import { keeperState } from "@/lib/draw/room";
import { POT_READS_SERVER_SNAPSHOT, potReadsStore } from "@/lib/pot/reads";

const CONFIG: PotConfig = {
  address: `0x${"11".repeat(20)}`,
  token: `0x${"22".repeat(20)}`,
  underlying: `0x${"33".repeat(20)}`,
  employer: `0x${"44".repeat(20)}`,
  owner: `0x${"55".repeat(20)}`,
  rate: 0n,
  epochDuration: 604_800n,
  perUserCap: 10_000_000_000n,
  participantCap: 32,
};

/** Giờ thật, vì `useNow()` dùng `Date.now()` — mốc round phải neo vào nó. */
const NOW = () => BigInt(Math.floor(Date.now() / 1000));

function pot(over: Partial<PotState> = {}): PotState {
  const now = NOW();
  return {
    epochId: 3n,
    start: now - 60n,
    end: now + 604_800n,
    phase: "Open",
    prizeAmount: 25_000_000n,
    snapshot: { cursor: 0, total: 0 },
    draw: { drawn: false, cursor: 0, total: 0 },
    paused: false,
    participantCount: 4,
    ...over,
  };
}

function live(state: PotState): void {
  potReadsStore.set({ ...POT_READS_SERVER_SNAPSHOT, deployment: "ready", config: CONFIG, state });
}

afterEach(() => {
  potReadsStore.set(POT_READS_SERVER_SNAPSHOT);
});

describe("NextDrawCard — đường vào Draw Room", () => {
  it("round còn mở: có cửa vào phòng, nhưng không giục ai chạy gì", () => {
    live(pot());
    render(<NextDrawCard />);

    const link = screen.getByTestId("dashboard-draw-link");
    expect(link).toHaveAttribute("href", "/app/draws/current");
    expect(link).toHaveTextContent("Open the draw room");
    // Chưa hết giờ thì chưa có việc. Một cái nhãn kiểu "run the next step" ở đây
    // gửi người ta tới một phòng chỉ có đồng hồ đếm ngược.
    expect(screen.queryByText(/Anyone can run it/)).toBeNull();
  });

  it("đang có batch chờ: nhãn link đúng bằng chữ trên nút trong phòng", () => {
    const state = pot({
      end: NOW() - 60n,
      phase: "Snapshotting",
      snapshot: { cursor: 8, total: 21 },
    });
    live(state);
    render(<NextDrawCard />);

    const keeper = keeperState(state, NOW());
    // Nếu hai chỗ này lệch nhau thì người dùng đọc một hành động ở dashboard và
    // gặp một hành động tên khác ở phòng — không có gì đỏ lên, chỉ có một giây
    // ngờ vực. `expect` này tồn tại để giây đó không xảy ra.
    expect(keeper.kind).toBe("ready");
    expect(screen.getByTestId("dashboard-draw-link")).toHaveTextContent(
      `${keeper.kind === "ready" ? keeper.label : ""} in the draw room`,
    );
    // Cursor onchain, không phải phần trăm ước lượng.
    expect(screen.getByText(/8 of 21 done\./)).toBeInTheDocument();
    expect(screen.getByText(/Anyone can run it/)).toBeInTheDocument();
  });

  it("pause chặn seed: cửa vẫn mở, lời mời thì không", () => {
    // Bước duy nhất bị pause chặn là `requestRandom` (§room). Card vẫn phải cho
    // vào xem — phòng giải thích vì sao — nhưng không được bảo ai đó đi bấm một
    // tx sẽ revert.
    const state = pot({
      end: NOW() - 60n,
      phase: "Drawing",
      snapshot: { cursor: 4, total: 4 },
      draw: { drawn: false, cursor: 0, total: 4 },
      paused: true,
    });
    live(state);
    render(<NextDrawCard />);

    expect(keeperState(state, NOW()).kind).toBe("blocked-paused");
    const link = screen.getByTestId("dashboard-draw-link");
    expect(link).toHaveAttribute("href", "/app/draws/current");
    expect(link).toHaveTextContent("Open the draw room");
    expect(screen.queryByText(/Anyone can run it/)).toBeNull();
    // Và lý do vẫn phải nói ra ở đây, không bắt người dùng sang phòng mới biết.
    expect(screen.getByText(/New rounds are paused/)).toBeInTheDocument();
  });

  it("không có pool nào để mở phòng: không có link", () => {
    // Ranh giới của link: nó là đường tới một vòng CÓ THẬT. Không đọc được vòng
    // nào mà vẫn mời vào phòng thì đó là một cánh cửa dẫn tới cùng thông báo lỗi.
    potReadsStore.set({ ...POT_READS_SERVER_SNAPSHOT, deployment: "not-deployed", state: null });
    render(<NextDrawCard />);

    expect(screen.queryByTestId("dashboard-draw-link")).toBeNull();
  });
});
