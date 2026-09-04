"use client";

import Link from "next/link";
import { useId, useState } from "react";

import { Button } from "@/components/ui/Button";
import { EncryptedBadge, PublicBadge } from "@/components/ui/Card";

const HIDDEN = [
  "Your deposit and your balance",
  "Your average balance, which sets your odds",
  "Whether you won a round",
  "How much you won",
] as const;

/**
 * §7 acceptance đòi bốn thứ này phải được gọi tên: address, timing, tx graph,
 * claim linkage. Chúng ở đây nguyên văn, không gói vào một câu chung chung kiểu
 * "một số metadata vẫn công khai".
 */
const PUBLIC = [
  "Your wallet address",
  "The time of every action, forever",
  "The transaction graph — who funded you, whom you funded",
  "That you claimed a prize, and when — not how much",
  "The prize, the head count and the rules",
] as const;

export function ConsentStep({ onAccept }: { onAccept: () => void }) {
  const [checked, setChecked] = useState(false);
  const id = useId();

  return (
    <div>
      <p className="text-fg-muted max-w-[62ch] text-[16px] leading-relaxed">
        This pool keeps <span className="text-fg font-medium">amounts</span> confidential. It does not make you
        anonymous. Read the right column before you agree.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="border-privacy/30 bg-privacy-subtle rounded-card border p-5">
          <EncryptedBadge>Stays encrypted</EncryptedBadge>
          <ul className="mt-4 flex flex-col gap-3">
            {HIDDEN.map((item) => (
              <li key={item} className="text-[14px] leading-snug">
                {item}
              </li>
            ))}
          </ul>
          <p className="text-fg-muted mt-5 text-[12px] leading-relaxed">
            Only your address can decrypt these. Not the sponsor, not the keeper, not the deployer.
          </p>
        </div>

        <div className="border-border-default bg-surface rounded-card border p-5">
          <PublicBadge>Public forever</PublicBadge>
          <ul className="mt-4 flex flex-col gap-3">
            {PUBLIC.map((item) => (
              <li key={item} className="text-[14px] leading-snug">
                {item}
              </li>
            ))}
          </ul>
          <p className="text-fg-muted mt-5 text-[12px] leading-relaxed">
            If being linked to this pool is the problem, use an address not tied to you.
          </p>
        </div>
      </div>

      <div className="border-border-default mt-6 border-t pt-5">
        <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
          <input
            id={id}
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.currentTarget.checked)}
            className="accent-action mt-0.5 size-[18px] shrink-0"
          />
          <span className="max-w-[64ch] text-[15px] leading-relaxed">
            I have read both columns: my address and timing are public; confidential means amounts, not identity.
          </span>
        </label>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Button disabled={!checked} onClick={onAccept}>
            I understand — continue
          </Button>
          <Link href="/docs/privacy" className="text-fg-muted text-[13px] underline underline-offset-4">
            Full privacy page →
          </Link>
        </div>
      </div>
    </div>
  );
}
