import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "../app/page";
import { expectNoAnonymityClaim } from "./helpers/anonymity";

describe("home", () => {
  it("frames the product without claiming anonymity", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("PayDay Pot");

    // Framing bắt buộc: sản phẩm bảo mật SỐ TIỀN, không ẩn địa chỉ.
    expectNoAnonymityClaim(document.body, "landing");
  });

  it("denies anonymity out loud instead of staying silent about it", () => {
    render(<Home />);
    // Nói ra là một yêu cầu, không phải một tuỳ chọn: đây là chỗ người dùng học
    // được rằng địa chỉ vẫn công khai, trước khi họ quyết định nối ví nào.
    expect(document.body.textContent ?? "").toMatch(/does not make you anonymous/i);
  });

  it("points at the docs from the header and the footer", () => {
    render(<Home />);
    const docsLinks = screen.getAllByRole("link", { name: /^docs$/i });
    expect(docsLinks.length).toBeGreaterThanOrEqual(2);
    for (const link of docsLinks) expect(link).toHaveAttribute("href", "/docs");
  });
});
