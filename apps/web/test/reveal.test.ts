/**
 * Vòng đời của giá trị đã decrypt — phần khó nhất của non-negotiable #5.
 *
 * Plaintext chỉ được sống trong bộ nhớ tab, tối đa 5 phút, và phải biến mất khi
 * Hide · hết TTL · reload · đổi account · đổi chain · tab bị ẩn · handle đổi.
 * Mỗi mục trong danh sách đó là một dòng test ở đây. Chúng là loại ràng buộc dễ
 * vỡ âm thầm nhất trong cả repo: bỏ một listener đi thì không có gì đỏ lên,
 * không có gì hiện sai, chỉ là số tiền của người dùng ở lại trên màn hình lâu
 * hơn mức họ đồng ý — và không ai phát hiện ra cho tới khi có người nhìn vào
 * đúng cái tab đó.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installRevealGuards } from "@/lib/reveal/guards";
import {
  REVEAL_TTL_MS,
  __resetRevealStoreForTests,
  clearReveals,
  commitReveals,
  currentGeneration,
  readReveal,
  revealKey,
  revealStore,
} from "@/lib/reveal/store";
import { setWallet, walletStore } from "@/lib/wallet/store";

const CHAIN = 11155111;
const POT = "0xFF8c126d12715b4fe069728A3f8a24142726ec25";
const ALICE = "0x1cE8D5ff6E57a64E23cb28334315232A2e732D57";
const BOB = "0x9b5Cd13b8eFbB58Dc25A05CF411D8056058aDFfF";
const HANDLE = "0xabc0000000000000000000000000000000000000000000000000000000000001";

const KEY = revealKey(CHAIN, POT, ALICE, HANDLE);

/** Mở sẵn một giá trị để mỗi test chỉ phải mô tả cái nó muốn phá. */
function openOne(value = 1_234_567n): void {
  const ok = commitReveals(currentGeneration(), new Map([[KEY, value]]));
  expect(ok, "fixture failed to open a reveal").toBe(true);
  expect(readReveal(revealStore.get(), KEY)).toBe(value);
}

function setVisibility(state: "visible" | "hidden"): void {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  __resetRevealStoreForTests();
  walletStore.set({ status: "disconnected", address: null, chainId: null, hasProvider: true, error: null });
  setVisibility("visible");
});

afterEach(() => {
  vi.useRealTimers();
  __resetRevealStoreForTests();
});

describe("reveal ttl", () => {
  it("reveal-ttl-expires-with-fake-timers", () => {
    vi.useFakeTimers();
    openOne();

    vi.advanceTimersByTime(REVEAL_TTL_MS - 1);
    expect(readReveal(revealStore.get(), KEY), "expired one tick early").toBe(1_234_567n);

    vi.advanceTimersByTime(1);
    const after = revealStore.get();
    expect(after.entries.size).toBe(0);
    expect(after.expiresAt).toBeNull();
    // Hết hạn là chuyện phải giải thích: con số tự biến mất mà không nói gì thì
    // trông y hệt một cái bug, và người dùng sẽ học cách không tin màn hình.
    expect(after.notice?.kind).toBe("expired");
  });

  it("treats an expired entry as unopened without waiting for the timer", () => {
    vi.useFakeTimers();
    openOne();

    // Không `advanceTimersByTime` — chỉ đẩy đồng hồ. Timer là vệ sinh; nếu đọc
    // mà chỉ dựa vào timer đã chạy thì một tab bị throttle (background tab,
    // laptop vừa mở nắp) sẽ phục vụ plaintext quá hạn.
    vi.setSystemTime(Date.now() + REVEAL_TTL_MS + 1);
    expect(readReveal(revealStore.get(), KEY)).toBeUndefined();
  });
});

