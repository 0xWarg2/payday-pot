"use client";

import { useEffect, useState } from "react";

import { WalletGate } from "@/components/guards/WalletGate";
import { EncryptedBadge } from "@/components/ui/Card";
import { NoticeBanner } from "@/components/ui/ErrorPanel";
import { potReadsStore } from "@/lib/pot/reads";
import { useStore } from "@/lib/store/external-store";
import { AssetsHelper } from "./AssetsHelper";
import { ClaimPanel } from "./ClaimPanel";
import { HistoryPanel } from "./HistoryPanel";
import { TransferFlow } from "./TransferFlow";
import { WithdrawAllPanel } from "./WithdrawAllPanel";

type Tab = "deposit" | "withdraw" | "history";

const TABS: readonly { id: Tab; label: string }[] = [
  { id: "deposit", label: "Deposit" },
  { id: "withdraw", label: "Withdraw" },
  { id: "history", label: "History" },
];

/**
 * Ba tab, và hash của URL là nguồn sự thật cho tab nào đang mở.
 *
 * Dashboard đã trỏ vào `#withdraw` và `#claim` từ Day 6, nên hash không phải là
 * một thứ trang trí thêm — nó là hợp đồng đã tồn tại. `#claim` cố ý mở tab
 * Withdraw: rút tiền và nhận tiền thắng là cùng một việc trong đầu người dùng
 * ("lấy tiền ra"), và tách chúng thành hai tab chỉ để khớp với tên hai hàm
 * trong contract là bắt người dùng học sơ đồ nội bộ của ta.
 *
 * Hash KHÔNG bao giờ mang số tiền hay bất kỳ giá trị nào — URL là thứ bị log ở
 * mọi tầng và đi vào referrer, nên nó chỉ được phép mang tên một tab.
 */
export function SavingsTabs() {
  const [tab, setTab] = useState<Tab>("deposit");
  const reads = useStore(potReadsStore);

  useEffect(() => {
    const apply = (): void => {
      const hash = window.location.hash.replace("#", "");
      if (hash === "withdraw" || hash === "claim") setTab("withdraw");
      else if (hash === "history") setTab("history");
      else if (hash === "deposit") setTab("deposit");
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  const paused = reads.state?.paused ?? false;
  const depositsClosed = reads.state !== null && reads.state.phase !== "Open";

  return (
    <div className="flex flex-col gap-5">
      <div role="tablist" aria-label="Savings" className="border-border-default flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => {
              setTab(t.id);
              history.replaceState(null, "", `#${t.id}`);
            }}
            className={`-mb-px border-b-2 px-4 py-2 text-[14px] font-medium transition-colors ${
              tab === t.id ? "border-action text-fg" : "text-fg-muted border-transparent hover:text-fg"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* R10: pause chặn deposit, KHÔNG chặn rút. Nói cả hai nửa trong một câu,
          vì nửa thứ hai là nửa người ta đang lo. */}
      {paused ? (
        <NoticeBanner
          tone="warning"
          title="The pool is paused"
          detail="New deposits are on hold. Withdrawing and claiming are not — they work in every stage and while paused, by design of the contract."
        />
      ) : null}

      <WalletGate>
        {tab === "deposit" ? (
          <section role="tabpanel" aria-label="Deposit" className="flex flex-col gap-5">
            {depositsClosed ? (
              <NoticeBanner
                tone="warning"
                title="This round has stopped taking deposits"
                detail="The round is being settled. Your savings stay yours and can be withdrawn at any point — a new round opens after this one finishes."
              />
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <EncryptedBadge>Amount encrypted in your browser</EncryptedBadge>
                </div>
                <TransferFlow kind="deposit" />
              </>
            )}
            <AssetsHelper />
          </section>
        ) : null}

        {tab === "withdraw" ? (
          <section role="tabpanel" aria-label="Withdraw" className="flex flex-col gap-5">
            <WithdrawAllPanel />
            <div className="border-border-default rounded-card border p-4">
              <p className="text-[15px] font-semibold tracking-tight">Withdraw part of it</p>
              <div className="mt-3">
                <TransferFlow kind="withdraw" />
              </div>
            </div>
            <div id="claim" className="scroll-mt-24">
              <ClaimPanel />
            </div>
          </section>
        ) : null}

        {tab === "history" ? (
          <section role="tabpanel" aria-label="History">
            <HistoryPanel />
          </section>
        ) : null}
      </WalletGate>
    </div>
  );
}
