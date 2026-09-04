"use client";

import { createElement, useRef, type HTMLAttributes, type ReactNode } from "react";

import { useInView } from "@/lib/motion/use-in-view";

/**
 * Vỏ đánh dấu `data-in` cho con `.word/.fade/.in-item/.typed/.link-draw`.
 *
 * Server HTML không có attr ⇒ con hiện bình thường (progressive, không phụ
 * thuộc JS). Phía client: `"false"` giữ con ẩn tới khi section vào viewport,
 * `"true"` thả cho animation chạy. Không đọc store, không đọc ví — chỉ đọc
 * geometry của chính element, nên landing vẫn là "cây server thuần" về dữ liệu.
 */
export function InView({
  as = "div",
  className = "",
  children,
  ...rest
}: {
  as?: "section" | "div" | "article" | "ol" | "ul";
  className?: string;
  children?: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, "className" | "children">) {
  const ref = useRef<HTMLElement>(null);
  const state = useInView(ref);
  return createElement(
    as,
    { ...rest, ref, className, "data-in": state === null ? undefined : state ? "true" : "false" },
    children,
  );
}
