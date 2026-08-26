"use client";

import { useState } from "react";

import { isSepolia } from "@/lib/chain/rpc";
import { useStore } from "@/lib/store/external-store";
import { switchToSepolia } from "@/lib/wallet/connect";
import { walletStore } from "@/lib/wallet/store";
import { NoticeBanner } from "@/components/ui/ErrorPanel";
import { NoSsr } from "@/components/privacy/NoSsr";

/**
 * R8 — ví đang ở sai mạng.
 *
 * Cảnh báo, không phải chặn màn hình. Toàn bộ phần đọc của app đi qua RPC
 * Sepolia cố định, nên dashboard vẫn đúng và vẫn xem được; thứ duy nhất không
 * dùng được là các nút gửi tx, và `useWriteGate` đã lo phần đó. Che cả trang chỉ
 * để nói "sai mạng" là lấy đi thông tin mà người dùng vẫn có quyền xem.
 *
 * Chuyển mạng KHÔNG reload trang: state onboarding và phiên reveal phải sống
 * sót qua thao tác này.
 */
export function NetworkBanner() {
  return (
    <NoSsr>
      <NetworkBannerInner />
    </NoSsr>
  );
}

function NetworkBannerInner() {
  const wallet = useStore(walletStore);
  const [switching, setSwitching] = useState(false);

  if (wallet.status !== "connected" || isSepolia(wallet.chainId)) return null;

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 pt-4">
      <NoticeBanner
        title="Your wallet is on another network"
        detail="You can keep reading the pool — it is always read from Sepolia. Sending anything needs your wallet on Sepolia too."
        action={{
          label: "Switch to Sepolia",
          loading: switching,
          onClick: () => {
            setSwitching(true);
            void switchToSepolia()
              .catch(() => {})
              .finally(() => setSwitching(false));
          },
        }}
      />
    </div>
  );
}
