/**
 * Đường thoát hiểm, kiểm trong trình duyệt thật — R1 và R11.
 *
 * Đây là hai dòng mà submission winner Season 3 bị chất vấn: unwrap treo giữa
 * hai bước, và reload giữa một tx đang bay. Cả hai đều không diễn được bằng
 * happy path, và cả hai đều cần một chain nói dối theo kịch bản — nên RPC ở đây
 * bị chặn có chọn lọc.
 *
 * **Chỉ hai lời gọi bị dàn dựng**: `eth_getTransactionReceipt` của đúng một hash
 * bịa, và `unwrapRequester(id)` của đúng requestId đó. Mọi thứ khác đi thẳng ra
 * Sepolia thật. Một stub toàn phần sẽ biến test này thành test của cái stub.
 */

import { ethers } from "ethers";
import { expect, test, type Page, type Route } from "@playwright/test";

import { installWallet } from "./fixtures/wallet";

const RPC = "https://ethereum-sepolia-rpc.publicnode.com";
/** Khớp bằng regex chứ không bằng chuỗi: URL thật có thể mang thêm dấu `/`. */
const RPC_MATCH = /ethereum-sepolia-rpc\.publicnode\.com/;
const CUSDC = "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639";

const UNWRAP_TOPIC = ethers.id("UnwrapRequested(address,bytes32,bytes32)");
const REQUESTER_SELECTOR = ethers.id("unwrapRequester(bytes32)").slice(0, 10);

const UNWRAP_HASH = `0x${"c1".repeat(32)}`;
/**
 * `requestId` trên bản live CHÍNH LÀ ciphertext handle của số đã burn (quirk
 * #23) — lý do nó không bao giờ được persist. Ở đây nó chỉ là một bytes32 bịa.
 */
const REQUEST_ID = `0x${"d2".repeat(32)}`;
const AMOUNT_HANDLE = `0x${"e3".repeat(32)}`;

interface RpcCall {
  id: unknown;
  method: string;
  params: unknown[];
}

interface RpcResult {
  jsonrpc: string;
  id: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

function receiptFor(receiver: string): Record<string, unknown> {
  const log = {
    address: CUSDC,
    topics: [UNWRAP_TOPIC, ethers.zeroPadValue(receiver, 32), REQUEST_ID],
    data: AMOUNT_HANDLE,
    blockNumber: "0x1",
    blockHash: `0x${"0b".repeat(32)}`,
    transactionHash: UNWRAP_HASH,
    transactionIndex: "0x0",
    logIndex: "0x0",
    removed: false,
  };
  return {
    blockHash: log.blockHash,
    blockNumber: "0x1",
    contractAddress: null,
    cumulativeGasUsed: "0x1",
    effectiveGasPrice: "0x1",
    from: receiver,
    gasUsed: "0x1",
    logs: [log],
    logsBloom: `0x${"00".repeat(256)}`,
    status: "0x1",
    to: CUSDC,
    transactionHash: UNWRAP_HASH,
    transactionIndex: "0x0",
    type: "0x2",
  };
}

/**
 * Chặn RPC theo kịch bản. `settled` là ô công tắc: `false` = yêu cầu còn treo,
 * `true` = ai đó (bất kỳ ai) đã finalize xong.
 */
async function stubUnwrap(page: Page, receiver: string, state: { settled: boolean }): Promise<void> {
  await page.route(RPC_MATCH, async (route: Route) => {
    let body: RpcCall | RpcCall[];
    try {
      body = JSON.parse(route.request().postData() ?? "") as RpcCall | RpcCall[];
    } catch {
      await route.continue();
      return;
    }
    // ethers gộp nhiều call vào một request (batchMaxCount 10), nên một body có
    // thể là mảng. Bỏ qua chuyện đó là cách test này xanh trên máy nhanh và đỏ
    // trên máy chậm.
    const calls = Array.isArray(body) ? body : [body];
    const answers = calls.map((call) => stubAnswer(call, receiver, state));

    if (answers.every((a) => a === null)) {
      await route.continue();
      return;
    }

    // Một call trong lô cần dàn dựng thì cả lô phải do ta trả lời — JSON-RPC
    // không cho trả một nửa. Phần còn lại vẫn phải ra Sepolia thật, và đi bằng
    // `route.fetch` chứ không bằng `fetch` của Node: cùng ngăn xếp mạng với
    // trình duyệt, nên không dính chuyện IPv6 của máy chạy test.
    const passthrough = calls.filter((_, i) => answers[i] === null);
    const upstream = new Map<unknown, unknown>();
    if (passthrough.length > 0) {
      try {
        const response = await route.fetch({
          postData: JSON.stringify(Array.isArray(body) ? passthrough : passthrough[0]),
        });
        const json = (await response.json()) as RpcResult | RpcResult[];
        for (const item of Array.isArray(json) ? json : [json]) upstream.set(item.id, item);
      } catch {
        // RPC thật chớp thì để `findPendingUnwraps` thấy đúng cái nó phải thấy
        // ngoài đời — một lỗi — thay vì một câu trả lời bịa.
      }
    }

    const resolved = calls.map(
      (call, i) =>
        answers[i] ??
        upstream.get(call.id) ?? {
          jsonrpc: "2.0",
          id: call.id,
          error: { code: -32603, message: "upstream unavailable" },
        },
    );
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(Array.isArray(body) ? resolved : resolved[0]),
    });
  });
}

