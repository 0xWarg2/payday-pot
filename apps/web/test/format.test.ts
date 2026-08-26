/**
 * Cái nút cổ chai giữa "giá trị mã hoá" và "chuỗi trên màn hình".
 *
 * `formatConfidential` là hàm total trên union ba trạng thái và cố ý KHÔNG có
 * tham số `fallback` — không tồn tại đường nào để `undefined` đi vào rồi đi ra
 * thành `"0"`. Test ở đây giữ đúng tính chất đó, vì nó là hình thức thi hành
 * non-negotiable #8 ở tầng thấp nhất.
 */

import { describe, expect, it } from "vitest";

import {
  MASK_GLYPH,
  formatAbsolute,
  formatAmount,
  formatConfidential,
  formatCountdown,
  formatRelativeTime,
  parseAmount,
  shortAddress,
  shortHash,
  twabAverage,
  type ConfidentialView,
} from "@/lib/format";

describe("formatConfidential", () => {
  const masked: ConfidentialView[] = [{ kind: "unavailable" }, { kind: "hidden" }];

  it.each(masked)("puts no digit on screen for $kind", (view) => {
    const display = formatConfidential(view, "Savings");

    expect(display.text).not.toMatch(/\d/);
    expect(display.isPlain).toBe(false);
  });

  it("says three different things for three different states", () => {
    const texts = [...masked, { kind: "revealed", value: 0n } as const].map(
      (view) => formatConfidential(view, "Savings").text,
    );

    // `unavailable` là "chưa có gì onchain", `hidden` là "có, bạn chưa mở",
    // `revealed: 0n` là "thật sự bằng không". Ba câu trả lời, ba hành động khác.
    expect(new Set(texts).size).toBe(3);
  });

  it("never hands a screen reader the dots", () => {
    for (const view of masked) {
      const display = formatConfidential(view, "Savings");
      expect(display.announce).not.toContain(MASK_GLYPH);
      expect(display.announce.toLowerCase()).toContain("savings");
    }
  });

  it("marks only a revealed value as a real number", () => {
    const revealed = formatConfidential({ kind: "revealed", value: 1_500_000n }, "Savings");

    expect(revealed.isPlain).toBe(true);
    expect(revealed.text).toBe("1.5");
  });
});

describe("formatAmount", () => {
  it("renders zero as a bare zero", () => {
    expect(formatAmount(0n)).toBe("0");
  });

  it("groups thousands and trims trailing zeros", () => {
    expect(formatAmount(1_234_567_890_123n)).toBe("1,234,567.89");
    expect(formatAmount(100_000_000n)).toBe("100");
  });

  it("keeps at most two fraction digits", () => {
    expect(formatAmount(1_999_999n)).toBe("1.99");
  });

  it("shows a sub-cent amount as zero, which only ever happens to a revealed value", () => {
    // Cắt về "0.00" là quy ước tiền tệ bình thường và chỉ áp dụng cho giá trị
    // ĐÃ mở. Nó không đụng non-negotiable #8: #8 nói về việc hiện 0 cho thứ
    // đang bị giấu, và đường đó bị chặn ở `formatConfidential` phía trên.
    expect(formatAmount(1n)).toBe("0.00");
  });
});

describe("parseAmount", () => {
  it("round-trips with formatAmount", () => {
    for (const input of ["1.5", "100", "1000.25"]) {
      expect(formatAmount(parseAmount(input))).toBe(Number(input).toLocaleString("en-US"));
    }
  });

  it("accepts a grouped number the way a user types it", () => {
    expect(parseAmount("1,000")).toBe(1_000_000_000n);
  });

  it("throws instead of quietly returning zero", () => {
    // Trả 0n cho một chuỗi không parse được là cách chắc chắn để gửi nhầm một
    // giao dịch rỗng và làm người dùng tưởng nó đã đi.
    for (const bad of ["", ".", "abc", "1.2.3", "-5"]) {
      expect(() => parseAmount(bad), `accepted ${JSON.stringify(bad)}`).toThrow(RangeError);
    }
  });

  it("refuses more decimal places than the token has", () => {
    expect(() => parseAmount("1.1234567")).toThrow(RangeError);
    expect(parseAmount("1.123456")).toBe(1_123_456n);
  });
});

