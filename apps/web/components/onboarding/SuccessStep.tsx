"use client";

import Link from "next/link";

import { hasShielded, assetsStore } from "@/lib/tokens/assets";
import type { Role } from "@/lib/onboarding/role";
import { useStore } from "@/lib/store/external-store";

const CTA: Record<Role, { href: string; label: string; body: string }> = {
  employee: {
    href: "/app",
    label: "Make your first deposit",
    body: "Your deposit is encrypted on arrival. Reveal it to yourself; withdraw in full any time.",
  },
  employer: {
    href: "/employer",
    label: "Fund a prize",
    body: "You fund a round's prize. You see the pot and the head count, never a balance.",
  },
};

const NEXT = [
  "Test money only.",
  "Losing a round costs you nothing.",
  "Withdraw in every phase, even while paused.",
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
          Not shielded yet — the deposit form will ask first. Two transactions, about a minute.
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
        The prize is sponsored, not earned as yield; the adapter for a real yield source is empty in this build.{" "}
        <Link href="/docs/known-limitations" className="underline underline-offset-4">
          Known limitations →
        </Link>
      </p>
    </div>
  );
}
