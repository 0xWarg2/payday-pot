import Link from "next/link";

/**
 * Placeholder có chủ đích. Landing thật là việc của Day 6 (§7); route này tồn
 * tại lúc này chỉ để `/` không còn redirect vào spike Day 1 — và để chứng minh
 * toolchain (Tailwind v4 + token §14.2) render đúng trong production build.
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-[640px] flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-[32px] leading-tight font-semibold tracking-tight">PayDay Pot</h1>
      <p className="text-fg-muted text-[18px] leading-relaxed">
        A confidential prize-savings pool. Nobody loses their deposit; the prize is sponsored by an
        employer. Your balance, your weight and your winnings stay encrypted — wallet addresses and
        transaction timing do not.
      </p>
      <div className="border-border-default bg-surface rounded-card border p-5">
        <p className="text-fg-muted text-[14px]">
          The product screens land on day 6. Until then:
        </p>
        <ul className="mt-3 flex flex-col gap-2 text-[14px]">
          <li>
            <Link className="underline underline-offset-4" href="/spike">
              /spike
            </Link>{" "}
            — the day 1 compatibility spike: encrypt in the browser, send, decrypt back.
          </li>
          <li>
            <Link className="underline underline-offset-4" href="/tokens">
              /tokens
            </Link>{" "}
            — design tokens, rendered.
          </li>
        </ul>
      </div>
    </main>
  );
}
