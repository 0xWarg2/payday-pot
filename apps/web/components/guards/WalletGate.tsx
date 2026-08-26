"use client";

import { useState, type ReactNode } from "react";

import { connectWallet } from "@/lib/wallet/connect";
import { useStore } from "@/lib/store/external-store";
import { walletStore } from "@/lib/wallet/store";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorPanel } from "@/components/ui/ErrorPanel";
import { NoSsr } from "@/components/privacy/NoSsr";

/**
 * Chặn, KHÔNG redirect ngầm.
 *
 * Một trang bỗng dưng nhảy về `/onboarding` vì ví chưa kết nối là cách tốt để
 * người dùng mất chỗ đang đứng và không hiểu vì sao. Ở lại đúng URL, nói rõ
 * thiếu gì, và cho đúng một nút để giải quyết — quay lại được bằng nút Back của
 * trình duyệt, chia sẻ link được, và test được.
 */
export function WalletGate({ children }: { children: ReactNode }) {
  return (
    <NoSsr fallback={<GateSkeleton />}>
      <WalletGateInner>{children}</WalletGateInner>
    </NoSsr>
  );
}

function WalletGateInner({ children }: { children: ReactNode }) {
  const wallet = useStore(walletStore);
  const [busy, setBusy] = useState(false);

  if (wallet.hasProvider === false) {
    return (
      <Card>
        <h2 className="text-[18px] font-semibold tracking-tight">You need a browser wallet</h2>
        <p className="text-fg-muted mt-2 text-[14px] leading-relaxed">
          PayDay Pot signs everything locally in your browser — there is no account to create and no server holding
          your keys. Install a wallet such as MetaMask, then come back to this page.
        </p>
        <a
          data-cta
          href="https://metamask.io/download/"
          target="_blank"
          rel="noreferrer"
          className="rounded-control bg-action text-on-action mt-4 inline-flex items-center px-5 text-[15px] font-medium"
        >
          Get a wallet
        </a>
      </Card>
    );
  }

  if (wallet.status !== "connected") {
    return (
      <Card>
        <h2 className="text-[18px] font-semibold tracking-tight">Connect your wallet to continue</h2>
        <p className="text-fg-muted mt-2 text-[14px] leading-relaxed">
          Your address becomes visible to the network — your balance, your weight and your winnings do not.
        </p>
        {wallet.error ? (
          <div className="mt-4">
            <ErrorPanel
              error={wallet.error}
              handlers={{
                "connect-wallet": () => void connectWallet().catch(() => {}),
                retry: () => void connectWallet().catch(() => {}),
              }}
            />
          </div>
        ) : null}
        <Button
          className="mt-4"
          loading={busy || wallet.status === "connecting"}
          onClick={() => {
            setBusy(true);
            void connectWallet()
              .catch(() => {})
              .finally(() => setBusy(false));
          }}
        >
          Connect wallet
        </Button>
      </Card>
    );
  }

  return <>{children}</>;
}

function GateSkeleton() {
  return <Card className="min-h-[168px]" />;
}
