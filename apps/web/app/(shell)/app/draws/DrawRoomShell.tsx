import type { ReactNode } from "react";

/**
 * Cái hộp làm cho Draw Room trở thành một phòng khác.
 *
 * Không full-bleed bằng `w-screen`/`-ml-[50vw]`: mẹo đó tính theo viewport width
 * *bao gồm* thanh cuộn, nên trên máy có thanh cuộn chiếm chỗ nó đẩy trang lệch
 * vài pixel và tạo cuộn ngang — đúng dòng mà QA Day 8 phải kiểm, và là kiểu lỗi
 * chỉ xuất hiện trên máy người khác. Một tấm nền tối bo góc bên trong layout
 * sáng vừa nói đúng chuyện "bối cảnh khác", vừa không đụng gì tới dòng chảy
 * của trang.
 */
export function DrawRoomShell({ children }: { children: ReactNode }) {
  return (
    <div className="draw-room rounded-card border-draw-border elev-2 border p-5 sm:p-8" data-testid="draw-room">
      {children}
    </div>
  );
}
