/**
 * Danh sách hình vẽ trong Docs — data-only, để file nội dung vẫn là dữ liệu
 * thuần và không kéo component vào. Component thật nằm ở
 * `components/docs/figures/`; `FIGURES` bên đó là `Record<FigureId, …>` nên
 * thêm id ở đây mà quên vẽ là lỗi type, không phải một ô trống trên trang.
 */
export const FIGURE_IDS = [
  "setup-path",
  "round-lifecycle",
  "encrypted-vs-public",
  "prize-source",
  "who-can-decrypt",
  "draw-scan",
] as const;

export type FigureId = (typeof FIGURE_IDS)[number];
