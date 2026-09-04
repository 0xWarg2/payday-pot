/**
 * Luồng tiền trong trình duyệt thật — Day 7.
 *
 * Cái mà unit test không chứng minh được: một chuỗi trạng thái đi qua ví, relayer
 * và chain thật thì hỏng ở đâu, và khi hỏng thì người dùng còn đường nào đi tiếp.
 * Mọi test ở đây kiểm **đường lỗi**, vì đó là chỗ sản phẩm tiền bạc mất niềm tin
 * — và vì exit gate Day 7 đòi "mọi error chỉ đúng recovery".
 *
 * Ba test dưới không cần ví có tiền. Đường thành công (deposit/withdraw thật)
 * được diễn ở demo Day 7 với ví đã seed, không nhét vào CI: nó tiêu USDC thật
 * trên testnet và mất ~10 giây mã hoá mỗi lần.
 */

import { expect, test } from "@playwright/test";

import { installWallet, switchChain, SEPOLIA_HEX } from "./fixtures/wallet";

const MAINNET_HEX = "0x1";

test.describe("wrong chain", () => {
  test("no money button is live while the wallet sits on another chain (R8)", async ({ page }) => {
    await installWallet(page, { chainId: MAINNET_HEX });
    await page.goto("/app/savings");

    await page.getByLabel("Amount to deposit").fill("10");
    const review = page.getByRole("button", { name: "Continue to review" });
    await review.waitFor({ state: "visible", timeout: 30_000 });
    await expect(review).toBeDisabled();

    // Cổng ghi phải nói RA lý do. Một nút xám không lời giải thích là chỗ người
    // dùng kết luận app hỏng.
    await expect(review).toHaveAttribute("title", /sepolia/i);

    // Số liệu công khai vẫn đọc được: read đi qua RPC cố định, không qua ví.
    // Nếu chỗ này trống thì "sai mạng" đã lan ra cả trang chứ không chỉ nút bấm.
    await expect(page.getByRole("heading", { name: "Savings" })).toBeVisible();

    await switchChain(page, SEPOLIA_HEX);
    await expect(review).toBeEnabled({ timeout: 30_000 });
  });
});

test.describe("relayer unavailable", () => {
  test("encryption that never finishes ends in a recovery, not a spinner (R7)", async ({ page }) => {
    // Mặc định 30 giây của Playwright thấp hơn thời gian mã hoá thật (~10 giây)
    // cộng đường timeout của relayer, nên test sẽ chết vì đồng hồ của chính nó
    // trước khi kịp kiểm điều nó muốn kiểm.
    test.setTimeout(150_000);
    await installWallet(page);
    // Cắt relayer. Đây là cách duy nhất diễn được đúng lỗi này: relayer thật
    // hiếm khi hỏng đúng lúc ta chạy test, và một mock của relayer sẽ không đi
    // qua `classifyError` bằng cùng một hình dạng lỗi.
    await page.route("**/*.zama.cloud/**", (route) => route.abort("failed"));
    await page.route("**/relayer**", (route) => route.abort("failed"));

    await page.goto("/app/savings#withdraw");
    await page.getByLabel("Amount to withdraw").fill("1");
    await page.getByRole("button", { name: "Review withdrawal" }).click();

    // Không assert vào chữ trên spinner: relayer bị cắt có thể hỏng ngay ở bước
    // khởi tạo, và lúc đó bước "đang mã hoá" hoàn toàn có quyền không kịp hiện.
    // Điều PHẢI đúng là điểm đến: một panel phục hồi, không phải một spinner
    // đứng mãi.
    const panel = page.getByTestId("error-panel");
    await expect(panel).toBeVisible({ timeout: 90_000 });
    // Không có dead end: panel luôn có một hành động đi tiếp.
    await expect(panel.getByRole("button").or(panel.getByRole("link")).first()).toBeVisible();
    // Và không có số tiền trong thông điệp lỗi, kể cả số vừa gõ.
    await expect(panel).not.toContainText("1 USDC");
  });

  test("cancelling during encryption says plainly that nothing was sent", async ({ page }) => {
    test.setTimeout(150_000);
    await installWallet(page);
    // Cắt ĐÚNG lời gọi sinh input-proof và cho nó treo, chứ không cắt cả relayer:
    // khởi tạo SDK phải thành công để màn hình thực sự đứng ở bước mã hoá — đó
    // mới là bước ta cần huỷ.
    await page.route("**/input-proof**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 120_000));
      await route.abort("failed");
    });

    await page.goto("/app/savings#withdraw");
    await page.getByLabel("Amount to withdraw").fill("5");
    await page.getByRole("button", { name: "Review withdrawal" }).click();

    const cancel = page.getByRole("button", { name: "Cancel" });
    await cancel.waitFor({ state: "visible", timeout: 60_000 });
    await expect(page.getByText(/no transaction to lose/i)).toBeVisible();
    await cancel.click();

    // Về đúng form, và số đã gõ không còn nằm đó chờ được gửi đi bởi một cú bấm
    // lạc tay.
    await expect(page.getByRole("button", { name: "Review withdrawal" })).toBeVisible();
    await expect(page.getByTestId("review-dialog")).toHaveCount(0);
  });
});

