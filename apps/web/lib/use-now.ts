"use client";

import { useEffect, useState } from "react";

/**
 * Đồng hồ chung cho countdown và TTL.
 *
 * Trả `null` cho tới khi mount xong — cố ý. `Date.now()` lúc render server khác
 * `Date.now()` lúc hydrate, nên mọi countdown render thẳng từ nó đều là một
 * hydration mismatch đang chờ xảy ra. Bắt caller xử lý `null` rẻ hơn nhiều so
 * với việc đi truy một cảnh báo hydration mơ hồ về sau.
 */
export function useNow(intervalMs: number = 1_000): number | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
