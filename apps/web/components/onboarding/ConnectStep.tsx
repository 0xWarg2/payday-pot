"use client";

import { useState } from "react";

import { GuideLink } from "@/components/onboarding/GuideLink";
import { ErrorPanel } from "@/components/ui/ErrorPanel";
import { Button } from "@/components/ui/Button";
import { connectWallet } from "@/lib/wallet/connect";
import { walletStore } from "@/lib/wallet/store";
import { useStore } from "@/lib/store/external-store";

const FACTS = [
  "No account, no email, no password",
  "Connecting sends no transaction",
  "Reading your balance later takes a signature, not gas",
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
          No wallet extension found. Install one and reload — you land back here.
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
          Any EIP-1193 wallet works. <GuideLink href="/docs/get-started#before-you-start" />
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-fg-muted max-w-[62ch] text-[16px] leading-relaxed">
        Sepolia test money only. Nothing here touches real funds.
      </p>

      <ul className="mt-5 flex flex-col gap-2">
        {FACTS.map((fact) => (
          <li key={fact} className="text-fg-muted flex items-start gap-2.5 text-[14px] leading-relaxed">
            <span aria-hidden="true" className="bg-fg-muted/60 mt-2 size-1 shrink-0 rounded-full" />
            {fact}
          </li>
        ))}
      </ul>
      <p className="mt-3">
        <GuideLink href="/docs/get-started#steps" />
      </p>

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
