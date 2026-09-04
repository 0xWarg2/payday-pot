"use client";

import { createElement, useEffect, useRef, type HTMLAttributes, type ReactNode } from "react";

export type SpotlightHue = "privacy" | "prize" | "neutral";

/**
 * Viền sáng theo con trỏ — depth kit #02.
 *
 * Toàn bộ việc của nó là set ba CSS var trên chính element (`--spot-x`,
 * `--spot-y`, `--spot-o`); phần vẽ nằm ở `.spot` trong globals.css. Không có
 * state React nên không re-render gì khi chuột di chuyển.
 *
 * `hue` là ngữ nghĩa, không phải trang trí: cyan cho card đang giữ dữ liệu mã
 * hoá, vàng cho card tiền thưởng/công khai. Người dùng học được "màu = loại dữ
 * liệu" từ badge, và spotlight lặp lại cùng bài học đó.
 *
 * Không gắn listener khi thiết bị không có hover (touch) hoặc người dùng tắt
 * motion — khi đó nó là một `<section>` bình thường, không hơn.
 */
export function Spotlight({
  as = "section",
  hue = "privacy",
  className = "",
  children,
  ...rest
}: {
  as?: "section" | "div" | "article" | "aside";
  hue?: SpotlightHue;
  className?: string;
  children?: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, "className" | "children">) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window.matchMedia !== "function") return;
    if (window.matchMedia("(hover: none)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const move = (e: PointerEvent): void => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--spot-x", `${e.clientX - r.left}px`);
      el.style.setProperty("--spot-y", `${e.clientY - r.top}px`);
      el.style.setProperty("--spot-o", "1");
    };
    const leave = (): void => el.style.setProperty("--spot-o", "0");

    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, []);

  return createElement(as, { ...rest, ref, className: `spot ${className}`, "data-spot": hue }, children);
}
