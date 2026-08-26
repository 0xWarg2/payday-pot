import { type StepId, stepIndex } from "./steps";

/**
 * Phần trạng thái onboarding mà KHÔNG có nguồn nào khác ngoài "người này vừa
 * bấm nút ở tab này".
 *
 * Role, ví, mạng, consent đều có nguồn sự thật riêng (store ví, `localStorage`
 * qua allowlist). Còn ba cái dưới đây thuần tuý là "đã đọc xong màn hình đó" —
 * không nhạy cảm, nhưng cũng chẳng đáng persist: đọc lại một màn hình giải
 * thích sau khi reload không phải là hình phạt, còn một cờ "đã đọc" sai lại
 * làm người dùng nhảy cóc qua đúng phần chữ mà họ cần đọc.
 *
 * Reducer thuần — không I/O, không `Date.now()`, test được bằng bảng.
 */
export interface OnboardingProgress {
  sawProgram: boolean;
  assetsAcknowledged: boolean;
  reviewed: boolean;
}

export const INITIAL_PROGRESS: OnboardingProgress = Object.freeze({
  sawProgram: false,
  assetsAcknowledged: false,
  reviewed: false,
});

/** Mỗi cờ mở khoá đúng một bước — bảng này là thứ `rewind` dùng để lùi. */
const ACK_STEP: Record<keyof OnboardingProgress, StepId> = {
  sawProgram: "program",
  assetsAcknowledged: "assets",
  reviewed: "review",
};

export type OnboardingEvent =
  | { type: "ack"; flag: keyof OnboardingProgress }
  | { type: "rewind"; to: StepId }
  | { type: "reset" };

export function onboardingReducer(state: OnboardingProgress, event: OnboardingEvent): OnboardingProgress {
  switch (event.type) {
    case "ack":
      return state[event.flag] ? state : { ...state, [event.flag]: true };
    case "rewind":
      return rewind(state, event.to);
    case "reset":
      return INITIAL_PROGRESS;
  }
}

/**
 * Lùi về một bước = **gỡ** các cờ từ bước đó trở đi.
 *
 * Trong mô hình bước-suy-ra, không có cách nào khác để đi lùi: bước hiện tại là
 * hàm của điều kiện, nên muốn màn hình quay lại thì phải làm cho điều kiện sai
 * trở lại. Gỡ cả các cờ *sau* nó nữa, nếu không người dùng sửa role rồi bị bắn
 * thẳng tới review, bỏ qua đúng những bước mà thay đổi vừa rồi ảnh hưởng tới.
 */
export function rewind(state: OnboardingProgress, to: StepId): OnboardingProgress {
  const target = stepIndex(to);
  let next = state;
  for (const key of Object.keys(ACK_STEP) as (keyof OnboardingProgress)[]) {
    if (state[key] && stepIndex(ACK_STEP[key]) >= target) {
      next = { ...next, [key]: false };
    }
  }
  return next;
}
