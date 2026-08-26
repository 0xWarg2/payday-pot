/**
 * Bước hiện tại được SUY RA, không lưu — và đó là chỗ dễ hỏng.
 *
 * Vì `currentStep` chỉ là một chuỗi `if`, thứ tự các dòng CHÍNH LÀ logic resume.
 * Đổi chỗ hai dòng là đổi hành vi quay lui, mà không có gì đỏ lên. Bảng dưới
 * đây pin đúng thứ tự đó, và pin luôn cái case đắt nhất: ngắt ví ở bước gần
 * cuối phải rơi về "connect" mà KHÔNG mất role, consent hay bất cứ thứ gì khác.
 */

import { describe, expect, it } from "vitest";

import {
  INITIAL_PROGRESS,
  onboardingReducer,
  rewind,
  type OnboardingProgress,
} from "@/lib/onboarding/reducer";
import {
  STEP_LABELS,
  STEP_ORDER,
  STEP_SHORT_LABELS,
  TOTAL_STEPS,
  currentStep,
  stepIndex,
  stepNumber,
  type OnboardingFacts,
} from "@/lib/onboarding/steps";

const DONE: OnboardingFacts = {
  role: "employee",
  connected: true,
  onSepolia: true,
  sawProgram: true,
  consented: true,
  assetsReady: true,
  reviewed: true,
};

describe("currentStep", () => {
  const table: [string, OnboardingFacts][] = [
    ["role", { ...DONE, role: null }],
    ["connect", { ...DONE, connected: false }],
    ["network", { ...DONE, onSepolia: false }],
    ["program", { ...DONE, sawProgram: false }],
    ["consent", { ...DONE, consented: false }],
    ["assets", { ...DONE, assetsReady: false }],
    ["review", { ...DONE, reviewed: false }],
    ["done", DONE],
  ];

  it.each(table)("stops at %s when that is the first unmet condition", (expected, facts) => {
    expect(currentStep(facts)).toBe(expected);
  });

  it("covers every step in STEP_ORDER", () => {
    // Thêm một bước mà quên thêm dòng bảng thì test này đỏ, thay vì bước mới
    // lặng lẽ không bao giờ được kiểm.
    expect(table.map(([id]) => id)).toEqual([...STEP_ORDER]);
  });

  it("falls back to connect — not review — when the wallet disconnects late", () => {
    // §7 và R8: giữ nguyên role và mọi tiến độ khác. Một con trỏ `step` được
    // persist sẽ nói "bước 7" và hiện màn hình review cho một ví không tồn tại.
    const dropped: OnboardingFacts = { ...DONE, connected: false, onSepolia: false };

    expect(currentStep(dropped)).toBe("connect");
    expect(dropped.role).toBe("employee");
    expect(dropped.consented).toBe(true);
  });

  it("sends a connected wallet on the wrong chain to the network step", () => {
    expect(currentStep({ ...DONE, onSepolia: false })).toBe("network");
  });
});

describe("step numbering", () => {
  it("counts from one for the label a screen reader reads", () => {
    expect(stepNumber("role")).toBe(1);
    expect(stepNumber("done")).toBe(TOTAL_STEPS);
    expect(stepIndex("role")).toBe(0);
  });

  it("has a label and a short label for every step", () => {
    for (const id of STEP_ORDER) {
      expect(STEP_LABELS[id], `no label for ${id}`).toBeTruthy();
      expect(STEP_SHORT_LABELS[id], `no short label for ${id}`).toBeTruthy();
    }
  });
});

describe("onboardingReducer", () => {
  it("returns the very same object when acking a flag that is already set", () => {
    const acked = onboardingReducer(INITIAL_PROGRESS, { type: "ack", flag: "sawProgram" });

    // `toBe`, không phải `toEqual`: store so sánh bằng `Object.is`, nên giữ
    // nguyên reference là cái ngăn một cú ack lặp lại re-render cả cây.
    expect(onboardingReducer(acked, { type: "ack", flag: "sawProgram" })).toBe(acked);
    expect(acked.sawProgram).toBe(true);
  });

  it("resets to the shared initial constant", () => {
    const acked = onboardingReducer(INITIAL_PROGRESS, { type: "ack", flag: "reviewed" });

    expect(onboardingReducer(acked, { type: "reset" })).toBe(INITIAL_PROGRESS);
  });

  it("routes rewind through the reducer", () => {
    const all: OnboardingProgress = { sawProgram: true, assetsAcknowledged: true, reviewed: true };

    expect(onboardingReducer(all, { type: "rewind", to: "assets" })).toEqual({
      sawProgram: true,
      assetsAcknowledged: false,
      reviewed: false,
    });
  });
});

describe("rewind", () => {
  const all: OnboardingProgress = { sawProgram: true, assetsAcknowledged: true, reviewed: true };

  it("clears the target step and everything after it", () => {
    // Gỡ cả các cờ SAU nó là phần load-bearing: nếu chỉ gỡ đúng một cờ, người
    // dùng sửa role xong sẽ bị bắn thẳng tới review, bỏ qua đúng những bước mà
    // thay đổi vừa rồi ảnh hưởng tới.
    expect(rewind(all, "program")).toEqual({
      sawProgram: false,
      assetsAcknowledged: false,
      reviewed: false,
    });
  });

  it("leaves earlier steps alone", () => {
    expect(rewind(all, "review")).toEqual({ sawProgram: true, assetsAcknowledged: true, reviewed: false });
  });

  it("is a no-op when the target sits past every tracked flag", () => {
    expect(rewind(all, "done")).toBe(all);
  });

  it("is a no-op on a state that has nothing acked", () => {
    expect(rewind(INITIAL_PROGRESS, "role")).toBe(INITIAL_PROGRESS);
  });
});
