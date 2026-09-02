/**
 * Ranh giới riêng tư, kiểm bằng máy thay vì bằng kỷ luật.
 *
 * Ba thứ được pin ở đây, và cả ba đều thuộc loại "hỏng mà không ai thấy":
 *
 *  1. Ba trạng thái của một giá trị mã hoá phải hiện ra KHÁC NHAU, và hai trạng
 *     thái chưa mở không bao giờ được chứa một chữ số nào (non-negotiable #8).
 *  2. HTML do server render không bao giờ chứa gì của ai — cơ chế là mọi store
 *     phải khai báo một `SERVER_SNAPSHOT` hằng số masked.
 *  3. Không có gì nhạy cảm chạm tới `localStorage`, và `sessionStorage` không
 *     được dùng ở bất cứ đâu.
 */

import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HIDDEN_HANDLE } from "@payday-pot/sdk";

import { PrivatePositionCard } from "@/components/dashboard/PrivatePositionCard";
import { ConfidentialValue, MaskGlyph } from "@/components/privacy/ConfidentialValue";
import { MASK_GLYPH, type ConfidentialView } from "@/lib/format";
import { classifyReadError } from "@/lib/pot/classify-read-error";
import { POT_READS_SERVER_SNAPSHOT, potReadsStore } from "@/lib/pot/reads";
import { REVEAL_SERVER_SNAPSHOT, revealStore } from "@/lib/reveal/store";
import {
  ALLOWED_STORAGE_KEYS,
  STORAGE_KEYS,
  StorageContractError,
  type StorageKey,
  writeJson,
} from "@/lib/storage";
import { TX_SERVER_SNAPSHOT, recordTx, txStore } from "@/lib/tx/store";
import { WALLET_SERVER_SNAPSHOT, walletStore } from "@/lib/wallet/store";

const A_HASH = `0x${"a1".repeat(32)}`;

describe("no-plaintext-in-dom-when-masked", () => {
  const masked: ConfidentialView[] = [{ kind: "unavailable" }, { kind: "hidden" }];

  it.each(masked)("renders no digit at all for $kind", (view) => {
    render(<ConfidentialValue view={view} label="Savings" />);
    const node = screen.getByTestId("confidential-value");

    // Bất kỳ chữ số nào ở đây cũng là một rò rỉ hoặc một lời nói dối. `0` là
    // trường hợp nguy hiểm nhất: nó trông như một câu trả lời hợp lệ.
    expect(node.textContent ?? "").not.toMatch(/\d/);
  });

  it("shows the real number only once it is revealed", () => {
    render(<ConfidentialValue view={{ kind: "revealed", value: 1_500_000n }} label="Savings" />);
    const node = screen.getByTestId("confidential-value");

    expect(node).toHaveAttribute("data-state", "revealed");
    expect(node.textContent ?? "").toContain("1.5");
  });

  it("keeps the three states distinguishable from each other", () => {
    // Gộp bất kỳ hai cái nào lại là nói dối người dùng về tiền của họ: "chưa có
    // gì onchain" và "có, bạn chưa mở" dẫn tới hai hành động hoàn toàn khác.
    const texts = new Set<string>();
    for (const view of [...masked, { kind: "revealed", value: 0n } as const]) {
      const { unmount } = render(<ConfidentialValue view={view} label="Savings" />);
      texts.add(screen.getByTestId("confidential-value").textContent ?? "");
      unmount();
    }
    expect(texts.size).toBe(3);
  });

  it("never makes a screen reader read out the dots", () => {
    render(<ConfidentialValue view={{ kind: "hidden" }} label="Savings" />);
    // Dãy chấm là thông tin bằng 0 khi đọc lên. Người dùng screen reader phải
    // nghe "savings hidden" — một trạng thái — chứ không phải sáu dấu chấm.
    expect(screen.getByText("Savings hidden")).toBeInTheDocument();
    expect(screen.getByText("Savings hidden")).toHaveClass("sr-only");
  });

  it("labels a bare mask glyph too", () => {
    render(<MaskGlyph label="Amount" />);
    expect(screen.getByText("Amount hidden")).toHaveClass("sr-only");
    expect(screen.getByText(MASK_GLYPH)).toHaveAttribute("aria-hidden", "true");
  });
});

