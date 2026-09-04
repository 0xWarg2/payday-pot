"use client";

import { createElement, useEffect, useRef, type HTMLAttributes, type ReactNode } from "react";

/**
 * Nghiêng theo con trỏ — depth kit #07.
 *
 * Cùng mẫu `Spotlight`: chỉ set CSS var trên chính element, không state React,
 * không re-render khi chuột di. Góc tối đa 6° — đủ để thấy thẻ là một tấm
 * phẳng trong không gian, chưa đủ để chữ khó đọc.
 *
 * Không gắn listener khi thiết bị không có hover hoặc người dùng tắt motion —
 * khi đó nó là một element bình thường mang class `tilt` mà CSS đã vô hiệu.
 */
export function Tilt({
  as = "div",
  max = 6,
  className = "",
  children,
  ...rest
}: {
  as?: "section" | "div" | "article" | "aside";
  /** Góc nghiêng tối đa, độ. */
  max?: number;
  className?: string;
  children?: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, "className" | "children">) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window.matchMedia !== "function") return;
    if (window.matchMedia("(hover: none)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      el.classList.remove("is-resting");
      el.style.setProperty("--ry", `${(px * max * 2).toFixed(2)}deg`);
      el.style.setProperty("--rx", `${(-py * max * 2).toFixed(2)}deg`);
    };
    const onLeave = () => {
      el.classList.add("is-resting");
      el.style.setProperty("--rx", "0deg");
      el.style.setProperty("--ry", "0deg");
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [max]);

  return createElement(as, { ...rest, ref, className: `tilt ${className}` }, children);
}
