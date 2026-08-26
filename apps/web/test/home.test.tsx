import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "../app/page";

describe("home", () => {
  it("frames the product without claiming anonymity", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("PayDay Pot");
    // Framing bắt buộc: sản phẩm bảo mật SỐ TIỀN, không ẩn địa chỉ. Nói
    // "anonymous" ở bất kỳ đâu là sai sự thật về chính contract đã ship.
    expect(document.body.textContent ?? "").not.toMatch(/anonymous|anonymity/i);
  });
});
