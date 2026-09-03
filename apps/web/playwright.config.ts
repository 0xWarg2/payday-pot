import { defineConfig, devices } from "@playwright/test";

/**
 * Cổng riêng, không phải 3000: dev server thường đang chạy sẵn ở đó, và một
 * e2e run bám vào dev server là e2e run không kiểm tra được production build.
 */
const PORT = Number(process.env["E2E_PORT"] ?? 3100);

/**
 * `E2E_BASE_URL` trỏ cả suite vào một deployment đã public thay vì build cục
 * bộ — đó là cách duy nhất kiểm dòng exit gate "full cycle từ public URL" bằng
 * chính bộ test, thay vì bằng một lần bấm tay rồi ghi "đã kiểm".
 *
 * Khi có nó thì **không** dựng webServer: dựng lên rồi vẫn gọi ra ngoài chỉ
 * tổ tốn 3 phút build và tạo ảo giác là mình đang test bản local.
 */
const EXTERNAL = process.env["E2E_BASE_URL"];

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  reporter: process.env["CI"] ? "github" : "list",
  use: {
    baseURL: EXTERNAL ?? `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      // 320px là bề ngang nhỏ nhất còn phải dùng được (§7). Không phải chuyện
      // hoàn hảo chủ nghĩa: một grid tràn ngang ở đây làm cả trang cuộn ngang,
      // và trên máy để bàn thì không có triệu chứng nào để mà nhìn thấy.
      name: "mobile-320",
      use: { ...devices["Desktop Chrome"], viewport: { width: 320, height: 720 }, isMobile: false },
      testMatch: /shell\.spec\.ts/,
    },
  ],
  ...(EXTERNAL
    ? {}
    : {
        webServer: {
          // `next build && next start` chứ không phải `next dev`: relayer SDK chỉ
          // được chứng minh chạy trong production build (spike Day 1), và COOP/COEP
          // là thứ dễ khác nhau giữa dev và prod nhất.
          command: `pnpm build && pnpm start --port ${PORT}`,
          url: `http://127.0.0.1:${PORT}`,
          reuseExistingServer: !process.env["CI"],
          timeout: 180_000,
          // Build ra thư mục RIÊNG. Cổng riêng thôi thì chưa đủ tách: hai tiến trình
          // Next khác nhau vẫn ghi đè chunk của nhau nếu cùng `distDir`, và hậu quả
          // rơi vào dev server chứ không vào e2e — nó phục vụ 404 cho chunk client và
          // trang chết lặng ở skeleton mà không có lỗi nào nói vì sao.
          env: { NEXT_DIST_DIR: ".next-e2e" },
        },
      }),
});
