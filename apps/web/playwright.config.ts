import { defineConfig, devices } from "@playwright/test";

/**
 * Cổng riêng, không phải 3000: dev server thường đang chạy sẵn ở đó, và một
 * e2e run bám vào dev server là e2e run không kiểm tra được production build.
 */
const PORT = Number(process.env["E2E_PORT"] ?? 3100);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  reporter: process.env["CI"] ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // `next build && next start` chứ không phải `next dev`: relayer SDK chỉ
    // được chứng minh chạy trong production build (spike Day 1), và COOP/COEP
    // là thứ dễ khác nhau giữa dev và prod nhất.
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env["CI"],
    timeout: 180_000,
  },
});
