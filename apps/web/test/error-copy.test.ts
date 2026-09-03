/**
 * Pin hai luật của error taxonomy. Chúng dễ vỡ một cách âm thầm: ai đó thêm
 * `${balance}` vào message cho "rõ hơn", và thế là số tiền rò ra screenshot,
 * log, bug report — non-negotiable #5 vỡ mà không có gì đỏ lên.
 */

import { ALL_CONTRACT_ERROR_SPECS, ALL_FOREIGN_ERROR_SPECS, classifyError } from "@payday-pot/sdk";
import { PAYDAY_POT_ERRORS } from "@payday-pot/shared";
import { describe, expect, it } from "vitest";

const specs = [
  ...Object.entries(ALL_CONTRACT_ERROR_SPECS).map(([k, v]) => [k, v] as const),
  ...Object.entries(ALL_FOREIGN_ERROR_SPECS).map(([k, v]) => [k, v] as const),
];

describe("error taxonomy", () => {
  it("covers every error in the frozen contract ABI", () => {
    for (const name of PAYDAY_POT_ERRORS) {
      expect(ALL_CONTRACT_ERROR_SPECS, `no recovery row for ${name}`).toHaveProperty(name);
    }
  });

  it.each(specs)("%s carries no amount in its copy", (_name, spec) => {
    // Bất kỳ cụm 2+ chữ số nào cũng đáng ngờ: không có lý do chính đáng để một
    // dòng recovery chứa số.
    const copy = `${spec.title} ${spec.detail}`;
    expect(copy).not.toMatch(/\d{2,}/);
  });

  it.each(specs)("%s offers a way forward", (_name, spec) => {
    expect(spec.action.kind).toBeTruthy();
    expect(spec.title.length).toBeGreaterThan(0);
    expect(spec.detail.length).toBeGreaterThan(0);
  });

  it("never returns a dead end, even for garbage", () => {
    for (const junk of [null, undefined, 0, "", {}, new Error("???"), { data: "0xdeadbeef" }]) {
      const e = classifyError(junk);
      expect(e.action.kind).toBeTruthy();
      expect(e.detail).not.toMatch(/\d{2,}/);
    }
  });

  it("names the four cases the brief calls out", () => {
    const rows = specs.map(([, s]) => s.row);
    // R13 missing approval · R14 insufficient balance · R8 network mismatch · R15 unsupported token
    expect(rows).toContain("R13");
    expect(rows).toContain("R14");
    expect(rows).toContain("R15");
    expect(classifyError({ code: 4902 }).row).toBe("R8");
  });
});

/**
 * Thất bại dựng lại share của KMS — họ lỗi Day 9, và nó từng là một dead end.
 *
 * Đo thật trên Sepolia: relayer trả `{"status":"succeeded"}` kèm payload, rồi
 * WASM phía client chết ở `Gao decoding failure … n=13, deg=4, #shares=9`. Câu
 * duy nhất `@zama-fhe/relayer-sdk` để lộ ra ngoài là "An error occured during
 * decryption", nguyên nhân thật nằm trong `cause` — nên trước khi sửa, hành
 * động chủ lực của sản phẩm rơi vào nhánh `unknown` với `row: null` và câu
 * "Something went wrong". Tức là: reveal chết, và không còn thông tin nào ở
 * đâu cả, kể cả cho người đang debug.
 */
describe("KMS share reconstruction failure", () => {
  const real = (): Error =>
    new Error("An error occured during decryption", {
      cause: new Error(
        "Error in core/service/src/client/user_decryption_wasm.rs: Error reconstructing all blocks: " +
          "Gao decoding failure: Allowed at most 0 errors but xgcd factor degree indicates 1.. n=13, deg=4, #shares=9",
      ),
    });

  it("lands on a real recovery row, not the unknown bucket", () => {
    const e = classifyError(real());
    expect(e.code).toBe("decryption-incomplete");
    expect(e.row).toBe("R7");
    expect(e.retryable).toBe(true);
    expect(e.action.kind).toBe("retry");
  });

  it("is found through the cause chain, not the outer message", () => {
    // Lớp ngoài không khớp regex nào của taxonomy — bằng chứng là chuỗi `cause`
    // mới là thứ mang thông tin. Nếu ai đó "dọn" `messageChainOf` đi, test này đỏ.
    const causeOnly = new Error("wrapped", { cause: real().cause });
    expect(classifyError(causeOnly).code).toBe("decryption-incomplete");
  });

  it("does not tell the user to wait, and does not blame them", () => {
    const e = classifyError(real());
    // "service is slow" (R7 timeout) sẽ khiến người dùng ngồi đợi một thứ đã xong.
    expect(`${e.title} ${e.detail}`).not.toMatch(/slow|wait/i);
    expect(e.detail).toMatch(/nothing was sent/i);
    expect(`${e.title} ${e.detail}`).not.toMatch(/\d{2,}/);
  });
});
