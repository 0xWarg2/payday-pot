import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { CoinMark } from "@/components/brand/CoinMark";
import { DocsSidebar } from "@/components/docs/DocsSidebar";

export const metadata: Metadata = {
  title: { default: "Docs — PayDay Pot", template: "%s — PayDay Pot docs" },
  description: "How the pool works, what stays private, where the prize comes from, and how to check the draw.",
};

const HEADER_LINK =
  "rounded-control border-border-default bg-surface hover:bg-subtle inline-flex h-9 items-center px-4 text-[14px] font-medium transition-colors duration-(--duration-hover) ease-(--ease-ui)";

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-canvas text-fg min-h-dvh">
      <a
        href="#docs-content"
        className="bg-surface focus:ring-privacy sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:px-3 focus:py-2 focus:ring-2"
      >
        Skip to content
      </a>

      <header className="border-border-default bg-canvas/85 sticky top-0 z-40 border-b backdrop-blur-sm">
        <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center gap-3 px-4">
          <Link href="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
            <CoinMark size={20} />
            PayDay Pot
          </Link>
          <span className="text-fg-muted text-[14px]" aria-hidden>
            /
          </span>
          <Link href="/docs" className="text-fg-muted hover:text-fg text-[14px] font-medium">
            Docs
          </Link>
          <Link href="/app" className={`${HEADER_LINK} ml-auto`}>
            Open the app
          </Link>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1200px] gap-8 px-4 py-8 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-12 lg:py-12">
        <DocsSidebar />
        <main id="docs-content" className="min-w-0">
          {children}
        </main>
      </div>

      <footer className="border-border-default border-t">
        <div className="text-fg-muted mx-auto flex w-full max-w-[1200px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-6 text-[13px]">
          <span>Built with Zama FHEVM</span>
          <span aria-hidden>·</span>
          <span>Ethereum Sepolia</span>
          <span aria-hidden>·</span>
          <span>test money only</span>
          <Link href="/docs/known-limitations" className="ml-auto underline underline-offset-4">
            Known limitations
          </Link>
        </div>
      </footer>
    </div>
  );
}