describe("position-card-never-claims-what-it-has-not-read", () => {
  /**
   * "Chưa đọc xong" là một trạng thái riêng, và nó KHÔNG được mượn giao diện của
   * "không có gì".
   *
   * Bug thật đã xảy ra: khi `readAccount` còn đang bay, thẻ rơi vào nhánh cuối
   * và render nút "Reveal my position" với `targets` rỗng. Bấm vào thì nhận được
   * "Connect your wallet first" — trong lúc địa chỉ ví đang hiện ngay trên đầu
   * màn hình. Cùng một họ lỗi với non-negotiable #8, chỉ ở tầng nút thay vì tầng
   * con số: khẳng định một điều mình chưa biết.
   */
  const CONFIG = {
    address: `0x${"11".repeat(20)}`,
    token: `0x${"22".repeat(20)}`,
    underlying: `0x${"33".repeat(20)}`,
    employer: `0x${"44".repeat(20)}`,
    owner: `0x${"55".repeat(20)}`,
    rate: 0n,
    epochDuration: 604_800n,
    perUserCap: 10_000_000_000n,
    participantCap: 32,
  };

  function connected(patch: Partial<typeof POT_READS_SERVER_SNAPSHOT>): void {
    walletStore.set({ ...WALLET_SERVER_SNAPSHOT, status: "connected", address: `0x${"ab".repeat(20)}`, chainId: 11155111 });
    potReadsStore.set({ ...POT_READS_SERVER_SNAPSHOT, deployment: "ready", config: CONFIG, ...patch });
  }

  const account = (handle: string) => ({
    registered: handle !== HIDDEN_HANDLE,
    lastCheckpoint: 0n,
    principal: handle,
    twabArea: HIDDEN_HANDLE,
    pendingPrize: HIDDEN_HANDLE,
  });

  afterEach(() => {
    walletStore.set(WALLET_SERVER_SNAPSHOT);
    potReadsStore.set(POT_READS_SERVER_SNAPSHOT);
    revealStore.set(REVEAL_SERVER_SNAPSHOT);
  });

  it("offers no Reveal button while the position is still unknown", () => {
    connected({ account: null, loading: true });
    render(<PrivatePositionCard />);

    expect(screen.queryByRole("button", { name: "Reveal my position" })).toBeNull();
    expect(screen.getByTestId("position-loading")).toBeInTheDocument();
    // Và cũng không được mượn câu của "chưa từng gửi" — hai câu dẫn tới hai hành
    // động khác nhau.
    expect(screen.queryByText(/Nothing is stored for this wallet yet/)).toBeNull();
  });

  it("says a failed read failed instead of spinning for ever", () => {
    // Ngõ cụt mà exit gate Day 6 cấm: RPC chết mà màn hình vẫn "đang đọc…" thì
    // người dùng không có gì để làm và không biết vì sao.
    // Đi qua đúng hàm mà `refreshPotReads` dùng, không phải `classifyError` trần:
    // chênh lệch giữa hai cái CHÍNH LÀ R7-vs-R8, và một fixture tự nặn ra sẽ
    // kiểm một `PotError` không bao giờ tồn tại trên đường đọc.
    connected({
      account: null,
      error: classifyReadError(Object.assign(new Error("failed to fetch"), { code: "NETWORK_ERROR" })),
    });
    render(<PrivatePositionCard />);

    expect(screen.queryByTestId("position-loading")).toBeNull();
    expect(screen.getByTestId("error-panel")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("points a never-registered wallet at its first deposit, with no Reveal button", () => {
    connected({ account: account(HIDDEN_HANDLE) });
    render(<PrivatePositionCard />);

    expect(screen.queryByRole("button", { name: "Reveal my position" })).toBeNull();
    expect(screen.getByRole("link", { name: "Make your first deposit" })).toBeInTheDocument();
  });

  it("offers the Reveal button exactly when there is a handle to open", () => {
    connected({ account: account(`0x${"7c".repeat(32)}`) });
    render(<PrivatePositionCard />);

    expect(screen.getByRole("button", { name: "Reveal my position" })).toBeEnabled();
  });
});

describe("server-snapshot-is-masked", () => {
  const stores = [
    ["wallet", walletStore, WALLET_SERVER_SNAPSHOT],
    ["reveal", revealStore, REVEAL_SERVER_SNAPSHOT],
    ["tx", txStore, TX_SERVER_SNAPSHOT],
    ["potReads", potReadsStore, POT_READS_SERVER_SNAPSHOT],
  ] as const;

  it.each(stores)("%s returns the same frozen reference every time", (_name, store, constant) => {
    // `useSyncExternalStore` so sánh bằng `Object.is` mỗi lần render server.
    // Trả về một object mới sẽ không ra bug hiển thị mà ra vòng lặp vô hạn.
    expect(store.getServerSnapshot()).toBe(constant);
    expect(store.getServerSnapshot()).toBe(store.getServerSnapshot());
    expect(Object.isFrozen(constant)).toBe(true);
  });

  it("carries nothing about anyone in the server HTML", () => {
    expect(WALLET_SERVER_SNAPSHOT.address).toBeNull();
    expect(WALLET_SERVER_SNAPSHOT.chainId).toBeNull();
    expect(REVEAL_SERVER_SNAPSHOT.entries.size).toBe(0);
    expect(REVEAL_SERVER_SNAPSHOT.expiresAt).toBeNull();
    expect(TX_SERVER_SNAPSHOT.records).toHaveLength(0);
    expect(POT_READS_SERVER_SNAPSHOT.account).toBeNull();
    expect(POT_READS_SERVER_SNAPSHOT.state).toBeNull();
  });

  it("keeps deployment status out of the sensitive set", () => {
    // `deployment` được phép có giá trị thật trên server — nó là fact về build,
    // không phải về người dùng. Pin lại để không ai "dọn dẹp" nó thành null và
    // làm mọi trang nhấp nháy qua trạng thái not-deployed khi hydrate.
    expect(["ready", "not-deployed", "mismatch"]).toContain(POT_READS_SERVER_SNAPSHOT.deployment);
  });
});

describe("storage-allowlist-only", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("refuses a key that is not on the allowlist", () => {
    expect(() => writeJson("pdp.principal.v1" as StorageKey, 1000)).toThrow(StorageContractError);
    expect(window.localStorage.length).toBe(0);
  });

  it("refuses an allowlisted key whose shape is wrong", () => {
    // Allowlist một mình thì không đủ: `role` là key hợp lệ, nên nếu chỉ kiểm
    // key thì ai đó nhét cả một object vị thế vào dưới cái tên đó cũng lọt.
    expect(() => writeJson(STORAGE_KEYS.role, { principal: 1000n.toString() })).toThrow(StorageContractError);
    expect(() => writeJson(STORAGE_KEYS.consent, { acceptedAt: 1, amount: 5 })).toThrow(StorageContractError);
    expect(window.localStorage.length).toBe(0);
  });

  it("refuses a transaction record carrying an amount", () => {
    // Hợp đồng persist của tx là đúng năm field. Amount suy ra được vị thế, và
    // localStorage sống lâu hơn tab — kể cả amount "public" của một lần wrap.
    expect(() => recordTx({ chainId: 11155111, action: "wrap", txHash: A_HASH, createdAt: 1, amount: 5 } as never)).toThrow(
      TypeError,
    );
    expect(window.localStorage.getItem(STORAGE_KEYS.tx)).toBeNull();
  });

  it("refuses a transaction record carrying an unwrap request id", () => {
    // Trên bản cUSDC live, requestId CHÍNH LÀ ciphertext handle của số đã burn
    // (COMPATIBILITY_NOTES quirk #23) — ghi nó xuống đĩa là ghi handle xuống đĩa.
    expect(() =>
      recordTx({
        chainId: 11155111,
        action: "finalize-unwrap",
        txHash: A_HASH,
        createdAt: 1,
        unwrapRequestId: `0x${"f".repeat(64)}`,
      } as never),
    ).toThrow(TypeError);
  });

  it("persists only allowlisted keys once the real write paths have run", () => {
    writeJson(STORAGE_KEYS.role, "employee");
    writeJson(STORAGE_KEYS.consent, { acceptedAt: 1_700_000_000_000 });
    recordTx({ chainId: 11155111, action: "wrap", txHash: A_HASH, createdAt: 1_700_000_000_000 });

    const keys = Object.keys(window.localStorage);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(ALLOWED_STORAGE_KEYS, `unexpected key ${key}`).toContain(key);
  });

  it("writes nothing that looks like a value under the non-tx keys", () => {
    writeJson(STORAGE_KEYS.role, "employee");

    // Quét bằng regex chỉ áp dụng cho các key KHÔNG chứa tx. Với `pdp.tx.v1`
    // thì regex là công cụ sai: tx hash và ciphertext handle giống hệt nhau về
    // hình dạng, nên chỉ schema mới phân biệt được — `txHash` là field được
    // phép, còn handle thì không có field nào để nằm vào. Đó là lý do hai test
    // ở trên kiểm hợp đồng field thay vì kiểm hình dạng chuỗi.
    const role = window.localStorage.getItem(STORAGE_KEYS.role) ?? "";
    expect(role).not.toMatch(/\d{2,}|0x[0-9a-fA-F]{64}/);
  });

  it("keeps the persisted transaction record down to the five agreed fields", () => {
    recordTx({ chainId: 11155111, action: "deposit", txHash: A_HASH, epochId: "1", createdAt: 1_700_000_000_000 });

    const raw = window.localStorage.getItem(STORAGE_KEYS.tx);
    expect(raw).not.toBeNull();
    const parsed: unknown = JSON.parse(raw ?? "[]");
    expect(Array.isArray(parsed)).toBe(true);
    for (const record of parsed as Record<string, unknown>[]) {
      expect(Object.keys(record).sort()).toEqual(["action", "chainId", "createdAt", "epochId", "txHash"]);
    }
  });

  it("never touches sessionStorage", () => {
    writeJson(STORAGE_KEYS.role, "employer");
    recordTx({ chainId: 11155111, action: "claim", txHash: A_HASH, createdAt: 1 });

    expect(window.sessionStorage.length).toBe(0);
  });
});
