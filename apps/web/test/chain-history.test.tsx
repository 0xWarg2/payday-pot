/**
 * Lịch sử đọc từ chain — phần kiểm bằng máy.
 *
 *  1. Filter đúng hình: một `getLogs` mỗi chunk, topic0 = bốn event, topic1 = ví.
 *  2. Chunk 40k tuần tự, liền kề, không vượt head.
 *  3. `Registered` + `Deposited` cùng tx ⇒ MỘT hàng "Deposited".
 *  4. Lỗi RPC ⇒ `unavailable` nhưng GIỮ items; lần sau xanh ⇒ `ready`.
 *  5. Đổi ví ⇒ snapshot về `loading, []` ngay, và kết quả ví cũ về sau bị bỏ.
 *  6. Không gì rơi xuống đĩa: localStorage/sessionStorage không đổi, item đúng 5 field.
 */
import { Interface, getAddress, zeroPadValue, type InterfaceAbi } from "ethers";
import { PAYDAY_POT_ABI, getPayDayPotDeployment } from "@payday-pot/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const USER_A = getAddress(`0x${"a1".repeat(20)}`);
const USER_B = getAddress(`0x${"b2".repeat(20)}`);
const TX1 = `0x${"c1".repeat(32)}`;
const TX2 = `0x${"c2".repeat(32)}`;

const iface = new Interface(PAYDAY_POT_ABI as unknown as InterfaceAbi);
function log(event: string, user: string, epoch: bigint, txHash: string, blockNumber: number, index: number) {
  const { data, topics } = iface.encodeEventLog(iface.getEvent(event)!, [user, epoch]);
  return { data, topics, transactionHash: txHash, blockNumber, index };
}

const deployment = getPayDayPotDeployment();
const chain = {
  head: deployment.deployBlock + 100,
  logs: [] as ReturnType<typeof log>[],
  fail: false,
  gate: null as null | (() => Promise<void>),
};
const getBlockNumber = vi.fn(async () => chain.head);
const getLogs = vi.fn(async (_filter: unknown) => {
  if (chain.gate) await chain.gate();
  if (chain.fail) throw new Error("exceed maximum block range: 50000");
  return chain.logs;
});

vi.mock("@/lib/chain/rpc", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/chain/rpc")>()),
  readProvider: () => ({ getBlockNumber, getLogs }),
}));

const mod = await import("@/lib/tx/chain-history");
const { chainHistoryStore, refreshChainHistory, retryChainHistory, CHAIN_HISTORY_SERVER_SNAPSHOT, HISTORY_CHUNK_BLOCKS, REORG_MARGIN_BLOCKS } = mod;
const { mergeHistory } = await import("@/lib/tx/history");

beforeEach(() => {
  chain.head = deployment.deployBlock + 100;
  chain.logs = [];
  chain.fail = false;
  chain.gate = null;
  getLogs.mockClear();
  getBlockNumber.mockClear();
  chainHistoryStore.set(CHAIN_HISTORY_SERVER_SNAPSHOT);
  window.localStorage.clear();
  window.sessionStorage.clear();
});
afterEach(() => void refreshChainHistory(null));

describe("scan shape", () => {
  it("asks for the four pool events of exactly this wallet, from deployBlock", async () => {
    await refreshChainHistory(USER_A);
    expect(getLogs).toHaveBeenCalledTimes(1);
    const filter = getLogs.mock.calls[0]![0] as { address: string; fromBlock: number; toBlock: number; topics: [string[], string] };
    expect(filter.address).toBe(deployment.address);
    expect(filter.fromBlock).toBe(deployment.deployBlock);
    expect(filter.toBlock).toBe(chain.head);
    expect(filter.topics[0]).toHaveLength(4);
    for (const name of ["Registered", "Deposited", "Withdrawn", "PrizeClaimed"]) {
      expect(filter.topics[0]).toContain(iface.getEvent(name)!.topicHash);
    }
    expect(filter.topics[1]).toBe(zeroPadValue(USER_A, 32));
    expect(chainHistoryStore.get().status).toBe("ready");
  });

  it("walks a long range in adjacent chunks of at most 40k blocks, in order", async () => {
    chain.head = deployment.deployBlock + 100_000;
    await refreshChainHistory(USER_A);
    const ranges = getLogs.mock.calls.map((c) => c[0] as { fromBlock: number; toBlock: number });
    expect(ranges).toHaveLength(3);
    expect(ranges[0]!.fromBlock).toBe(deployment.deployBlock);
    for (let i = 0; i < ranges.length; i++) {
      expect(ranges[i]!.toBlock - ranges[i]!.fromBlock + 1).toBeLessThanOrEqual(HISTORY_CHUNK_BLOCKS);
      if (i > 0) expect(ranges[i]!.fromBlock).toBe(ranges[i - 1]!.toBlock + 1);
    }
    expect(ranges.at(-1)!.toBlock).toBe(chain.head);
    expect(chainHistoryStore.get().scannedTo).toBe(chain.head);
  });

  it("refreshes incrementally from scannedTo minus the reorg margin and dedupes", async () => {
    chain.logs = [log("Deposited", USER_A, 3n, TX1, deployment.deployBlock + 10, 0)];
    await refreshChainHistory(USER_A);
    chain.head += 50;
    await refreshChainHistory(USER_A);
    const second = getLogs.mock.calls[1]![0] as { fromBlock: number };
    expect(second.fromBlock).toBe(chain.head - 50 - REORG_MARGIN_BLOCKS);
    expect(chainHistoryStore.get().items).toHaveLength(1);
    expect(chainHistoryStore.get().status).toBe("ready");
  });
});

