"use client";

import { useEffect, type ReactNode } from "react";

import { SEPOLIA_CHAIN_ID } from "@/lib/chain/rpc";
import { loadConsent } from "@/lib/onboarding/consent";
import { loadRole } from "@/lib/onboarding/role";
import { POLL_INTERVAL_MS, refreshPotReads } from "@/lib/pot/reads";
import { installRevealGuards } from "@/lib/reveal/guards";
import { useStore } from "@/lib/store/external-store";
import { loadTxRecords } from "@/lib/tx/store";
import { reconcileTxStatuses } from "@/lib/tx/watch";
import { restoreWallet, watchWallet } from "@/lib/wallet/connect";
import { walletStore } from "@/lib/wallet/store";

/**
 * Mọi side-effect toàn cục của app, ở đúng một chỗ.
 *
 * Không phải một React context: không có state nào ở đây cả. Các store là
 * module-level và component tự subscribe; component này chỉ chịu trách nhiệm
 * *bật* chúng lên — khôi phục ví, gắn listener, nạp dữ liệu đã lưu, và cài các
 * guard xoá reveal. Gom lại như vậy để danh sách trigger của PRIVACY §1 nằm
 * trong một file đọc hết được, thay vì rải theo từng màn hình.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  useEffect(() => {
    void restoreWallet();
    loadRole();
    loadConsent();
    loadTxRecords();
    const unwatchWallet = watchWallet();
    const uninstallGuards = installRevealGuards();
    return () => {
      unwatchWallet();
      uninstallGuards();
    };
  }, []);

  const address = useStore(walletStore).address;

  useEffect(() => {
    let cancelled = false;

    const read = (): void => {
      if (cancelled) return;
      void refreshPotReads(address, SEPOLIA_CHAIN_ID);
      void reconcileTxStatuses();
    };

    // Lần đọc ĐẦU chạy vô điều kiện; chỉ vòng lặp mới nhìn `visibilityState`.
    //
    // Hai việc khác nhau bị gộp làm một là một lỗi thật, không phải chuyện của
    // riêng môi trường test: một tab mở nền — cmd-click, khôi phục phiên nhiều
    // tab, webview nhúng — sẽ dựng cây React, bỏ qua lần đọc đầu, và đứng ở
    // skeleton mãi. Nó chỉ tự khỏi nếu tab được nhìn tới; webview nhúng thì
    // `visibilitychange` có thể không bao giờ bắn.
    //
    // Tạm dừng khi ẩn vẫn đúng cho POLL: 15 giây một lần vào RPC công cộng để
    // cập nhật thứ không ai đang xem là lãng phí. Nhưng nó không phải một cơ
    // chế riêng tư và không được đóng vai đó — dữ liệu đọc ở đây là public
    // state cộng với handle chưa decrypt, còn việc xoá reveal lúc tab ẩn do
    // `installRevealGuards` lo, tách hẳn ra.
    read();

    const id = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      read();
    }, POLL_INTERVAL_MS);

    const onVisible = (): void => {
      if (document.visibilityState === "visible") read();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [address]);

  return <>{children}</>;
}
