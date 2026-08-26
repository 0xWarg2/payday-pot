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
