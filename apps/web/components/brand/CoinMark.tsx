import type { CSSProperties } from "react";

/**
 * Logo: đồng xu 3D của hero, đứng yên, nhìn hơi nghiêng.
 *
 * Cùng một vật với `HeroCoin` (mặt vàng prize, vành tối dần, ký hiệu "¢" mono)
 * nhưng vẽ bằng SVG để dùng được ở 16px lẫn 1200px và không cần
 * `preserve-3d`. Chiều sâu là một ellipse thứ hai lệch xuống-phải, tô màu
 * vành; mặt trước đè lên. Màu đọc từ token qua `var()` với fallback hex đúng
 * bằng token, nên `app/icon.svg` (không có CSS của trang) vẫn ra cùng màu.
 *
 * Trang trí: `aria-hidden`, tên của link/brand vẫn là chữ "PayDay Pot" bên cạnh.
 */
export function CoinMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 } as CSSProperties}
    >
      <CoinArt />
    </svg>
  );
}

/** Phần vẽ, tách ra để `app/icon.svg` và ảnh OG dùng chung một hình. */
export function CoinArt() {
  return (
    <>
      <defs>
        <radialGradient id="pdp-face" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="var(--color-prize-mid, #ffe052)" />
          <stop offset="0.62" stopColor="var(--color-prize, #ffd208)" />
          <stop offset="1" stopColor="var(--color-coin-deep, #b8990c)" />
        </radialGradient>
        <radialGradient id="pdp-shine" cx="32%" cy="28%" r="45%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.15" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Vành: 6 đĩa xếp lệch dần xuống-phải (như 22 đĩa của HeroCoin), đáy tối hơn. */}
      <ellipse cx="33.2" cy="34.0" rx="26" ry="24" fill="var(--color-coin-deep, #b8990c)" />
      <ellipse cx="32.7" cy="33.3" rx="26" ry="24" fill="var(--color-coin-deep, #b8990c)" />
      <ellipse cx="32.1" cy="32.7" rx="26" ry="24" fill="var(--color-coin-deep, #b8990c)" />
      <ellipse cx="31.6" cy="32.0" rx="26" ry="24" fill="var(--color-coin-deep, #b8990c)" />
      <ellipse cx="31.1" cy="31.3" rx="26" ry="24" fill="var(--color-coin-edge, #d0ac0a)" />
      <ellipse cx="30.5" cy="30.7" rx="26" ry="24" fill="var(--color-coin-edge, #d0ac0a)" />
      {/* Mặt trước */}
      <ellipse cx="30" cy="30" rx="26" ry="24" fill="url(#pdp-face)" />
      <ellipse cx="30" cy="30" rx="22.4" ry="20.6" fill="none" stroke="var(--color-prize-light, #fff2b5)" strokeWidth="2.6" />
      <ellipse cx="30" cy="30" rx="20.8" ry="19.1" fill="none" stroke="var(--color-coin-edge, #d0ac0a)" strokeWidth="0.9" />
      <text
        x="30"
        y="30"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace"
        fontWeight="600"
        fontSize="27"
        fill="var(--color-coin-ink, #463f11)"
      >
        ¢
      </text>
      <ellipse cx="30" cy="30" rx="26" ry="24" fill="url(#pdp-shine)" />
    </>
  );
}
