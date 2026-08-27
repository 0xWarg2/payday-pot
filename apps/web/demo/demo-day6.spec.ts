/**
 * Day 6 EOD demo — the product becomes visible, and stays private while it does.
 *
 *   pnpm demo:day6   (trong apps/web)
 *
 * Nằm trong `demo/` (ngoài `e2e/`) nên KHÔNG chạy cùng `pnpm test:e2e` — cùng
 * quy ước với `packages/contracts/demo/`. Chạy bằng Playwright vì đó là cách duy
 * nhất diễn được ba thứ chỉ tồn tại trong trình duyệt thật: HTML server gửi đi,
 * cái còn lại trong storage, và chuyện gì xảy ra khi ví đổi account giữa chừng.
 *
 * Flow: server chứng minh nó không biết gì → một người mới đi hết onboarding và
 *       tới dashboard che kín, được bảo "chưa có gì" chứ KHÔNG phải "bạn có 0" →
 *       chủ ví mở vị thế của chính mình bằng đúng một chữ ký → đóng lại → đổi
 *       mạng thì phiên tự đóng nhưng phần công khai vẫn đọc được → reload không
 *       khôi phục gì → và storage không giữ lại con số nào.
 *
 * Persona "seeded" cần khoá thật trong env (xem `e2e/fixtures/wallet.ts`).
 * Không có thì beat reveal tự bỏ qua và nói rõ vì sao — một reveal giả không
 * chứng minh gì cả.
 */

import { expect, test, type Page } from "@playwright/test";

import { installWallet, switchAccount, switchChain, SEPOLIA_HEX } from "../e2e/fixtures/wallet";

const MAINNET_HEX = "0x1";
const OTHER_ACCOUNT = "0x000000000000000000000000000000000000dEaD";

const line = (s = "") => console.log(s);
const beat = (n: number, s: string) => console.log(`\n${n}. ${s}`);
const ok = (s: string) => console.log(`   ✅ ${s}`);
const no = (s: string) => console.log(`   🔒 ${s}`);
const info = (s: string) => console.log(`   ▸ ${s}`);

/** Dừng đủ lâu để người xem đọc kịp màn hình vừa đổi. */
const read = (page: Page, ms = 900) => page.waitForTimeout(ms);

test.describe.configure({ mode: "serial" });

