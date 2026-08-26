import type { ReactNode } from "react";

import { AppProviders } from "@/components/shell/AppProviders";
import { AppShell } from "@/components/shell/AppShell";

/**
 * Route group `(shell)` — mọi màn hình có app chrome sống ở đây.
 *
 * Landing (`/`) và onboarding (`/onboarding`) cố ý nằm NGOÀI group này. Landing
 * vì nó là một cây server thuần: không store, không ví, nên bài test "HTML từ
 * server không chứa giá trị nào" ở đó không phải chứng minh gì cả. Onboarding
 * vì nó là màn hình full-bleed — có sẵn thanh nav trỏ tới những trang chưa dùng
 * được thì chỉ tổ mời người ta đi lạc giữa chừng.
 */
export default function ShellLayout({ children }: { children: ReactNode }) {
  return (
    <AppProviders>
      <AppShell>{children}</AppShell>
    </AppProviders>
  );
}
