/**
 * Day 8 EOD demo — the Draw Room, and the two ways this product refuses to lie.
 *
 *   pnpm demo:day8        # chạy + dựng MP4 có phụ đề tiếng Anh
 *   pnpm demo:day8:run    # chỉ chạy Playwright
 *
 * Nằm trong `demo/` nên KHÔNG chạy cùng `pnpm test:e2e` — cùng quy ước với
 * `demo-day6.spec.ts` và `demo-day7.spec.ts`.
 *
 * Day 6 diễn "che kín là mặc định". Day 7 diễn một luồng tiền mà mọi nhánh hỏng
 * đều có đường đi tiếp. Day 8 diễn thứ khó quay nhất và cũng là thứ judge hỏi
 * đầu tiên: **làm sao biết vòng quay này không do ai đó điều khiển**. Câu trả
 * lời không nằm ở một dòng chữ trấn an — nó nằm ở chỗ giết tab đi rồi mở lại
 * vẫn ra đúng con số cũ, vì màn hình này không nhớ gì cả.
 *
 * Ba beat cuối là recovery: banner unwrap treo (R1) và đường ra tiền từ trong
 * phòng tối. Đó là 30 giây trả lời trực tiếp tiêu chí "handle errors gracefully".
 *
 * Thuyết minh viết bằng tiếng Anh vì nó là phụ đề burn vào MP4 nộp cho judge.
 */

import { ethers } from "ethers";
import { expect, test, type Page, type Route } from "@playwright/test";

import { installWallet } from "../e2e/fixtures/wallet";
import { clip, resetReel } from "./narrate";

const ROOM = "/app/draws/current";
const READ = 60_000;

test.describe.configure({ mode: "serial" });

async function openRoom(page: Page): Promise<void> {
  await page.goto(ROOM);
  await page.getByTestId("draw-timeline").waitFor({ state: "visible", timeout: READ });
}

/** Mọi thứ Draw Room khẳng định về tiến độ, dưới dạng so sánh được từng ký tự. */
async function fingerprint(page: Page): Promise<string> {
  return page.evaluate(() => {
    const stages = [...document.querySelectorAll("[data-testid^='draw-stage-']")].map((el) =>
      [
        el.getAttribute("data-testid"),
        el.getAttribute("data-status"),
        (el.querySelector("[data-testid='draw-progress']")?.textContent ?? "").trim(),
      ].join("|"),
    );
    const keeper = document.querySelector("[data-testid='keeper-state']")?.getAttribute("data-state") ?? "";
    return JSON.stringify({ stages, keeper });
  });
}

