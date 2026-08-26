"use client";

import Link from "next/link";

import { hasShielded, assetsStore } from "@/lib/tokens/assets";
import type { Role } from "@/lib/onboarding/role";
import { useStore } from "@/lib/store/external-store";

const CTA: Record<Role, { href: string; label: string; body: string }> = {
  employee: {
    href: "/app",
    label: "Make your first deposit",
    body: "Your deposit is encrypted the moment it lands. From the dashboard you can reveal your own balance to yourself, and withdraw it in full at any time, in any phase of any round.",
  },
  employer: {
    href: "/employer",
    label: "Fund a prize",
    body: "You fund the prize for a round out of your own pocket. You will see the prize you funded and how many people are in the round — never any individual's balance, deposit or winnings.",
  },
};

const NEXT = [
  "Nothing here is worth real money, and nothing can be.",
  "Your deposit is never spent on the prize, so losing a round costs you nothing.",
  "Withdrawing works in every phase, including while a draw is running or the pool is paused.",
] as const;

export function SuccessStep({ role }: { role: Role }) {
  const assets = useStore(assetsStore);
  const cta = CTA[role];
  const shielded = hasShielded(assets);

  return (
    <div>
      <p className="text-fg-muted max-w-[62ch] text-[16px] leading-relaxed">{cta.body}</p>

      {!shielded && role === "employee" ? (
        <p className="text-fg-muted mt-4 max-w-[62ch] text-[14px] leading-relaxed">
          One thing still outstanding: you have not shielded any USDC yet, so the deposit form will ask you to do that
          first. It is two transactions and takes about a minute.
        </p>
      ) : null}

      <div className="mt-7 flex flex-wrap items-center gap-3">
        <Link
          data-cta
          href={cta.href}
          className="rounded-control bg-action text-on-action hover:bg-action-hover inline-flex items-center px-6 text-[16px] font-medium transition-colors duration-(--duration-hover) ease-(--ease-ui)"
        >
          {cta.label}
        </Link>
        <Link
          data-cta
          href="/app"
          className="rounded-control border-border-default bg-surface hover:bg-subtle inline-flex items-center px-5 text-[15px] font-medium transition-colors duration-(--duration-hover) ease-(--ease-ui)"
        >
          Go to the dashboard
        </Link>
      </div>

      <ul className="border-border-default mt-9 flex flex-col gap-3 border-t pt-5">
        {NEXT.map((item) => (
          <li key={item} className="text-fg-muted flex items-start gap-2.5 text-[14px] leading-relaxed">
            <span aria-hidden="true" className="bg-action mt-2 size-1.5 shrink-0 rounded-full" />
            {item}
          </li>
        ))}
      </ul>

      <p className="text-fg-muted mt-6 max-w-[64ch] text-[13px] leading-relaxed">
        The prize is sponsored, not earned as yield on your savings. The contract exposes an adapter interface so a real
        yield source could fund it, but none is connected in this build —{" "}
        <Link href="/docs/known-limitations" className="underline underline-offset-4">
          the full list of limitations
        </Link>{" "}
        says what else that means.
      </p>
    </div>
  );
}
