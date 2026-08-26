"use client";

import { useState } from "react";

import { isSepolia } from "@/lib/chain/rpc";
import { shortAddress } from "@/lib/format";
import { useStore } from "@/lib/store/external-store";
import { connectWallet } from "@/lib/wallet/connect";
import { walletStore } from "@/lib/wallet/store";
import { Button } from "@/components/ui/Button";
import { NoSsr } from "@/components/privacy/NoSsr";

export function WalletButton() {
  return (
    <NoSsr fallback={<span className="block h-11 w-[132px]" />}>
      <WalletButtonInner />
    </NoSsr>
  );
}

function WalletButtonInner() {
  const wallet = useStore(walletStore);
  const [busy, setBusy] = useState(false);

  if (wallet.status === "connected" && wallet.address) {
    const wrongNetwork = !isSepolia(wallet.chainId);
    return (
      <span className="rounded-control border-border-default bg-surface inline-flex min-h-[44px] items-center gap-2 border px-3 text-[14px] font-medium">
        <span
          aria-hidden="true"
          className={`size-1.5 rounded-full ${wrongNetwork ? "bg-warning" : "bg-success"}`}
        />
        <span className="font-mono">{shortAddress(wallet.address)}</span>
        <span className="sr-only">
          {wrongNetwork ? "Connected, but on the wrong network" : "Connected on Sepolia"}
        </span>
      </span>
    );
  }

  if (wallet.hasProvider === false) {
    return (
      <a
        data-cta
        href="https://metamask.io/download/"
        target="_blank"
        rel="noreferrer"
        className="rounded-control border-border-default bg-surface inline-flex items-center px-4 text-[14px] font-medium"
      >
        Get a wallet
      </a>
    );
  }

  return (
    <Button
      size="sm"
      loading={busy || wallet.status === "connecting"}
      onClick={() => {
        setBusy(true);
        void connectWallet()
          .catch(() => {})
          .finally(() => setBusy(false));
      }}
    >
      Connect
    </Button>
  );
}
