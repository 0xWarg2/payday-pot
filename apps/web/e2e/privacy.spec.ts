/**
 * Biên riêng tư, kiểm trong trình duyệt thật.
 *
 * Unit test đã pin logic reveal ở tầng store. Cái nó KHÔNG chứng minh được là ba
 * thứ chỉ tồn tại khi có một trình duyệt thật: HTML mà server trả về, những gì
 * còn lại trong storage sau khi đóng tab, và chuyện điều gì xảy ra khi ví đổi
 * account ngay giữa một phiên đang mở.
 *
 * Persona "seeded" cần khoá thật trong env (xem `fixtures/wallet.ts`) — không có
 * thì skip, vì một reveal giả không chứng minh gì cả.
 */

import { expect, test, type Locator, type Page } from "@playwright/test";

import { installWallet, switchAccount, switchChain, SEPOLIA_HEX } from "./fixtures/wallet";

const OTHER_ACCOUNT = "0x000000000000000000000000000000000000dEaD";
const MAINNET_HEX = "0x1";

/**
 * Đợi thẻ vị thế đọc xong, rồi mở nó.
 *
 * Không assert `hidden` trước khi nút xuất hiện: `hidden` cũng là mặc định của
 * lúc-chưa-biết-gì, nên assert nó lúc đầu sẽ xanh ngay ở frame đầu tiên và
 * không chứng minh điều gì. Nút "Reveal my position" chỉ được render khi handle
 * đã về, nên nó là tín hiệu "đã đọc xong" duy nhất trung thực trên trang này.
 */
async function revealPosition(page: Page): Promise<Locator> {
  const button = page.getByRole("button", { name: "Reveal my position" });
  await button.waitFor({ state: "visible", timeout: 60_000 });

  const value = page.getByTestId("confidential-value").first();
  await expect(value).toHaveAttribute("data-state", "hidden");

  await button.click();
  // Relayer thật: nạp WASM, sinh keypair, ký, rồi userDecrypt. Chậm, và chậm là
  // bình thường — nhưng nó phải xong, không được đứng ở spinner.
  await expect(value).toHaveAttribute("data-state", "revealed", { timeout: 120_000 });
  return value;
}

test.describe("server never sends a private value", () => {
  test("ssr html carries no balance, no handle, no reveal", async ({ request }) => {
    // Đọc thẳng response chứ không đọc DOM: đây là câu hỏi về cái server GỬI ĐI,
    // và nó phải đúng kể cả trước khi React chạy. Bất kỳ giá trị nào lọt vào đây
    // là đã rời khỏi máy người dùng trước khi họ ký bất cứ thứ gì.
    const response = await request.get("/app");
    expect(response.status()).toBe(200);
    const html = await response.text();

    // Ciphertext handle: 0x + 64 hex. Chúng KHÔNG bí mật về mặt mật mã, nhưng có
    // mặt trong SSR nghĩa là server đã đọc state của một ví cụ thể — tức là nó
    // biết ai đang xem, và đó là thứ kiến trúc này cố ý không có.
    expect(html).not.toMatch(/0x[0-9a-fA-F]{64}/);
    expect(html.toLowerCase()).not.toContain("revealed");
  });

  test("masked dashboard shows no digits where a private value goes", async ({ page }) => {
    await installWallet(page);
    await page.goto("/app");

    const values = page.getByTestId("confidential-value");
    await expect(values.first()).toBeVisible();

    for (const value of await values.all()) {
      const state = await value.getAttribute("data-state");
      if (state === "revealed") continue;
      // Không phải "không hiện số 0" mà là "không hiện CHỮ SỐ NÀO". Một `0` lọt
      // ra ở đây là non-negotiable #8 bị vi phạm, và `12` cũng vậy.
      expect(await value.innerText(), `state=${state}`).not.toMatch(/\d/);
    }
  });

  test("nothing private survives in storage", async ({ page }) => {
    await installWallet(page);
    await page.goto("/app");
    await page.getByTestId("confidential-value").first().waitFor();

    const dump = await page.evaluate(() => ({
      local: Object.fromEntries(Object.entries(localStorage)),
      session: Object.fromEntries(Object.entries(sessionStorage)),
    }));

    expect(Object.keys(dump.session)).toHaveLength(0);
    for (const [key, value] of Object.entries(dump.local)) {
      expect(key, `unexpected storage key ${key}`).toMatch(/^pdp\./);
      // Loại trừ đúng `pdp.tx.v1`: tx hash và ciphertext handle giống hệt nhau
      // về hình dạng nên regex không phân biệt được, và tx hash thì được phép.
      if (key === "pdp.tx.v1") continue;
      expect(String(value), `value under ${key}`).not.toMatch(/0x[0-9a-fA-F]{64}/);
    }
  });
});

