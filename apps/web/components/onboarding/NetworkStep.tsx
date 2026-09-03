"use client";

import { useState } from "react";
import { toPotError, type PotError } from "@payday-pot/sdk";

import { ErrorPanel } from "@/components/ui/ErrorPanel";
import { Button } from "@/components/ui/Button";
import { SEPOLIA_CHAIN_ID, SEPOLIA_RPC } from "@/lib/chain/rpc";
import { switchToSepolia } from "@/lib/wallet/connect";
import { walletStore } from "@/lib/wallet/store";
import { useStore } from "@/lib/store/external-store";

const MANUAL: [string, string][] = [
  ["Network name", "Ethereum Sepolia"],
  ["Chain ID", String(SEPOLIA_CHAIN_ID)],
  ["Currency symbol", "ETH"],
  ["RPC URL", SEPOLIA_RPC],
  ["Block explorer", "https://sepolia.etherscan.io"],
];

/**
 * Bước 3 — đổi mạng.
 *
 * Hai điều cố ý:
 *
 *  1. **Không reload trang** sau khi đổi (R8). Reload là cách rẻ nhất để chắc
 *     chắn state đồng bộ, và cũng là cách chắc chắn để ném đi role vừa chọn,
 *     consent vừa đọc, số vừa gõ. Listener `chainChanged` đã cập nhật store rồi.
 *  2. **Luôn có hướng dẫn thủ công.** Nút một-chạm hỏng ở nhiều ví hơn ta tưởng
 *     — ví trong app di động, ví hardware qua bridge, ví không hỗ trợ
 *     `wallet_addEthereumChain`. Một nút không phản hồi mà không kèm đường lui
 *     là chỗ người dùng đứng lại và bỏ đi.
 */
export function NetworkStep() {
  const wallet = useStore(walletStore);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PotError | null>(null);

  async function onSwitch() {
    setBusy(true);
    setError(null);
    try {
      await switchToSepolia();
    } catch (e) {
      setError(toPotError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="text-fg-muted max-w-[62ch] text-[16px] leading-relaxed">
        Your wallet is on{" "}
        <span className="text-fg font-medium">
          {wallet.chainId === null ? "an unknown network" : `chain ${wallet.chainId}`}
        </span>
        . The pool only exists on Sepolia, so nothing you send from another network would reach it.
      </p>

      {error ? (
        <div className="mt-6">
          <ErrorPanel
            error={error}
            handlers={{ "switch-network": () => void onSwitch(), retry: () => void onSwitch() }}
            onDismiss={() => setError(null)}
          />
        </div>
      ) : null}

      <div className="mt-6">
        <Button onClick={() => void onSwitch()} loading={busy}>
          Switch to Sepolia
        </Button>
        <p className="text-fg-muted mt-3 text-[13px]">
          Your role and everything else you have filled in stays exactly where it is.
        </p>
      </div>

      <details className="border-border-default mt-8 border-t pt-5">
        <summary className="cursor-pointer text-[15px] font-medium">Add the network by hand instead</summary>
        <p className="text-fg-muted mt-3 max-w-[62ch] text-[14px] leading-relaxed">
          Some wallets do not let a page add a network. Open your wallet&rsquo;s network settings and enter these.
        </p>
        <dl className="mt-4 flex flex-col gap-2">
          {MANUAL.map(([label, value]) => (
            <div key={label} className="border-border-default flex flex-wrap items-baseline gap-x-4 border-t pt-2">
              <dt className="text-fg-muted min-w-[130px] text-[13px]">{label}</dt>
              <dd className="font-mono text-[13px] break-all">{value}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
