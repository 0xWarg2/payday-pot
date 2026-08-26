import Link from "next/link";

/**
 * Không có route riêng cho faucet/learn (§6 IA). Người dùng cần test USDC thì
 * onboarding tự phát cho họ bằng một tx trong app — mock token có faucet mở,
 * nên đẩy họ ra một trang bên thứ ba có captcha và rate limit là tự tạo ra một
 * chỗ để rơi rụng ngay giữa lúc họ đang muốn thử.
 */
export function FaucetSection() {
  return (
    <section className="border-border-default border-t py-14 sm:py-20">
      <div className="grid gap-8 sm:grid-cols-[1.2fr_1fr] sm:items-start">
        <div>
          <h2 className="text-[28px] leading-tight font-semibold tracking-tight sm:text-[34px]">
            Nothing here costs real money
          </h2>
          <p className="text-fg-muted mt-3 max-w-[56ch] text-[16px] leading-relaxed">
            The pool runs on Ethereum Sepolia with a mock USDC. Setup hands you the test tokens itself — one
            transaction, no external faucet, no captcha. All you need to bring is Sepolia ETH for gas and a browser
            wallet.
          </p>
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
              href="/docs/known-limitations"
              className="rounded-control border-border-default bg-surface hover:bg-subtle inline-flex items-center px-5 text-[16px] font-medium transition-colors duration-(--duration-hover) ease-(--ease-ui)"
            >
              Known limitations
            </Link>
          </div>
        </div>

        <dl className="border-border-default bg-surface rounded-card border p-5 sm:p-6">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-fg-muted text-[14px]">Network</dt>
            <dd className="text-[14px] font-medium">Ethereum Sepolia</dd>
          </div>
          <div className="border-border-default mt-3 flex items-baseline justify-between gap-4 border-t pt-3">
            <dt className="text-fg-muted text-[14px]">You need</dt>
            <dd className="text-[14px] font-medium">A wallet + Sepolia ETH</dd>
          </div>
          <div className="border-border-default mt-3 flex items-baseline justify-between gap-4 border-t pt-3">
            <dt className="text-fg-muted text-[14px]">Test USDC</dt>
            <dd className="text-[14px] font-medium">Given to you in setup</dd>
          </div>
          <div className="border-border-default mt-3 flex items-baseline justify-between gap-4 border-t pt-3">
            <dt className="text-fg-muted text-[14px]">Sign-up</dt>
            <dd className="text-[14px] font-medium">None</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
