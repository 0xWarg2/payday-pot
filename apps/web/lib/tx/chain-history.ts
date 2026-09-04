"use client";

import { Interface, getAddress, zeroPadValue, type InterfaceAbi, type Log } from "ethers";
import { toPotError, type PotError } from "@payday-pot/sdk";
import { PAYDAY_POT_ABI, getPayDayPotDeployment } from "@payday-pot/shared";

import { SEPOLIA_CHAIN_ID, readProvider } from "../chain/rpc";
import { createExternalStore } from "../store/external-store";

/**
 * Lịch sử của VÍ, đọc từ chain — bổ sung cho lịch sử của TRÌNH DUYỆT (`store.ts`).
 *
 * Bốn event của pool có `user` là indexed topic và KHÔNG mang số tiền
 * (`Registered/Deposited/Withdrawn/PrizeClaimed` — xem ABI), nên một `getLogs`
 * theo địa chỉ trả lời "ví này đã làm gì, ở round nào, tx nào" mà không lộ
 * thêm gì so với explorer. Không backend, không index của riêng app.
 *
 * Ba ràng buộc:
 *  - KHÔNG persist. Không localStorage, không sessionStorage. Đổi máy thì đọc
 *    lại từ chain — đó chính là lý do có file này.
 *  - Đổi account/chain ⇒ snapshot về `loading, []` NGAY (đồng bộ) và
 *    `generation` tăng, để kết quả của lần quét cũ về sau bị bỏ, không ghi
 *    lịch sử của ví A vào màn hình của ví B.
 *  - Lỗi RPC ⇒ `unavailable` nhưng GIỮ những gì đã đọc được. Không bao giờ trả
 *    `[]` giả kèm chữ "Nothing yet" — với lịch sử tiền bạc, "không có" và
 *    "không đọc được" là hai câu khác nhau.
 */
export type ChainAction = "register" | "deposit" | "withdraw" | "claim";

export interface ChainHistoryItem {
  txHash: string;
  action: ChainAction;
  /** Public; bigint serialise thành chuỗi thập phân như `TxRecord.epochId`. */
  epochId: string;
  blockNumber: number;
  logIndex: number;
}

export type ChainHistoryStatus = "idle" | "loading" | "ready" | "unavailable";

export interface ChainHistorySnapshot {
  /** `${chainId}:${address}` đang hiển thị, hoặc null khi chưa có ví. */
  key: string | null;
  status: ChainHistoryStatus;
  items: readonly ChainHistoryItem[];
  /** Block đã quét tới; lần sau quét từ đây trừ `REORG_MARGIN_BLOCKS`. */
  scannedTo: number | null;
  error: PotError | null;
}

export const CHAIN_HISTORY_SERVER_SNAPSHOT: ChainHistorySnapshot = Object.freeze({
  key: null,
  status: "idle",
  items: Object.freeze([]),
  scannedTo: null,
  error: null,
});

export const chainHistoryStore = createExternalStore<ChainHistorySnapshot>(
  CHAIN_HISTORY_SERVER_SNAPSHOT,
  CHAIN_HISTORY_SERVER_SNAPSHOT,
);

/**
 * Cửa sổ mỗi `getLogs`. publicnode từ chối ở 100k và nhận ở 50k (đo 02/09,
 * `pending-unwrap.ts`); 40k để chừa biên. Quét TUẦN TỰ, không song song — RPC
 * công cộng rate-limit theo request, và lịch sử không phải thứ cần nhanh.
 */
export const HISTORY_CHUNK_BLOCKS = 40_000;
/** Quét lại vài block cuối mỗi lần để một reorg nông không làm mất log. */
export const REORG_MARGIN_BLOCKS = 12;

const EVENT_TO_ACTION: Record<string, ChainAction> = {
  Registered: "register",
  Deposited: "deposit",
  Withdrawn: "withdraw",
  PrizeClaimed: "claim",
};

let iface: Interface | undefined;
function abi(): Interface {
  iface ??= new Interface(PAYDAY_POT_ABI as unknown as InterfaceAbi);
  return iface;
}

function topic0s(): string[] {
  return Object.keys(EVENT_TO_ACTION)
    .map((name) => abi().getEvent(name)?.topicHash)
    .filter((t): t is string => typeof t === "string");
}

let generation = 0;
let inflight: Promise<void> | null = null;

