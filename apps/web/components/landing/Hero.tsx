import Link from "next/link";

import { HeroCoin } from "./HeroCoin";

/**
 * `<h1>` phải là đúng chuỗi "PayDay Pot" — e2e smoke pin nó, và đó là một
 * ràng buộc có lý do: đây là tên sản phẩm, không phải slogan. Lời hứa nằm ngay
 * dưới, ở cỡ chữ lớn hơn cả h1, nên thứ tự đọc bằng mắt vẫn là "lời hứa trước,
 * tên sau" trong khi cây heading vẫn đúng cho screen reader.
 *
 * Nền "soft light" (depth kit #01): bốn blob gradient vàng/lime/cyan trôi rất
 * chậm sau chữ. Bên phải (từ `sm`) là đồng xu 3D thuần CSS — vàng là "tiền
 * thưởng", và đây là đồ vật duy nhất trên trang được mang màu đó ngoài badge.
 * Một câu dẫn, hai nút, một dòng chữ nhỏ: phần còn lại nằm trong /docs.
 *
 * Chữ vào màn theo bậc (`.hero-in`, `--n` = thứ tự): pill → tên → ba dòng lời
 * hứa từng dòng → câu dẫn → nút. Chỉ opacity + translateY, 700ms, một lần khi
 * tải; reduced-motion hiện ngay. Không phải hiệu ứng lặp — là thứ tự đọc.
 */
const PROMISE_LINES = ["Save together.", "Keep every cent.", "One of you wins the prize."] as const;

function stagger(n: number): React.CSSProperties {
  return { "--n": n } as React.CSSProperties;
}
export function Hero() {
  return (
    <section className="rounded-sheet border-border-default bg-surface relative isolate mt-6 overflow-hidden border px-6 pt-12 pb-12 sm:mt-8 sm:px-12 sm:pt-16 sm:pb-16">
      <div aria-hidden="true" className="glow-field">
        <span className="glow-a" />
        <span className="glow-b" />
        <span className="glow-c" />
        <span className="glow-d" />
      </div>

      <div className="relative grid gap-8 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-center">
        <div>
          <p className="hero-in text-fg-muted flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-caption tracking-[0.02em]" style={stagger(0)}>
            <span className="border-border-default bg-surface/70 rounded-full border px-2.5 py-1">Sepolia testnet</span>
            <span className="bg-privacy-subtle text-fg inline-flex items-center gap-1.5 rounded-full px-2.5 py-1">
              <span aria-hidden="true" className="bg-privacy size-1.5 rounded-full" />
              Balances encrypted
            </span>
            <span className="bg-prize-soft border-prize/60 text-fg inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1">
              <span aria-hidden="true" className="bg-prize size-1.5 rounded-full" />
              Prize sponsored
            </span>
          </p>

          <h1 className="hero-in mt-6 text-h1 leading-none font-semibold tracking-tight sm:text-display" style={stagger(1)}>
            PayDay Pot
          </h1>

          <p className="mt-5 max-w-[36ch] text-[26px] leading-tight font-medium tracking-tight sm:max-w-[24ch] sm:text-[38px]">
            {PROMISE_LINES.map((line, i) => (
              <span key={line} className="hero-in block" style={stagger(2 + i)}>
                {line}
              </span>
            ))}
          </p>

          <p className="hero-in text-fg-muted mt-5 max-w-[48ch] text-lead leading-relaxed" style={stagger(5)}>
            Never at risk. Encrypted, even from the pool.
          </p>

          <div className="hero-in mt-8 flex flex-wrap items-center gap-3" style={stagger(6)}>
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
              className="rounded-control border-border-default bg-surface hover:bg-subtle inline-flex items-center border px-5 text-[16px] font-medium transition-colors duration-(--duration-hover) ease-(--ease-ui)"
            >
              How it works
            </a>
          </div>

          <p className="hero-in text-fg-muted mt-4 text-small" style={stagger(7)}>
            Testnet · test money only
          </p>
        </div>

        <HeroCoin />
      </div>
    </section>
  );
}