function stubAnswer(call: RpcCall, receiver: string, state: { settled: boolean }): RpcResult | null {
  if (call.method === "eth_getTransactionReceipt" && call.params[0] === UNWRAP_HASH) {
    return { jsonrpc: "2.0", id: call.id, result: receiptFor(receiver) };
  }
  if (call.method === "eth_call") {
    const tx = call.params[0] as { to?: string; data?: string };
    if (tx.to?.toLowerCase() === CUSDC.toLowerCase() && tx.data?.startsWith(REQUESTER_SELECTOR)) {
      // `finalizeUnwrap` là permissionless, nên "ai đó đã làm xong" trông y hệt
      // "chính bạn đã làm xong": requester về địa chỉ 0.
      const owner = state.settled ? ethers.ZeroAddress : receiver;
      return { jsonrpc: "2.0", id: call.id, result: ethers.zeroPadValue(owner, 32) };
    }
  }
  return null;
}

/** Ghi một tx record như thể tab trước đã gửi `unwrap` rồi bị đóng. */
async function seedUnwrapRecord(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, hash]) => {
      window.localStorage.setItem(
        key as string,
        JSON.stringify([{ chainId: 11155111, action: "unwrap", txHash: hash, createdAt: Date.now() }]),
      );
    },
    ["pdp.tx.v1", UNWRAP_HASH],
  );
}

/* ------------------------------------------------------------------ *
 * R1 — unwrap treo
 * ------------------------------------------------------------------ */

test.describe("an unwrap left half-done (R1)", () => {
  // Phần không dàn dựng của mỗi lô RPC vẫn ra Sepolia thật, nên nhóm này chậm
  // hơn mặc định 30s một cách hợp pháp.
  test.slow();

  test("survives closing the tab, and never reads as money lost", async ({ page }) => {
    const wallet = await installWallet(page);
    const state = { settled: false };
    await stubUnwrap(page, wallet.address, state);
    await seedUnwrapRecord(page);

    await page.goto("/app");

    const banner = page.getByTestId("pending-unwrap");
    await banner.waitFor({ state: "visible", timeout: 60_000 });

    // Ba câu phải có mặt, và câu thứ ba là câu quan trọng nhất: người dùng vừa
    // thấy số dư của mình tụt đi và chưa thấy USDC về ví.
    await expect(banner).toContainText(/two steps/i);
    await expect(banner).toContainText(/has not settled/i);
    await expect(banner).toContainText(/nothing is lost/i);

    // Không có ngõ cụt: ít nhất một đường đi tiếp, và một đường tự xác nhận.
    await expect(banner.getByRole("link", { name: /what to do/i })).toBeVisible();
    await expect(banner.getByTestId("unwrap-recheck")).toBeVisible();
    // Và một link ra explorer để tự kiểm chứng bằng nguồn khác app này.
    await expect(banner.getByRole("link", { name: /view the request/i })).toHaveAttribute(
      "href",
      new RegExp(UNWRAP_HASH),
    );
  });

  test("re-checking is idempotent, and a finished request closes the banner instead of erroring", async ({ page }) => {
    const wallet = await installWallet(page);
    const state = { settled: false };
    await stubUnwrap(page, wallet.address, state);
    await seedUnwrapRecord(page);

    await page.goto("/app");
    const banner = page.getByTestId("pending-unwrap");
    await banner.waitFor({ state: "visible", timeout: 60_000 });

    // Nút tự khoá trong lúc đang hỏi chain — chờ nó mở lại rồi mới bấm. Bấm
    // chồng lên một lần kiểm tra đang bay chính là cách sinh ra hai câu trả lời
    // cho một câu hỏi, và đó là bug ta đang phòng chứ không phải bug ta muốn gây.
    const recheck = banner.getByTestId("unwrap-recheck");
    await expect(recheck).toBeEnabled({ timeout: 30_000 });
    await recheck.click();
    // Bấm lại khi chưa có gì đổi: vẫn đúng banner đó, không nhân đôi, không lỗi.
    await expect(page.getByTestId("pending-unwrap")).toHaveCount(1);
    await expect(recheck).toBeEnabled({ timeout: 30_000 });

    // `finalizeUnwrap` là permissionless — ví nào bấm cũng được, kể cả một ví
    // khác. Từ phía app, chuyện đó trông đúng như thế này: `unwrapRequester`
    // trả về địa chỉ 0. Phản ứng đúng là banner biến mất, KHÔNG phải một lỗi đỏ.
    state.settled = true;
    await recheck.click();
    await expect(page.getByTestId("pending-unwrap")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByText(/went wrong|failed/i)).toHaveCount(0);
  });

  test("a confidential balance still refuses to render as zero while this is open", async ({ page }) => {
    const wallet = await installWallet(page);
    await stubUnwrap(page, wallet.address, { settled: false });
    await seedUnwrapRecord(page);

    await page.goto("/app");
    await page.getByTestId("pending-unwrap").waitFor({ state: "visible", timeout: 60_000 });

    const values = page.getByTestId("confidential-value");
    await values.first().waitFor({ state: "visible", timeout: 60_000 });

    // Đây là cách hỏng tệ nhất của R1: tiền đang nằm ở token contract, app đọc
    // không ra, và hiện `0`. Người dùng kết luận mất tiền (non-negotiable #8).
    for (const value of await values.all()) {
      if ((await value.getAttribute("data-state")) === "revealed") continue;
      expect(await value.innerText()).not.toMatch(/\d/);
    }
  });
});

