/**
 * R1 — unwrap treo, phần kiểm bằng máy.
 *
 * Ba tính chất mà nếu hỏng thì màn hình vẫn trông bình thường:
 *
 *  1. Phát hiện đọc CHAIN, không đọc đĩa. Bản trước lọc `txStore` theo một kind
 *     mà không chỗ nào ghi, nên banner chưa từng có khả năng hiện ra — một lỗi
 *     mà mọi test "component render được" đều bỏ qua.
 *  2. Log KHÔNG phải bằng chứng còn treo. Log của một request đã finalize nằm
 *     trên chain mãi mãi; `unwrapRequester` mới là câu trả lời. Lẫn hai thứ này
 *     thì banner sẽ đòi người dùng làm lại một việc đã xong.
 *  3. Số báo là số THẬT, kể cả 0. Unwrap quá số dư không revert — nó clamp về
 *     encrypted zero rồi chuyển 0 (cùng ngữ nghĩa với deposit clamp,
 *     non-negotiable #2). Hiện "xong rồi" mà không nói số là dựng lại đúng cái
 *     bẫy mà R1 sinh ra để tránh.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ZeroAddress, getAddress } from "ethers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ACCOUNT = getAddress(`0x${"a1".repeat(20)}`);
const REQUEST_ID = `0x${"d2".repeat(32)}`;
const OTHER_ID = `0x${"d3".repeat(32)}`;
const TX = `0x${"c1".repeat(32)}`;

/** Một `getLogs` giả lập, đủ hình dạng để `queryFilter` parse ra `args`. */
function logs(...ids: string[]) {
  return ids.map((unwrapRequestId, i) => ({
    args: { unwrapRequestId, receiver: ACCOUNT },
    transactionHash: i === 0 ? TX : `0x${"c2".repeat(32)}`,
  }));
}

const chain = {
  head: 11_600_000,
  logs: logs(REQUEST_ID),
  requesters: new Map<string, string>([[REQUEST_ID, ACCOUNT]]),
  failGetLogs: false,
};

const queryFilter = vi.fn(async () => {
  if (chain.failGetLogs) throw new Error("exceed maximum block range: 50000");
  return chain.logs;
});
const filters = { UnwrapRequested: vi.fn((receiver: string) => ({ receiver })) };
const unwrapRequester = vi.fn(async (id: string) => chain.requesters.get(id) ?? ZeroAddress);
const finalizeUnwrap = vi.fn();
const getBlockNumber = vi.fn(async () => chain.head);

vi.mock("@/lib/chain/rpc", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/chain/rpc")>()),
  readProvider: () => ({ getBlockNumber }),
}));

vi.mock("@/lib/chain/tokens", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/chain/tokens")>()),
  getCusdc: () => ({ queryFilter, filters, unwrapRequester, finalizeUnwrap }),
}));

const publicDecrypt = vi.fn(async (handles: string[]) => ({
  clearValues: { [handles[0] ?? ""]: 2_500_000n },
  abiEncodedClearValues: "0x",
  decryptionProof: "0xproof",
}));

vi.mock("@/lib/fhevm/instance", () => ({ ensureFheInstance: async () => ({ publicDecrypt }) }));

const sendTx = vi.fn(async (_opts: unknown, run: (signer: unknown) => Promise<unknown>) => {
  await run({});
  return { hash: `0x${"f1".repeat(32)}` };
});

vi.mock("@/lib/tx/send", () => ({ sendTx }));

import { PendingUnwrapBanner } from "@/components/tx/PendingUnwrapBanner";
import { findPendingUnwraps, resumeUnwrap, UNWRAP_LOOKBACK_BLOCKS } from "@/lib/tx/pending-unwrap";
import { setWallet } from "@/lib/wallet/store";

beforeEach(() => {
  chain.head = 11_600_000;
  chain.logs = logs(REQUEST_ID);
  chain.requesters = new Map([[REQUEST_ID, ACCOUNT]]);
  chain.failGetLogs = false;
  vi.clearAllMocks();
  setWallet({ status: "connected", address: ACCOUNT, chainId: 11155111, hasProvider: true, error: null });
});

afterEach(() => {
  setWallet({ status: "disconnected", address: null, chainId: null, hasProvider: true, error: null });
});

