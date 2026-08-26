"use client";

import { createExternalStore } from "../store/external-store";
import { STORAGE_KEYS, readJson, removeKey, writeJson } from "../storage";

/**
 * Vai trò người dùng chọn ở onboarding. Persist được vì nó KHÔNG nhạy cảm —
 * "tôi đang xem app dưới góc nhìn nhân viên hay nhà tài trợ" không nói gì về
 * tiền của ai cả, và mất nó mỗi lần reload thì onboarding trở nên khó chịu.
 */
export type Role = "employee" | "employer";

export const ROLE_SERVER_SNAPSHOT: Role | null = null;

export const roleStore = createExternalStore<Role | null>(ROLE_SERVER_SNAPSHOT, ROLE_SERVER_SNAPSHOT);

function isRole(v: unknown): v is Role {
  return v === "employee" || v === "employer";
}

export function loadRole(): void {
  roleStore.set(readJson(STORAGE_KEYS.role, isRole));
}

export function setRole(role: Role): void {
  roleStore.set(role);
  writeJson(STORAGE_KEYS.role, role);
}

export function clearRole(): void {
  roleStore.set(null);
  removeKey(STORAGE_KEYS.role);
}
