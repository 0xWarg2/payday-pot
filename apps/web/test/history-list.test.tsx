/**
 * HistoryList — ba trạng thái mà nếu sai thì màn hình nói dối:
 *   loading + 0 hàng      → không "Nothing yet"
 *   unavailable + 0 hàng  → không "Nothing yet", có Try again
 *   ready + hàng          → một <li> mỗi tx, link mang hash
 */
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HistoryList } from "@/components/tx/HistoryList";
import { CHAIN_HISTORY_SERVER_SNAPSHOT, chainHistoryStore } from "@/lib/tx/chain-history";
import { TX_SERVER_SNAPSHOT, txStore } from "@/lib/tx/store";
import { WALLET_SERVER_SNAPSHOT, walletStore } from "@/lib/wallet/store";

import { expectNoAnonymityClaim } from "./helpers/anonymity";

vi.mock("@/lib/chain/rpc", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/chain/rpc")>()),
  readProvider: () => ({ getBlockNumber: async () => 0, getLogs: async () => [] }),
}));

const ADDR = `0x${"ab".repeat(20)}`;
const KEY = `11155111:${ADDR}`;
const TX = `0x${"c1".repeat(32)}`;

beforeEach(() => {
  walletStore.set({ ...WALLET_SERVER_SNAPSHOT, status: "connected", address: ADDR, chainId: 11155111 });
  txStore.set(TX_SERVER_SNAPSHOT);
});
afterEach(() => {
  walletStore.set(WALLET_SERVER_SNAPSHOT);
  chainHistoryStore.set(CHAIN_HISTORY_SERVER_SNAPSHOT);
});

describe("HistoryList", () => {
  it("while loading with nothing yet, never says 'Nothing yet'", () => {
    chainHistoryStore.set({ key: KEY, status: "loading", items: [], scannedTo: null, error: null });
    render(<HistoryList />);
    expect(screen.queryByText(/Nothing yet/)).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(/Reading your history from the chain/);
  });

  it("when the chain can't be read and nothing loaded, offers Try again instead of 'Nothing yet'", () => {
    chainHistoryStore.set({
      key: KEY,
      status: "unavailable",
      items: [],
      scannedTo: null,
      error: { code: "RPC_UNAVAILABLE", title: "x", detail: "y", action: "retry" } as never,
    });
    render(<HistoryList />);
    expect(screen.queryByText(/Nothing yet/)).toBeNull();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "explorer" })).toHaveAttribute("href", expect.stringContaining(ADDR));
  });

  it("when ready, renders one row per tx with the hash link and no amount", () => {
    chainHistoryStore.set({
      key: KEY,
      status: "ready",
      items: [
        { txHash: TX, action: "register", epochId: "3", blockNumber: 100, logIndex: 0 },
        { txHash: TX, action: "deposit", epochId: "3", blockNumber: 100, logIndex: 1 },
      ],
      scannedTo: 100,
      error: null,
    });
    const { container } = render(<HistoryList />);
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Deposited");
    expect(rows[0]).toHaveTextContent("Confirmed");
    expect(rows[0]).toHaveTextContent("block 100");
    expect(rows[0]!.querySelector("a")).toHaveAttribute("href", expect.stringContaining(TX));
    expect(container.textContent).not.toMatch(/USDC|\$/);
    expectNoAnonymityClaim(container);
  });

  it("with no wallet, still shows the browser's own records and invites a connection", () => {
    walletStore.set(WALLET_SERVER_SNAPSHOT);
    txStore.set({
      records: [{ chainId: 11155111, action: "approve", txHash: TX, createdAt: Date.now() }],
      status: new Map([[TX, "pending"]]),
      minedAt: new Map(),
    });
    render(<HistoryList />);
    expect(screen.getByRole("listitem")).toHaveTextContent("Approved the wrapper");
    expect(screen.getByText(/Connect a wallet to also see/)).toBeInTheDocument();
  });
});
