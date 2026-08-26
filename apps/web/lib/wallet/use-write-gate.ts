"use client";

import { isSepolia } from "../chain/rpc";
import { potReadsStore } from "../pot/reads";
import { useStore } from "../store/external-store";
import { walletStore } from "./store";

export type WriteBlock = "wallet-missing" | "disconnected" | "wrong-network" | "not-deployed" | null;

export interface WriteGate {
  ready: boolean;
  block: WriteBlock;
  /** Câu ngắn để đặt vào `title` của nút bị vô hiệu hoá. */
  reason: string | null;
}

export interface WriteGateOptions {
  /**
   * Hành động này có cần PayDayPot đã lên chain không. Mặc định có.
   *
   * Đặt `false` cho các tx chỉ đụng tới token: faucet mint, approve, wrap. Ba
   * cái đó nói chuyện với USDCMock và cUSDC — hai contract đã sống trên Sepolia
   * từ trước và hoàn toàn không biết PayDayPot tồn tại. Chặn chúng vì pool chưa
   * deploy là khoá đúng những bước chuẩn bị mà người dùng cần làm *trước* khi
   * pool có mặt.
   */
  requiresPot?: boolean;
}

const REASONS: Record<NonNullable<WriteBlock>, string> = {
  "wallet-missing": "You need a browser wallet to sign transactions.",
  disconnected: "Connect your wallet first.",
  "wrong-network": "Switch your wallet to Sepolia first.",
  "not-deployed": "The pool is not live on this network yet.",
};

/**
 * Điều kiện để một nút GỬI được.
 *
 * Đọc thì không cần cổng này — read luôn đi qua RPC Sepolia cố định, nên
 * dashboard vẫn hiển thị đầy đủ khi ví đang đứng ở mạng khác. Chỉ hành động
 * mới bị chặn, và chặn thì phải kèm lý do đọc được: một nút xám không giải
 * thích gì là cách nhanh nhất để người dùng nghĩ app hỏng (R8).
 */
export function useWriteGate({ requiresPot = true }: WriteGateOptions = {}): WriteGate {
  const wallet = useStore(walletStore);
  const reads = useStore(potReadsStore);

  const block: WriteBlock =
    wallet.hasProvider === false
      ? "wallet-missing"
      : wallet.status !== "connected"
        ? "disconnected"
        : !isSepolia(wallet.chainId)
          ? "wrong-network"
          : requiresPot && reads.deployment !== "ready"
            ? "not-deployed"
            : null;

  return { ready: block === null, block, reason: block === null ? null : REASONS[block] };
}
