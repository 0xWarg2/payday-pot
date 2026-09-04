"use client";

import { useMemo } from "react";

import { SEPOLIA_CHAIN_ID } from "../chain/rpc";
import { useStore } from "../store/external-store";
import { walletStore } from "../wallet/store";
import { chainHistoryStore, type ChainHistorySnapshot } from "./chain-history";
import { mergeHistory, type HistoryItem } from "./history";
import { txRecordsFor, txStore } from "./store";

export interface MergedHistory {
  items: HistoryItem[];
  chain: ChainHistorySnapshot;
  address: string | null;
}

/** Lịch sử gộp browser + chain cho ví đang kết nối (hoặc chỉ browser khi chưa có ví). */
export function useMergedHistory(): MergedHistory {
  const tx = useStore(txStore);
  const chain = useStore(chainHistoryStore);
  const address = useStore(walletStore).address;
  const items = useMemo(
    () => mergeHistory(txRecordsFor(tx, SEPOLIA_CHAIN_ID), tx.status, tx.minedAt, chain.items),
    [tx, chain.items],
  );
  return { items, chain, address };
}
