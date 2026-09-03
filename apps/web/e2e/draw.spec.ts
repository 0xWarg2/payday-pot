/**
 * Draw Room, kiểm trong trình duyệt thật.
 *
 * Unit test đã pin view model (`test/draw-room.test.tsx`). Cái nó KHÔNG chứng
 * minh được là bốn thứ chỉ tồn tại khi có một trình duyệt thật:
 *
 *  1. **Reload không làm số nhảy.** Exit gate Day 8 nói "giết keeper giữa chừng
 *     rồi reload phải ra đúng con số cũ". Ở đây kiểm vế mạnh hơn: xoá sạch
 *     storage rồi reload vẫn ra đúng con số đó — tức là con số chưa từng đến từ
 *     tab này.
 *  2. **Hai persona nhìn thấy cùng một thứ trước khi reveal.** Kiểm bằng hai
 *     browser context riêng, hai ví riêng.
 *  3. Bàn phím đi hết được Draw Room, và reduced-motion thì thật sự đứng yên.
 *  4. Không có gì riêng tư rời khỏi máy hay ở lại trên đĩa.
 *
 * Những test cần vị thế thật sẽ tự skip khi env không có khoá đã seed — một
 * assertion về "kết quả niêm phong" chạy trên ví trắng không chứng minh gì cả.
 */

import { expect, test, type Page } from "@playwright/test";

import { installWallet } from "./fixtures/wallet";

const ROOM = "/app/draws/current";
const READ_TIMEOUT = 60_000;

// Timeout mặc định của Playwright là 30s, tức là `READ_TIMEOUT` ở trên KHÔNG BAO
// GIỜ với tới được — test chết trước khi cái `waitFor` kịp hết giờ. Nó xanh suốt
// vì route đã compile sẵn từ lần chạy trước; lần đầu chạy nguội (Next compile
// `/app/draws/current` + một vòng đọc Sepolia thật) thì đỏ, và đỏ ở đúng test
// đầu tiên nên trông như lỗi sản phẩm. Nới ở đây để con số 60s kia có nghĩa.
test.describe.configure({ timeout: 120_000 });

/** Đợi phòng đọc xong chain. `draw-timeline` chỉ render sau khi có epoch thật. */
async function openRoom(page: Page): Promise<void> {
  await page.goto(ROOM);
  await page.getByTestId("draw-timeline").waitFor({ state: "visible", timeout: READ_TIMEOUT });
}

/**
 * Toàn bộ thứ mà Draw Room khẳng định về tiến độ của vòng, dưới dạng so sánh được.
 *
 * Cố ý gom cả `data-status` lẫn chữ của progress: một cái là máy trạng thái, cái
 * kia là con số cursor. Chỉ so một trong hai thì một bug làm lệch cái còn lại sẽ
 * đi lọt.
 */
async function progressFingerprint(page: Page): Promise<string> {
  return page.evaluate(() => {
    const stages = [...document.querySelectorAll("[data-testid^='draw-stage-']")].map((el) => {
      const progress = el.querySelector("[data-testid='draw-progress']");
      return [
        el.getAttribute("data-testid"),
        el.getAttribute("data-status"),
        (progress?.textContent ?? "").trim(),
      ].join("|");
    });
    const keeper = document.querySelector("[data-testid='keeper-state']")?.getAttribute("data-state") ?? "";
    const keeperProgress = (document.querySelector("[data-testid='keeper-progress']")?.textContent ?? "").trim();
    return JSON.stringify({ stages, keeper, keeperProgress });
  });
}

/* ------------------------------------------------------------------ *
 * Phần công khai
 * ------------------------------------------------------------------ */

test.describe("the round is public", () => {
  test("renders the whole timeline without a wallet", async ({ page }) => {
    // Không có `installWallet` ở đây, và đó là chủ ý: phần công khai của một
    // vòng phải đọc được bởi người chưa có ví — kể cả giám khảo mở link lần đầu.
    await openRoom(page);

    const stages = ["open", "snapshot", "random", "select", "settled"];
    for (const id of stages) {
      const stage = page.getByTestId(`draw-stage-${id}`);
      await expect(stage).toBeVisible();
      expect(["done", "active", "upcoming"]).toContain(await stage.getAttribute("data-status"));
    }
  });

  test("says out loud that anyone can run the next step", async ({ page }) => {
    await openRoom(page);
    // Đây là khác biệt giữa "keeper là tiện nghi" và "keeper là đặc quyền", và
    // nó phải nằm trên màn hình chứ không chỉ trong README.
    await expect(page.getByTestId("keeper-panel")).toContainText(/permissionless/i);
    await expect(page.getByTestId("keeper-panel")).toContainText(/any wallet can send it/i);
  });

  test("prize is framed as sponsored, never as yield the pool made", async ({ page }) => {
    await openRoom(page);
    await expect(page.getByTestId("draw-room")).toContainText(/employer sponsor/i);
  });
});