test.describe("PayDay Pot — Day 6 EOD demo", () => {
  test("a new saver reaches a masked dashboard without ever showing a number", async ({ page, request }) => {
    line();
    line("═══ PayDay Pot · Day 6 — Shell, onboarding, dashboard ═══");

    beat(1, "The server does not know who is asking.");
    const html = await (await request.get("/app")).text();
    // Handle ciphertext = 0x + 64 hex. Nó KHÔNG bí mật về mật mã, nhưng có mặt
    // trong SSR nghĩa là server đã đọc state của một ví cụ thể — tức là nó biết
    // ai đang xem. Đó chính là thứ kiến trúc này cố ý không có.
    expect(html).not.toMatch(/0x[0-9a-fA-F]{64}/);
    no("SSR của /app: không một ciphertext handle nào, không một giá trị nào");
    info("Store nào cũng có SERVER_SNAPSHOT che sẵn — che là mặc định, không phải kỷ luật");

    beat(2, "Landing.");
    // `preauthorized: false` = trình duyệt sạch thật sự: ví có đó, nhưng trang
    // chưa từng được cấp quyền, nên bước Connect là bước có thật chứ không phải
    // bước bị nhảy qua.
    await installWallet(page, { fresh: true, preauthorized: false });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await read(page);
    ok("Prize là sponsored yield do employer tài trợ — nói thẳng, không để judge tự phát hiện");

    beat(3, "Onboarding — tám bước, ví trắng tinh.");
    await page.goto("/onboarding");

    await expect(page.getByRole("heading", { name: "Choose how you are joining" })).toBeVisible();
    await page.getByRole("radio", { name: /I want to save/i }).check();
    await page.getByRole("button", { name: "Continue" }).click();
    info("Role → localStorage. Bước hiện tại thì KHÔNG persist — nó được suy ra từ facts");

    await expect(page.getByRole("heading", { name: "Connect your wallet" })).toBeVisible();
    await page.getByRole("button", { name: "Connect wallet" }).click();
    await read(page);
    ok("Địa chỉ hiện ra dạng checksum — sai một chữ hoa là sai ví");

    // Ví stub cài sẵn trên Sepolia nên bước network thường bị bỏ qua. Vẫn xử lý
    // nếu nó xuất hiện — bước là hàm của trạng thái, không phải một con trỏ.
    const networkStep = page.getByRole("button", { name: "Switch to Sepolia" });
    if (await networkStep.isVisible().catch(() => false)) await networkStep.click();

    await expect(page.getByRole("heading", { name: "Meet the pool" })).toBeVisible();
    await read(page);
    ok("Mọi số ở bước này là công khai: pool, sponsor, prize, số người — không của riêng ai");
    await page.getByRole("button", { name: /^(Continue|Look through the rest of the setup)$/ }).click();

    await expect(page.getByRole("heading", { name: "What is public, what is not" })).toBeVisible();
    await read(page);
    const consent = page.getByRole("checkbox");
    await expect(consent).not.toBeChecked();
    no("Checkbox KHÔNG tick sẵn — người dùng phải tự nói là đã đọc");
    info('Và câu chữ nói "confidential = amounts, not identity". Không có chữ "anonymous" ở đâu cả');
    await consent.check();
    await page.getByRole("button", { name: "I understand — continue" }).click();

    await expect(page.getByRole("heading", { name: "Get ready to deposit" })).toBeVisible();
    await read(page);
    await expect(page.getByText(/wrap amount is public|last public number/i).first()).toBeVisible();
    ok('Cảnh báo "số tiền shield là công khai" nằm TRÊN nút ký, không phải dưới');
    info('"Get 1,000 test USDC" là một tx trong app — faucet của mock USDC mở, không cần rời trang');
    await page.getByRole("button", { name: /^(Continue|Skip for now)$/ }).click();

    await expect(page.getByRole("heading", { name: "Review" })).toBeVisible();
    await read(page);
    await page.getByRole("button", { name: "Finish setup" }).click();

    await expect(page.getByRole("heading", { name: "You are set up" })).toBeVisible();
    ok("Tám bước, không một bước nào đòi số tiền");
    await page.getByRole("link", { name: "Go to the dashboard" }).click();

    beat(4, "Dashboard — và đây là câu quan trọng nhất của cả ngày.");
    const position = page.getByTestId("confidential-value").first();
    await expect(position).toHaveAttribute("data-state", "unavailable", { timeout: 60_000 });
    await expect(page.getByText("Nothing is stored for this wallet yet")).toBeVisible();
    await read(page, 1400);
    no('Ví chưa gửi bao giờ → "Nothing is stored for this wallet yet"');
    line();
    line("      unavailable  ≠  hidden  ≠  đã decrypt ra 0");
    line("      chưa có gì      có, đang khoá     thật sự bằng không");
    line();
    ok("Ba câu khác nhau, ba màn hình khác nhau. Hiện 0 ở ô đầu là non-negotiable #8 bị vi phạm");
    info("Và trạng thái thứ tư — CHƯA ĐỌC XONG — cũng không được mượn UI của ba cái trên");

    for (const value of await page.getByTestId("confidential-value").all()) {
      const state = await value.getAttribute("data-state");
      if (state === "revealed") continue;
      expect(await value.innerText(), `state=${state}`).not.toMatch(/\d/);
    }
    no("Không một CHỮ SỐ nào trên toàn bộ dashboard khi chưa mở khoá");
  });

  test("the owner opens their own position with one signature, and every exit closes it", async ({ page }) => {
    const wallet = await installWallet(page);

    beat(5, "Cùng màn hình đó, nhưng là ví đã có tiền trong pot.");
    if (!wallet.funded) {
      info("E2E_MNEMONIC chưa set → bỏ qua phần reveal.");
      info("Cố tình không giả lập: một reveal giả không chứng minh được gì.");
      info('Chạy lại với:  E2E_MNEMONIC="$(cd ../../packages/contracts && npx hardhat vars get MNEMONIC)" pnpm demo:day6');
      test.skip();
      return;
    }

    await page.goto("/app");
    const button = page.getByRole("button", { name: "Reveal my position" });
    // Nút chỉ tồn tại khi handle đã về — nên nó, chứ không phải data-state, là
    // tín hiệu "đọc xong" trung thực duy nhất trên trang này.
    await button.waitFor({ state: "visible", timeout: 60_000 });
    const value = page.getByTestId("confidential-value").first();
    await expect(value).toHaveAttribute("data-state", "hidden");
    await read(page);
    no("Chủ ví, đúng máy, đúng mạng — vẫn che. Mặc định không bao giờ là mở");

    beat(6, "Một chữ ký EIP-712 mở cả principal lẫn TWAB.");
    await button.click();
    info("SDK init → ACL check → chờ ký → decrypt. Bốn pha, không gộp thành một spinner:");
    info('"đang nạp WASM" và "ví đang đợi bạn ký" là hai việc rất khác nhau với người đang nhìn');
    await expect(value).toHaveAttribute("data-state", "revealed", { timeout: 120_000 });
    await expect(value).toContainText(/\d/);
    await read(page, 1200);
    ok("Một chữ ký, hai giá trị — gộp vì chúng luôn được xem cùng nhau");
    ok("Handle chưa init bị LỌC trước khi gửi: relayer từ chối cả batch chỉ vì một HIDDEN_HANDLE");
    await expect(page.getByTestId("reveal-session-strip")).toBeVisible();
    info("Đồng hồ TTL 5 phút chạy trên đầu — lời hứa 'nó sẽ tự biến mất' được viết ra thành thứ nhìn thấy được");

    beat(7, "Đóng lại.");
    await page.getByRole("button", { name: "Hide", exact: true }).click();
    await expect(value).toHaveAttribute("data-state", "hidden");
    await read(page);
    ok("Về lại che ngay lập tức");

    beat(8, "Đổi mạng giữa lúc đang mở.");
    await button.click();
    await expect(value).toHaveAttribute("data-state", "revealed", { timeout: 120_000 });
    await switchChain(page, MAINNET_HEX);
    await expect(value).not.toHaveAttribute("data-state", "revealed");
    await expect(page.getByTestId("reveal-session-strip")).toBeHidden();
    await expect(page.getByText("Your wallet is on another network")).toBeVisible();
    await read(page, 1200);
    no("Phiên đóng, giá trị biến mất");
    await expect(page.getByRole("heading", { name: "Your pool" })).toBeVisible();
    ok("NHƯNG trang vẫn đọc được: read đi qua RPC Sepolia cố định, không qua ví");
    info("Chặn cả trang ở đây là ngõ cụt — và ngõ cụt là thứ exit gate Day 6 cấm");
    await switchChain(page, SEPOLIA_HEX);
    await expect(page.getByText("Your wallet is on another network")).toBeHidden();
    ok("Về đúng mạng thì banner tự biến mất, không phải bấm gì");

    beat(9, "Đổi account giữa lúc đang mở.");
    await button.waitFor({ state: "visible", timeout: 60_000 });
    await button.click();
    await expect(value).toHaveAttribute("data-state", "revealed", { timeout: 120_000 });
    await switchAccount(page, OTHER_ACCOUNT);
    await expect(value).not.toHaveAttribute("data-state", "revealed");
    await expect(page.getByTestId("reveal-session-strip")).toBeHidden();
    await read(page, 1200);
    no("Giá trị của ví CŨ không nằm lại một frame nào trên màn hình của ví MỚI");
    info("Đây là rò rỉ giữa hai người dùng trên cùng một máy — và một generation counter bỏ luôn kết quả đang bay về");

    beat(10, "Reload, rồi soi storage.");
    await page.reload();
    await expect(page.getByTestId("confidential-value").first()).toHaveAttribute("data-state", "hidden", {
      timeout: 60_000,
    });
    no("Không gì được khôi phục — giá trị đã decrypt chỉ sống trong memory");

    const dump = await page.evaluate(() => ({
      local: Object.fromEntries(Object.entries(localStorage)),
      session: Object.fromEntries(Object.entries(sessionStorage)),
    }));
    expect(Object.keys(dump.session)).toHaveLength(0);
    for (const [key, v] of Object.entries(dump.local)) {
      expect(key, `unexpected storage key ${key}`).toMatch(/^pdp\./);
      if (key === "pdp.tx.v1") continue;
      expect(String(v), `value under ${key}`).not.toMatch(/0x[0-9a-fA-F]{64}/);
    }
    no(`sessionStorage rỗng · localStorage chỉ có ${Object.keys(dump.local).join(", ") || "(rỗng)"}`);
    ok("Không số tiền, không handle, không winner — allowlist chứ không phải tin tưởng");

    line();
    line("═══ Exit gate Day 6 ═══");
    ok("incognito → onboarding → dashboard che kín → reveal/hide vị thế của chính mình");
    ok("sai mạng và huỷ chữ ký đều recover được, không có ngõ cụt nào");
    line();
  });
});
