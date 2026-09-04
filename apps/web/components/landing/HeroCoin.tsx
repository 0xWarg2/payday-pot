/**
 * Đồng xu 3D thuần CSS (depth kit Tier B).
 *
 * Một đĩa gồm nhiều lớp xếp theo `translateZ` trong `transform-style:
 * preserve-3d`, quay chậm bằng `rotateY`. Không JS, không ảnh, không dữ liệu:
 * nó là một vật trang trí và được đánh dấu như vậy (`aria-hidden`). Ẩn dưới
 * `sm` — ở 320px hero chỉ có chỗ cho chữ. Reduced-motion: đứng yên ở 25°.
 *
 * Ký hiệu trên mặt là "¢" — "keep every cent" — không phải logo của ai.
 */
/**
 * Rìa = 22 đĩa phẳng xếp cách 1px (xem `--half`/`--gap` trong globals.css).
 * `--i` là vị trí theo Z; `--shade` là độ tối, đối xứng qua tâm (1…11…1) để nhìn
 * từ mặt nào rìa cũng tối dần vào giữa và hai nửa vòng quay giống nhau.
 */
const EDGE_COUNT = 22;
const EDGES: ReadonlyArray<readonly [number, number]> = Array.from({ length: EDGE_COUNT }, (_, k) => {
  const i = k + 1;
  return [i, Math.min(i, EDGE_COUNT + 1 - i)] as const;
});

export function HeroCoin() {
  return (
    <div aria-hidden="true" className="coin-stage hidden sm:block">
      <div className="coin">
        <span className="coin-face coin-face-front">¢</span>
        {EDGES.map(([i, shade]) => (
          <span key={i} className="coin-edge" style={{ "--i": i, "--shade": shade } as React.CSSProperties} />
        ))}
        <span className="coin-face coin-face-back">¢</span>
      </div>
      <span className="coin-shadow" />
    </div>
  );
}
