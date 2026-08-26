"use client";

import { createExternalStore } from "../store/external-store";
import { STORAGE_KEYS, readJson, removeKey, writeJson } from "../storage";

/**
 * Người dùng đã đọc và chấp nhận ranh giới riêng tư chưa.
 *
 * Persist đúng một số: `acceptedAt`. Đó là toàn bộ hình dạng mà validator ở
 * `lib/storage` cho phép ghi vào key này — không address, không role, không gì
 * suy ra được vị thế.
 *
 * Vì sao persist: bắt đọc lại tuyên bố riêng tư sau mỗi lần reload nghe thì có
 * vẻ "an toàn hơn", thực tế nó dạy người dùng bấm qua mà không đọc. Nhớ rằng họ
 * đã đọc, và không bao giờ prechecked ở lần đầu (§7 acceptance) — đó mới là thứ
 * làm cho lần đọc duy nhất ấy có trọng lượng.
 */
export interface ConsentRecord {
  acceptedAt: number;
}

export const CONSENT_SERVER_SNAPSHOT: ConsentRecord | null = null;

export const consentStore = createExternalStore<ConsentRecord | null>(
  CONSENT_SERVER_SNAPSHOT,
  CONSENT_SERVER_SNAPSHOT,
);

function isConsent(v: unknown): v is ConsentRecord {
  return (
    typeof v === "object" &&
    v !== null &&
    Object.keys(v).length === 1 &&
    typeof (v as { acceptedAt?: unknown }).acceptedAt === "number"
  );
}

export function loadConsent(): void {
  consentStore.set(readJson(STORAGE_KEYS.consent, isConsent));
}

export function acceptConsent(): void {
  const record: ConsentRecord = { acceptedAt: Date.now() };
  consentStore.set(record);
  writeJson(STORAGE_KEYS.consent, record);
}

export function revokeConsent(): void {
  consentStore.set(null);
  removeKey(STORAGE_KEYS.consent);
}
