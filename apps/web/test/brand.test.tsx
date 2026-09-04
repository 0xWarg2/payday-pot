import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CoinMark } from "../components/brand/CoinMark";

/**
 * Logo là trang trí: đứng cạnh chữ "PayDay Pot", không được thêm tên vào link
 * (screen reader đọc "PayDay Pot", không đọc "image PayDay Pot"). Favicon là
 * SVG tĩnh ngoài CSS của trang nên không được lệ thuộc `var()`.
 */
describe("brand", () => {
  it("CoinMark is decorative and sized by prop", () => {
    const { container } = render(<CoinMark size={22} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("width")).toBe("22");
    expect(svg.textContent?.trim()).toBe("¢");
  });

  it("favicon SVG uses only literal colours", () => {
    const svg = readFileSync(join(__dirname, "../app/icon.svg"), "utf8");
    expect(svg).not.toMatch(/var\(/);
    expect(svg).toContain("#ffd208");
  });
});
