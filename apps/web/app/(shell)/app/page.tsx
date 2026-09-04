import type { CSSProperties, ReactNode } from "react";

import { EmployerBoostCard } from "@/components/dashboard/EmployerBoostCard";
import { NextDrawCard } from "@/components/dashboard/NextDrawCard";
import { PrivateActivityList } from "@/components/dashboard/PrivateActivityList";
import { PrivatePositionCard } from "@/components/dashboard/PrivatePositionCard";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { TwabCard } from "@/components/dashboard/TwabCard";
import { Words } from "@/components/motion/Words";
import { RevealSessionStrip } from "@/components/privacy/RevealSessionStrip";
import { PendingUnwrapBanner } from "@/components/tx/PendingUnwrapBanner";

export const metadata = {
  title: "Dashboard · PayDay Pot",
  description: "Your confidential position in the pool, and the public state of the current round.",
};

/**
 * Dashboard.
 *
 * Thứ tự đọc đổi theo bề ngang, và đổi có lý do (§7):
 *   - Mobile: vòng quay TRƯỚC vị thế. Trên điện thoại người ta mở app để hỏi
 *     "sắp quay chưa, giải bao nhiêu" — câu hỏi công khai. Vị thế riêng tư đòi
 *     một chữ ký, và bắt cuộn qua một thẻ bị che để tới thứ mình cần thì lần nào
 *     cũng vô ích.
 *   - Desktop: vị thế bên trái (5 cột), vòng quay bên phải (7). Mắt đọc từ trái
 *     sang, và trên màn hình rộng thì cả hai cùng nằm trong tầm nhìn nên không
 *     còn phải chọn cái nào trước.
 *
 * Trang KHÔNG bọc trong `WalletGate`: phần công khai — giải, đếm ngược, số người
 * tham gia — đọc được mà không cần ví, vì read đi qua RPC Sepolia cố định. Chỉ
 * những thẻ riêng tư mới tự hỏi ví, và mỗi thẻ tự nói ra nó đang thiếu gì.
 */
export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-4">
      {/* Không có câu dẫn: badge Encrypted/Public trên từng thẻ và footer đã nói điều đó. */}
      <h1 className="enter text-[26px] font-semibold tracking-tight sm:text-[30px]">
        <Words>Your pool</Words>
      </h1>

      <PendingUnwrapBanner />
      <RevealSessionStrip />

      <div className="bento grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Cell n={0} mobile="order-2" desktop="lg:order-1 lg:col-span-5">
          <PrivatePositionCard />
        </Cell>
        <Cell n={1} mobile="order-1" desktop="lg:order-2 lg:col-span-7">
          <NextDrawCard />
        </Cell>

        <Cell n={2} mobile="order-4" desktop="lg:order-3 lg:col-span-4">
          <TwabCard />
        </Cell>
        <Cell n={3} mobile="order-3" desktop="lg:order-4 lg:col-span-8">
          <QuickActions />
        </Cell>

        <Cell n={4} mobile="order-5" desktop="lg:order-5 lg:col-span-12">
          <EmployerBoostCard />
        </Cell>

        <Cell n={5} mobile="order-6" desktop="lg:order-6 lg:col-span-12">
          <PrivateActivityList />
        </Cell>
      </div>
    </div>
  );
}

/**
 * `order-*` chỉ có tác dụng khi con nằm trực tiếp trong grid, nên mỗi thẻ cần
 * một ô mang class thay vì tự mang. Bọc như vậy cũng giữ cho component thẻ không
 * biết gì về chỗ nó được đặt — đó là việc của trang.
 */
function Cell({ n, mobile, desktop, children }: { n: number; mobile: string; desktop: string; children: ReactNode }) {
  // `n` = thứ tự đọc trên desktop (0..5): mỗi ô vào chậm hơn ô trước 60ms (`.enter`).
  return (
    <div className={`enter ${mobile} ${desktop}`} style={{ "--n": n } as CSSProperties}>
      {children}
    </div>
  );
}
