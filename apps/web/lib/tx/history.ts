import type { ChainHistoryItem } from "./chain-history";
import type { TxAction, TxRecord, TxStatus } from "./store";

/**
 * Gộp hai nguồn lịch sử thành một danh sách — thuần, không I/O, test được.
 *
 * Nguồn "browser" (`TxRecord`) biết: hành động ĐÚNG như người dùng bấm (kể cả
 * approve/wrap/faucet vốn không phải event của pool), thời điểm gửi, và trạng
 * thái receipt. Nguồn "chain" (`ChainHistoryItem`) biết: mọi tx của ví, ở máy
 * nào cũng thấy, nhưng chỉ bốn event của pool và không có "lúc mấy giờ".
 *
 * Một tx có thể phát NHIỀU log — lần deposit đầu tiên bắn `Registered` rồi
 * `Deposited` — nên gộp theo txHash và lấy hành động "đậm" nhất.
 */
export type HistoryAction = TxAction | "register";

export interface HistoryItem {
  txHash: string;
  action: HistoryAction;
  epochId?: string;
  /** Lúc gửi, chỉ nguồn browser mới biết. */
  createdAt?: number;
  blockNumber?: number;
  logIndex?: number;
  status: TxStatus;
  source: "browser" | "chain" | "both";
}

const CHAIN_PRECEDENCE: Record<ChainHistoryItem["action"], number> = { deposit: 3, withdraw: 2, claim: 1, register: 0 };

export function mergeHistory(
  local: readonly TxRecord[],
  status: ReadonlyMap<string, TxStatus>,
  minedAt: ReadonlyMap<string, number>,
  chain: readonly ChainHistoryItem[],
  limit: number = 100,
): HistoryItem[] {
  const byHash = new Map<string, HistoryItem>();

  // Chain trước: một hàng mỗi txHash, giữ log "đậm" nhất và logIndex cao nhất để sort ổn định.
  for (const item of chain) {
    const prev = byHash.get(item.txHash);
    if (!prev) {
      byHash.set(item.txHash, {
        txHash: item.txHash,
        action: item.action,
        epochId: item.epochId || undefined,
        blockNumber: item.blockNumber,
        logIndex: item.logIndex,
        status: "success",
        source: "chain",
      });
      continue;
    }
    const prevRank = CHAIN_PRECEDENCE[prev.action as ChainHistoryItem["action"]] ?? -1;
    if (CHAIN_PRECEDENCE[item.action] > prevRank) prev.action = item.action;
    if (item.logIndex > (prev.logIndex ?? -1)) prev.logIndex = item.logIndex;
    if (!prev.epochId && item.epochId) prev.epochId = item.epochId;
  }

  // Browser sau: thắng về hành động/round/thời điểm; trạng thái thì log đã mine là câu trả lời.
  for (const record of local) {
    const localStatus = status.get(record.txHash) ?? "unknown";
    const onChain = byHash.get(record.txHash);
    if (onChain) {
      onChain.action = record.action;
      onChain.epochId = record.epochId ?? onChain.epochId;
      onChain.createdAt = record.createdAt;
      onChain.status = localStatus === "success" || localStatus === "reverted" ? localStatus : "success";
      onChain.source = "both";
      continue;
    }
    byHash.set(record.txHash, {
      txHash: record.txHash,
      action: record.action,
      epochId: record.epochId,
      createdAt: record.createdAt,
      blockNumber: minedAt.get(record.txHash),
      status: localStatus,
      source: "browser",
    });
  }

  return [...byHash.values()]
    .sort((a, b) => {
      // Chưa vào block đứng trước (mới nhất trước), rồi block giảm dần.
      const aPending = a.blockNumber === undefined;
      const bPending = b.blockNumber === undefined;
      if (aPending !== bPending) return aPending ? -1 : 1;
      if (aPending && bPending) return (b.createdAt ?? 0) - (a.createdAt ?? 0);
      if (a.blockNumber !== b.blockNumber) return (b.blockNumber ?? 0) - (a.blockNumber ?? 0);
      return (b.logIndex ?? 0) - (a.logIndex ?? 0);
    })
    .slice(0, limit);
}