describe("twabAverage", () => {
  it("returns null rather than zero when no time has elapsed", () => {
    expect(twabAverage(100n, 0n)).toBeNull();
    expect(twabAverage(100n, -5n)).toBeNull();
  });

  it("divides on plaintext, in the owner's own tab", () => {
    expect(twabAverage(1_000n, 4n)).toBe(250n);
  });
});

describe("formatCountdown", () => {
  it("switches to days once there is more than one", () => {
    expect(formatCountdown(2 * 86_400 + 4 * 3_600 + 11 * 60 + 9)).toBe("2d 04h 11m");
  });

  it("shows a clock inside the last day", () => {
    expect(formatCountdown(4 * 3_600 + 11 * 60 + 9)).toBe("04:11:09");
  });

  it("never runs negative", () => {
    expect(formatCountdown(0)).toBe("0m");
    expect(formatCountdown(-30)).toBe("0m");
  });
});

describe("formatAbsolute", () => {
  it("does not throw", () => {
    // Regression: bản đầu ghép `dateStyle`/`timeStyle` với `timeZoneName`. Intl
    // CẤM trộn style với option thành phần, và nó không cảnh báo — nó ném
    // `TypeError` lúc chạy, đúng lúc card đầu tiên nhận dữ liệu thật. Cả trang
    // chết, ở đúng chỗ khó nhìn thấy nhất trong lúc dựng.
    expect(() => formatAbsolute(1_787_917_344n)).not.toThrow();
    expect(() => formatAbsolute(1_787_917_344)).not.toThrow();
  });

  it("carries a year and a timezone, because a countdown alone verifies nothing", () => {
    const text = formatAbsolute(1_787_917_344n);

    expect(text).toMatch(/\d{4}/);
    // Không hard-code chuỗi đầy đủ: timezone của tiến trình test không được pin,
    // và một test chỉ xanh ở Asia/Ho_Chi_Minh thì tệ hơn là không có test.
    expect(text.length).toBeGreaterThan("1 Jan 2026".length);
  });

  it("moves when the timestamp moves", () => {
    expect(formatAbsolute(1_787_917_344n)).not.toBe(formatAbsolute(1_787_917_344n + 86_400n));
  });
});

describe("addresses and hashes", () => {
  it("checksums an address on the way to the screen", () => {
    // relayer-sdk từ chối address lowercase, nên hiện dạng checksummed ở UI
    // giữ cho cái người dùng đọc khớp với cái hệ thống dùng.
    expect(shortAddress("0x1ce8d5ff6e57a64e23cb28334315232a2e732d57")).toBe("0x1cE8…2D57");
  });

  it("throws on something that is not an address", () => {
    expect(() => shortAddress("0xnope")).toThrow();
  });

  it("shortens a hash from both ends", () => {
    expect(shortHash(`0x${"ab".repeat(32)}`)).toBe("0xabababab…ababab");
  });
});

describe("formatRelativeTime", () => {
  it("reads as just now inside the first minute", () => {
    const now = 1_700_000_000_000;
    expect(formatRelativeTime(now - 10_000, now)).toBe("just now");
  });

  it("steps up through minutes, hours and days", () => {
    const now = 1_700_000_000_000;
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe("5m ago");
    expect(formatRelativeTime(now - 3 * 3_600_000, now)).toBe("3h ago");
    expect(formatRelativeTime(now - 2 * 86_400_000, now)).toBe("2d ago");
  });

  it("never reports the future as negative", () => {
    const now = 1_700_000_000_000;
    expect(formatRelativeTime(now + 60_000, now)).toBe("just now");
  });
});
