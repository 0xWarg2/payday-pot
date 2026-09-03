/**
 * "Deposits close in" — cùng một sự thật, hai màn hình, và trước hôm nay là hai
 * câu trả lời khác nhau.
 *
 * Contract đòi CẢ HAI điều kiện để nhận deposit (`PayDayPot.sol:260`):
 * `phase == Open` **và** `block.timestamp < ep.end`. Hai cái đó tách rời nhau
 * được, và trên Sepolia nó đã tách rời thật: 30/08 vòng 1 hết giờ từ 51 tiếng
 * trước mà `beginSnapshot()` chưa ai gọi, nên phase vẫn đọc ra `Open`.
 *
 * Màn sponsor rẽ nhánh theo `phase` nên rơi vào `formatCountdown(số âm)` →
 * `"0m"`. Dashboard rẽ theo đồng hồ nên nói `"Closed"`. `"0m"` không phải một
 * cách nói khác của "đã đóng": nó đọc thành *còn kịp, nhanh lên* — đúng lúc sự
 * thật là cửa đã khoá hai ngày. Với người bỏ tiền ra tài trợ thì đó là một câu
 * giục sai.
 *
 * Nên test này không kiểm tra chữ. Nó kiểm tra hai màn hình **đọc chung một
 * hàm**, và ghim lại đúng cái thế trận đã sinh ra lỗi.
 */

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { PotConfig, PotState } from "@payday-pot/sdk";

import { NextDrawCard } from "@/components/dashboard/NextDrawCard";
import { SponsorOverview } from "@/components/employer/SponsorOverview";
import { depositsClosed } from "@/lib/draw/room";
import { POT_READS_SERVER_SNAPSHOT, potReadsStore } from "@/lib/pot/reads";

const CONFIG: PotConfig = {
  address: `0x${"11".repeat(20)}`,
  token: `0x${"22".repeat(20)}`,
  underlying: `0x${"33".repeat(20)}`,
  employer: `0x${"44".repeat(20)}`,
  owner: `0x${"55".repeat(20)}`,
  rate: 1n,
  epochDuration: 172_800n,
  perUserCap: 10_000_000_000n,
  participantCap: 32,
};

const NOW = () => BigInt(Math.floor(Date.now() / 1000));

function pot(over: Partial<PotState> = {}): PotState {
  const now = NOW();
  return {
    epochId: 1n,
    start: now - 172_800n,
    end: now + 86_400n,
    phase: "Open",
    prizeAmount: 0n,
    snapshot: { cursor: 0, total: 1 },
    draw: { drawn: false, cursor: 0, total: 1 },
    paused: false,
    participantCount: 1,
    ...over,
  };
}

function live(state: PotState): void {
  potReadsStore.set({ ...POT_READS_SERVER_SNAPSHOT, deployment: "ready", config: CONFIG, state });
}

/** Đúng thế trận Sepolia 30/08: quá hạn 51.5 tiếng, phase vẫn Open. */
const EXPIRED = () => pot({ end: NOW() - 185_344n, phase: "Open" });

afterEach(() => {
  potReadsStore.set(POT_READS_SERVER_SNAPSHOT);
});

describe("SponsorOverview — 'deposits close in'", () => {
  it("hết giờ nhưng phase còn Open: nói đã đóng, không nói '0m'", () => {
    const state = EXPIRED();
    expect(depositsClosed(state, NOW())).toBe(true);

    live(state);
    render(<SponsorOverview />);

    const cell = screen.getByText("Deposits close in").parentElement;
    expect(cell).toHaveTextContent("Closed");
    // "0m" là giá trị kẹp của đồng hồ đếm ngược ở giây cuối, không phải câu trả
    // lời cho một cửa đã khoá từ hai ngày trước.
    expect(cell).not.toHaveTextContent("0m");
  });

  it("round còn chạy thật: vẫn đếm ngược bình thường", () => {
    const state = pot({ end: NOW() + 86_400n });
    expect(depositsClosed(state, NOW())).toBe(false);

    live(state);
    render(<SponsorOverview />);

    const cell = screen.getByText("Deposits close in").parentElement;
    expect(cell).not.toHaveTextContent("Closed");
    expect(cell?.textContent).toMatch(/\d/);
  });

  it("sponsor và dashboard không được nói khác nhau về cùng một vòng", () => {
    for (const state of [EXPIRED(), pot(), pot({ phase: "Snapshotting", end: NOW() - 60n })]) {
      live(state);

      const sponsor = render(<SponsorOverview />);
      const fromSponsor = sponsor.getByText("Deposits close in").parentElement?.textContent ?? "";
      sponsor.unmount();

      const dash = render(<NextDrawCard />);
      const fromDash = dash.getByText("Deposits close in").parentElement?.textContent ?? "";
      dash.unmount();

      // Không so nguyên văn: dashboard còn in thêm ngày giờ tuyệt đối dưới con
      // số. Cái phải khớp là KẾT LUẬN đóng hay chưa.
      expect(fromSponsor.includes("Closed")).toBe(fromDash.includes("Closed"));
    }
  });
});