/* ------------------------------------------------------------------ *
 * Exit gate: cursor onchain là sự thật
 * ------------------------------------------------------------------ */

test.describe("the numbers come from the chain, not from this tab", () => {
  test("wiping storage and reloading reproduces the same progress", async ({ page }) => {
    await openRoom(page);
    const before = await progressFingerprint(page);

    // Xoá sạch rồi tải lại. Nếu bất kỳ con số nào ở trên từng được nhớ ở client,
    // đây là chỗ nó biến mất — và test đỏ. Đó chính là kịch bản "keeper chết
    // giữa chừng, người dùng F5": không có gì để khôi phục, nên không có gì để
    // mất.
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload();
    await page.getByTestId("draw-timeline").waitFor({ state: "visible", timeout: READ_TIMEOUT });

    expect(await progressFingerprint(page)).toBe(before);
  });

  test("nothing about the round is written to storage at all", async ({ page }) => {
    await installWallet(page);
    await openRoom(page);

    const dump = await page.evaluate(() => ({
      local: Object.fromEntries(Object.entries(localStorage)),
      session: Object.fromEntries(Object.entries(sessionStorage)),
    }));

    // `sessionStorage` không được dùng ở bất cứ đâu trong app.
    expect(Object.keys(dump.session)).toEqual([]);
    const blob = JSON.stringify(dump.local).toLowerCase();
    for (const word of ["cursor", "epoch", "snapshot", "winner", "prize", "twab", "principal"]) {
      expect(blob, `localStorage mentions "${word}"`).not.toContain(word);
    }
    // Và không handle nào: 0x + 64 hex.
    expect(JSON.stringify(dump.local)).not.toMatch(/0x[0-9a-fA-F]{64}/);
  });

  test("a keeper transaction is offered from the cursor, not from a local step counter", async ({ page }) => {
    await installWallet(page);
    await openRoom(page);

    const state = await page.getByTestId("keeper-state").getAttribute("data-state");
    expect(["counting-down", "ready", "blocked-paused", "idle"]).toContain(state);

    if (state === "ready") {
      const progress = page.getByTestId("keeper-progress");
      if (await progress.count()) {
        await expect(progress).toContainText(/continues from the cursor on chain/i);
      }
    }
  });
});

/* ------------------------------------------------------------------ *
 * Exit gate: winner và loser không phân biệt được
 * ------------------------------------------------------------------ */

test.describe("two wallets, one screen", () => {
  test("the sealed result looks the same to both before either reveals", async ({ browser }) => {
    // Hai context tách hẳn nhau — hai profile trình duyệt, hai ví, không chia sẻ
    // storage. Đây là cách duy nhất diễn được "người ngồi cạnh chụp màn hình".
    const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
    const pages: Page[] = [];
    try {
      for (const [i, context] of contexts.entries()) {
        const page = await context.newPage();
        await installWallet(page, { accountIndex: i });
        await openRoom(page);
        pages.push(page);
      }

      const cards = await Promise.all(
        pages.map(async (page) => {
          const card = page.getByTestId("sealed-result");
          await card.waitFor({ state: "visible", timeout: READ_TIMEOUT });
          return {
            state: await page.getByTestId("sealed-state").getAttribute("data-state"),
            html: await card.innerHTML(),
          };
        }),
      );

      // Hai ví ở hai tình huống khác nhau (một người chưa vào pool) thì khác
      // nhau là ĐÚNG — và không nói gì về ai thắng. Tính chất cần kiểm chỉ có
      // nghĩa khi cả hai đã niêm phong. Không dựng được thì skip, chứ không
      // xanh giả: `test/draw-room.test.tsx` giữ vế byte-identical ở tầng unit.
      test.skip(
        cards[0]!.state !== "sealed" || cards[1]!.state !== "sealed",
        `needs two settled positions, got ${cards[0]!.state} / ${cards[1]!.state}`,
      );

      expect(cards[0]!.html).toBe(cards[1]!.html);
    } finally {
      await Promise.all(contexts.map((c) => c.close()));
    }
  });
});

/* ------------------------------------------------------------------ *
 * Của riêng bạn: gate claim và đường rút tiền
 * ------------------------------------------------------------------ */

