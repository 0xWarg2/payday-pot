import Link from "next/link";

import { FaucetSection } from "@/components/landing/FaucetSection";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { NoLossPromise } from "@/components/landing/NoLossPromise";
import { PrivacyComparison } from "@/components/landing/PrivacyComparison";

/**
 * Landing — cây SERVER thuần, cố ý.
 *
 * Không store, không ví bên dưới. Client code duy nhất là `<InView>` (đợt 4):
 * nó chỉ đọc geometry của chính element để bật animation chữ, không đọc dữ
 * liệu nào. Nhờ vậy
 * bài test "HTML do server trả về không chứa giá trị nào của ai" ở trang này
 * đúng một cách hiển nhiên thay vì phải chứng minh — và trang đầu tiên người
 * lạ nhìn thấy cũng là trang nhẹ nhất.
 */
export default function Home() {
  return (
    <div className="mx-auto w-full max-w-[880px] px-4">
      <header className="border-border-default flex items-center justify-between border-b py-4">
        <span className="text-[15px] font-semibold tracking-tight">PayDay Pot</span>
        <nav aria-label="Site" className="flex items-center gap-4">
          <Link href="/docs" className="text-fg-muted hover:text-fg text-[14px] font-medium transition-colors duration-(--duration-hover) ease-(--ease-ui)">
            Docs
          </Link>
          <Link
            data-cta
            href="/app"
            className="rounded-control border-border-default bg-surface hover:bg-subtle inline-flex h-9 items-center px-4 text-[14px] font-medium transition-colors duration-(--duration-hover) ease-(--ease-ui)"
          >
            Open the app
          </Link>
        </nav>
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
        <Link href="/docs" className="ml-auto underline underline-offset-4">
          Docs
        </Link>
        <Link href="/docs/known-limitations" className="underline underline-offset-4">
          Known limitations
        </Link>
      </footer>
    </div>
  );
}
