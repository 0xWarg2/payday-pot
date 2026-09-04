"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { CoinMark } from "@/components/brand/CoinMark";

import { NetworkBanner } from "./NetworkBanner";
import { SdkHealth } from "./SdkHealth";
import { WalletButton } from "./WalletButton";
import { TxCenter } from "@/components/tx/TxCenter";

const NAV = [
  { href: "/app", label: "Dashboard" },
  { href: "/app/savings", label: "Savings" },
  { href: "/app/draws/current", label: "Draw room" },
  { href: "/employer", label: "Sponsor" },
  { href: "/docs", label: "Docs" },
] as const;

/**
 * Chỉ tô sáng mục khớp DÀI NHẤT.
 *
 * Kiểm từng mục kiểu `pathname.startsWith(href)` làm "Dashboard" (`/app`) sáng
 * trên mọi trang `/app/*` — đứng ở Draw Room thì cả hai mục cùng sáng và
 * `aria-current="page"` xuất hiện hai lần, tức là trình đọc màn hình được bảo
 * rằng người dùng đang ở hai nơi cùng lúc. Prefix phải cắt ở dấu `/` để
 * `/app/draws` không nhận `/app/drawsomething` là con của nó.
 */
function activeHref(pathname: string): string | null {
  let best: string | null = null;
  for (const { href } of NAV) {
    const hit = pathname === href || pathname.startsWith(`${href}/`);
    if (hit && (best === null || href.length > best.length)) best = href;
  }
  return best;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const current = activeHref(pathname);

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="bg-surface focus:rounded-control sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:border focus:px-4 focus:py-2"
      >
        Skip to content
      </a>

      <header className="border-border-default bg-canvas/90 sticky top-0 z-30 border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1120px] items-center gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 text-body font-semibold tracking-tight">
            <CoinMark size={22} />
            PayDay Pot
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1 overflow-x-auto">
            {NAV.map((item) => {
              const active = current === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-control inline-flex min-h-[44px] items-center px-3 text-[14px] font-medium whitespace-nowrap ${
                    active ? "bg-subtle" : "text-fg-muted hover:bg-subtle hover:text-fg"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto">
            <WalletButton />
          </div>
        </div>
      </header>

      <NetworkBanner />
      <SdkHealth />

      <main id="main" className="mx-auto w-full max-w-[1120px] flex-1 px-4 py-6 sm:py-8">
        {children}
      </main>

      <footer className="border-border-default border-t">
        <div className="text-fg-muted mx-auto flex w-full max-w-[1120px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-5 text-caption">
          <span>Sepolia testnet · no real money</span>
          <span aria-hidden="true">·</span>
          <span>Amounts stay encrypted; addresses and timing are public</span>
          <Link href="/docs" className="ml-auto underline underline-offset-4">
            Docs
          </Link>
          <Link href="/docs/known-limitations" className="underline underline-offset-4">
            Known limitations
          </Link>
        </div>
      </footer>

      <TxCenter />
    </div>
  );
}
