"use client";

import Link from "next/link";

import { NotDeployedCard } from "@/components/guards/NotDeployedCard";
import { GuideLink } from "@/components/onboarding/GuideLink";
import { Button } from "@/components/ui/Button";
import { EncryptedBadge, PublicBadge } from "@/components/ui/Card";
import { formatAbsolute, formatAmount, shortAddress } from "@/lib/format";
import { potReadsStore } from "@/lib/pot/reads";
import { useStore } from "@/lib/store/external-store";

/**
 * Bước 4 — "connect program".
 *
 * §7 gọi bước này là enrollment demo cho P0, và ở đây phải nói thật một điều dễ
 * bị làm mờ: **không có gì để ký ở bước này**. Contract không có hàm `enroll`;
 * bạn trở thành người tham gia đúng vào lúc khoản gửi đầu tiên tới nơi. Dựng
 * một nút "Join" chạy rỗng rồi hiện dấu tích sẽ trông mượt hơn hẳn — và sẽ là
 * một lời nói dối nhỏ về việc tiền của người ta đang ở đâu.
 *
 * Toàn bộ số liệu dưới đây là **công khai**: địa chỉ pool, nhà tài trợ, số tiền
 * thưởng, số người tham gia. Không có gì ở đây thuộc về một cá nhân nào.
 */
export function ProgramStep({ onContinue }: { onContinue: () => void }) {
  const reads = useStore(potReadsStore);

  if (reads.deployment !== "ready") {
    return (
      <div>
        <NotDeployedCard status={reads.deployment} />
        <div className="mt-6">
          <Button variant="secondary" onClick={onContinue}>
            Look through the rest of the setup
          </Button>
          <p className="text-fg-muted mt-3 max-w-[62ch] text-[13px] leading-relaxed">
            No deposit is possible until the pool is live on Sepolia.
          </p>
        </div>
      </div>
    );
  }

  const { config, state, account } = reads;
  const days = config ? Number(config.epochDuration) / 86_400 : null;

  return (
    <div>
      <p className="text-fg-muted max-w-[62ch] text-[16px] leading-relaxed">
        Nothing to sign here — you join with your first deposit. This is what you are walking into.{" "}
        <GuideLink href="/docs/how-it-works" />
      </p>

      {account?.registered ? (
        <div className="border-privacy/30 bg-privacy-subtle rounded-card mt-6 border p-5">
          <p className="text-[15px] font-medium">This address is already in the pool.</p>
          <p className="text-fg-muted mt-1 max-w-[60ch] text-[14px] leading-relaxed">
            Nothing is created twice. Read on, or go to your dashboard.
          </p>
          <Link
            data-cta
            href="/app"
            className="rounded-control border-border-default bg-surface hover:bg-subtle mt-4 inline-flex items-center px-5 text-[14px] font-medium transition-colors duration-(--duration-hover) ease-(--ease-ui)"
          >
            Open my dashboard
          </Link>
        </div>
      ) : null}

      <dl className="mt-6 grid gap-x-8 gap-y-4 sm:grid-cols-2">
        <Fact label="Round length" value={days === null ? "—" : `${days} days`} />
        <Fact label="People in this round" value={state ? String(state.participantCount) : "—"} />
        <Fact
          label="Prize this round"
          value={state ? `${formatAmount(state.prizeAmount)} USDC` : "—"}
          note="Funded by the sponsor, not from deposits."
        />
        <Fact
          label="Round ends"
          value={state ? formatAbsolute(state.end) : "—"}
          note={state?.paused ? "New deposits are paused. Withdrawing still works." : undefined}
        />
        <Fact
          label="Most one person can hold"
          value={config ? `${formatAmount(config.perUserCap)} USDC` : "—"}
          note="Enforced by the contract."
        />
        <Fact
          label="Room in the pool"
          value={config && state ? `${state.participantCount} of ${config.participantCap}` : "—"}
        />
      </dl>

      <div className="border-border-default mt-8 border-t pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <PublicBadge>Public</PublicBadge>
          <span className="text-fg-muted text-[13px]">Everything on this screen is public.</span>
        </div>
        <dl className="mt-4 flex flex-col gap-2">
          <Address label="Pool contract" value={config?.address} />
          <Address label="Prize sponsor" value={config?.employer} />
          <Address label="Token you deposit" value={config?.token} />
        </dl>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <EncryptedBadge>Encrypted</EncryptedBadge>
          <span className="text-fg-muted text-[13px]">Your balance, odds and winnings never appear in the clear.</span>
        </div>
      </div>

      <div className="mt-8">
        <Button onClick={onContinue}>Continue</Button>
      </div>
    </div>
  );
}

function Fact({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="border-border-default border-t pt-3">
      <dt className="text-fg-muted text-[13px]">{label}</dt>
      <dd className="tabular mt-1 text-[17px] font-semibold tracking-tight">{value}</dd>
      {note ? <dd className="text-fg-muted mt-1 max-w-[42ch] text-[12px] leading-relaxed">{note}</dd> : null}
    </div>
  );
}

function Address({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4">
      <dt className="text-fg-muted min-w-[130px] text-[13px]">{label}</dt>
      <dd className="font-mono text-[13px]">
        {value ? (
          <a
            href={`https://sepolia.etherscan.io/address/${value}`}
            target="_blank"
            rel="noreferrer noopener"
            className="underline underline-offset-4"
          >
            {shortAddress(value)}
          </a>
        ) : (
          "—"
        )}
      </dd>
    </div>
  );
}
