import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Thư mục build tách được qua env — mặc định vẫn là `.next`.
   *
   * `next dev` và `next build` dùng chung một `.next` nhưng ghi hai bộ chunk có
   * quy ước tên khác nhau (dev: `main-app.js`, prod: `main-app-<hash>.js`).
   * Chạy `pnpm build` trong lúc dev server đang sống sẽ xoá sạch chunk dev, và
   * dev server sau đó trả 404 cho đúng những file nó vừa bảo trình duyệt tải.
   * Triệu chứng không hề giống nguyên nhân: trang vẫn SSR ra HTML đầy đủ, chỉ
   * là không có React nào hydrate nó, nên mọi thứ đứng im ở skeleton.
   *
   * `playwright.config.ts` set `NEXT_DIST_DIR=.next-e2e` để `pnpm test:e2e`
   * (vốn `build && start`) không giẫm lên dev server đang chạy.
   */
  distDir: process.env["NEXT_DIST_DIR"] ?? ".next",

  // Bắt buộc cho relayer-sdk WASM threads (cross-origin isolation)
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};

export default nextConfig;
