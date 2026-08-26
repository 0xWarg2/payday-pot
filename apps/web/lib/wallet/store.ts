"use client";

import { getAddress } from "ethers";
import type { PotError } from "@payday-pot/sdk";

import { createExternalStore } from "../store/external-store";

export type WalletStatus = "disconnected" | "connecting" | "connected";

export interface WalletSnapshot {
  status: WalletStatus;
  /** Luôn checksummed — relayer-sdk từ chối address lowercase. */
  address: string | null;
  chainId: number | null;
  /** Ví có tồn tại trong trình duyệt không. `null` = chưa biết (chưa mount). */
  hasProvider: boolean | null;
  error: PotError | null;
}

/**
 * Snapshot server: chưa kết nối, không biết gì. Hằng số dùng chung reference
 * (yêu cầu của `useSyncExternalStore`) và đồng thời là bảo đảm rằng HTML do
 * server render không bao giờ chứa address hay chain của ai cả.
 */
export const WALLET_SERVER_SNAPSHOT: WalletSnapshot = Object.freeze({
  status: "disconnected",
  address: null,
  chainId: null,
  hasProvider: null,
  error: null,
});

export const walletStore = createExternalStore<WalletSnapshot>(
  WALLET_SERVER_SNAPSHOT,
  WALLET_SERVER_SNAPSHOT,
);

export function setWallet(patch: Partial<WalletSnapshot>): void {
  walletStore.set((prev) => ({ ...prev, ...patch }));
}

/** Reset về "chưa kết nối" nhưng giữ `hasProvider` (nó là fact về trình duyệt). */
export function resetWallet(): void {
  walletStore.set((prev) => ({ ...WALLET_SERVER_SNAPSHOT, hasProvider: prev.hasProvider }));
}

export function normalizeAccount(raw: unknown): string | null {
  if (typeof raw !== "string" || raw === "") return null;
  try {
    return getAddress(raw);
  } catch {
    return null;
  }
}

export function normalizeChainId(raw: unknown): number | null {
  if (typeof raw === "number") return raw;
  if (typeof raw === "string" && raw !== "") {
    const n = Number.parseInt(raw, raw.startsWith("0x") ? 16 : 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
