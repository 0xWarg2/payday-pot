"use client";

import { useCallback, useMemo } from "react";
import { HIDDEN_HANDLE } from "@payday-pot/sdk";

import { SEPOLIA_CHAIN_ID } from "../chain/rpc";
import type { ConfidentialView } from "../format";
import { potReadsStore } from "../pot/reads";
import { useStore } from "../store/external-store";
import { walletStore } from "../wallet/store";
import { revealHandles, type RevealTarget } from "./reveal";
import {
  clearReveals,
  readReveal,
  revealKey,
  revealStore,
  setNotice,
  type RevealFlight,
  type RevealNotice,
} from "./store";

/**
 * Handle → một trong ba trạng thái hiển thị.
 *
 * `chainId` dùng để khoá cache là **Sepolia cố định**, không phải chain hiện tại
 * của ví. Handle sống trên Sepolia bất kể ví đang đứng ở đâu; lấy chain của ví
 * làm khoá sẽ khiến cùng một giá trị có hai key khác nhau và reveal "biến mất"
 * một cách khó hiểu khi ví nhảy mạng rồi nhảy về.
 */
export function useConfidentialView(handle: string | null | undefined): ConfidentialView {
  const reveal = useStore(revealStore);
  const wallet = useStore(walletStore);
  const reads = useStore(potReadsStore);

  const contract = reads.config?.address ?? null;
  const account = wallet.address;

  return useMemo<ConfidentialView>(() => {
    if (handle === HIDDEN_HANDLE) return { kind: "unavailable" };
    if (!handle || !contract || !account) return { kind: "hidden" };
    const value = readReveal(reveal, revealKey(SEPOLIA_CHAIN_ID, contract, account, handle));
    return value === undefined ? { kind: "hidden" } : { kind: "revealed", value };
  }, [handle, contract, account, reveal]);
}

export interface RevealController {
  flight: RevealFlight | null;
  notice: RevealNotice | null;
  expiresAt: number | null;
  hasOpenReveals: boolean;
  busy: boolean;
  reveal: (targets: readonly RevealTarget[]) => Promise<void>;
  hide: () => void;
  dismissNotice: () => void;
}

export function useRevealController(): RevealController {
  const snapshot = useStore(revealStore);
  const wallet = useStore(walletStore);
  const reads = useStore(potReadsStore);

  const contract = reads.config?.address ?? null;
  const account = wallet.address;

  const reveal = useCallback(
    async (targets: readonly RevealTarget[]) => {
      if (!account) {
        setNotice({
          kind: "error",
          title: "Connect your wallet first",
          detail: "Revealing a value needs a signature from the wallet that owns it.",
        });
        return;
      }
      // Ví đã kết nối nhưng chưa có handle nào ⇒ ta CHƯA BIẾT, không phải "không
      // có gì". Gộp hai nhánh này lại thì người dùng bấm Reveal trong lúc read
      // còn đang bay sẽ được bảo là hãy kết nối ví — trong khi ví đang kết nối
      // ngay trên đầu màn hình. Một câu sai còn tệ hơn không nói gì.
      if (!contract || targets.length === 0) {
        setNotice({
          kind: "error",
          title: "Still reading your position",
          detail: "The pool has not answered yet, so there is nothing to open. Try again in a moment.",
        });
        return;
      }
      await revealHandles({ chainId: SEPOLIA_CHAIN_ID, contractAddress: contract, account, targets });
    },
    [contract, account],
  );

  const hide = useCallback(() => clearReveals("hide"), []);
  const dismissNotice = useCallback(() => setNotice(null), []);

  return {
    flight: snapshot.flight,
    notice: snapshot.notice,
    expiresAt: snapshot.expiresAt,
    hasOpenReveals: snapshot.entries.size > 0,
    busy: snapshot.flight !== null,
    reveal,
    hide,
    dismissNotice,
  };
}
