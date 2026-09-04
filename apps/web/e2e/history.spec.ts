/**
 * Lịch sử giao dịch đọc từ chain — không phải từ localStorage của trình duyệt này.
 *
 * Chain nói dối đúng một câu: `eth_getLogs` cho bộ 4 event của pool, lọc theo
 * ví test, trả về một log `Deposited` bịa. Mọi lời gọi khác đi thẳng ra Sepolia
 * thật. Nếu hàng "Deposited" hiện ra mà `pdp.tx.v1` vẫn trống, thì nguồn của
 * nó chỉ có thể là chain.
 */

import { ethers } from "ethers";
import { expect, test, type Page, type Route } from "@playwright/test";

import { installWallet } from "./fixtures/wallet";

const RPC_MATCH = /ethereum-sepolia-rpc\.publicnode\.com/;
const DEPOSITED_TOPIC = ethers.id("Deposited(address,uint256)");
const TX_HASH = `0x${"a7".repeat(32)}`;
const BLOCK = 11_624_001;

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

function depositedLog(user: string, potAddress: string): Record<string, unknown> {
  return {
    address: potAddress,
    topics: [DEPOSITED_TOPIC, ethers.zeroPadValue(user, 32), ethers.toBeHex(3, 32)],
    data: "0x",
    blockNumber: ethers.toBeHex(BLOCK),
    blockHash: `0x${"0b".repeat(32)}`,
    transactionHash: TX_HASH,
    transactionIndex: "0x0",
    logIndex: "0x0",
    removed: false,
  };
}

/** Chỉ `eth_getLogs` của lịch sử ví (topics[0] là MẢNG 4 event, topics[1] là ví) bị dàn dựng. */
function stubAnswer(call: RpcCall, user: string): RpcResult | null {
  if (call.method !== "eth_getLogs") return null;
  const filter = call.params[0] as { address?: string; topics?: (string | string[] | null)[] };
  const t0 = filter.topics?.[0];
  const t1 = filter.topics?.[1];
  if (!Array.isArray(t0) || !t0.includes(DEPOSITED_TOPIC)) return null;
  if (typeof t1 !== "string" || t1.toLowerCase() !== ethers.zeroPadValue(user, 32).toLowerCase()) return null;
  // Mỗi chunk đều được hỏi; log chỉ nằm trong chunk chứa BLOCK.
  const { fromBlock, toBlock } = call.params[0] as { fromBlock?: string; toBlock?: string };
  const from = Number(fromBlock);
  const to = Number(toBlock);
  const hit = Number.isFinite(from) && Number.isFinite(to) ? from <= BLOCK && BLOCK <= to : true;
  return { jsonrpc: "2.0", id: call.id, result: hit ? [depositedLog(user, filter.address ?? ethers.ZeroAddress)] : [] };
}

async function stubHistory(page: Page, user: string): Promise<void> {
  await page.route(RPC_MATCH, async (route: Route) => {
    let body: RpcCall | RpcCall[];
    try {
      body = JSON.parse(route.request().postData() ?? "") as RpcCall | RpcCall[];
    } catch {
      await route.continue();
      return;
    }
    const calls = Array.isArray(body) ? body : [body];
    const answers = calls.map((call) => stubAnswer(call, user));
    if (answers.every((a) => a === null)) {
      await route.continue();
      return;
    }
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
        // RPC thật chớp thì phần đó lỗi thật — không bịa.
      }
    }
    const resolved = calls.map(
      (call, i) =>
        answers[i] ??
        upstream.get(call.id) ?? { jsonrpc: "2.0", id: call.id, error: { code: -32603, message: "upstream unavailable" } },
    );
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(Array.isArray(body) ? resolved : resolved[0]),
    });
  });
}

test.describe("transaction history from the chain", () => {
  test.slow();

  test("a Deposited log for this wallet shows up as a confirmed row without touching storage", async ({ page }) => {
    const wallet = await installWallet(page);
    await stubHistory(page, wallet.address);
    await page.goto("/app/savings#history");

    const row = page.getByRole("listitem").filter({ hasText: "Deposited" }).first();
    await expect(row).toBeVisible({ timeout: 60_000 });
    await expect(row).toContainText("Confirmed");
    await expect(row).toContainText("round 3");
    await expect(row.getByRole("link")).toHaveAttribute("href", new RegExp(TX_HASH));
    // Không có số tiền ở đâu — event cũng không mang nó.
    await expect(row).not.toContainText(/USDC/);

    expect(await page.evaluate(() => localStorage.getItem("pdp.tx.v1"))).toBeNull();
    expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  });
});
