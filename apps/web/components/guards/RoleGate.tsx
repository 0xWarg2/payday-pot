"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { roleStore, setRole, type Role } from "@/lib/onboarding/role";
import { useStore } from "@/lib/store/external-store";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { NoSsr } from "@/components/privacy/NoSsr";

const ROLE_COPY: Record<Role, { noun: string; blurb: string }> = {
  employee: {
    noun: "saver",
    blurb: "Deposit, build weight over the round, and claim if you win.",
  },
  employer: {
    noun: "sponsor",
    blurb: "Fund the prize for a round and watch the pool without seeing anyone's balance.",
  },
};

/**
 * Vai trò là một cách xem, không phải một quyền.
 *
 * Không có gì ở đây thay thế cho ACL onchain — `EMPLOYER` được contract kiểm
 * tra, và không vai trò nào ở client mở được dữ liệu của người khác. Cổng này
 * chỉ để màn hình khỏi nói chuyện với sai người, nên nó luôn có đường đi tiếp
 * chứ không phải một bức tường.
 */
export function RoleGate({ role, children }: { role: Role; children: ReactNode }) {
  return (
    <NoSsr fallback={<Card className="min-h-[140px]" />}>
      <RoleGateInner role={role}>{children}</RoleGateInner>
    </NoSsr>
  );
}

function RoleGateInner({ role, children }: { role: Role; children: ReactNode }) {
  const current = useStore(roleStore);
  if (current === role) return <>{children}</>;

  const copy = ROLE_COPY[role];
  return (
    <Card>
      <h2 className="text-[18px] font-semibold tracking-tight">This page is the {copy.noun} view</h2>
      <p className="text-fg-muted mt-2 text-[14px] leading-relaxed">
        {copy.blurb} You picked a different view during setup, but nothing stops you from switching — the pool does not
        care which one you are looking at.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setRole(role)}>
          Switch to the {copy.noun} view
        </Button>
        <Link
          data-cta
          href="/app"
          className="rounded-control border-border-default bg-surface inline-flex items-center px-3 text-[14px] font-medium"
        >
          Back to dashboard
        </Link>
      </div>
    </Card>
  );
}
