import { expect, test } from "@playwright/test";

/**
 * Smoke — chứng minh production build lên được và cross-origin isolation còn
 * nguyên. COOP/COEP là điều kiện sống của relayer-sdk (WASM threads); mất nó
 * thì mọi thao tác encrypt/decrypt chết, và nó là loại config im lặng biến mất
 * khi ai đó sửa next.config.
 */
test("serves the landing page cross-origin isolated", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  expect(response?.headers()["cross-origin-opener-policy"]).toBe("same-origin");
  expect(response?.headers()["cross-origin-embedder-policy"]).toBe("require-corp");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("PayDay Pot");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(245, 242, 234)");
  expect(await page.evaluate(() => window.crossOriginIsolated)).toBe(true);
});
