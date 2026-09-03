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
 */
export function EncryptedDrawOrb({ phase, progress }: { phase: EpochPhase; progress: number }) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  // Vòng ngoài mở dần theo tiến độ. Dùng dasharray thay vì transform để không có
  // gì chuyển động khi state không đổi.
  const circumference = 2 * Math.PI * 52;
  const arc = phase === "Open" ? 0 : circumference * clamped;

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 128 128"
      className="size-[112px] shrink-0 sm:size-[128px]"
      role="presentation"
    >
      <defs>
        <radialGradient id="orb-core" cx="38%" cy="32%" r="72%">
          <stop offset="0%" stopColor="var(--color-privacy)" stopOpacity="0.55" />
          <stop offset="55%" stopColor="var(--color-draw-violet)" stopOpacity="0.45" />
          <stop offset="100%" stopColor="var(--color-draw-canvas)" stopOpacity="0.9" />
        </radialGradient>
      </defs>

      <circle cx="64" cy="64" r="40" fill="url(#orb-core)" />
      <circle cx="64" cy="64" r="40" fill="none" stroke="var(--color-draw-border)" strokeWidth="1" />

      {/* Rãnh của vòng tiến độ — luôn hiện, để phần chưa xong có hình dạng. */}
      <circle cx="64" cy="64" r="52" fill="none" stroke="var(--color-draw-border)" strokeWidth="2" />
      {arc > 0 ? (
        <circle
          cx="64"
          cy="64"
          r="52"
          fill="none"
          stroke="var(--color-privacy)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={`${arc} ${circumference}`}
          transform="rotate(-90 64 64)"
        />
      ) : null}
    </svg>
  );
}
