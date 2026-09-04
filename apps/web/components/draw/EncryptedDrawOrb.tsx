import type { CSSProperties } from "react";
import type { EpochPhase } from "@payday-pot/sdk";

/**
 * Orb — trang trí, và chỉ trang trí.
 *
 * Nó nhận ĐÚNG hai thứ: `phase` và tỉ lệ tiến độ, cả hai đều đọc được từ chain
 * bởi bất kỳ ai. Không có prop nào ở đây mang dữ liệu của ví đang xem, nên
 * không có đường nào để hình ảnh này khác nhau giữa người thắng và người thua —
 * đó là ràng buộc thật, không phải lời hứa: một prop mới muốn lọt vào đây thì
 * phải đi qua chữ ký hàm.
 *
 * `aria-hidden` vì mọi thông tin nó gợi ý đều đã có ở timeline ngay bên cạnh
 * dưới dạng chữ. Một hình tròn phát sáng không nói được "3 trên 12 đã đóng
 * băng"; đọc nó lên cho screen reader chỉ tạo tiếng ồn.
 *
 * Không animation loop: `EXECUTION_PLAN` Day 8 nói orb tĩnh là đủ, và một vòng
 * xoay vô hạn trong lúc chờ block là thứ đầu tiên `prefers-reduced-motion` phải
 * gỡ bỏ — nên tốt nhất là đừng thêm vào để rồi phải gỡ.
 *
 * Day 10 (depth kit #05): đổi từ SVG phẳng sang khối cầu CSS — bốn lớp
 * radial-gradient + inset shadow đọc như một quả cầu thuỷ tinh tối, vòng tiến
 * độ là conic-gradient. Chữ ký hàm, aria, kích thước: giữ nguyên.
 */
export function EncryptedDrawOrb({ phase, progress }: { phase: EpochPhase; progress: number }) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  // Vòng ngoài mở dần theo tiến độ; ở "Open" chỉ có rãnh, để phần chưa xong có
  // hình dạng. Không có gì chuyển động khi state không đổi.
  const fill = phase === "Open" ? 0 : clamped;

  return (
    <div
      aria-hidden="true"
      role="presentation"
      className="relative grid size-[112px] shrink-0 place-items-center sm:size-[128px]"
    >
      <div className="orb-ring absolute inset-0" style={{ "--orb-p": fill } as CSSProperties} />
      <div className="orb-sphere size-[80px] sm:size-[92px]" />
    </div>
  );
}
