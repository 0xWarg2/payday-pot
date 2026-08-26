"use client";

import type { FheInstance } from "@/types/global";

import { SEPOLIA_RPC } from "../chain/rpc";
import { createExternalStore } from "../store/external-store";

/**
 * Relayer SDK instance — singleton ở tầng module, KHÔNG phải React provider.
 *
 * `initSDK()` nạp WASM và là side-effect toàn cục chạy đúng một lần cho cả tab;
 * gói nó vào context chỉ thêm một cây re-render quanh một thứ vốn không đổi.
 * Component nào cần thì `await ensureFheInstance()` tại chỗ.
 *
 * Bốn cái bẫy dưới đây đã trả giá ở spike Day 1 — đừng "dọn dẹp" chúng:
 *   1. `initSDK` phải được trỏ đường dẫn WASM tường minh; sibling resolution qua
 *      `document.currentScript` không đúng khi Next phục vụ từ route lồng nhau.
 *   2. `createInstance` dùng RPC Sepolia CỐ ĐỊNH, không bao giờ `window.ethereum`
 *      — ví đứng ở mạng khác lúc init sẽ cho CALL_EXCEPTION (R8).
 *   3. Address truyền vào SDK phải checksummed.
 *   4. `start`/`days` là number, và chữ ký phải strip `0x` (xem lib/reveal).
 */

export type FheStatus = "idle" | "loading" | "ready" | "error";

export interface FheHealth {
  status: FheStatus;
  /** Thông điệp ngắn cho banner SdkHealth. Không bao giờ chứa giá trị nào. */
  message: string | null;
}

export const FHE_SERVER_SNAPSHOT: FheHealth = Object.freeze({ status: "idle", message: null });

export const fheHealthStore = createExternalStore<FheHealth>(FHE_SERVER_SNAPSHOT, FHE_SERVER_SNAPSHOT);

let pending: Promise<FheInstance> | null = null;

export function ensureFheInstance(): Promise<FheInstance> {
  pending ??= create().catch((e: unknown) => {
    // Cho phép thử lại: một lần khởi tạo hỏng (mạng chớp, WASM chưa tới) không
    // được khoá vĩnh viễn tính năng reveal của cả tab.
    pending = null;
    fheHealthStore.set({
      status: "error",
      message: "The encryption service did not start. Reveal is unavailable until it does.",
    });
    throw e;
  });
  return pending;
}

async function create(): Promise<FheInstance> {
  fheHealthStore.set({ status: "loading", message: null });
  const sdk = window.relayerSDK;
  if (!sdk) throw new Error("relayerSDK bundle is not loaded");

  await sdk.initSDK({ tfheParams: "/tfhe_bg.wasm", kmsParams: "/kms_lib_bg.wasm" });
  const instance = (await sdk.createInstance({ ...sdk.SepoliaConfig, network: SEPOLIA_RPC })) as FheInstance;

  fheHealthStore.set({
    status: "ready",
    message: crossOriginIsolated ? null : "Cross-origin isolation is off; decryption may be slow.",
  });
  return instance;
}

/** Chỉ dùng trong test — trả module về trạng thái chưa khởi tạo. */
export function __resetFheInstanceForTests(): void {
  pending = null;
  fheHealthStore.set(FHE_SERVER_SNAPSHOT);
}
