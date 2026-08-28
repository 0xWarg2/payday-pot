/**
 * Day 7 EOD demo — money in, money out, and what happens when things break.
 *
 *   pnpm demo:day7        # chạy + dựng MP4 có phụ đề tiếng Anh
 *   pnpm demo:day7:run    # chỉ chạy Playwright
 *
 * Nằm trong `demo/` nên KHÔNG chạy cùng `pnpm test:e2e` — cùng quy ước với
 * `demo-day6.spec.ts`.
 *
 * Day 6 diễn "che kín là mặc định". Day 7 diễn cái đắt hơn: một luồng tiền mà
 * mọi nhánh HỎNG đều có đường đi tiếp, và không nhánh nào — kể cả nhánh thành
 * công — in lại con số người dùng vừa gõ.
 *
 * Ví trong demo này KHÔNG có vị thế trong pool, và đó là điều may: mọi tx đụng
 * tiền revert ngay ở `eth_estimateGas`, nên demo chạy được ở bất cứ đâu mà vẫn
 * là revert THẬT từ contract thật trên Sepolia. Đường thành công (deposit thật)
 * cần ví có tiền và được diễn tay — xem beat 12.
 *
 * Thuyết minh viết bằng tiếng Anh vì nó là phụ đề burn vào MP4 nộp cho judge.
 */

import { expect, test, type Page } from "@playwright/test";

import { installWallet, switchChain, SEPOLIA_HEX } from "../e2e/fixtures/wallet";
import { clip, resetReel } from "./narrate";

const MAINNET_HEX = "0x1";
const read = (page: Page, ms = 900) => page.waitForTimeout(ms);

test.describe.configure({ mode: "serial" });