test.describe("signing", () => {
  /**
   * Ví trong CI không có vị thế trong pool, nên MỌI tx đụng vào tiền của user
   * đều revert ngay ở `eth_estimateGas` — trước cả lúc ví mở ra. Nghĩa là không
   * thể diễn "user bấm Reject" bằng deposit hay withdraw ở đây.
   *
   * Faucet thì được: nó mint token mock, không phụ thuộc số dư, nên nó tới được
   * đúng bước ký. Đó là chỗ duy nhất trong app mà test này còn đúng nghĩa.
   */
  test("một chữ ký bị từ chối là recovery, không phải dead end (R6)", async ({ page }) => {
    await installWallet(page, { rejectTransactions: true });
    await page.goto("/app/savings#assets");

    const faucet = page.getByRole("button", { name: /Get 1,000 test USDC/i });
    await faucet.waitFor({ state: "visible", timeout: 30_000 });
    await expect(faucet).toBeEnabled({ timeout: 30_000 });
    await faucet.click();

    const panel = page.getByTestId("error-panel");
    await expect(panel).toBeVisible({ timeout: 30_000 });
    // Bấm Cancel trong ví là một việc CỐ Ý, nên nó không được hiện ra như một
    // sự cố. Đây là chỗ `classifyError` phải đọc được 4001 qua lớp bọc ethers.
    await expect(panel).toContainText(/you cancelled/i);
    await expect(panel).toContainText(/nothing was sent/i);
    await expect(panel.getByRole("button", { name: "Try again" })).toBeVisible();

    // Ví từ chối thì không có tx nào — tx center không được có bóng ma.
    const records = await page.evaluate(() => window.localStorage.getItem("pdp.tx.v1"));
    expect(records === null || records === "[]").toBe(true);
  });

  test("một hành động onchain thất bại vẫn nói được nó là lỗi gì", async ({ page }) => {
    await installWallet(page);
    await page.goto("/app/savings#withdraw");

    // `withdrawAll` với một ví chưa từng deposit revert bằng custom error của
    // contract. Điều được kiểm ở đây không phải cái revert, mà là app gọi TÊN
    // được nó: revert data phải đi hết đường từ RPC qua ví tới `classifyError`.
    await page.getByRole("button", { name: "Withdraw everything", exact: true }).click();
    await page.getByRole("button", { name: "Yes, withdraw everything" }).click();

    const panel = page.getByTestId("error-panel");
    await expect(panel).toBeVisible({ timeout: 60_000 });
    await expect(panel).not.toContainText("Something went wrong");
    await expect(panel.getByRole("button").or(panel.getByRole("link")).first()).toBeVisible();
  });

  test("bấm ký hai lần vẫn chỉ là một transaction", async ({ page }) => {
    test.setTimeout(180_000);
    await installWallet(page);
    await page.goto("/app/savings#withdraw");
    await page.getByLabel("Amount to withdraw").fill("1");
    await page.getByRole("button", { name: "Review withdrawal" }).click();

    // Màn review chỉ dựng được sau khi relayer mã hoá xong. Relayer chết thì app
    // đi đúng nhánh R7 ("The encryption service is slow", input còn nguyên, chưa
    // gửi gì) — đó là hành vi ĐÚNG và đã có test riêng. Nhưng nó không phải cái
    // test này đang kiểm, nên chờ cả hai rồi skip có lý do, thay vì để một lần
    // relayer sập đọc thành lỗi sản phẩm ở đúng luồng tiền.
    const dialog = page.getByTestId("review-dialog");
    const relayerDown = page.getByTestId("error-panel").filter({ hasText: /encryption service/i });
    await expect(dialog.or(relayerDown).first()).toBeVisible({ timeout: 150_000 });
    test.skip(await relayerDown.isVisible(), "relayer không mã hoá được — nhánh R7, không phải nhánh này");

    const sign = page.getByRole("button", { name: "Sign and withdraw" });
    await sign.click();

    // Cú bấm thứ hai không còn chỗ để rơi vào: `SUBMIT` chỉ nhận từ `review`, và
    // màn review biến mất ngay khi rời stage đó. Không có nút nào để bấm lần hai
    // là hình dạng UI của cùng một luật.
    await expect(dialog).toHaveCount(0, { timeout: 30_000 });
    await expect(sign).toHaveCount(0);

    const records = await page.evaluate(() => JSON.parse(window.localStorage.getItem("pdp.tx.v1") ?? "[]") as unknown[]);
    expect(records.length).toBeLessThanOrEqual(1);
  });
});