describe("phát hiện unwrap treo", () => {
  it("hỏi chain theo địa chỉ, không hỏi localStorage", async () => {
    const found = await findPendingUnwraps(ACCOUNT);

    expect(found).toEqual([{ txHash: TX, requestId: REQUEST_ID, receiver: ACCOUNT }]);
    // Nguồn duy nhất là một filter theo `receiver` — indexed topic — nên không
    // cần backend và không cần tab này từng gửi tx đó.
    expect(filters.UnwrapRequested).toHaveBeenCalledWith(ACCOUNT);
  });

  it("chỉ quét đúng cửa sổ RPC cho phép, không quét từ block 0", async () => {
    await findPendingUnwraps(ACCOUNT);

    // 50k là con số ĐO THẬT ở publicnode (100k trả `exceed maximum block
    // range`). Quét từ 0 thì RPC từ chối và banner im lặng vĩnh viễn.
    expect(queryFilter).toHaveBeenCalledWith(expect.anything(), chain.head - UNWRAP_LOOKBACK_BLOCKS, chain.head);
    expect(UNWRAP_LOOKBACK_BLOCKS).toBe(50_000);
  });

  it("bỏ qua request đã finalize dù log của nó vẫn còn trên chain", async () => {
    chain.logs = logs(REQUEST_ID, OTHER_ID);
    chain.requesters = new Map([[OTHER_ID, ACCOUNT]]);

    const found = await findPendingUnwraps(ACCOUNT);

    // `finalizeUnwrap` là permissionless: "ai đó đã làm hộ" trông y hệt "bạn đã
    // làm xong" — requester về địa chỉ 0. Phản ứng đúng là im lặng.
    expect(found.map((f) => f.requestId)).toEqual([OTHER_ID]);
  });

  it("không có ví thì không hỏi chain", async () => {
    expect(await findPendingUnwraps(null)).toEqual([]);
    expect(queryFilter).not.toHaveBeenCalled();
  });

  it("RPC lỗi thì trả rỗng, không ném ra giữa lúc render", async () => {
    chain.failGetLogs = true;
    // Banner sai còn tệ hơn banner thiếu, và "Check again" bắt được lần sau.
    expect(await findPendingUnwraps(ACCOUNT)).toEqual([]);
  });
});

describe("hoàn tất bước hai", () => {
  it("truyền đúng proof của publicDecrypt vào finalizeUnwrap", async () => {
    const result = await resumeUnwrap({ txHash: TX, requestId: REQUEST_ID, receiver: ACCOUNT });

    // Ẩn số duy nhất của R1 hồi Day 7 là tham số thứ ba. Nó là `decryptionProof`
    // — đọc từ source OZ và chạy thật trên Sepolia 02/09. `cleartexts` do
    // contract tự `abi.encode(uint64)`, nên ở đây chỉ truyền số.
    expect(publicDecrypt).toHaveBeenCalledWith([REQUEST_ID]);
    expect(finalizeUnwrap).toHaveBeenCalledWith(REQUEST_ID, 2_500_000n, "0xproof");
    expect(result.amount).toBe(2_500_000n);
  });

  it("không bao giờ ghi requestId xuống đĩa", async () => {
    await resumeUnwrap({ txHash: TX, requestId: REQUEST_ID, receiver: ACCOUNT });

    // requestId CHÍNH LÀ ciphertext handle của số đã burn (quirk #23).
    expect(sendTx.mock.calls[0]?.[0]).toEqual({ action: "finalize-unwrap" });
    expect(JSON.stringify(window.localStorage)).not.toContain(REQUEST_ID.slice(2));
  });
});

describe("banner", () => {
  it("nói ra sự thật và mở đúng ba đường ra", async () => {
    render(<PendingUnwrapBanner />);
    const banner = await screen.findByTestId("pending-unwrap");

    expect(banner).toHaveTextContent(/two steps/i);
    expect(banner).toHaveTextContent(/nothing is lost/i);
    expect(screen.getByTestId("unwrap-finalize")).toBeEnabled();
    expect(screen.getByTestId("unwrap-recheck")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /what to do/i })).toBeInTheDocument();
  });

  it("báo số thật sau khi hoàn tất", async () => {
    render(<PendingUnwrapBanner />);
    await screen.findByTestId("pending-unwrap");
    chain.requesters = new Map();

    await userEvent.click(screen.getByTestId("unwrap-finalize"));

    const done = await screen.findByTestId("unwrap-finalized");
    expect(done).toHaveTextContent("2.5 USDC");
    expect(done).toHaveAttribute("data-amount-zero", "false");
  });

  it("chuyển 0 thì nói là 0, không nói thành công", async () => {
    publicDecrypt.mockResolvedValueOnce({
      clearValues: { [REQUEST_ID]: 0n },
      abiEncodedClearValues: "0x",
      decryptionProof: "0xproof",
    });
    render(<PendingUnwrapBanner />);
    await screen.findByTestId("pending-unwrap");
    chain.requesters = new Map();

    await userEvent.click(screen.getByTestId("unwrap-finalize"));

    const done = await screen.findByTestId("unwrap-finalized");
    // Đây là cái bẫy thật, gặp lúc probe: unwrap từ ví không có cUSDC không
    // revert — nó clamp về 0 rồi finalize chuyển 0. Một dấu tích xanh ở đây là
    // app nói dối về một giao dịch thành công.
    expect(done).toHaveAttribute("data-amount-zero", "true");
    expect(done).toHaveTextContent(/0 USDC/);
    expect(done).toHaveTextContent(/capped it at zero/i);
    expect(finalizeUnwrap).toHaveBeenCalledWith(REQUEST_ID, 0n, "0xproof");
  });

  it("chưa nối ví thì không hiện gì", async () => {
    setWallet({ status: "disconnected", address: null, chainId: null, hasProvider: true, error: null });
    render(<PendingUnwrapBanner />);

    await waitFor(() => expect(queryFilter).not.toHaveBeenCalled());
    expect(screen.queryByTestId("pending-unwrap")).toBeNull();
  });
});
