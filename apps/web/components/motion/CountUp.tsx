"use client";

import { useLayoutEffect, useRef, useState } from "react";

const COUNT_MS = 700;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function scale<T extends bigint | number>(value: T, k: number): T {
  return (typeof value === "bigint" ? BigInt(Math.round(Number(value) * k)) : Math.round(value * k)) as T;
}

/**
 * Số PUBLIC đếm lên một lần khi vào view (prize, savers, funded).
 *
 * KHÔNG dùng cho giá trị confidential — số ẩn chỉ có scramble trong
 * `ConfidentialValue`, và `test/motion.test.tsx` chặn import ở các file đó.
 *
 * Mặc định render `format(value)` thành đúng một text node: đó là SSR, jsdom,
 * reduced-motion, và trạng thái sau khi đếm xong — nên mọi `getByText`/so
 * `textContent` giữa hai trang vẫn đúng. Chỉ trong ~700ms đếm mới có hai span
 * (một `aria-hidden` cho mắt, một `.sr-only` giữ số cuối cho screen reader).
 * Đếm từ giá trị thô rồi format lại mỗi frame nên dấu phẩy/thập phân luôn
 * đúng chuẩn của `formatAmount`. Đếm một lần mỗi mount; `value` đổi về sau
 * (poll 15s) hiện thẳng.
 */
export function CountUp<T extends bigint | number>({
  value,
  format = (v) => String(v),
  className,
}: {
  value: T;
  format?: (v: T) => string;
  className?: string;
}) {
  const [frame, setFrame] = useState<T | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const done = useRef(false);

  useLayoutEffect(() => {
    if (done.current) return;
    const el = ref.current;
    if (
      !el ||
      typeof IntersectionObserver === "undefined" ||
      typeof window.matchMedia !== "function" ||
      typeof window.requestAnimationFrame !== "function" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      done.current = true;
      return;
    }
    const target = value;
    if (Number(target) === 0) {
      done.current = true;
      return;
    }
    let raf = 0;
    setFrame(scale(target, 0));

    const run = (start: number) => (now: number): void => {
      const k = Math.min(1, (now - start) / COUNT_MS);
      if (k >= 1) {
        setFrame(null);
        return;
      }
      setFrame(scale(target, easeOutCubic(k)));
      raf = window.requestAnimationFrame(run(start));
    };

    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      done.current = true;
      raf = window.requestAnimationFrame((t) => {
        raf = window.requestAnimationFrame(run(t));
      });
    });
    io.observe(el);
    return () => {
      io.disconnect();
      window.cancelAnimationFrame(raf);
    };
    // Đếm đúng một lần cho giá trị lúc mount; đổi value về sau hiện thẳng.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (frame === null) {
    return (
      <span ref={ref} className={className}>
        {format(value)}
      </span>
    );
  }
  return (
    <span ref={ref} className={className}>
      <span aria-hidden="true">{format(frame)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