export function historyKey(chainId: number, address: string): string {
  return `${chainId}:${address.toLowerCase()}`;
}

function reset(): void {
  generation += 1;
  inflight = null;
  if (chainHistoryStore.get() !== CHAIN_HISTORY_SERVER_SNAPSHOT) chainHistoryStore.set(CHAIN_HISTORY_SERVER_SNAPSHOT);
}

/**
 * Đọc/cập nhật lịch sử cho `address`. Gọi mỗi vòng poll: lần đầu quét từ
 * `deployBlock`, các lần sau chỉ quét phần mới (rẻ: một `eth_blockNumber` và
 * một `getLogs` ngắn) và giữ trạng thái `ready` yên — không nhấp nháy sang
 * `loading` mỗi 15 giây.
 */
export function refreshChainHistory(address: string | null): Promise<void> {
  let deployment: ReturnType<typeof getPayDayPotDeployment>;
  try {
    deployment = getPayDayPotDeployment();
  } catch {
    reset();
    return Promise.resolve();
  }
  if (address === null) {
    reset();
    return Promise.resolve();
  }
  let checksummed: string;
  try {
    checksummed = getAddress(address);
  } catch {
    reset();
    return Promise.resolve();
  }

  const key = historyKey(SEPOLIA_CHAIN_ID, checksummed);
  const prev = chainHistoryStore.get();
  if (prev.key !== key) {
    generation += 1;
    inflight = null;
    chainHistoryStore.set({ key, status: "loading", items: [], scannedTo: null, error: null });
  } else if (inflight) {
    return inflight;
  }

  const gen = generation;
  const run = scan(gen, key, checksummed, deployment.address, deployment.deployBlock).finally(() => {
    if (inflight === run) inflight = null;
  });
  inflight = run;
  return run;
}

/** "Try again": quên `scannedTo` rồi quét lại từ đầu. */
export function retryChainHistory(address: string | null): Promise<void> {
  const prev = chainHistoryStore.get();
  if (prev.key !== null) chainHistoryStore.set({ ...prev, status: "loading", scannedTo: null, error: null });
  inflight = null;
  return refreshChainHistory(address);
}

async function scan(gen: number, key: string, user: string, pot: string, deployBlock: number): Promise<void> {
  const provider = readProvider();
  const start = chainHistoryStore.get();
  const from = start.scannedTo === null ? deployBlock : Math.max(deployBlock, start.scannedTo - REORG_MARGIN_BLOCKS);
  const found: ChainHistoryItem[] = [];
  try {
    const head = await provider.getBlockNumber();
    for (let lo = from; lo <= head; lo += HISTORY_CHUNK_BLOCKS) {
      if (gen !== generation) return;
      const hi = Math.min(head, lo + HISTORY_CHUNK_BLOCKS - 1);
      const logs = await provider.getLogs({
        address: pot,
        fromBlock: lo,
        toBlock: hi,
        // topic0 ∈ bốn event; topic1 = user (indexed đầu tiên ở cả bốn).
        topics: [topic0s(), zeroPadValue(user, 32)],
      });
      for (const log of logs) {
        const item = decode(log);
        if (item) found.push(item);
      }
    }
    if (gen !== generation) return;
    chainHistoryStore.set((prev) => {
      if (prev.key !== key) return prev;
      const byId = new Map(prev.items.map((i) => [`${i.txHash}:${i.logIndex}`, i]));
      for (const item of found) byId.set(`${item.txHash}:${item.logIndex}`, item);
      return { key, status: "ready", items: [...byId.values()], scannedTo: head, error: null };
    });
  } catch (e) {
    if (gen !== generation) return;
    // Giữ items/scannedTo cũ: "không đọc được" không phải "không có".
    chainHistoryStore.set((prev) => (prev.key === key ? { ...prev, status: "unavailable", error: toPotError(e) } : prev));
  }
}

function decode(log: Log): ChainHistoryItem | null {
  const parsed = abi().parseLog({ topics: [...log.topics], data: log.data });
  if (!parsed) return null;
  const action = EVENT_TO_ACTION[parsed.name];
  if (!action) return null;
  const epoch = parsed.args["epochId"] as bigint | undefined;
  return {
    txHash: log.transactionHash,
    action,
    epochId: epoch === undefined ? "" : epoch.toString(),
    blockNumber: Number(log.blockNumber),
    logIndex: Number(log.index),
  };
}
