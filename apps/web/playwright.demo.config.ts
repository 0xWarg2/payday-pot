import { defineConfig, devices } from "@playwright/test";

/**
 * Config RIÊNG cho demo EOD — không phải config test.
 *
 * Cùng lý do `packages/contracts/demo/` nằm ngoài `test/`: demo là thứ để NGƯỜI
 * XEM, chạy chậm, có lời dẫn, và quay video. Trộn nó vào `pnpm test:e2e` thì
 * suite chậm đi vài phút mỗi lần chạy để đổi lấy một thứ không ai đọc trong CI.
 *
 *   pnpm demo:day6              # mở cửa sổ thật, vừa chạy vừa xem
 *   DEMO_HEADLESS=1 pnpm demo:day6   # không có màn hình (CI, ssh)
 *
 * Video luôn được quay: `test-results/` có file .webm để dán vào submission mà
 * không phải quay màn hình bằng tay.
 */
const PORT = Number(process.env["E2E_PORT"] ?? 3100);

export default defineConfig({
  testDir: "./demo",
  // Một worker, chạy tuần tự: lời dẫn phải đọc được từ trên xuống dưới. Song
  // song thì narration của hai persona xen vào nhau và không ai theo kịp.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  timeout: 300_000,
  // Thư mục RIÊNG, không dùng chung `test-results/` với suite.
  //
  // Playwright xoá sạch outputDir ở đầu mỗi lần chạy. Dùng chung thì một
  // `pnpm test:e2e` chạy sau sẽ xoá mất video demo — và video mới là thứ đem đi
  // nộp, chứ không phải dòng "2 passed".
  outputDir: "demo-results",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    headless: process.env["DEMO_HEADLESS"] === "1",
    // Đủ chậm để mắt bắt kịp mỗi bước, không chậm tới mức quá 5 phút.
    launchOptions: { slowMo: 350 },
    viewport: { width: 1280, height: 800 },
    video: { mode: "on", size: { width: 1280, height: 800 } },
    trace: "off",
  },
  projects: [{ name: "demo", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: true,
    timeout: 180_000,
    env: { NEXT_DIST_DIR: ".next-e2e" },
  },
});