describe("merging with the browser's own records", () => {
  it("collapses Registered + Deposited from one tx into a single Deposited row", () => {
    const items = [
      log("Registered", USER_A, 3n, TX1, 100, 0),
      log("Deposited", USER_A, 3n, TX1, 100, 1),
    ].map((l, i) => ({ txHash: TX1, action: i === 0 ? ("register" as const) : ("deposit" as const), epochId: "3", blockNumber: l.blockNumber, logIndex: l.index }));
    const merged = mergeHistory([], new Map(), new Map(), items);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ action: "deposit", epochId: "3", status: "success", source: "chain" });
  });

  it("keeps a browser-only record at its own status, and lets a mined log settle a pending one", () => {
    const local = [
      { chainId: 11155111, action: "approve" as const, txHash: TX2, createdAt: 5 },
      { chainId: 11155111, action: "deposit" as const, txHash: TX1, createdAt: 4, epochId: "3" },
    ];
    const chainItems = [{ txHash: TX1, action: "deposit" as const, epochId: "3", blockNumber: 100, logIndex: 0 }];
    const merged = mergeHistory(local, new Map([[TX2, "pending"], [TX1, "pending"]]), new Map(), chainItems);
    expect(merged.map((m) => m.txHash)).toEqual([TX2, TX1]); // chưa vào block đứng trước
    expect(merged[0]).toMatchObject({ status: "pending", source: "browser" });
    expect(merged[1]).toMatchObject({ status: "success", source: "both", createdAt: 4 });
  });
});

describe("failure and identity", () => {
  it("goes unavailable on an RPC error but keeps what it already read, then recovers", async () => {
    chain.logs = [log("Deposited", USER_A, 3n, TX1, deployment.deployBlock + 10, 0)];
    await refreshChainHistory(USER_A);
    chain.fail = true;
    await retryChainHistory(USER_A);
    let snap = chainHistoryStore.get();
    expect(snap.status).toBe("unavailable");
    expect(snap.items).toHaveLength(1);
    expect(snap.error).not.toBeNull();
    chain.fail = false;
    await retryChainHistory(USER_A);
    snap = chainHistoryStore.get();
    expect(snap.status).toBe("ready");
    expect(snap.error).toBeNull();
  });

  it("switching wallets clears synchronously and discards the old wallet's late result", async () => {
    let release!: () => void;
    chain.gate = () => new Promise<void>((r) => { release = r; });
    chain.logs = [log("Deposited", USER_A, 3n, TX1, deployment.deployBlock + 10, 0)];
    const first = refreshChainHistory(USER_A);
    expect(chainHistoryStore.get()).toMatchObject({ status: "loading", items: [] });
    // Để A đi qua getBlockNumber và đứng lại trong getLogs (gate) trước khi đổi ví.
    await new Promise((r) => setTimeout(r, 0));
    expect(getLogs).toHaveBeenCalledTimes(1);

    chain.gate = null;
    const second = refreshChainHistory(USER_B);
    expect(chainHistoryStore.get()).toMatchObject({ status: "loading", items: [], key: `11155111:${USER_B.toLowerCase()}` });
    release();
    await Promise.all([first, second]);
    const snap = chainHistoryStore.get();
    expect(snap.key).toBe(`11155111:${USER_B.toLowerCase()}`);
    // B nhận đúng log của lần quét B (mock trả cùng logs), không phải một bản ghi kép từ A.
    expect(snap.items).toHaveLength(1);
  });

  it("writes nothing to disk and keeps items to exactly five public fields", async () => {
    const before = Object.keys(window.localStorage);
    chain.logs = [log("PrizeClaimed", USER_A, 2n, TX2, deployment.deployBlock + 20, 3)];
    await refreshChainHistory(USER_A);
    expect(Object.keys(window.localStorage)).toEqual(before);
    expect(window.sessionStorage.length).toBe(0);
    const item = chainHistoryStore.get().items[0]!;
    expect(Object.keys(item).sort()).toEqual(["action", "blockNumber", "epochId", "logIndex", "txHash"]);
    expect(item).toMatchObject({ action: "claim", epochId: "2", txHash: TX2 });
  });

  it("with no wallet, resets to the frozen server snapshot", async () => {
    await refreshChainHistory(USER_A);
    await refreshChainHistory(null);
    expect(chainHistoryStore.get()).toBe(CHAIN_HISTORY_SERVER_SNAPSHOT);
  });
});