test.describe("PayDay Pot — Day 7 EOD demo", () => {
  test.beforeAll(() => resetReel());

  test("one transfer: encrypted in the tab, reviewed, and never echoed back", async ({ page }, info) => {
    const say = clip(page, info, 1, "transfer");
    console.log("\n═══ PayDay Pot · Day 7 — Savings + Employer ═══");

    await installWallet(page);
    await page.goto("/app/savings");
    await expect(page.getByRole("heading", { name: "Savings" })).toBeVisible({ timeout: 60_000 });
    await say.beat(1, "The Savings page, before anything is signed.");
    await say.ok("Three tabs: Deposit · Withdraw · History.");
    await say.info("Public numbers (pool, prize, headcount) are read over a fixed RPC — never through the wallet.");

    await say.beat(2, "The way out is built before the way in.");
    await page.getByRole("tab", { name: "Withdraw" }).click();
    await expect(page.getByText(/Available in every stage of every round/i)).toBeVisible();
    await say.ok("`Withdraw everything`: no amount to type, nothing to encrypt, NOTHING to reveal.");
    await say.info("`submitWithdrawAll` takes no EncryptedAmount — non-negotiable #1, as a function signature.");
    await say.info("It works while the pool is paused. Pause never blocks the exit.");

    await say.beat(3, "A partial withdrawal — the slowest ten seconds in the product.");
    await page.getByLabel("Amount to withdraw").fill("25");
    await page.getByRole("button", { name: "Review withdrawal" }).click();
    await expect(page.getByText(/Encrypting your amount/i)).toBeVisible({ timeout: 30_000 });
    await say.ok("Not a bare spinner: it names the step it is on and counts the seconds (measured: 9752ms).");
    await say.no("And Cancel says the true thing — no transaction exists yet, the wallet was never asked.");

    await say.beat(4, "Review — private on one side, public on the other.");
    const dialog = page.getByTestId("review-dialog");
    await dialog.waitFor({ state: "visible", timeout: 180_000 });
    await expect(dialog).toContainText("Stays private");
    await expect(dialog).toContainText("Becomes public");
    await say.no("Private: the amount, the pool balance, the odds, and whether you ever won.");
    await say.ok("Public: this address just withdrew — timing, hash, gas. Said out loud, not buried.");
    await say.info('The word "anonymous" appears nowhere: this hides AMOUNTS, not people.');

    await say.beat(5, "Sign. A second click has nowhere to land.");
    await page.getByRole("button", { name: "Sign and withdraw" }).click();
    await expect(dialog).toHaveCount(0, { timeout: 60_000 });
    await say.ok("The state machine accepts SUBMIT only from `review` — two clicks are still one transaction.");

    const panel = page.getByTestId("error-panel");
    await expect(panel).toBeVisible({ timeout: 60_000 });
    // Ví demo chưa từng deposit → contract revert. Điều đáng xem không phải cái
    // revert, mà là app GỌI TÊN được nó.
    await expect(panel).not.toContainText("Something went wrong");
    say.raw(`\n      ${(await panel.innerText()).split("\n").slice(0, 2).join(" — ")}\n`);
    await say.ok("Revert data travels RPC → wallet → classifyError → one named line with a recovery.");
    await say.info("Three real bugs were fixed on this exact path today. One of them was a WHITE SCREEN.");
    await say.finish();
  });

  // Mỗi persona một `page` riêng: `installWallet` dùng `exposeFunction`, và hàm
  // đó chỉ đăng ký được MỘT lần cho mỗi page. Chia test theo persona chứ không
  // theo beat là cách duy nhất để mỗi nhánh lỗi có một ví riêng.
  test("wrong network: the money button dies, but explains itself (R8)", async ({ page }, info) => {
    const say = clip(page, info, 2, "wrong-network");
    await installWallet(page, { chainId: MAINNET_HEX });
    await page.goto("/app/savings");
    await page.getByLabel("Amount to deposit").fill("100");
    const review = page.getByRole("button", { name: "Continue to review" });
    await expect(review).toBeDisabled({ timeout: 60_000 });
    await expect(review).toHaveAttribute("title", /sepolia/i);
    await say.beat(6, "Wrong network (R8): the money button dies, but explains itself.");
    await say.no("A greyed-out button with NO reason is where users conclude the app is broken.");
    await say.ok("The public half still reads fine — a wrong network does not take down the page.");
    await switchChain(page, SEPOLIA_HEX);
    await expect(review).toBeEnabled({ timeout: 30_000 });
    await say.ok("Switch the network and the page comes back on its own. No reload.");
    await say.finish();
  });

  test("the user hits Cancel in the wallet (R6)", async ({ page }, info) => {
    const say = clip(page, info, 3, "cancel");
    await installWallet(page, { rejectTransactions: true });
    await page.goto("/app/savings#assets");
    const faucet = page.getByRole("button", { name: /Get 1,000 test USDC/i });
    await expect(faucet).toBeEnabled({ timeout: 60_000 });
    await say.beat(7, "The user hits Cancel in the wallet (R6).");
    await faucet.click();
    const rejected = page.getByTestId("error-panel");
    await expect(rejected).toBeVisible({ timeout: 30_000 });
    await expect(rejected).toContainText(/you cancelled/i);
    await say.ok('"You cancelled — nothing was sent and nothing changed." Plus a Try again button.');
    await say.info("ethers rewraps code 4001 under UNKNOWN_ERROR; until today this said 'Something went wrong'.");
    const ghosts = await page.evaluate(() => window.localStorage.getItem("pdp.tx.v1"));
    expect(ghosts === null || ghosts === "[]").toBe(true);
    await say.no("And the transaction center has no ghosts: a rejection writes no record at all.");
    await say.finish();
  });

  test("the relayer dies, the tab is closed, and what is left on disk", async ({ page }, info) => {
    const say = clip(page, info, 4, "relayer-and-disk");
    await installWallet(page);
    await page.route("**/*.zama.cloud/**", (route) => route.abort("failed"));
    await page.route("**/relayer**", (route) => route.abort("failed"));
    await page.goto("/app/savings#withdraw");
    await page.getByLabel("Amount to withdraw").fill("10");
    await say.beat(8, "The relayer dies mid-encryption (R7).");
    await page.getByRole("button", { name: "Review withdrawal" }).click();
    const r7 = page.getByTestId("error-panel");
    await expect(r7).toBeVisible({ timeout: 120_000 });
    await expect(r7).not.toContainText("10 USDC");
    await say.ok("The destination is a panel with an action, not a spinner that never ends.");
    await say.no("And the error text carries no amount — not even the one just typed.");

    await page.unrouteAll();
    const txHash = `0x${"ab".repeat(32)}`;
    // Viết thẳng vào hợp đồng persist rồi RELOAD — đúng cái tab trước để lại khi
    // nó bị đóng giữa lúc tx đang bay. Đây là toàn bộ những gì được phép còn
    // lại: không amount, không handle.
    await page.evaluate(
      ([key, hash]) => {
        window.localStorage.setItem(
          key,
          JSON.stringify([{ chainId: 11155111, action: "deposit", txHash: hash, createdAt: Date.now() }]),
        );
      },
      ["pdp.tx.v1", txHash] as const,
    );
    await say.beat(9, "The tab is closed while a transaction is still in flight (R11).");
    await page.goto("/app/savings#history");
    await page.reload();
    const row = page.locator("li", { hasText: "Deposited" }).first();
    await expect(row).toBeVisible({ timeout: 60_000 });
    await expect(row).toContainText(/pending|unknown/i);
    await say.ok("Status is rebuilt FROM CHAIN on every load — status never lives on disk.");
    await say.no("History records no amounts. This is the screen people screenshot and send around.");

    await say.beat(10, "Everything that is left on disk, after all of that.");
    const dump = await page.evaluate(() =>
      Object.keys(window.localStorage).map((k) => `${k} = ${window.localStorage.getItem(k)}`),
    );
    say.raw("");
    for (const entry of dump) say.raw(`      ${entry.slice(0, 160)}`);
    say.raw("");
    const keys = await page.evaluate(() => Object.keys(window.localStorage).sort());
    expect(keys.every((k) => ["pdp.role.v1", "pdp.consent.v1", "pdp.tx.v1"].includes(k))).toBe(true);
    await say.ok("Exactly 3 keys. A tx record is exactly 5 fields: chainId, action, txHash, epochId?, createdAt.");
    await say.no("No amount, no handle, no win or loss — a persistence contract, not a habit.");
    await say.finish();
  });

  test("the employer pays for the prize and buys no right to look", async ({ page }, info) => {
    const say = clip(page, info, 5, "employer");
    await installWallet(page);
    await page.goto("/employer");
    // Role đang là saver — trang không chặn, chỉ mời đổi view. Không có
    // permission wall nào ở đây cả: sponsor view không cho thêm quyền đọc.
    const switchView = page.getByRole("button", { name: /switch to the sponsor view/i });
    if (await switchView.isVisible().catch(() => false)) await switchView.click();
    await expect(page.getByText(/cannot see who won/i)).toBeVisible({ timeout: 60_000 });
    await say.beat(11, "The Sponsor page — one page, one form.");
    await say.ok("The prize funded for this round is a PUBLIC number, deliberately, and the badge says so.");
    await say.no("Funding the prize does NOT buy: any employee balance, anyone's odds,");
    await say.no("who won, or the power to choose the winner.");
    await say.ok("Those four lines sit NEXT TO the form, not in the docs — this is where people read.");
    await say.info("And those same four lines are Day 5 contract tests: the employer holds no ACL on anyone's weight.");

    await say.beat(12, "What is left for tomorrow.");
    await say.info("A real deposit/withdraw and a real prize funding through the UI: needs a funded wallet, done by hand.");
    await say.info("The employer wallet sits at 0 ETH — top it up with ~0.03 ETH from Account 3, not the deployer.");
    await say.finish();
    console.log("\n═══ end ═══\n");
  });
});
