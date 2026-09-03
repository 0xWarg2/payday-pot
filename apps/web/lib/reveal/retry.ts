"use client";

import { currentGeneration } from "./store";

/**
 * Đi hết chuỗi `cause` và nối lại thành một dòng.
 *
 * Cần hàm này vì `console.error(e)` của trình duyệt in `e.message` + stack và
 * **không** đi theo `e.cause`. Relayer SDK 0.4.1 bọc mọi thất bại decrypt lại
 * thành đúng một câu — `"An error occured during decryption"`, và vâng, trong
 * bundle nó viết "occured" một chữ r — rồi nhét lỗi thật vào `cause`. Không có
 * hàm này thì console lẫn taxonomy đều chỉ thấy câu vô nghĩa ở lớp ngoài.
 */
export function causeChain(e: unknown): string {
  const out: string[] = [];
  let cur = e;
  for (let depth = 0; depth < 6 && cur !== null && cur !== undefined; depth += 1) {
    const msg =
      cur instanceof Error ? cur.message : typeof cur === "string" ? cur : JSON.stringify(cur)?.slice(0, 300);
    out.push(`[${depth}] ${msg ?? String(cur)}`);
    cur = cur instanceof Error ? (cur.cause as unknown) : undefined;
  }
  return out.join(" <- ");
}

/** Khớp đúng một họ lỗi: threshold KMS trả về bộ share không dựng lại được. */
const RECONSTRUCTION_FAILURE =
  /gao decoding|error reconstructing|user_decryption_wasm|error occured during decryption/i;

export const isReconstructionFailure = (e: unknown): boolean => RECONSTRUCTION_FAILURE.test(causeChain(e));

export interface DecryptOutcome {
  /** Handle → giá trị, chỉ những handle thực sự mở được. */
  decrypted: Record<string, unknown>;
  /** Handle mà KMS không dựng lại được. Rỗng nghĩa là mở hết. */
  failed: readonly string[];
}

/** Gap giữa hai lần thử. Tách ra để test không phải chờ thật. */
const BACKOFF_MS = 600;

/**
 * Mở một tập handle, và khi KMS trả về bộ share hỏng thì **đổi cách hỏi** chứ
 * không hỏi lại y nguyên.
 *
 * Bối cảnh đo được trên Sepolia 03/09 (COMPATIBILITY_NOTES #58, #60): relayer
 * trả `202` rồi `200` với `{"status":"succeeded"}` và payload đầy đủ, sau đó
 * WASM client chết khi dựng lại:
 *
 *   Gao decoding failure: Allowed at most 0 errors but xgcd factor degree
 *   indicates 1.. n=13, deg=4, #shares=9
 *
 * Committee 13 party gửi về 9 share cho polynomial bậc 4 và một share không
 * nhất quán; ở tỉ lệ đó Reed–Solomon phát hiện được nhưng không sửa được, nên
 * nó thất bại dứt khoát. Toàn bộ chuyện này ở phía Zama — probe chạy trong
 * **Node**, ngoài mọi thứ của web (không Next build, không WASM path riêng,
 * không COOP/COEP, keypair mới), thất bại y hệt.
 *
 * Hai điều đo được quyết định chiến lược ở đây, và cả hai đều **phản trực giác**:
 *
 * 1. **Hỏi lại y nguyên là vô ích.** Ba POST liên tiếp cùng body nhận về đúng
 *    một `requestId` (`7dab9f00-…` trong trace Day 9) → cùng một câu trả lời
 *    hỏng. Phiên mới (keypair + `start` khác, tức body khác) cũng vẫn hỏng.
 * 2. **Đổi TẬP handle thì đổi kết quả.** Cùng một thời điểm, đo 3 lần mỗi ca:
 *    `[C]` và `[C,A]` xong 3/3, còn `[A]`, `[B]`, `[A,B]`, `[B,A]`, `[A,C]`,
 *    `[A,B,C]`, `[C,B,A]` hỏng 3/3. Nửa giờ trước đó thì `[A,B]` và `[A,B,C]`
 *    lại xong 10/10 — nên nó **dịch chuyển theo thời gian**, không phải một
 *    handle "xấu" cố định.
 *
 * Vì tập handle **không** nằm trong payload EIP-712 (chữ ký ký lên public key
 * của phiên + cửa sổ hiệu lực, không ký lên request), tách batch thành từng
 * handle một là **miễn phí**: không có chữ ký thứ hai, ví không bật lên lần nữa.
 *
 * Nên: thử cả batch một lần → nếu hỏng thì hỏi từng handle riêng → trả về
 * những gì mở được kèm danh sách hỏng. Mở được hai trong ba giá trị vẫn tốt hơn
 * một bức tường, và giá trị hỏng thì **giữ nguyên trạng thái ẩn** chứ không bao
 * giờ hiện `0` (non-negotiable #8).
 */
export async function decryptTargets(
  handles: readonly string[],
  request: (subset: readonly string[]) => Promise<Record<string, unknown>>,
  generation: number,
): Promise<DecryptOutcome> {
  const alive = () => {
    if (currentGeneration() !== generation) throw new Error("reveal session ended");
  };

  alive();
  try {
    return { decrypted: await request(handles), failed: [] };
  } catch (e) {
    if (!isReconstructionFailure(e)) throw e;

    // Một handle thì không có gì để tách. Vẫn thử lại hai lần nữa: bộ share
    // hỏng dịch chuyển theo thời gian, nên chờ một nhịp là cách duy nhất còn
    // lại — và nó rẻ.
    const subsets = handles.length > 1 ? handles.map((h) => [h]) : [handles, handles];
    console.warn(
      `[reveal] KMS could not reconstruct ${handles.length} handle(s) together; ` +
        `asking for ${handles.length > 1 ? "each one separately" : "it again"}`,
    );

    const decrypted: Record<string, unknown> = {};
    const failed: string[] = [];
    let last: unknown = e;

    for (let i = 0; i < subsets.length; i += 1) {
      const subset = subsets[i] as readonly string[];
      await new Promise((r) => setTimeout(r, BACKOFF_MS * (i + 1)));
      alive();
      try {
        Object.assign(decrypted, await request(subset));
        if (handles.length === 1) return { decrypted, failed: [] };
      } catch (inner) {
        if (!isReconstructionFailure(inner)) throw inner;
        last = inner;
        for (const h of subset) if (!failed.includes(h)) failed.push(h);
      }
    }

    // Không mở được gì cả: ném lỗi GỐC ra để taxonomy còn phân loại được thành
    // R7. Trả về một outcome rỗng ở đây sẽ biến một lỗi hạ tầng thành "service
    // returned nothing", tức là một câu sai.
    if (Object.keys(decrypted).length === 0) throw last;
    return { decrypted, failed };
  }
}
