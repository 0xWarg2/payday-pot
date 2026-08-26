"use client";

import {
  HIDDEN_HANDLE,
  getPot,
  readAccount,
  readPotConfig,
  readPotState,
  type AccountState,
  type PotConfig,
  type PotError,
  type PotState,
} from "@payday-pot/sdk";
import { ManifestMismatchError, isPayDayPotDeployed } from "@payday-pot/shared";

import { readProvider } from "../chain/rpc";
import { clearReveals, revealKey, revealStore } from "../reveal/store";
import { createExternalStore } from "../store/external-store";
import { classifyReadError } from "./classify-read-error";

/**
 * Trạng thái đọc-được của pot.
 *
 * `deployment` là một cổng riêng chứ không phải một loại lỗi: khi contract chưa
 * lên chain, `getPot()` ném `NotDeployedError` — thứ mà taxonomy cố ý không
 * biết, và nếu để nó rơi vào `classifyError` thì người xem sẽ nhận được
 * "Something went wrong" cho một tình huống hoàn toàn bình thường trong lúc
 * dựng sản phẩm. Nên: kiểm tra manifest TRƯỚC, dựng contract SAU.
 */
export type DeploymentStatus = "not-deployed" | "ready" | "mismatch";

export interface PotReadsSnapshot {
  deployment: DeploymentStatus;
  config: PotConfig | null;
  state: PotState | null;
  /** Toàn handle, chưa decrypt. `null` khi chưa kết nối ví. */
  account: AccountState | null;
  error: PotError | null;
  loading: boolean;
  loadedAt: number | null;
}

export const POT_READS_SERVER_SNAPSHOT: PotReadsSnapshot = Object.freeze({
  deployment: isPayDayPotDeployed() ? ("ready" as const) : ("not-deployed" as const),
  config: null,
  state: null,
  account: null,
  error: null,
  loading: false,
  loadedAt: null,
});

export const potReadsStore = createExternalStore<PotReadsSnapshot>(
  POT_READS_SERVER_SNAPSHOT,
  POT_READS_SERVER_SNAPSHOT,
);

/** Poll 15s: epoch tính bằng ngày, không có gì cần nhanh hơn. */
export const POLL_INTERVAL_MS = 15_000;

export async function refreshPotReads(account: string | null, chainId: number): Promise<void> {
  if (!isPayDayPotDeployed()) {
    // Chính là hằng số đó, không phải một bản sao: manifest không đổi lúc chạy,
    // nên set lại cùng reference sẽ bị `Object.is` chặn và không đánh thức
    // listener nào. Một object mới mỗi 15 giây thì re-render cả cây để nói đúng
    // một điều không hề thay đổi.
    potReadsStore.set(POT_READS_SERVER_SNAPSHOT);
    return;
  }

  potReadsStore.set((prev) => ({ ...prev, loading: true }));
  try {
    const pot = getPot(readProvider());
    const [config, state, accountState] = await Promise.all([
      readPotConfig(pot),
      readPotState(pot),
      account ? readAccount(pot, account) : Promise.resolve(null),
    ]);

    const previous = potReadsStore.get();
    potReadsStore.set({
      deployment: "ready",
      config,
      state,
      account: accountState,
      error: null,
      loading: false,
      loadedAt: Date.now(),
    });

    if (account && accountState) {
      invalidateStaleReveals(previous.account, accountState, chainId, config.address, account);
    }
  } catch (e) {
    if (e instanceof ManifestMismatchError) {
      potReadsStore.set((prev) => ({ ...prev, deployment: "mismatch", loading: false }));
      return;
    }
    potReadsStore.set((prev) => ({ ...prev, error: classifyReadError(e), loading: false }));
  }
}

/**
 * Handle đổi ⇒ giá trị đã mở là của quá khứ.
 *
 * Chỉ xoá khi thật sự có một entry đang mở cho handle CŨ. Xoá vô điều kiện mỗi
 * lần poll sẽ làm reveal session chết sau 15 giây và người dùng sẽ nghĩ TTL
 * 5 phút là nói dối.
 */
function invalidateStaleReveals(
  before: AccountState | null,
  after: AccountState,
  chainId: number,
  contract: string,
  account: string,
): void {
  if (!before) return;
  const pairs: [string, string][] = [
    [before.principal, after.principal],
    [before.twabArea, after.twabArea],
    [before.pendingPrize, after.pendingPrize],
  ];
  const { entries } = revealStore.get();
  for (const [old, next] of pairs) {
    if (old === next || old === HIDDEN_HANDLE) continue;
    if (entries.has(revealKey(chainId, contract, account, old))) {
      clearReveals("handle-change");
      return;
    }
  }
}
