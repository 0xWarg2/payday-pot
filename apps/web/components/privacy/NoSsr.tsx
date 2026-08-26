"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Chỉ render sau khi đã mount trên client.
 *
 * Đây là hàng rào thứ hai cho non-negotiable #5. Hàng rào thứ nhất là
 * `getServerSnapshot` của mỗi store (luôn masked/rỗng), và về lý thuyết nó đủ.
 * Nhưng bất kỳ ai thêm một `useEffect`-free read từ `window`/`localStorage` vào
 * một component con cũng sẽ phá vỡ hàng rào đó, còn cái này thì không phá được:
 * cây con đơn giản là không tồn tại trong HTML server render.
 *
 * Đổi lại là một lần render trống. `fallback` nên có cùng chiều cao với nội
 * dung thật, nếu không layout sẽ giật một nhịp lúc hydrate.
 */
export function NoSsr({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return <>{mounted ? children : fallback}</>;
}
