/**
 * Cùng một lỗi, hai câu trả lời đúng khác nhau tuỳ đường đi.
 *
 * `classifyError` trong SDK map ethers `NETWORK_ERROR` sang R8 "wrong network".
 * Trên đường WRITE (đi qua ví) đó là câu đúng. Trên đường READ thì không: read
 * luôn dùng một `JsonRpcProvider` Sepolia cố định, nên "ví sai mạng" là chuyện
 * không thể xảy ra — `NETWORK_ERROR` ở đó chỉ có thể là RPC chết, tức R7.
 *
 * Vì sao đáng một file test riêng: bảo người dùng "đổi mạng đi" khi thật ra
 * public RPC đang sập là một dead end hoàn hảo — họ đổi mạng, không có gì khá
 * hơn, và không còn gì để thử. Đúng loại lỗi mà Season 4 chấm ở mục "handle
 * errors gracefully".
 */

import { ALL_FOREIGN_ERROR_SPECS, classifyError } from "@payday-pot/sdk";
import { describe, expect, it } from "vitest";

import { classifyReadError } from "@/lib/pot/classify-read-error";

describe("network-error-maps-to-rpc-not-wrong-network", () => {
  it("turns an ethers NETWORK_ERROR on the read path into R7", () => {
    const classified = classifyReadError({ code: "NETWORK_ERROR", message: "could not detect network" });

    expect(classified.row).toBe("R7");
    expect(classified.code).toBe("network-unreachable");
    expect(classified.action.kind).toBe("retry");
    expect(classified.retryable).toBe(true);
  });

  it("still says wrong-network on the write path, which is the whole reason for the shim", () => {
    // Nếu dòng này đổi thì shim thành thừa — và cũng có nghĩa taxonomy đã bị
    // sửa, thứ đã freeze từ Day 5.
    expect(classifyError({ code: "NETWORK_ERROR" }).row).toBe("R8");
  });

  it("leaves a real wallet chain mismatch alone", () => {
    // 4902 đến từ VÍ, không đến từ read provider: ví thật sự chưa có Sepolia.
    // "Đổi mạng" ở đây là lối thoát đúng, shim không được nuốt nó.
    const classified = classifyReadError({ code: 4902 });

    expect(classified.row).toBe("R8");
    expect(classified.action.kind).toBe("switch-network");
  });

  it("passes every other classification through untouched", () => {
    for (const raw of [{ code: 4001 }, { code: "ACTION_REJECTED" }, new Error("relayer timed out"), null, {}]) {
      expect(classifyReadError(raw)).toEqual(classifyError(raw));
    }
  });

  it("never returns a dead end", () => {
    for (const raw of [{ code: "NETWORK_ERROR" }, { code: 4902 }, "", 0, undefined]) {
      const classified = classifyReadError(raw);
      expect(classified.action.kind).toBeTruthy();
      expect(`${classified.title} ${classified.detail}`).not.toMatch(/\d{2,}/);
    }
  });
});

describe("recovery actions the brief names", () => {
  it("R6 user rejection offers a plain retry and says nothing was sent", () => {
    const rejected = classifyError({ code: 4001 });

    expect(rejected.row).toBe("R6");
    expect(rejected.action.kind).toBe("retry");
    // "Nothing was sent" là phần quan trọng hơn cái nút: người vừa bấm Reject
    // cần biết ngay rằng họ không mất gì.
    expect(rejected.detail).toMatch(/nothing was sent/i);
  });

  it("R13 missing approval routes to approve, not to a generic retry", () => {
    const spec = ALL_FOREIGN_ERROR_SPECS["ERC20InsufficientAllowance"];
    expect(spec?.row).toBe("R13");
    expect(spec?.action.kind).toBe("approve");
  });

  it("R14 not enough test USDC routes to the faucet", () => {
    const spec = ALL_FOREIGN_ERROR_SPECS["ERC20InsufficientBalance"];
    expect(spec?.row).toBe("R14");
    // Một testnet dApp bảo "không đủ số dư" mà không đưa vòi nước là bắt người
    // dùng tự đi tìm faucet ở tab khác, và phần lớn sẽ bỏ cuộc ở đó.
    expect(spec?.action.kind).toBe("get-test-assets");
  });

  it("R1 a finished unwrap is explained as done, not as a failure to retry forever", () => {
    const spec = ALL_FOREIGN_ERROR_SPECS["InvalidUnwrapRequest"];
    expect(spec?.row).toBe("R1");
    expect(spec?.retryable).toBe(false);
    expect(spec?.detail).toMatch(/already been finalized/i);
  });
});
