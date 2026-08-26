import Link from "next/link";

import { FaucetSection } from "@/components/landing/FaucetSection";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { NoLossPromise } from "@/components/landing/NoLossPromise";
import { PrivacyComparison } from "@/components/landing/PrivacyComparison";

/**
 * Landing — cây SERVER thuần, cố ý.
 *
 * Không store, không ví, không `"use client"` ở bất kỳ đâu bên dưới. Nhờ vậy
 * bài test "HTML do server trả về không chứa giá trị nào của ai" ở trang này
 * đúng một cách hiển nhiên thay vì phải chứng minh — và trang đầu tiên người
 * lạ nhìn thấy cũng là trang nhẹ nhất.
 */
export default function Home() {
  return (
    <div className="mx-auto w-full max-w-[880px] px-4">
      <header className="border-border-default flex items-center justify-between border-b py-4">
        <span className="text-[15px] font-semibold tracking-tight">PayDay Pot</span>
        <Link
          data-cta
          href="/app"
          className="rounded-control border-border-default bg-surface hover:bg-subtle inline-flex items-center px-4 text-[14px] font-medium transition-colors duration-(--duration-hover) ease-(--ease-ui)"
        >
          Open the app
        </Link>
      </header>

      <main>
        <Hero />
        <HowItWorks />
        <PrivacyComparison />
        <NoLossPromise />
        <FaucetSection />
      </main>

      <footer className="border-border-default text-fg-muted flex flex-wrap items-center gap-x-4 gap-y-2 border-t py-6 text-[12px]">
        <span>Built with Zama FHEVM · Ethereum Sepolia · test money only</span>
        <Link href="/docs/known-limitations" className="ml-auto underline underline-offset-4">
          Known limitations
        </Link>
      </footer>
    </div>
  );
}
