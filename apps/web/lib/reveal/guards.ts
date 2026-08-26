"use client";

import { walletStore } from "../wallet/store";
import { clearReveals } from "./store";

/**
 * Các trigger xoá reveal cache (PRIVACY §1).
 *
 * Danh sách này rộng hơn spec §15.2 một mục — `visibilitychange`. Lý do: bfcache
 * có thể khôi phục nguyên vẹn JS heap khi người dùng bấm Back, nên "reload xoá
 * hết" là một giả định sai. Xoá ngay lúc tab bị ẩn đóng luôn lỗ đó, và tiện thể
 * xử lý cả trường hợp tầm thường hơn: người dùng chuyển sang tab khác rồi bỏ đi
 * với con số còn nằm trên màn hình.
 */
export function installRevealGuards(): () => void {
  if (typeof window === "undefined") return () => {};

  let lastAddress = walletStore.get().address;
  let lastChainId = walletStore.get().chainId;

  const unsubscribeWallet = walletStore.subscribe(() => {
    const { address, chainId } = walletStore.get();
    if (address !== lastAddress) {
      lastAddress = address;
      lastChainId = chainId;
      clearReveals("account-change");
      return;
    }
    if (chainId !== lastChainId) {
      lastChainId = chainId;
      clearReveals("chain-change");
    }
  });

  const onVisibility = (): void => {
    if (document.visibilityState === "hidden") clearReveals("tab-hidden");
  };
  const onPageHide = (): void => clearReveals("tab-hidden");

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);

  return () => {
    unsubscribeWallet();
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onPageHide);
  };
}