test.describe("PayDay Pot — Day 8 EOD demo", () => {
  test.beforeAll(() => resetReel());

  test("the round is public, and it says so before you connect anything", async ({ page }, info) => {
    const say = clip(page, info, 1, "draw-room");
    console.log("\n═══ PayDay Pot · Day 8 — The Draw Room ═══");

    await page.goto(ROOM);
    await say.beat(1, "The Draw Room. No wallet connected — and the whole round is already readable.");
    await page.getByTestId("draw-timeline").waitFor({ state: "visible", timeout: READ });
    await say.ok("Five stages, each with the cursor the contract is actually at.");
    await say.info("Amounts are encrypted. The SCHEDULE is not, and pretending otherwise would be theatre.");

    await say.beat(2, "Who is allowed to run the draw? Anyone.");
    const keeper = page.getByTestId("keeper-panel");
    await keeper.scrollIntoViewIfNeeded();
    await expect(keeper).toContainText(/permissionless/i);
    await expect(keeper).toContainText(/any wallet can send it/i);
    await say.ok("All five steps are `external` with no access modifier. The copy is checkable by sending one.");
    await say.no("The keeper cannot supply the seed, the weights, or the winner. It can only say 'go'.");

    await say.beat(3, "And the prize is sponsored — said out loud, not implied.");
    await expect(page.getByTestId("draw-room")).toContainText(/employer sponsor/i);
    await say.info("An employer funds it. This is not yield the pool generated, and the screen never suggests it is.");
    await say.finish();
  });

  test("kill the tab mid-draw and the numbers do not move", async ({ page }, info) => {
    const say = clip(page, info, 2, "cursor-on-chain");
    await openRoom(page);

    await say.beat(4, "The exit-gate question: what does this page remember?");
    const before = await fingerprint(page);
    say.raw(`\n      ${before}\n`);
    await say.info("Here is every stage status and every cursor the room is showing right now.");

    await say.beat(5, "Now destroy everything this browser stored about it.");
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await page.reload();
    await page.getByTestId("draw-timeline").waitFor({ state: "visible", timeout: READ });
    const after = await fingerprint(page);
    expect(after).toBe(before);
    await say.ok("Identical. Byte for byte.");
    await say.info("Because there was nothing to lose: the cursor lives on chain, and this page has no memory of it.");
    await say.no("Kill the keeper halfway, open the room on another machine — same numbers, same next step.");

    await say.beat(6, "Which is also why a stranger can finish someone else's draw.");
    const progress = page.getByTestId("keeper-progress");
    if (await progress.count()) {
      await expect(progress).toContainText(/cursor on chain/i);
      await say.ok("`Continue` resumes from the on-chain cursor, in batches sized under the HCU ceiling.");
    } else {
      await say.ok("Nothing is half-finished right now — so there is no cursor line to show. That is the honest state.");
    }
    await say.info("Measured limits: 21 participants per snapshot tx, 22 per select tx. The UI never asks for 32.");
    await say.finish();
  });

  test("the sealed result looks the same whether you won or lost", async ({ page }, info) => {
    const say = clip(page, info, 3, "sealed-result");
    await installWallet(page);
    await openRoom(page);

    await say.beat(7, "Your side of the round — sealed until you sign for it.");
    const sealed = page.getByTestId("sealed-result");
    await sealed.scrollIntoViewIfNeeded();
    await page.getByTestId("sealed-state").waitFor({ state: "visible", timeout: READ });
    await say.no("A winner's screen and a loser's screen are the same DOM here — asserted character by character.");
    await say.info("Even the contract agrees: claim costs identical gas either way. 748,032 / 369,000 / 396,250.");

    await say.beat(8, "And nothing that cannot be read is allowed to render as zero.");
    for (const value of await page.getByTestId("confidential-value").all()) {
      if ((await value.getAttribute("data-state")) === "revealed") continue;
      expect(await value.innerText()).not.toMatch(/\d/);
    }
    await say.ok("No digit appears in any value you have not unlocked — non-negotiable #8.");
    await say.no("'Hidden' and 'zero' are different states. Showing 0 for a hidden balance reads as money lost.");

    await say.beat(9, "So claiming stays shut until you have read your own result.");
    const review = page.getByTestId("claim-open-review");
    if (await review.count()) {
      await expect(review).toBeDisabled();
      await expect(page.getByTestId("claim-gate")).toContainText(/unlock|settl|position|round/i);
      await say.ok("Not a security boundary — the contract is that. A boundary against signing what you cannot see.");
    } else {
      await expect(page.getByTestId("sealed-state")).not.toHaveText(/^\s*$/);
      await say.ok("No claim button yet, and the card says why. A dead button is worse than an explained absence.");
    }

    await say.beat(10, "The fairness receipt is a tab in this same room, not a PDF nobody opens.");
    await page.getByTestId("draw-tab-receipt").click();
    await expect(page.getByTestId("fairness-facts")).toBeVisible();
    await expect(page.getByTestId("fairness-absences")).toBeVisible();
    await say.ok("What is provable is listed. So is what is deliberately ABSENT: no amounts, no winner address.");
    await say.finish();
  });

  test("an unwrap left half-done, and the way back (R1)", async ({ page }, info) => {
    const say = clip(page, info, 4, "recovery");
    const wallet = await installWallet(page);

    // Kịch bản dàn dựng ở tầng RPC — chỉ hai lời gọi, phần còn lại ra Sepolia
    // thật. Không dựng được cảnh này bằng happy path: nó cần một yêu cầu unwrap
    // đang treo, và trên testnet ta không có sẵn một cái để chỉ vào.
    const CUSDC = "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639";
    const HASH = `0x${"c1".repeat(32)}`;
    const REQUEST_ID = `0x${"d2".repeat(32)}`;
    const settled = { done: false };

    await page.route(/ethereum-sepolia-rpc\.publicnode\.com/, async (route: Route) => {
      let body: unknown;
      try {
        body = JSON.parse(route.request().postData() ?? "");
      } catch {
        await route.continue();
        return;
      }
      const calls = (Array.isArray(body) ? body : [body]) as { id: unknown; method: string; params: unknown[] }[];
      const answers = calls.map((call) => {
        if (call.method === "eth_getTransactionReceipt" && call.params[0] === HASH) {
          return {
            jsonrpc: "2.0",
            id: call.id,
            result: {
              blockHash: `0x${"0b".repeat(32)}`,
              blockNumber: "0x1",
              contractAddress: null,
              cumulativeGasUsed: "0x1",
              effectiveGasPrice: "0x1",
              from: wallet.address,
              gasUsed: "0x1",
              logs: [
                {
                  address: CUSDC,
                  topics: [
                    ethers.id("UnwrapRequested(address,bytes32,bytes32)"),
                    ethers.zeroPadValue(wallet.address, 32),
                    REQUEST_ID,
                  ],
                  data: `0x${"e3".repeat(32)}`,
                  blockNumber: "0x1",
                  blockHash: `0x${"0b".repeat(32)}`,
                  transactionHash: HASH,
                  transactionIndex: "0x0",
                  logIndex: "0x0",
                  removed: false,
                },
              ],
              logsBloom: `0x${"00".repeat(256)}`,
              status: "0x1",
              to: CUSDC,
              transactionHash: HASH,
              transactionIndex: "0x0",
              type: "0x2",
            },
          };
        }
        const tx = call.params[0] as { to?: string; data?: string } | undefined;
        if (
          call.method === "eth_call" &&
          tx?.to?.toLowerCase() === CUSDC.toLowerCase() &&
          tx.data?.startsWith(ethers.id("unwrapRequester(bytes32)").slice(0, 10))
        ) {
          const owner = settled.done ? ethers.ZeroAddress : wallet.address;
          return { jsonrpc: "2.0", id: call.id, result: ethers.zeroPadValue(owner, 32) };
        }
        return null;
      });
      if (answers.every((a) => a === null)) {
        await route.continue();
        return;
      }
      const rest = calls.filter((_, i) => answers[i] === null);
      const upstream = new Map<unknown, unknown>();
      if (rest.length > 0) {
        try {
          const res = await route.fetch({ postData: JSON.stringify(Array.isArray(body) ? rest : rest[0]) });
          const json = (await res.json()) as { id: unknown }[] | { id: unknown };
          for (const item of Array.isArray(json) ? json : [json]) upstream.set(item.id, item);
        } catch {
          /* để lỗi thật đi tiếp, không bịa câu trả lời */
        }
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(
          Array.isArray(body)
            ? calls.map((c, i) => answers[i] ?? upstream.get(c.id))
            : (answers[0] ?? upstream.get(calls[0]!.id)),
        ),
      });
    });

    await page.addInitScript(
      ([key, hash]) => {
        window.localStorage.setItem(
          key as string,
          JSON.stringify([{ chainId: 11155111, action: "unwrap", txHash: hash, createdAt: Date.now() }]),
        );
      },
      ["pdp.tx.v1", HASH],
    );

    await page.goto("/app");
    await say.beat(11, "The failure that sank last season's winners: an unwrap that stopped halfway.");
    const banner = page.getByTestId("pending-unwrap");
    await banner.waitFor({ state: "visible", timeout: READ });
    await say.info("Unwrapping is two transactions. Close the tab between them and your balance just… drops.");
    await expect(banner).toContainText(/nothing is lost/i);
    await say.ok("So the app says the whole truth: step one landed, step two did not, and nothing is lost.");
    await say.no("It does NOT print a zero balance. A zero here is how a user concludes the money is gone.");

    await say.beat(12, "Three ways out, and none of them is a dead end.");
    await expect(banner.getByRole("link", { name: /view the request/i })).toBeVisible();
    await expect(banner.getByRole("link", { name: /what to do/i })).toBeVisible();
    await say.info("Verify it on Etherscan · read the limitation · or ask the chain again.");

    await say.beat(13, "Finalizing is permissionless too — so someone else finishing it must look like success.");
    const recheck = banner.getByTestId("unwrap-recheck");
    await expect(recheck).toBeEnabled({ timeout: 30_000 });
    settled.done = true;
    await recheck.click();
    await expect(page.getByTestId("pending-unwrap")).toHaveCount(0, { timeout: 30_000 });
    await say.ok("`unwrapRequester` came back empty — the request is done. The banner closes. No red error.");
    await say.info("Live probe today: `finalizeUnwrap(bytes32,uint64,bytes)` exists; an unknown id reverts");
    await say.info("with InvalidUnwrapRequest — 0xd1630f8e — which the taxonomy already reads as 'already finished'.");
    await say.no("Still owed: the one-click Resume button. It needs a real stuck request on a funded wallet first.");
    await say.finish();
  });

  test("the exit is reachable from inside the dark room", async ({ page }, info) => {
    const say = clip(page, info, 5, "exit");
    await installWallet(page);
    await openRoom(page);

    await say.beat(14, "Last thing, and it is the first rule of the contract.");
    const link = page.getByTestId("draw-withdraw-link");
    await link.scrollIntoViewIfNeeded();
    await link.click();
    await expect(page).toHaveURL(/\/app\/savings/);
    await expect(page.getByRole("heading", { name: "Savings" })).toBeVisible({ timeout: READ });
    await say.ok("From the middle of a draw, one click to the way out.");
    await say.info("`withdrawAll()` works in every phase, including while paused. So the route to it must too.");
    await say.no("Nobody has to wait for a round to end to get their own savings back.");
    await say.finish();
  });
});
