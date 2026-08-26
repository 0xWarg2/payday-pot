import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "../app/page";

/** Một phủ định nào đó, trong cùng câu, ngay trước từ khoá. */
const NEGATED_BEFORE = /\b(?:not|never|n['’]t|no)\b[^.!?]{0,60}$/i;

describe("home", () => {
  it("frames the product without claiming anonymity", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("PayDay Pot");

    // Framing bắt buộc: sản phẩm bảo mật SỐ TIỀN, không ẩn địa chỉ.
    //
    // Luật cấm KHẲNG ĐỊNH ẩn danh — không cấm cái từ. Bản test cũ chặn thẳng
    // chuỗi ký tự, nên nó bắt luôn câu "it does not make you anonymous", tức là
    // đúng câu framing trung thực nhất trên trang. Chặn kiểu đó chỉ đẩy landing
    // về chỗ im lặng, mà để người đọc tự suy ra "chắc là ẩn danh" là dạng sai
    // lệch khó cãi nhất, không phải dạng an toàn nhất.
    const text = document.body.textContent ?? "";
    for (const match of text.matchAll(/anonymous|anonymity/gi)) {
      const at = match.index;
      expect(at, "match without an index").toBeTypeOf("number");
      if (at === undefined) continue;
      const context = text.slice(Math.max(0, at - 80), at + 20);
      expect(text.slice(0, at), `claims anonymity: …${context}…`).toMatch(NEGATED_BEFORE);
    }
  });

  it("denies anonymity out loud instead of staying silent about it", () => {
    render(<Home />);
    // Nói ra là một yêu cầu, không phải một tuỳ chọn: đây là chỗ người dùng học
    // được rằng địa chỉ vẫn công khai, trước khi họ quyết định nối ví nào.
    expect(document.body.textContent ?? "").toMatch(/does not make you anonymous/i);
  });
});
