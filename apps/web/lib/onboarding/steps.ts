import type { Role } from "./role";

/**
 * Tám bước §7. Bước hiện tại được **suy ra**, không lưu.
 *
 * Một con trỏ `step` được persist là thứ luôn luôn lệch khỏi sự thật: người
 * dùng ngắt ví ở bước 7, quay lại, con trỏ vẫn nói "bước 7" và màn hình review
 * hiện ra cho một ví không tồn tại. Ở đây mỗi bước là một *điều kiện sống*, nên
 * resume là hệ quả miễn phí của việc đọc lại điều kiện — và ngắt ví ở bước 7
 * rơi đúng về bước 2 mà vẫn giữ nguyên role, consent, mọi thứ khác (§7 "preserve
 * role and return route", R8).
 *
 * Hệ quả cần biết khi đọc `currentStep`: **thứ tự các câu lệnh `if` CHÍNH LÀ
 * logic resume**. Đổi chỗ hai dòng là đổi hành vi quay lui.
 */
export type StepId = "role" | "connect" | "network" | "program" | "consent" | "assets" | "review" | "done";

export const STEP_ORDER = [
  "role",
  "connect",
  "network",
  "program",
  "consent",
  "assets",
  "review",
  "done",
] as const satisfies readonly StepId[];

export const TOTAL_STEPS = STEP_ORDER.length;

export const STEP_LABELS: Record<StepId, string> = {
  role: "Choose how you are joining",
  connect: "Connect your wallet",
  network: "Switch to Sepolia",
  program: "Meet the pool",
  consent: "What is public, what is not",
  assets: "Get ready to deposit",
  review: "Review",
  done: "You are set up",
};

/** Nhãn ngắn cho stepper ngang — nhãn đầy đủ ở trên là tiêu đề của bước. */
export const STEP_SHORT_LABELS: Record<StepId, string> = {
  role: "Role",
  connect: "Wallet",
  network: "Network",
  program: "Pool",
  consent: "Privacy",
  assets: "Assets",
  review: "Review",
  done: "Done",
};

export interface OnboardingFacts {
  role: Role | null;
  connected: boolean;
  onSepolia: boolean;
  sawProgram: boolean;
  consented: boolean;
  assetsReady: boolean;
  reviewed: boolean;
}

export function currentStep(facts: OnboardingFacts): StepId {
  if (facts.role === null) return "role";
  if (!facts.connected) return "connect";
  if (!facts.onSepolia) return "network";
  if (!facts.sawProgram) return "program";
  if (!facts.consented) return "consent";
  if (!facts.assetsReady) return "assets";
  if (!facts.reviewed) return "review";
  return "done";
}

/** 1-based, cho `Step n of 8` mà screen reader đọc. */
export function stepNumber(id: StepId): number {
  return STEP_ORDER.indexOf(id) + 1;
}

export function stepIndex(id: StepId): number {
  return STEP_ORDER.indexOf(id);
}
