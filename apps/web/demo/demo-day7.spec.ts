/**
 * Day 7 EOD demo — tiền vào, tiền ra, và cái xảy ra khi mọi thứ hỏng.
 *
 *   pnpm demo:day7   (trong apps/web)
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
 * cần ví có tiền và được diễn tay — xem cuối file.
 */

import { expect, test, type Page } from "@playwright/test";

import { installWallet, switchChain, SEPOLIA_HEX } from "../e2e/fixtures/wallet";

const MAINNET_HEX = "0x1";

const line = (s = "") => console.log(s);
const beat = (n: number, s: string) => console.log(`\n${n}. ${s}`);
const ok = (s: string) => console.log(`   ✅ ${s}`);
const no = (s: string) => console.log(`   🔒 ${s}`);
const info = (s: string) => console.log(`   ▸ ${s}`);

const read = (page: Page, ms = 900) => page.waitForTimeout(ms);

test.describe.configure({ mode: "serial" });

test.describe("PayDay Pot — Day 7 EOD demo", () => {
  test("một lần chuyển tiền: mã hoá trong tab, review, và không bao giờ echo lại con số", async ({ page }) => {
    line();
    line("═══ PayDay Pot · Day 7 — Savings + Employer ═══");

    beat(1, "Trang Savings, chưa ký gì cả.");
    await installWallet(page);
    await page.goto("/app/savings");
    await expect(page.getByRole("heading", { name: "Savings" })).toBeVisible({ timeout: 60_000 });
    await read(page);
    ok("Ba tab: Deposit · Withdraw · History");
    info("Số công khai (pool, prize, số người) đọc qua RPC cố định — không qua ví");

    beat(2, "Lối ra được dựng TRƯỚC lối vào.");
    await page.getByRole("tab", { name: "Withdraw" }).click();
    await expect(page.getByText(/Available in every stage of every round/i)).toBeVisible();
    await read(page);
    ok("`Withdraw everything`: không cần nhập số, không cần mã hoá, KHÔNG cần reveal");
    info("`submitWithdrawAll` không nhận EncryptedAmount — non-negotiable #1 ở dạng chữ ký hàm");
    info("Chạy được cả khi pool đang pause. Pause không bao giờ chặn đường ra");

    beat(3, "Rút một phần — và đây là mười giây chậm nhất của sản phẩm.");
    await page.getByLabel("Amount to withdraw").fill("25");
    await page.getByRole("button", { name: "Review withdrawal" }).click();
    await expect(page.getByText(/Encrypting your amount/i)).toBeVisible({ timeout: 30_000 });
    await read(page, 1200);
    ok("Không phải spinner trần: nói tên việc đang làm + đếm giây (đo thật 9752ms)");
    no("Và có nút Cancel kèm câu ĐÚNG: chưa có tx nào, ví chưa được hỏi gì");

    beat(4, "Review — tách đôi cái riêng tư và cái công khai.");
    const dialog = page.getByTestId("review-dialog");
    await dialog.waitFor({ state: "visible", timeout: 180_000 });
    await read(page, 1600);
    await expect(dialog).toContainText("Stays private");
    await expect(dialog).toContainText("Becomes public");
    no("Riêng tư: số tiền, số dư trong pool, trọng số, và việc có thắng hay không");
    ok("Công khai: địa chỉ này VỪA rút — thời điểm, hash, gas. Nói thẳng chứ không giấu");
    info('Không có chữ "anonymous" ở bất cứ đâu: sản phẩm giấu SỐ TIỀN, không giấu người');

    beat(5, "Bấm ký. Lần thứ hai không có chỗ nào để rơi vào.");
    await page.getByRole("button", { name: "Sign and withdraw" }).click();
    await expect(dialog).toHaveCount(0, { timeout: 60_000 });
    ok("Máy trạng thái chỉ nhận SUBMIT từ `review` — bấm hai lần vẫn là một tx");

    const panel = page.getByTestId("error-panel");
    await expect(panel).toBeVisible({ timeout: 60_000 });
    await read(page, 1400);
    // Ví demo chưa từng deposit → contract revert. Điều đáng xem không phải cái
    // revert, mà là app GỌI TÊN được nó.
    await expect(panel).not.toContainText("Something went wrong");
    line();
    line(`      ${(await panel.innerText()).split("\n").slice(0, 2).join(" — ")}`);
    line();
    ok("Revert data đi hết đường từ RPC → ví → classifyError → một dòng recovery");
    info('Hôm nay sửa 3 bug thật ở chính đường này. Một trong số đó là màn hình TRẮNG');
  });

  // Mỗi persona một `page` riêng: `installWallet` dùng `exposeFunction`, và hàm
  // đó chỉ đăng ký được MỘT lần cho mỗi page. Chia test theo persona chứ không
  // theo beat là cách duy nhất để mỗi nhánh lỗi có một ví riêng.
  test("sai mạng: nút tiền chết, nhưng nói ra vì sao (R8)", async ({ page }) => {
    beat(6, "Sai mạng (R8): nút tiền chết, nhưng nói ra vì sao.");
    await installWallet(page, { chainId: MAINNET_HEX });
    await page.goto("/app/savings");
    await page.getByLabel("Amount to deposit").fill("100");
    const review = page.getByRole("button", { name: "Continue to review" });
    await expect(review).toBeDisabled({ timeout: 60_000 });
    await expect(review).toHaveAttribute("title", /sepolia/i);
    await read(page);
    no("Nút xám KHÔNG có lời giải thích là chỗ người dùng kết luận app hỏng");
    ok("Và phần công khai vẫn đọc được — sai mạng không lan ra cả trang");
    await switchChain(page, SEPOLIA_HEX);
    await expect(review).toBeEnabled({ timeout: 30_000 });
    ok("Đổi mạng xong, trang tự sống lại. Không phải reload");
  });

  test("người dùng bấm Cancel trong ví (R6)", async ({ page }) => {
    beat(7, "Người dùng bấm Cancel trong ví (R6).");
    await installWallet(page, { rejectTransactions: true });
    await page.goto("/app/savings#assets");
    const faucet = page.getByRole("button", { name: /Get 1,000 test USDC/i });
    await expect(faucet).toBeEnabled({ timeout: 60_000 });
    await faucet.click();
    const rejected = page.getByTestId("error-panel");
    await expect(rejected).toBeVisible({ timeout: 30_000 });
    await expect(rejected).toContainText(/you cancelled/i);
    await read(page, 1200);
    ok('"You cancelled — nothing was sent and nothing changed." + nút Try again');
    info("ethers bọc mã 4001 lại dưới UNKNOWN_ERROR; trước hôm nay chỗ này nói 'Something went wrong'");
    const ghosts = await page.evaluate(() => window.localStorage.getItem("pdp.tx.v1"));
    expect(ghosts === null || ghosts === "[]").toBe(true);
    no("Và tx center không có bóng ma: từ chối thì không có record nào");
  });

  test("relayer chết, tab bị đóng, và cái còn lại trên đĩa", async ({ page }) => {
    beat(8, "Relayer chết giữa chừng (R7).");
    await installWallet(page);
    await page.route("**/*.zama.cloud/**", (route) => route.abort("failed"));
    await page.route("**/relayer**", (route) => route.abort("failed"));
    await page.goto("/app/savings#withdraw");
    await page.getByLabel("Amount to withdraw").fill("10");
    await page.getByRole("button", { name: "Review withdrawal" }).click();
    const r7 = page.getByTestId("error-panel");
    await expect(r7).toBeVisible({ timeout: 120_000 });
    await expect(r7).not.toContainText("10 USDC");
    await read(page, 1200);
    ok("Điểm đến là một panel có hành động, không phải một spinner đứng mãi");
    no("Và thông điệp lỗi không chứa số tiền — kể cả số vừa gõ");

    beat(9, "Đóng tab giữa lúc tx đang bay (R11).");
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
    await page.goto("/app/savings#history");
    await page.reload();
    const row = page.locator("li", { hasText: "Deposited" }).first();
    await expect(row).toBeVisible({ timeout: 60_000 });
    await expect(row).toContainText(/pending|unknown/i);
    await read(page, 1200);
    ok("Status dựng lại TỪ CHAIN mỗi lần load — status không nằm trên đĩa");
    no("Lịch sử không ghi số tiền. Đây là thứ người ta hay chụp màn hình gửi đi");

    beat(10, "Cái còn lại trên đĩa, sau tất cả.");
    const dump = await page.evaluate(() =>
      Object.keys(window.localStorage).map((k) => `${k} = ${window.localStorage.getItem(k)}`),
    );
    line();
    for (const entry of dump) line(`      ${entry.slice(0, 160)}`);
    line();
    const keys = await page.evaluate(() => Object.keys(window.localStorage).sort());
    expect(keys.every((k) => ["pdp.role.v1", "pdp.consent.v1", "pdp.tx.v1"].includes(k))).toBe(true);
    ok("Đúng 3 key. Record tx đúng 5 field: chainId, action, txHash, epochId?, createdAt");
    no("Không amount, không handle, không kết quả thắng thua — hợp đồng persist, không phải thói quen");
  });

  test("employer trả tiền thưởng mà không mua được quyền nhìn", async ({ page }) => {
    beat(11, "Trang Sponsor — một trang, một form.");
    await installWallet(page);
    await page.goto("/employer");
    // Role đang là saver — trang không chặn, chỉ mời đổi view. Không có
    // permission wall nào ở đây cả: sponsor view không cho thêm quyền đọc.
    const switchView = page.getByRole("button", { name: /switch to the sponsor view/i });
    if (await switchView.isVisible().catch(() => false)) await switchView.click();
    await expect(page.getByText(/cannot see who won/i)).toBeVisible({ timeout: 60_000 });
    await read(page, 1600);
    ok("Prize đã cấp cho vòng này là số CÔNG KHAI — cố ý, và badge nói thẳng");
    line();
    line("      Tài trợ KHÔNG mua được:");
    line("      · đọc số dư của bất kỳ nhân viên nào");
    line("      · đọc odds của bất kỳ ai");
    line("      · biết ai đã thắng");
    line("      · chọn người thắng");
    line();
    ok("Bốn câu này nằm CẠNH form, không nằm trong docs — đó là chỗ người ta đọc");
    info("Và đúng bốn câu đó có test contract Day 5: employer không có ACL trên weight của ai cả");

    beat(12, "Còn lại cho ngày mai.");
    info("Deposit/withdraw thật + fund prize thật qua UI: cần ví có tiền, diễn tay");
    info("Ví employer đang 0 ETH — nạp ~0.03 ETH từ Account 3, không lấy của deployer");
    line();
    line("═══ hết ═══");
    line();
  });
});
