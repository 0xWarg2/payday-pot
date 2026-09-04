import { useEffect, useState, type RefObject } from "react";

/** `null` = chưa biết (SSR / trước effect), `false` = chờ vào view, `true` = đã vào (không quay lại). */
export type InViewState = null | false | true;

/**
 * "Đã vào viewport chưa" — một lần, không quay lại.
 *
 * Trả `true` ngay khi không có gì để chờ: không `IntersectionObserver`, không
 * `matchMedia`, hoặc người dùng tắt motion (cùng luật bail với `Spotlight`).
 * Element đang ở trong màn lúc mount cũng là `true` ngay — không được làm thứ
 * đã vẽ nhấp nháy biến mất rồi hiện lại.
 */
export function useInView(ref: RefObject<Element | null>, opts?: { rootMargin?: string }): InViewState {
  const [state, setState] = useState<InViewState>(null);
  const rootMargin = opts?.rootMargin ?? "0px 0px -12% 0px";

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (
      typeof IntersectionObserver === "undefined" ||
      typeof window.matchMedia !== "function" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setState(true);
      return;
    }
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight && r.bottom > 0) {
      setState(true);
      return;
    }
    setState(false);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setState(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin]);

  return state;
}
