"use client";

import { createExternalStore } from "../store/external-store";
import { STORAGE_KEYS, readJson, registerValidator, writeJson } from "../storage";

/**
 * Transaction center.
 *
 * HÌNH DẠNG PERSIST LÀ MỘT HỢP ĐỒNG, không phải tiện tay: đúng năm field dưới
 * đây và không thêm gì nữa.
 *
 *  - KHÔNG amount. Kể cả amount "public" như số USDC đem đi wrap — nó suy ra
 *    được vị thế, và localStorage sống lâu hơn tab.
 *  - KHÔNG `unwrapRequestId`. Trên bản cUSDC live, requestId CHÍNH LÀ ciphertext
 *    handle của số đã burn (COMPATIBILITY_NOTES quirk #23). Ghi nó xuống đĩa là
 *    ghi một handle nhạy cảm xuống đĩa. Resume một unwrap thì quét log
 *    `UnwrapRequested` theo địa chỉ — xem `pending-unwrap.ts`.
 *  - KHÔNG có kind `"unwrap"`. App không tự unwrap; một unwrap treo hầu như luôn
 *    đến từ ngoài app, nên nó được phát hiện từ chain chứ không từ đĩa. Một kind
 *    không ai ghi là một nhánh UI không ai chạy.
 *  - `status` cũng KHÔNG persist: nó suy ra được từ receipt, nên giữ trong bộ
 *    nhớ tab và tính lại sau reload.
 */
export type TxAction =
  | "faucet-mint"
  | "approve"
  | "wrap"
  | "deposit"
  | "finalize-unwrap"
  | "claim"
  | "withdraw"
  | "fund-prize"
  | "begin-snapshot"
  | "snapshot"
  | "request-random"
  | "select"
  | "start-new-epoch";

export interface TxRecord {
  chainId: number;
  action: TxAction;
  txHash: string;
  /** epoch là dữ liệu công khai; bigint serialize thành chuỗi thập phân. */
  epochId?: string;
  createdAt: number;
}

export type TxStatus = "pending" | "success" | "reverted" | "unknown";

export interface TxSnapshot {
  records: readonly TxRecord[];
  /** Chỉ sống trong bộ nhớ tab. */
  status: ReadonlyMap<string, TxStatus>;
  /**
   * Block đã mine, theo txHash — cũng CHỈ trong bộ nhớ tab. Có nó để hàng ghi
   * từ trình duyệt và hàng đọc từ chain (`chain-history.ts`) sắp cùng một trục;
   * không persist vì receipt trả lại nó miễn phí ở lần đối chiếu sau.
   */
  minedAt: ReadonlyMap<string, number>;
}

const TX_ACTIONS: readonly string[] = [
  "faucet-mint",
  "approve",
  "wrap",
  "deposit",
  "finalize-unwrap",
  "claim",
  "withdraw",
  "fund-prize",
  "begin-snapshot",
  "snapshot",
  "request-random",
  "select",
  "start-new-epoch",
];

const MAX_RECORDS = 25;

export const TX_SERVER_SNAPSHOT: TxSnapshot = Object.freeze({
  records: Object.freeze([]),
  status: new Map<string, TxStatus>(),
  minedAt: new Map<string, number>(),
});

export const txStore = createExternalStore<TxSnapshot>(TX_SERVER_SNAPSHOT, TX_SERVER_SNAPSHOT);

/** Đúng 5 key, không hơn — đây là chỗ hợp đồng persist được thực thi. */
export function isTxRecord(value: unknown): value is TxRecord {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  const keys = Object.keys(r);
  if (keys.some((k) => !["chainId", "action", "txHash", "epochId", "createdAt"].includes(k))) return false;
  if (typeof r["chainId"] !== "number") return false;
  if (typeof r["action"] !== "string" || !TX_ACTIONS.includes(r["action"])) return false;
  if (typeof r["txHash"] !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(r["txHash"])) return false;
  if (r["epochId"] !== undefined && !(typeof r["epochId"] === "string" && /^\d+$/.test(r["epochId"]))) return false;
  if (typeof r["createdAt"] !== "number") return false;
  return true;
}

function isTxRecordArray(value: unknown): value is TxRecord[] {
  return Array.isArray(value) && value.every(isTxRecord);
}

registerValidator(STORAGE_KEYS.tx, isTxRecordArray);

export function loadTxRecords(): void {
  const records = readJson(STORAGE_KEYS.tx, isTxRecordArray) ?? [];
  txStore.set({ records, status: new Map(), minedAt: new Map() });
}

export function recordTx(record: TxRecord): void {
  if (!isTxRecord(record)) throw new TypeError("Refused to record a transaction with an unexpected shape");
  txStore.set((prev) => {
    const records = [record, ...prev.records.filter((r) => r.txHash !== record.txHash)].slice(0, MAX_RECORDS);
    writeJson(STORAGE_KEYS.tx, records);
    const status = new Map(prev.status);
    status.set(record.txHash, "pending");
    return { ...prev, records, status };
  });
}

export function setTxStatus(txHash: string, next: TxStatus, blockNumber?: number): void {
  txStore.set((prev) => {
    const sameBlock = blockNumber === undefined || prev.minedAt.get(txHash) === blockNumber;
    if (prev.status.get(txHash) === next && sameBlock) return prev;
    const status = new Map(prev.status);
    status.set(txHash, next);
    if (sameBlock) return { ...prev, status };
    const minedAt = new Map(prev.minedAt);
    minedAt.set(txHash, blockNumber);
    return { ...prev, status, minedAt };
  });
}

export function txRecordsFor(snapshot: TxSnapshot, chainId: number | null, action?: TxAction): readonly TxRecord[] {
  return snapshot.records.filter((r) => (chainId === null || r.chainId === chainId) && (!action || r.action === action));
}