test.describe("your side of the round", () => {
  test("claim stays shut until you have opened your own result", async ({ page }) => {
    await installWallet(page);
    await openRoom(page);

    const review = page.getByTestId("claim-open-review");
    const sealed = page.getByTestId("sealed-state");
    await sealed.waitFor({ state: "visible", timeout: READ_TIMEOUT });

    if (!(await review.count())) {
      // Chưa settle hoặc chưa có vị thế — nút review không tồn tại, và lý do
      // phải nói ra thay vì để một nút chết nằm đó.
      await expect(sealed).not.toHaveText(/^\s*$/);
      return;
    }

    // Không phải hàng rào bảo mật (contract mới quyết định) mà là hàng rào "đừng
    // ký thứ mình chưa đọc": `NothingToClaim` sau khi trả gas là câu trả lời tệ
    // nhất cho câu hỏi "tôi có thắng không".
    await expect(review).toBeDisabled();
    await expect(page.getByTestId("claim-gate")).toContainText(/unlock|settl|position|round/i);
  });

  test("no digit appears in a value you have not unlocked", async ({ page }) => {
    await installWallet(page);
    await openRoom(page);

    const values = page.getByTestId("confidential-value");
    await values.first().waitFor({ state: "visible", timeout: READ_TIMEOUT });
    for (const value of await values.all()) {
      if ((await value.getAttribute("data-state")) === "revealed") continue;
      // `0` là trường hợp nguy hiểm nhất — nó trông như một câu trả lời hợp lệ
      // cho "tôi có bao nhiêu" (non-negotiable #8).
      expect(await value.innerText()).not.toMatch(/\d/);
    }
  });

  test("withdrawing is reachable from inside the room", async ({ page }) => {
    // Exit gate: người đang đứng trong phòng tối phải ra được chỗ rút tiền mà
    // không phải đoán. `withdrawAll()` khả dụng ở mọi phase, nên đường tới nó
    // cũng phải vậy.
    await installWallet(page);
    await openRoom(page);

    const link = page.getByTestId("draw-withdraw-link");
    await link.waitFor({ state: "visible", timeout: READ_TIMEOUT });
    await link.click();
    await expect(page).toHaveURL(/\/app\/savings$/);
  });
});

/* ------------------------------------------------------------------ *
 * Fairness receipt
 * ------------------------------------------------------------------ */

test.describe("fairness receipt", () => {
  test("is a tab inside the room, and degrades to an explorer link", async ({ page }) => {
    await openRoom(page);
    await page.getByTestId("draw-tab-receipt").click();

    await expect(page.getByTestId("fairness-facts")).toBeVisible();
    // Phần "những gì KHÔNG có ở đây" là nửa quan trọng hơn của một receipt:
    // nó nói ra rằng số tiền và người thắng cố ý không nằm trong log.
    await expect(page.getByTestId("fairness-absences")).toBeVisible();

    const log = page.getByTestId("fairness-log");
    await expect(log).toBeVisible({ timeout: READ_TIMEOUT });
    // Không assert có bao nhiêu event: RPC công khai có quyền từ chối khoảng
    // block. Cái phải luôn đúng là người đọc không bị bỏ lại tay trắng.
    await expect(log).toContainText(/etherscan|event|log/i);
  });
});

/* ------------------------------------------------------------------ *
 * Bàn phím, chuyển động, điều hướng
 * ------------------------------------------------------------------ */

test.describe("keyboard and motion", () => {
  test("arrow keys move between tabs, as real tabs promise", async ({ page }) => {
    await openRoom(page);

    const draw = page.getByTestId("draw-tab-draw");
    const receipt = page.getByTestId("draw-tab-receipt");
    await draw.focus();
    await expect(draw).toHaveAttribute("aria-selected", "true");

    await page.keyboard.press("ArrowRight");
    await expect(receipt).toHaveAttribute("aria-selected", "true");
    await expect(receipt).toBeFocused();

    await page.keyboard.press("Home");
    await expect(draw).toHaveAttribute("aria-selected", "true");
    await expect(draw).toBeFocused();
  });

  test("nothing animates when the visitor asked for no motion", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    try {
      const page = await context.newPage();
      await openRoom(page);
      // Orb là SVG tĩnh theo thiết kế; test này là cái chuông báo khi ai đó
      // "làm cho nó sống động hơn" mà quên nhánh reduced-motion.
      const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length);
      expect(running).toBe(0);
    } finally {
      await context.close();
    }
  });

  test("the shell marks exactly one place as the current page", async ({ page }) => {
    await openRoom(page);
    // `startsWith` ngây thơ làm cả Dashboard lẫn Draw room cùng sáng, và trình
    // đọc màn hình được bảo rằng người dùng đang ở hai nơi cùng lúc.
    await expect(page.locator('nav[aria-label="Main"] [aria-current="page"]')).toHaveCount(1);
    await expect(page.locator('nav[aria-label="Main"] [aria-current="page"]')).toHaveText("Draw room");
  });
});

