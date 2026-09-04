"use client";

import { NoSsr } from "@/components/privacy/NoSsr";
import { HistoryList } from "@/components/tx/HistoryList";

/**
 * Lịch sử — và cố ý là một lịch sử KÉM đầy đủ.
 *
 * Không có số tiền, không có chỉ báo bạn thắng hay không, không có gì mà một ảnh
 * chụp màn hình gửi cho người khác có thể tiết lộ (§11.4). Hai nguồn: những gì
 * tab này từng gửi (localStorage) và bốn event của pool đọc từ chain theo địa
 * chỉ ví — cả hai đều không mang amount. Không backend.
 *
 * `NoSsr` không phải để tránh warning: render localStorage ở server là không thể,
 * và một danh sách nhấp nháy giữa rỗng và có dữ liệu ở màn hình tiền bạc thì
 * trông như vừa mất một giao dịch.
 */
export function HistoryPanel() {
  return (
    <NoSsr>
      <div className="border-border-default rounded-card border p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[15px] font-semibold tracking-tight">Your transactions</p>
          <span className="text-fg-muted text-[12px]">no amounts recorded</span>
        </div>
        <HistoryList />
        <p className="text-fg-muted mt-3 max-w-[68ch] text-[13px] leading-relaxed">
          <span className="text-fg font-medium">Pending</span> means no block has included it yet;
          <span className="text-fg font-medium"> Unknown</span> means this browser could not reach Sepolia to ask.
          Either way the hash opens on the explorer.
        </p>
      </div>
    </NoSsr>
  );
}