test.describe("resume after a reload (R11)", () => {
  test("một tx đã gửi vẫn hiện đúng sau khi đóng tab", async ({ page }) => {
    await installWallet(page);
    // Ghi thẳng vào hợp đồng persist một record như thể tab trước đã gửi tx rồi
    // bị đóng trước khi thấy receipt. Đây là toàn bộ những gì được phép còn lại
    // trên đĩa: không amount, không handle.
    const txHash = `0x${"ab".repeat(32)}`;
    await page.addInitScript(
      ([key, hash]) => {
        window.localStorage.setItem(
          key as string,
          JSON.stringify([{ chainId: 11155111, action: "deposit", txHash: hash, createdAt: Date.now() }]),
        );
      },
      ["pdp.tx.v1", txHash],
    );

    await page.goto("/app/savings#history");

    const row = page.getByText(/Deposited/i).first();
    await row.waitFor({ state: "visible", timeout: 30_000 });

    // Trạng thái được dựng lại từ chain: hash bịa không có receipt, nên câu trả
    // lời trung thực là "chưa vào block" — KHÔNG phải "thất bại", và tuyệt đối
    // không phải biến mất khỏi danh sách.
    const panel = page.locator("li", { hasText: "Deposited" }).first();
    await expect(panel).toContainText(/pending|unknown/i, { timeout: 30_000 });
    await expect(panel).not.toContainText(/failed/i);
    await expect(panel.getByRole("link")).toHaveAttribute("href", new RegExp(txHash));

    // Và lịch sử vẫn không ghi số tiền nào.
    const stored = await page.evaluate(() => window.localStorage.getItem("pdp.tx.v1"));
    expect(Object.keys(JSON.parse(stored ?? "[]")[0] as object).sort()).toEqual([
      "action",
      "chainId",
      "createdAt",
      "txHash",
    ]);
  });
});

test.describe("claim tells three different stories", () => {
  test("an unsettled round says so without hinting at a winner (R9)", async ({ page }) => {
    await installWallet(page);
    await page.goto("/app/savings#claim");

    const state = page.getByTestId("claim-state");
    await state.waitFor({ state: "visible", timeout: 30_000 });
    const kind = await state.getAttribute("data-state");
    expect(["not-settled", "no-position", "claimable"]).toContain(kind);

    // Bất kể case nào: nút không bao giờ là một hành động mù, và không câu nào
    // tiết lộ ai thắng.
    const text = (await page.getByTestId("claim-panel").textContent()) ?? "";
    expect(text).not.toMatch(/you won|congratulations|winner is/i);
    if (kind !== "claimable") {
      await expect(page.getByRole("button", { name: "Claim" })).toBeDisabled();
    }
  });
});

test.describe("employer page", () => {
  test("states the four things sponsoring does not grant, next to the form", async ({ page }) => {
    await installWallet(page);
    await page.goto("/employer");

    // RoleGate có thể chắn: nó là một cách xem, nên luôn có đường đi tiếp.
    // Gate dựng sau hydrate (NoSsr) — chờ hoặc nút chuyển vai, hoặc chính notice,
    // thay vì hỏi "nút có đang hiện không" đúng một lần khi trang còn là fallback.
    const proceed = page.getByRole("button", { name: /sponsor|continue|view/i }).first();
    await proceed.or(page.getByText(/cannot see who won/i)).first().waitFor({ timeout: 30_000 });
    if (await proceed.isVisible().catch(() => false)) await proceed.click();

    await expect(page.getByText(/cannot see who won/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/cannot pick the winner/i)).toBeVisible();
    await expect(page.getByText(/This amount is public/i)).toBeVisible();
  });
});