/* ------------------------------------------------------------------ *
 * R11 — reload giữa mọi pending state
 * ------------------------------------------------------------------ */

test.describe("reload in the middle of a pending transaction (R11)", () => {
  // Bốn điểm của R11. `deposit` và `draw cursor` có test riêng ở
  // `savings.spec.ts` và `draw.spec.ts`; hai điểm còn lại đóng ở đây, cùng một
  // cơ chế: record được ghi NGAY KHI CÓ HASH, trước `wait()`, nên tab chết giữa
  // chừng vẫn để lại đúng một dấu vết, và trạng thái dựng lại từ chain.
  for (const [action, label] of [
    ["approve", "Approved the wrapper"],
    ["claim", "Claimed"],
  ] as const) {
    test(`${action} survives a reload as pending, never as failed`, async ({ page }) => {
      await installWallet(page);
      const hash = `0x${(action === "approve" ? "a1" : "c1").repeat(32)}`;
      await page.addInitScript(
        ([key, act, h]) => {
          window.localStorage.setItem(
            key as string,
            JSON.stringify([{ chainId: 11155111, action: act, txHash: h, createdAt: Date.now() }]),
          );
        },
        ["pdp.tx.v1", action, hash],
      );

      await page.goto("/app/savings#history");
      const row = page.locator("li", { hasText: label }).first();
      await row.waitFor({ state: "visible", timeout: 60_000 });

      // Hash bịa không có receipt. Câu trả lời trung thực là "chưa vào block",
      // không phải "thất bại" — và tuyệt đối không phải biến mất.
      await expect(row).toContainText(/pending|unknown/i, { timeout: 30_000 });
      await expect(row).not.toContainText(/failed/i);
      await expect(row.getByRole("link")).toHaveAttribute("href", new RegExp(hash));
    });
  }

  test("the record on disk carries no amount, ever", async ({ page }) => {
    await installWallet(page);
    await page.addInitScript(
      ([key, h]) => {
        window.localStorage.setItem(
          key as string,
          JSON.stringify([{ chainId: 11155111, action: "claim", txHash: h, createdAt: Date.now() }]),
        );
      },
      ["pdp.tx.v1", `0x${"c1".repeat(32)}`],
    );
    await page.goto("/app/savings#history");
    await page.locator("li", { hasText: "Claimed" }).first().waitFor({ timeout: 60_000 });

    const stored = await page.evaluate(() => window.localStorage.getItem("pdp.tx.v1"));
    // Hợp đồng persist là đúng bốn trường. Một trường thứ năm lọt vào đây là
    // cách một số tiền rời khỏi bộ nhớ tab mà không ai nhận ra.
    expect(Object.keys(JSON.parse(stored ?? "[]")[0] as object).sort()).toEqual([
      "action",
      "chainId",
      "createdAt",
      "txHash",
    ]);
  });
});

/* ------------------------------------------------------------------ *
 * R13 — approval là bước 1/2, không phải một lỗi
 * ------------------------------------------------------------------ */

test.describe("the approval nobody warned you about (R13)", () => {
  // Một trong bốn dòng brief gọi tên tường minh. Cách hỏng kinh điển: người dùng
  // ký approve, thấy tx xanh, tưởng đã nạp tiền — rồi không thấy tiền đâu.
  test("names itself step 1 of 2, and does not eat the number you typed", async ({ page }) => {
    await installWallet(page, { fresh: true });
    await page.goto("/app/savings#deposit");

    const amount = page.getByLabel("Amount to shield");
    await amount.waitFor({ state: "visible", timeout: 60_000 });
    await amount.fill("5");

    // Ví trắng ⇒ allowance 0 ⇒ đây phải là bước 1, và phải tự nói ra là bước 1.
    const approve = page.getByRole("button", { name: /Approve — step 1 of 2/ });
    await expect(approve).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Two signatures/i)).toBeVisible();
    // Và số đã gõ vẫn nguyên — gõ lại số tiền sau mỗi bước là cách người ta gõ nhầm.
    await expect(amount).toHaveValue("5");

    // Không có nút "Shield" song song để bấm nhầm vào trước khi approve xong.
    await expect(page.getByRole("button", { name: /Shield — step 2 of 2/ })).toHaveCount(0);
  });
});
