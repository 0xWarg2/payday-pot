"use client";

import type { PotError } from "@payday-pot/sdk";

import { createExternalStore } from "../store/external-store";

/**
 * Reveal store — nơi duy nhất giá trị đã decrypt được phép tồn tại.
 *
 * Ràng buộc (non-negotiable #5 + PRIVACY §1): plaintext chỉ sống trong bộ nhớ
 * tab, TTL 5 phút, và bị xoá khi Hide · hết TTL · reload · đổi account · đổi
 * chain · TAB BỊ ẨN · handle đổi.
 *
 * Hai cơ chế, cố ý chồng lên nhau:
 *
 *  1. **Key.** Entry được khoá theo `chainId:contract:account:handle`. Đổi bất
 *     kỳ chiều nào thì key không khớp nữa ⇒ UI tự động thấy "hidden" kể cả khi
 *     một trigger xoá nào đó chưa kịp chạy. Đây là phần đúng-theo-cấu-trúc.
 *  2. **Trigger xoá.** Các listener ở `guards.ts` chủ động dọn. Đây là phần vệ
 *     sinh — nó rút ngắn thời gian plaintext nằm trong heap, kể cả khi tab được
 *     bfcache khôi phục nguyên trạng.
 *
 * `generation` là hàng rào chống race: mọi lần xoá đều tăng nó, và một reveal
 * đang bay xong sau đó sẽ bị bỏ kết quả thay vì ghi plaintext của account cũ.
 */

export const REVEAL_TTL_MS = 5 * 60 * 1000;

export type RevealPhase =
  | "MASKED"
  | "SDK_INITIALIZING"
  | "ACL_CHECKING"
  | "AWAITING_EIP712_SIGNATURE"
  | "DECRYPTING"
  | "REVEALED";

export type RevealNoticeKind = "rejected" | "expired" | "stale-handle" | "nothing-to-reveal" | "error";

export interface RevealNotice {
  kind: RevealNoticeKind;
  title: string;
  detail: string;
  /** Lỗi đã phân loại, nếu notice này đến từ một exception. */
  error?: PotError;
}

export interface RevealedEntry {
  value: bigint;
  expiresAt: number;
}

export interface RevealFlight {
  phase: Exclude<RevealPhase, "MASKED" | "REVEALED">;
  /** Key đang được mở — dùng để card biết spinner thuộc về mình. */
  keys: readonly string[];
}

export interface RevealSnapshot {
  entries: ReadonlyMap<string, RevealedEntry>;
  flight: RevealFlight | null;
  notice: RevealNotice | null;
  /** Hạn sớm nhất trong `entries` — RevealSessionStrip đếm ngược từ đây. */
  expiresAt: number | null;
}

export const REVEAL_SERVER_SNAPSHOT: RevealSnapshot = Object.freeze({
  entries: new Map<string, RevealedEntry>(),
  flight: null,
  notice: null,
  expiresAt: null,
});

export const revealStore = createExternalStore<RevealSnapshot>(REVEAL_SERVER_SNAPSHOT, REVEAL_SERVER_SNAPSHOT);

let generation = 0;
let ttlTimer: ReturnType<typeof setTimeout> | undefined;

export function currentGeneration(): number {
  return generation;
}

export function revealKey(chainId: number, contract: string, account: string, handle: string): string {
  return `${chainId}:${contract.toLowerCase()}:${account.toLowerCase()}:${handle.toLowerCase()}`;
}

export function setFlight(flight: RevealFlight | null): void {
  revealStore.set((prev) => ({ ...prev, flight }));
}

export function setNotice(notice: RevealNotice | null): void {
  revealStore.set((prev) => ({ ...prev, notice, flight: null }));
}

/**
 * Ghi kết quả decrypt. Bỏ qua nếu generation đã đổi giữa chừng — người dùng đã
 * đổi account/chain hoặc bấm Hide trong lúc relayer đang chạy.
 */
export function commitReveals(atGeneration: number, values: ReadonlyMap<string, bigint>): boolean {
  if (atGeneration !== generation) return false;
  const expiresAt = Date.now() + REVEAL_TTL_MS;
  revealStore.set((prev) => {
    const entries = new Map(prev.entries);
    for (const [key, value] of values) entries.set(key, { value, expiresAt });
    return { entries, flight: null, notice: null, expiresAt: earliestExpiry(entries) };
  });
  armTtl();
  return true;
}

/** Đọc một giá trị đã mở. Hết hạn thì coi như chưa mở — không chờ timer. */
export function readReveal(snapshot: RevealSnapshot, key: string, now: number = Date.now()): bigint | undefined {
  const entry = snapshot.entries.get(key);
  if (!entry || entry.expiresAt <= now) return undefined;
  return entry.value;
}

export type ClearReason = "hide" | "ttl" | "account-change" | "chain-change" | "tab-hidden" | "handle-change";

/**
 * Xoá vì lý do nào thì nói ra, xoá vì lý do nào thì im lặng.
 *
 * Hết hạn và handle cũ là hai việc người dùng cần được giải thích — nếu không
 * thì con số vừa biến mất trông như bug. Đổi account/chain/ẩn tab thì không:
 * chính người dùng vừa làm việc đó, một banner ở đây chỉ là tiếng ồn.
 */
const CLEAR_NOTICE: Partial<Record<ClearReason, RevealNotice>> = {
  ttl: {
    kind: "expired",
    title: "Your reveal session expired",
    detail: "Values are hidden again after five minutes. Reveal them again whenever you need to.",
  },
  "handle-change": {
    kind: "stale-handle",
    title: "Your position changed",
    detail: "A newer transaction replaced the encrypted value you had open. Reveal again to see the current one.",
  },
};

export function clearReveals(reason: ClearReason): void {
  generation += 1;
  if (ttlTimer !== undefined) {
    clearTimeout(ttlTimer);
    ttlTimer = undefined;
  }
  const notice = CLEAR_NOTICE[reason] ?? null;
  revealStore.set((prev) =>
    prev.entries.size === 0 && prev.flight === null && prev.notice === null && notice === null
      ? prev
      : { entries: new Map(), flight: null, notice, expiresAt: null },
  );
}

/**
 * Một timer duy nhất, luôn nhắm tới hạn sớm nhất và tự lên dây lại.
 * Nhiều timer song song là cách chắc chắn để bỏ sót một cái khi component unmount.
 */
export function armTtl(): void {
  if (ttlTimer !== undefined) clearTimeout(ttlTimer);
  const { expiresAt } = revealStore.get();
  if (expiresAt === null) {
    ttlTimer = undefined;
    return;
  }
  const delay = Math.max(0, expiresAt - Date.now());
  ttlTimer = setTimeout(() => {
    const now = Date.now();
    const snapshot = revealStore.get();
    const survivors = new Map([...snapshot.entries].filter(([, e]) => e.expiresAt > now));
    if (survivors.size === 0) {
      clearReveals("ttl");
      return;
    }
    revealStore.set({ ...snapshot, entries: survivors, expiresAt: earliestExpiry(survivors) });
    armTtl();
  }, delay);
}

function earliestExpiry(entries: ReadonlyMap<string, RevealedEntry>): number | null {
  let min: number | null = null;
  for (const { expiresAt } of entries.values()) min = min === null ? expiresAt : Math.min(min, expiresAt);
  return min;
}

/** Chỉ dùng trong test. */
export function __resetRevealStoreForTests(): void {
  if (ttlTimer !== undefined) clearTimeout(ttlTimer);
  ttlTimer = undefined;
  generation = 0;
  revealStore.set({ entries: new Map(), flight: null, notice: null, expiresAt: null });
}
