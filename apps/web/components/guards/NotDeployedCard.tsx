"use client";

import Link from "next/link";

import { Card } from "@/components/ui/Card";
import type { DeploymentStatus } from "@/lib/pot/reads";

/**
 * "Chưa lên chain" không phải là một lỗi.
 *
 * `getPot()` ném `NotDeployedError`/`ManifestMismatchError` — hai thứ mà error
 * taxonomy cố ý KHÔNG biết, vì chúng nói về tình trạng của bản build chứ không
 * phải về việc người dùng vừa làm. Nếu để chúng rơi vào `classifyError` thì cả
 * hai đều hiện ra "Something went wrong", tức là đổ lỗi cho người dùng vì một
 * việc họ không gây ra và không sửa được. Nên chúng có màn hình riêng ở đây,
 * và `lib/pot/reads.ts` kiểm tra manifest TRƯỚC khi dựng contract.
 */
export function NotDeployedCard({ status }: { status: Exclude<DeploymentStatus, "ready"> }) {
  const mismatch = status === "mismatch";
  return (
    <Card>
      <h2 className="text-[18px] font-semibold tracking-tight">
        {mismatch ? "This build is out of sync with the pool" : "The pool is not live yet"}
      </h2>
      <p className="text-fg-muted mt-2 text-[14px] leading-relaxed">
        {mismatch
          ? "The deployed contract does not match the interface this page was built against. Reading it now would show you numbers from the wrong shape, so the app stops here instead."
          : "No pool contract is recorded for Sepolia in this build. Everything you can see is real UI, but there is nothing on chain to talk to yet."}
      </p>
      <p className="text-fg-muted mt-3 text-[13px]">
        Nothing is at risk — no transaction can be sent from this state.
      </p>
      <Link
        data-cta
        href="/docs/known-limitations"
        className="rounded-control border-border-default bg-surface mt-4 inline-flex items-center px-4 text-[14px] font-medium"
      >
        Known limitations
      </Link>
    </Card>
  );
}
