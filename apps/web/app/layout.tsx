import type { Metadata } from "next";
import type { ReactNode } from "react";
import Script from "next/script";

import "./globals.css";

export const metadata: Metadata = {
  title: "PayDay Pot",
  description: "A confidential prize-savings pool. Your balance stays yours; the prize is public.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Prebundled relayer-sdk UMD (docs Zama: cách khuyến nghị cho SSR framework).
            Sibling files (wasm/worker) resolve qua document.currentScript. */}
        <Script src="/relayer-sdk-js.umd.js" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}
