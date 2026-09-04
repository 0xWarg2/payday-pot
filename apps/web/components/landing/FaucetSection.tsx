import Link from "next/link";
import type { CSSProperties } from "react";

import { InView } from "@/components/motion/InView";
import { Words } from "@/components/motion/Words";

/**
 * Không có route riêng cho faucet/learn (§6 IA). Người dùng cần test USDC thì
 * onboarding tự phát cho họ bằng một tx trong app — mock token có faucet mở,
 * nên đẩy họ ra một trang bên thứ ba có captcha và rate limit là tự tạo ra một
 * chỗ để rơi rụng ngay giữa lúc họ đang muốn thử. Bảng bên phải nói hết; đoạn
 * văn cũ đã vào /docs (overview › Try it).
 */
const FACTS = [
  ["Network", "Ethereum Sepolia"],
  ["You need", "A wallet + Sepolia ETH"],
  ["Test USDC", "Given to you in setup"],
  ["Sign-up", "None"],
] as const;

export function FaucetSection() {
  return (
    <InView as="section" className="border-border-default border-t py-14 sm:py-20">
      <div className="grid gap-8 sm:grid-cols-[1.2fr_1fr] sm:items-center">
        <div>
          <h2 className="text-h2 leading-tight font-semibold tracking-tight sm:text-[34px]">
            <Words>Nothing here costs real money</Words>
          </h2>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              data-cta
              href="/onboarding"
              className="rounded-control bg-action text-on-action hover:bg-action-hover inline-flex items-center px-6 text-[16px] font-medium transition-colors duration-(--duration-hover) ease-(--ease-ui)"
            >
              Start setup
            </Link>
            <Link
              data-cta
              href="/docs"
              className="rounded-control border-border-default bg-surface hover:bg-subtle inline-flex items-center px-5 text-[16px] font-medium transition-colors duration-(--duration-hover) ease-(--ease-ui)"
            >
              Read the docs
            </Link>
          </div>
        </div>

        <dl className="border-border-default bg-surface rounded-card elev-1 border p-5 sm:p-6">
          {FACTS.map(([k, v], i) => (
            <div
              key={k}
              className={`in-item flex items-baseline justify-between gap-4 ${i > 0 ? "border-border-default mt-3 border-t pt-3" : ""}`}
              style={{ "--n": i } as CSSProperties}
            >
              <dt className="text-fg-muted text-[14px]">{k}</dt>
              <dd className="text-[14px] font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </InView>
  );
}