test.describe("reveal session", () => {
  // Reveal đi qua relayer thật: init WASM, sinh keypair, ký, rồi userDecrypt.
  // Mặc định 30s của Playwright cắt ngang giữa chừng — và triệu chứng của nó
  // ("Received: hidden") trông y hệt một reveal hỏng, nên đây không phải nới
  // lỏng test mà là để nó đo đúng thứ nó định đo.
  test.describe.configure({ timeout: 180_000 });

  test("a fresh wallet is told nothing is there — not that it holds zero", async ({ page }) => {
    // Persona 1 của exit gate. Ví ngẫu nhiên chưa từng gửi ⇒ mọi handle là
    // HIDDEN_HANDLE ⇒ "unavailable", và màn hình phải nói đúng điều đó thay vì
    // hiện 0 hoặc treo spinner mãi.
    await installWallet(page, { fresh: true });
    await page.goto("/app");

    const position = page.getByTestId("confidential-value").first();
    await expect(position).toHaveAttribute("data-state", "unavailable", { timeout: 30_000 });
    await expect(page.getByText("Nothing is stored for this wallet yet")).toBeVisible();
    await expect(page.getByRole("link", { name: "Make your first deposit" })).toBeVisible();
  });

  test("seeded wallet opens its position with one signature, then hides it", async ({ page }) => {
    const wallet = await installWallet(page);
    test.skip(!wallet.funded, "E2E_MNEMONIC / E2E_PRIVATE_KEY not set — no seeded wallet to reveal");

    await page.goto("/app");
    const value = await revealPosition(page);
    await expect(value).toContainText(/\d/);

    // `exact` là bắt buộc: RevealSessionStrip cũng có một nút "Hide now", và cả
    // hai đều đúng — nút trên thẻ đóng vị thế này, nút trên strip đóng cả phiên.
    await page.getByRole("button", { name: "Hide", exact: true }).click();
    await expect(value).toHaveAttribute("data-state", "hidden");
  });

  test("a cancelled signature says nothing left and nothing was sent", async ({ page }) => {
    // Đường mà người dùng thật đi thường xuyên nhất: bấm Reveal rồi bấm Cancel
    // trong ví. Nó phải là một câu trả lời, không phải một panel "Something went
    // wrong" — và nhất là không được để lại spinner nào đang chạy.
    const wallet = await installWallet(page, { rejectSignatures: true });
    test.skip(!wallet.funded, "needs a seeded wallet to get as far as the signature");

    await page.goto("/app");
    const button = page.getByRole("button", { name: "Reveal my position" });
    await button.waitFor({ state: "visible", timeout: 60_000 });
    await button.click();

    // Copy đến từ taxonomy (R6), không phải từ chỗ này — `error-copy.test.ts` đã
    // pin từng chữ. Ở đây chỉ kiểm ba điều mà chỉ trình duyệt thật trả lời được:
    // lời từ chối có tới màn hình, nó được ghi đúng hàng recovery, và đường đi
    // tiếp còn mở.
    const alert = page.getByTestId("error-panel");
    await expect(alert).toBeVisible({ timeout: 60_000 });
    await expect(alert).toContainText("Nothing was sent and nothing changed");
    await expect(alert).toContainText("R6");
    await expect(alert.getByRole("button", { name: "Try again" })).toBeVisible();

    const value = page.getByTestId("confidential-value").first();
    await expect(value).toHaveAttribute("data-state", "hidden");
    // Nút quay lại được, không bị kẹt ở trạng thái loading của lần bấm trước.
    await expect(button).toBeEnabled();
  });

  test("switching account closes an open session", async ({ page }) => {
    const wallet = await installWallet(page);
    test.skip(!wallet.funded, "needs a seeded wallet to have something open");

    await page.goto("/app");
    const value = await revealPosition(page);

    await switchAccount(page, OTHER_ACCOUNT);

    // Giá trị đã mở của ví CŨ không được nằm lại trên màn hình của ví MỚI, dù
    // chỉ một frame. Đây là rò rỉ giữa hai người dùng trên cùng một máy.
    await expect(value).not.toHaveAttribute("data-state", "revealed");
    await expect(page.locator("body")).not.toContainText("Visible in this tab only");
  });

  test("switching chain closes the session and says so", async ({ page }) => {
    const wallet = await installWallet(page);
    test.skip(!wallet.funded, "needs a seeded wallet to have something open");

    await page.goto("/app");
    const value = await revealPosition(page);

    await switchChain(page, MAINNET_HEX);

    await expect(value).not.toHaveAttribute("data-state", "revealed");
    await expect(page.getByText("Your wallet is on another network")).toBeVisible();
  });

  test("a reload does not restore what was open", async ({ page }) => {
    const wallet = await installWallet(page);
    test.skip(!wallet.funded, "needs a seeded wallet to have something open");

    await page.goto("/app");
    await revealPosition(page);

    await page.reload();

    // Giá trị đã decrypt chỉ sống trong memory. Sống sót qua reload nghĩa là nó
    // đã được ghi ra đâu đó — và không có chỗ nào hợp lệ để ghi.
    await expect(page.getByTestId("confidential-value").first()).toHaveAttribute("data-state", "hidden", {
      timeout: 30_000,
    });
  });
});

test.describe("network guard", () => {
  test("wrong network warns but never blocks reading", async ({ page }) => {
    await installWallet(page, { chainId: MAINNET_HEX });
    await page.goto("/app");

    await expect(page.getByText("Your wallet is on another network")).toBeVisible();
    // R8: read đi qua RPC Sepolia cố định, nên chain của ví không được làm hỏng
    // phần công khai. Chặn cả trang ở đây là lỗi thường gặp và là một ngõ cụt.
    await expect(page.getByRole("heading", { name: "Your pool" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Switch to Sepolia" })).toBeVisible();
  });

  test("switching back to Sepolia clears the banner", async ({ page }) => {
    await installWallet(page, { chainId: MAINNET_HEX });
    await page.goto("/app");
    await expect(page.getByText("Your wallet is on another network")).toBeVisible();

    await switchChain(page, SEPOLIA_HEX);

    await expect(page.getByText("Your wallet is on another network")).toBeHidden();
  });
});