/* ------------------------------------------------------------------ *
 * URL không tồn tại
 * ------------------------------------------------------------------ */

test.describe("bad round ids", () => {
  test("a non-numeric id is a 404, not a white screen", async ({ page }) => {
    // `BigInt("abc")` ném bên trong cây client và biến một URL gõ sai thành
    // màn hình trắng. Chặn ở tầng route.
    const response = await page.goto("/app/draws/not-a-number");
    expect(response?.status()).toBe(404);
  });

  test("a round that does not exist says so instead of showing an empty open round", async ({ page }) => {
    // Mapping của contract trả struct rỗng cho id lạ — trông y hệt một vòng
    // đang mở nhận tiền. Đây là cái bẫy mà `useEpochView` phải chặn.
    await page.goto("/app/draws/99999");
    await expect(page.getByText(/there is no round 99999/i)).toBeVisible({ timeout: READ_TIMEOUT });
    await expect(page.getByTestId("draw-timeline")).toHaveCount(0);
  });
});

/* ------------------------------------------------------------------ *
 * Chain không trả lời
 * ------------------------------------------------------------------ */

test.describe("the chain does not answer", () => {
  test("the room still says which page it is", async ({ page }) => {
    // Tên phòng là `Round N`, và N đọc từ chain — nên trước Day 9 trang này
    // KHÔNG có `<h1>` nào trong cả năm trạng thái chưa-đọc-được. Screen reader
    // mở nó ra và không có gì nói đây là trang gì, và triệu chứng chỉ hiện khi
    // RPC chậm hoặc chết: suite bắt được đúng một lần trên 79 test và trông y
    // như flaky.
    //
    // Chặn RPC hoàn toàn là cách duy nhất kiểm được nhánh đó một cách xác định.
    await page.route(/ethereum-sepolia-rpc\.publicnode\.com/, (route) => route.abort());
    await page.goto(ROOM);

    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible();
    // Đúng MỘT `<h1>`: nhánh này và `Round N` phải loại trừ nhau, không cộng vào.
    await expect(heading).toHaveCount(1);
    // Và không bịa ra số vòng — `Round 0` tệ hơn là không có số.
    await expect(heading).not.toContainText(/round/i);
  });
});

/* ------------------------------------------------------------------ *
 * Đường vào phòng
 * ------------------------------------------------------------------ */

test.describe("getting into the room from the dashboard", () => {
  test("the round card opens the room, and the two agree on what is waiting", async ({ page }) => {
    await page.goto("/app");
    const link = page.getByTestId("dashboard-draw-link");
    await link.waitFor({ state: "visible", timeout: READ_TIMEOUT });

    // Dashboard và Draw Room đọc cùng một `keeperState()`, nên hai giá trị này
    // phải bằng nhau. Chúng chỉ lệch được nếu ai đó chép luật sang một bản thứ
    // hai — và bản thứ hai luôn là bản nói sai trước.
    // (Ranh giới epoch giữa hai lần đọc về lý thuyết làm chúng lệch; round trên
    // Sepolia dài 2 ngày nên không có cửa cho chuyện đó ở đây.)
    const fromCard = await link.getAttribute("data-keeper");
    expect(fromCard).not.toBeNull();

    await link.click();
    await expect(page).toHaveURL(/\/app\/draws\/current$/);
    await page.getByTestId("draw-timeline").waitFor({ state: "visible", timeout: READ_TIMEOUT });

    const inRoom = await page.getByTestId("keeper-state").getAttribute("data-state");
    expect(inRoom).toBe(fromCard);
  });

  test("the card never invites a step the room would refuse to run", async ({ page }) => {
    // Chỗ này là non-negotiable #1 nhìn từ phía khác: pause không được làm hỏng
    // đường đi, nhưng cũng không được giả vờ là có việc để bấm. Nhãn "…in the
    // draw room" chỉ được xuất hiện khi phòng thật sự có một bước chạy được.
    await page.goto("/app");
    const link = page.getByTestId("dashboard-draw-link");
    await link.waitFor({ state: "visible", timeout: READ_TIMEOUT });

    const kind = await link.getAttribute("data-keeper");
    const label = ((await link.textContent()) ?? "").trim();
    // `textContent` gom cả mũi tên `aria-hidden`, nên so phần chữ chứ không so
    // hết chuỗi.
    if (kind === "ready") {
      expect(label).toContain("in the draw room");
      expect(label).not.toMatch(/^Open the draw room/);
    } else {
      expect(label).toMatch(/^Open the draw room/);
    }
  });
});
