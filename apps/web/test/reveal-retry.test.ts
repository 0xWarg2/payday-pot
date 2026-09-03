/**
 * Chiến lược khi KMS trả về bộ share không dựng lại được — và bốn giới hạn của nó.
 *
 * Nguyên nhân đo được Day 9 (COMPATIBILITY_NOTES #58, #60): relayer trả
 * `{"status":"succeeded"}` kèm payload đầy đủ, rồi WASM client chết ở
 * `Gao decoding failure … n=13, deg=4, #shares=9`. Hai phép đo quyết định hình
 * dạng của code này:
 *
 * - hỏi lại **y nguyên** là vô ích: ba POST cùng body nhận về cùng một
 *   `requestId`, tức cùng một câu trả lời hỏng;
 * - đổi **tập handle** thì đổi kết quả: cùng lúc đó `[C]` xong 3/3 còn
 *   `[A,B,C]` hỏng 3/3, và nửa giờ trước `[A,B,C]` lại xong 10/10.
 *
 * Nên cách sửa là tách batch thành từng handle — miễn phí, vì tập handle không
 * nằm trong payload EIP-712 nên không sinh chữ ký thứ hai.
 *
 * Bốn thứ dễ vỡ nếu ai đó "đơn giản hoá" thành một vòng `for` trần: chỉ tách khi
 * đúng họ lỗi này, trả về phần mở được thay vì ném hết đi, ném lỗi GỐC khi
 * không mở được gì, và tôn trọng generation fence.
 */

import { describe, expect, it, vi } from "vitest";

import { decryptTargets } from "@/lib/reveal/retry";
import { __resetRevealStoreForTests, clearReveals, currentGeneration } from "@/lib/reveal/store";

const GAO = (): Error =>
  new Error("An error occured during decryption", {
    cause: new Error(
      "Error in core/service/src/client/user_decryption_wasm.rs: Error reconstructing all blocks: " +
        "Gao decoding failure: Allowed at most 0 errors but xgcd factor degree indicates 1.. n=13, deg=4, #shares=9",
    ),
  });

const A = "0xaaa";
const B = "0xbbb";
const C = "0xccc";

describe("decryptTargets", () => {
  it("mở cả batch trong một request khi hạ tầng bình thường", async () => {
    __resetRevealStoreForTests();
    const request = vi.fn(async (subset: readonly string[]) => Object.fromEntries(subset.map((h) => [h, 1n])));

    await expect(decryptTargets([A, B], request, currentGeneration())).resolves.toEqual({
      decrypted: { [A]: 1n, [B]: 1n },
      failed: [],
    });
    // Đúng một request: tách batch là đường sửa lỗi, không phải đường mặc định.
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("tách batch ra từng handle khi cả batch không dựng lại được", async () => {
    __resetRevealStoreForTests();
    const request = vi.fn(async (subset: readonly string[]) => {
      if (subset.length > 1 || subset[0] === B) throw GAO();
      return Object.fromEntries(subset.map((h) => [h, 7n]));
    });

    const out = await decryptTargets([A, B, C], request, currentGeneration());
    // Mở được hai trong ba vẫn tốt hơn một bức tường — và handle hỏng được
    // TRẢ TÊN VỀ để card giữ nó ở trạng thái ẩn chứ không hiện `0`.
    expect(out.decrypted).toEqual({ [A]: 7n, [C]: 7n });
    expect(out.failed).toEqual([B]);
    expect(request).toHaveBeenCalledTimes(4);
  });

  it("không mở được gì thì ném lỗi GỐC, để taxonomy còn phân loại được thành R7", async () => {
    __resetRevealStoreForTests();
    const request = vi.fn(async () => {
      throw GAO();
    });

    // Không bọc lại thành "retry exhausted": taxonomy đọc chuỗi `cause`, bọc
    // lại là mất đường về R7 và rơi vào "Something went wrong".
    await expect(decryptTargets([A, B], request, currentGeneration())).rejects.toThrow(/during decryption/);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("một handle thì không có gì để tách, nhưng vẫn được hỏi lại", async () => {
    __resetRevealStoreForTests();
    const request = vi
      .fn<(s: readonly string[]) => Promise<Record<string, unknown>>>()
      .mockRejectedValueOnce(GAO())
      .mockResolvedValueOnce({ [A]: 9n });

    await expect(decryptTargets([A], request, currentGeneration())).resolves.toEqual({
      decrypted: { [A]: 9n },
      failed: [],
    });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("không tách vì bất kỳ lỗi nào khác — chữ ký bị từ chối phải được trả lời ngay", async () => {
    __resetRevealStoreForTests();
    const rejected = Object.assign(new Error("user rejected action"), { code: 4001 });
    const request = vi.fn(async () => {
      throw rejected;
    });

    await expect(decryptTargets([A, B], request, currentGeneration())).rejects.toBe(rejected);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("dừng khi phiên đã chết giữa hai lần thử", async () => {
    __resetRevealStoreForTests();
    const request = vi.fn(async () => {
      // Người dùng bấm Hide (hoặc đổi account) ngay trong lúc chờ relayer.
      clearReveals("hide");
      throw GAO();
    });

    const generation = currentGeneration();
    await expect(decryptTargets([A, B], request, generation)).rejects.toThrow(/session ended/);
    // Đúng một lần gọi: không được tách batch sau khi phiên đã chết.
    expect(request).toHaveBeenCalledTimes(1);
  });
});
