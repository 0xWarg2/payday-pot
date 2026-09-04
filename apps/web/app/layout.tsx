import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";

import "./globals.css";

/*
 * Geist qua `next/font/google`: tải lúc build, self-host cùng origin (không đụng
 * COEP `require-corp`), không thêm dependency. Biến `--font-geist-*` gắn lên
 * `<html>`; `@theme` trong globals.css đọc qua `var(--font-geist-sans, Geist)`
 * nên nếu biến vắng (font không tải được) stack vẫn hợp lệ, không trắng chữ.
 */
const geist = Geist({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-geist-sans", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  title: "PayDay Pot",
  description: "A confidential prize-savings pool. Your balance stays yours; the prize is public.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body>
        {/* Prebundled relayer-sdk UMD (docs Zama: cách khuyến nghị cho SSR framework).
            Sibling files (wasm/worker) resolve qua document.currentScript. */}
        <Script src="/relayer-sdk-js.umd.js" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}
