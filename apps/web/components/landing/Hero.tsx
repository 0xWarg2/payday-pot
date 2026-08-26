import Link from "next/link";

/**
 * `<h1>` phải là đúng chuỗi "PayDay Pot" — e2e smoke pin nó, và đó là một
 * ràng buộc có lý do: đây là tên sản phẩm, không phải slogan. Lời hứa nằm ngay
 * dưới, ở cỡ chữ lớn hơn cả h1, nên thứ tự đọc bằng mắt vẫn là "lời hứa trước,
 * tên sau" trong khi cây heading vẫn đúng cho screen reader.
 */
export function Hero() {
  return (
    <section className="pt-14 pb-16 sm:pt-20 sm:pb-24">
      <p className="text-fg-muted flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
        <span className="border-border-default rounded-full border px-2.5 py-1">Sepolia testnet</span>
        <span className="bg-privacy-subtle rounded-full px-2.5 py-1">Balances encrypted end to end</span>
      </p>

      <h1 className="mt-6 text-[40px] leading-none font-semibold tracking-tight sm:text-[52px]">PayDay Pot</h1>

      <p className="mt-5 max-w-[36ch] text-[26px] leading-tight font-medium tracking-tight sm:max-w-[24ch] sm:text-[38px]">
        Save together. Keep every cent. One of you wins the prize.
      </p>

      <p className="text-fg-muted mt-5 max-w-[60ch] text-[17px] leading-relaxed">
        A savings pool where your deposit is never at risk and the prize comes from your employer, not from other
        savers. Your balance, your odds and your winnings are encrypted on chain — the pool computes on them without
        ever seeing them, and neither can anyone else.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link
          data-cta
          href="/onboarding"
          className="rounded-control bg-action text-on-action hover:bg-action-hover inline-flex items-center px-6 text-[16px] font-medium transition-colors duration-(--duration-hover) ease-(--ease-ui)"
        >
          Start setup
        </Link>
        <a
          data-cta
          href="#how-it-works"
          className="rounded-control border-border-default bg-surface hover:bg-subtle inline-flex items-center px-5 text-[16px] font-medium transition-colors duration-(--duration-hover) ease-(--ease-ui)"
        >
          How it works
        </a>
      </div>

      <p className="text-fg-muted mt-4 text-[13px]">
        Test money only. No account, no email — a browser wallet is all it takes.
      </p>
    </section>
  );
}
