import type { Metadata } from "next";
import type { ReactNode } from "react";
import Script from "next/script";

export const metadata: Metadata = {
  title: "PayDay Pot — Spike",
  description: "Day 1 compatibility spike (throwaway)",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "ui-monospace, monospace", margin: 0, background: "#0b0e14", color: "#e6e6e6" }}>
        {/* Prebundled relayer-sdk UMD (docs Zama: cách khuyến nghị cho SSR framework).
            Sibling files (wasm/worker) resolve qua document.currentScript. */}
        <Script src="/relayer-sdk-js.umd.js" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}
