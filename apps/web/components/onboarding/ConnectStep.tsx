"use client";

import { useState } from "react";

import { ErrorPanel } from "@/components/ui/ErrorPanel";
import { Button } from "@/components/ui/Button";
import { connectWallet } from "@/lib/wallet/connect";
import { walletStore } from "@/lib/wallet/store";
import { useStore } from "@/lib/store/external-store";

const FACTS = [
  {
    title: "No account, no email, no password",
    body: "Your wallet address is the whole of your identity here. There is nothing to sign up for and nothing to remember.",
  },
  {
    title: "Connecting costs nothing",
    body: "It sends no transaction and moves no funds. It only lets this page read which address you are.",
  },
  {
    title: "You will be asked to sign later",
    body: "Reading your own encrypted balance needs a typed-data signature (EIP-712) — a signature, not a transaction, so it still costs no gas. Every mainstream browser wallet supports it, and a wallet that does not will say so plainly instead of failing quietly.",
  },
] as const;

export function ConnectStep() {
  const wallet = useStore(walletStore);
  const [busy, setBusy] = useState(false);

  async function onConnect() {
    setBusy(true);
    try {
      await connectWallet();
    } catch {
      // `connectWallet` đã đặt PotError vào store; render nó ở dưới. Nuốt ở đây
      // để một lần bấm Cancel trong ví không thành unhandled rejection.
    } finally {
      setBusy(false);
    }
  }

  if (wallet.hasProvider === false) {
    return (
      <div>
        <p className="text-fg-muted max-w-[62ch] text-[16px] leading-relaxed">
          This browser has no wallet extension installed, so there is no address to connect. Install one, then reload
          this page — you will land back on this step.
        </p>
        <a
          data-cta
          href="https://metamask.io/download/"
          target="_blank"
          rel="noreferrer noopener"
          className="rounded-control bg-action text-on-action hover:bg-action-hover mt-6 inline-flex items-center px-6 text-[15px] font-medium transition-colors duration-(--duration-hover) ease-(--ease-ui)"
        >
          Get MetaMask
        </a>
        <p className="text-fg-muted mt-3 text-[13px]">
          Any wallet that speaks EIP-1193 works. MetaMask is simply the one most people already have.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-fg-muted max-w-[62ch] text-[16px] leading-relaxed">
        Everything below happens on Ethereum Sepolia with test money. Nothing here can touch real funds.
      </p>

      <dl className="mt-6 flex flex-col gap-4">
        {FACTS.map((fact) => (
          <div key={fact.title} className="border-border-default border-t pt-4">
            <dt className="text-[15px] font-semibold tracking-tight">{fact.title}</dt>
            <dd className="text-fg-muted mt-1 max-w-[64ch] text-[14px] leading-relaxed">{fact.body}</dd>
          </div>
        ))}
      </dl>

      {wallet.error ? (
        <div className="mt-6">
          <ErrorPanel error={wallet.error} handlers={{ retry: () => void onConnect() }} />
        </div>
      ) : null}

      <div className="mt-6">
        <Button onClick={() => void onConnect()} loading={busy || wallet.status === "connecting"}>
          Connect wallet
        </Button>
      </div>
    </div>
  );
}