describe("reveal clear triggers", () => {
  it("reveal-clears-on-account-change", () => {
    setWallet({ status: "connected", address: ALICE, chainId: CHAIN });
    const uninstall = installRevealGuards();
    openOne();

    setWallet({ address: BOB });

    expect(revealStore.get().entries.size).toBe(0);
    // Im lặng là cố ý: chính người dùng vừa đổi ví, một banner ở đây là tiếng ồn.
    expect(revealStore.get().notice).toBeNull();
    uninstall();
  });

  it("reveal-clears-on-chain-change", () => {
    setWallet({ status: "connected", address: ALICE, chainId: CHAIN });
    const uninstall = installRevealGuards();
    openOne();

    setWallet({ chainId: 1 });

    expect(revealStore.get().entries.size).toBe(0);
    expect(revealStore.get().notice).toBeNull();
    uninstall();
  });

  it("reveal-clears-on-visibility-hidden", () => {
    setWallet({ status: "connected", address: ALICE, chainId: CHAIN });
    const uninstall = installRevealGuards();
    openOne();

    setVisibility("hidden");

    // Đây là mục rộng hơn spec §15.2, và nó gánh luôn lỗ bfcache: bấm Back có
    // thể khôi phục nguyên vẹn JS heap, nên "reload xoá hết" là giả định sai.
    expect(revealStore.get().entries.size).toBe(0);
    uninstall();
  });

  it("clears on pagehide, which is the one bfcache actually fires", () => {
    setWallet({ status: "connected", address: ALICE, chainId: CHAIN });
    const uninstall = installRevealGuards();
    openOne();

    window.dispatchEvent(new Event("pagehide"));

    expect(revealStore.get().entries.size).toBe(0);
    uninstall();
  });

  it("stops clearing once the guards are uninstalled", () => {
    setWallet({ status: "connected", address: ALICE, chainId: CHAIN });
    const uninstall = installRevealGuards();
    uninstall();
    openOne();

    setWallet({ address: BOB });

    // Không phải để cho phép rò — để chứng minh listener thật sự được gỡ, chứ
    // không tích luỹ thêm một bản mỗi lần AppProviders remount.
    expect(revealStore.get().entries.size).toBe(1);
  });
});

describe("reveal races", () => {
  it("stale-generation-result-dropped", () => {
    const generation = currentGeneration();

    // Người dùng đổi ví TRONG LÚC relayer đang chạy. Kết quả bay về sau đó là
    // plaintext của ví cũ; ghi nó vào store là hiện số dư của người khác.
    clearReveals("account-change");
    const committed = commitReveals(generation, new Map([[KEY, 999n]]));

    expect(committed).toBe(false);
    expect(revealStore.get().entries.size).toBe(0);
  });

  it("accepts a result that carries the current generation", () => {
    clearReveals("account-change");
    const committed = commitReveals(currentGeneration(), new Map([[KEY, 42n]]));

    expect(committed).toBe(true);
    expect(readReveal(revealStore.get(), KEY)).toBe(42n);
  });
});

describe("clear notices", () => {
  it("explains the two disappearances the user did not cause", () => {
    for (const reason of ["ttl", "handle-change"] as const) {
      __resetRevealStoreForTests();
      openOne();
      clearReveals(reason);
      expect(revealStore.get().notice, `${reason} vanished silently`).not.toBeNull();
    }
  });

  it("stays quiet for the ones the user did cause", () => {
    for (const reason of ["hide", "account-change", "chain-change", "tab-hidden"] as const) {
      __resetRevealStoreForTests();
      openOne();
      clearReveals(reason);
      expect(revealStore.get().notice, `${reason} produced noise`).toBeNull();
    }
  });

  it("carries no amount in any notice copy", () => {
    // Cùng luật với error taxonomy: một dòng giải thích không có lý do gì để
    // chứa số, và nếu nó chứa thì số đó gần như chắc chắn là tiền của ai đó.
    for (const reason of ["ttl", "handle-change"] as const) {
      __resetRevealStoreForTests();
      openOne();
      clearReveals(reason);
      const notice = revealStore.get().notice;
      expect(`${notice?.title} ${notice?.detail}`).not.toMatch(/\d{2,}/);
    }
  });
});

describe("reveal key", () => {
  it("separates the four dimensions that make a value someone else's", () => {
    const base = revealKey(CHAIN, POT, ALICE, HANDLE);
    expect(revealKey(1, POT, ALICE, HANDLE)).not.toBe(base);
    expect(revealKey(CHAIN, BOB, ALICE, HANDLE)).not.toBe(base);
    expect(revealKey(CHAIN, POT, BOB, HANDLE)).not.toBe(base);
    expect(revealKey(CHAIN, POT, ALICE, HANDLE.replace(/1$/, "2"))).not.toBe(base);
  });

  it("ignores address casing so a checksum flip cannot resurrect a stale entry", () => {
    // Ví trả về address khi thì checksummed khi thì lowercase. Nếu key phân
    // biệt hoa thường thì cùng một người sẽ có hai entry, và cái cũ không bao
    // giờ bị các trigger xoá nhìn thấy.
    expect(revealKey(CHAIN, POT.toLowerCase(), ALICE.toLowerCase(), HANDLE.toUpperCase())).toBe(
      revealKey(CHAIN, POT, ALICE, HANDLE),
    );
  });
});
