"use client";

/**
 * Cổng duy nhất ra `localStorage`.
 *
 * Non-negotiable #5 cấm mọi thứ nhạy cảm chạm tới persistence. Cách rẻ tiền là
 * "nhớ đừng ghi" — cách này thì không dựa vào trí nhớ: mỗi key có một validator,
 * và `writeJson` từ chối cả key lạ lẫn payload sai hình dạng. Muốn persist thêm
 * cái gì thì phải khai báo ở đây, tức là phải nghĩ về nó một lần.
 *
 * Vì sao không phải regex "cấm chuỗi 32 byte": tx hash và ciphertext handle
 * giống hệt nhau về hình dạng. Chỉ có schema mới phân biệt được — `txHash` là
 * field được phép, còn handle thì không có field nào để nằm vào.
 *
 * `sessionStorage` cố ý KHÔNG được dùng ở bất cứ đâu; test pin `length === 0`.
 */

export const STORAGE_KEYS = {
  role: "pdp.role.v1",
  consent: "pdp.consent.v1",
  tx: "pdp.tx.v1",
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

export const ALLOWED_STORAGE_KEYS: readonly string[] = Object.values(STORAGE_KEYS);

type Validator = (value: unknown) => boolean;

/**
 * Hình dạng được phép ghi cho từng key. Thiếu entry ⇒ không ghi được.
 * `tx` dùng validator riêng do `lib/tx/store` cung cấp lúc đăng ký để tránh
 * vòng import; mặc định từ chối mọi thứ.
 */
const validators = new Map<string, Validator>([
  [STORAGE_KEYS.role, (v) => v === "employee" || v === "employer"],
  [
    STORAGE_KEYS.consent,
    (v) =>
      typeof v === "object" &&
      v !== null &&
      Object.keys(v).length === 1 &&
      typeof (v as { acceptedAt?: unknown }).acceptedAt === "number",
  ],
]);

export function registerValidator(key: StorageKey, validator: Validator): void {
  validators.set(key, validator);
}

export class StorageContractError extends Error {
  constructor(key: string) {
    super(
      `Refused to persist "${key}": it is not in the storage allowlist, or the value does not ` +
        `match the declared shape. Confidential values must never reach persistence ` +
        `(CLAUDE.md non-negotiable #5).`,
    );
    this.name = "StorageContractError";
  }
}

export function writeJson(key: StorageKey, value: unknown): void {
  const validator = validators.get(key);
  if (!validator || !validator(value)) throw new StorageContractError(key);
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota đầy hoặc storage bị chặn (Safari private). Không phải lỗi user cần
    // thấy — mất một tiện ích nhỏ, không mất tiền.
  }
}

export function readJson<T>(key: StorageKey, guard: (value: unknown) => value is T): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return guard(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function removeKey(key: StorageKey): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* xem writeJson */
  }
}
