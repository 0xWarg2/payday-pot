/**
 * Shell: điều hướng, guard, bàn phím, 320px.
 *
 * Chạy trên cả hai project (`chromium` và `mobile-320`) — cùng một spec, hai bề
 * ngang. Đó là chủ ý: layout 320px hỏng theo kiểu không ai thấy trên máy để bàn,
 * và một suite chỉ chạy ở 1280px sẽ xanh suốt trong lúc trang tràn ngang trên
 * điện thoại của giám khảo.
 */

import { expect, test } from "@playwright/test";

import { installWallet } from "./fixtures/wallet";

test.describe("routes render without a wallet", () => {
  // Phần công khai đọc qua RPC Sepolia cố định, nên không route nào được đòi ví
  // chỉ để hiện chữ. `/docs/known-limitations` là đích của link trong error
  // taxonomy — 69 test copy trỏ vào nó, và một 404 ở đó là ngõ cụt.
  for (const path of ["/", "/onboarding", "/app", "/app/savings", "/employer", "/docs/known-limitations"]) {
    test(`${path} answers 200 and shows a heading`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    });
  }
});

test.describe("no horizontal overflow", () => {
  for (const path of ["/", "/onboarding", "/app"]) {
    test(`${path} fits its viewport`, async ({ page }) => {
      await installWallet(page);
      await page.goto(path);
      await page.getByRole("heading", { level: 1 }).waitFor();

      const overflow = await page.evaluate(() => {
        const el = document.documentElement;
        return { scroll: el.scrollWidth, client: el.clientWidth };
      });
      // 1px sai số cho subpixel rounding; nhiều hơn thế là tràn thật.
      expect(overflow.scroll, `scrollWidth ${overflow.scroll} vs ${overflow.client}`).toBeLessThanOrEqual(
        overflow.client + 1,
      );
    });
  }
});

test.describe("keyboard", () => {
  test("tab reaches the primary action on the landing page", async ({ page }) => {
    await page.goto("/");

    // Đi tối đa 20 tab để tới một control dùng được. Nhiều hơn thế thì về mặt
    // kỹ thuật vẫn "accessible", nhưng trên thực tế không ai tới được.
    let reached = false;
    for (let i = 0; i < 20 && !reached; i++) {
      await page.keyboard.press("Tab");
      const active = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        return { tag: el.tagName, text: (el.textContent ?? "").trim().slice(0, 40) };
      });
      if (active && (active.tag === "A" || active.tag === "BUTTON") && active.text.length > 0) reached = true;
    }
    expect(reached, "no focusable link or button within 20 tabs").toBe(true);
  });

  test("every focused control shows a visible focus ring", async ({ page }) => {
    await installWallet(page);
    await page.goto("/app");
    await page.getByRole("heading", { level: 1 }).waitFor();

    const focusable = await page.locator("a[href], button:not([disabled])").all();
    expect(focusable.length).toBeGreaterThan(0);

    for (const control of focusable.slice(0, 12)) {
      if (!(await control.isVisible())) continue;
      await control.focus();
      const ring = await control.evaluate((el) => {
        const s = getComputedStyle(el);
        return { outlineWidth: s.outlineWidth, outlineStyle: s.outlineStyle, boxShadow: s.boxShadow };
      });
      // `outline: none` mà không thay bằng box-shadow là cách phổ biến nhất để
      // làm bàn phím không dùng được, và nó luôn xảy ra do một dòng CSS reset.
      const visible =
        (ring.outlineStyle !== "none" && parseFloat(ring.outlineWidth) > 0) || ring.boxShadow !== "none";
      expect(visible, `no focus indicator on "${(await control.textContent())?.trim().slice(0, 30)}"`).toBe(true);
    }
  });
});

test.describe("onboarding", () => {
  test("starts at the role step and remembers the choice across a reload", async ({ page }) => {
    await installWallet(page);
    await page.goto("/onboarding");

    // Radio thật, không phải div gắn onClick — nên `getByRole("radio")` là cách
    // đúng để chọn, và nếu nó ngừng là radio thì test này đỏ, đúng như mong muốn.
    const employee = page.getByRole("radio", { name: /I want to save/i });
    await expect(employee).toBeVisible();
    await employee.check();
    await page.getByRole("button", { name: "Continue" }).click();

    await page.reload();
    // Bước hiện tại được SUY RA từ facts, không persist con trỏ. Reload xong mà
    // quay lại bước 1 nghĩa là role đã mất — và người dùng phải làm lại từ đầu.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const role = await page.evaluate(() => localStorage.getItem("pdp.role.v1"));
    expect(role).toBeTruthy();
  });
});
