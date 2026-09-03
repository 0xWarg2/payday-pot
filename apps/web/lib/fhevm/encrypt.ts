"use client";

import { getAddress, hexlify } from "ethers";
import { classifyError, type EncryptedAmount } from "@payday-pot/sdk";

import { ensureFheInstance } from "./instance";

/**
 * Mã hoá một số tiền để gửi lên chain.
 *
 * ĐÂY LÀ BƯỚC CHẬM NHẤT CỦA CẢ SẢN PHẨM: đo được **9752 ms** phía Node cho một
 * `add64().encrypt()` trên relayer thật (COMPATIBILITY_NOTES quirk #25). Trong
 * trình duyệt còn thêm phần nạp WASM lần đầu. Nghĩa là:
 *
 *  - Không được là một spinner trần. `onPhase` tồn tại để UI nói được đang làm
 *    gì; "đang chờ" mười giây không giải thích thì người dùng sẽ bấm lại, và
 *    bấm lại ở đây là encrypt hai lần chứ không phải nhanh hơn.
 *  - Phải huỷ được, và huỷ phải nói rõ là chưa mất gì: ở bước này **chưa có tx
 *    nào**, chưa mở ví, chưa tiêu gas. `AbortSignal` không dừng được WASM đang
 *    chạy, nên nó dừng ở chỗ dừng được — bỏ kết quả và không đi tiếp sang ký.
 *
 * `boundTo` không phải trang trí: proof bind vào (contract, user), và deposit đi
 * qua TOKEN còn withdraw đi vào POT. Trả kèm địa chỉ để `sendDeposit`/
 * `sendWithdraw` kiểm lại được thay vì để chain từ chối sau mười giây.
 */
export type EncryptPhase = "starting" | "encrypting" | "done";

export interface EncryptOptions {
  /** Contract mà proof này sẽ được dùng ở: token cho deposit, pot cho withdraw. */
  contractAddress: string;
  /** Ví sẽ gửi tx. Proof bind vào đúng ví này. */
  account: string;
  amount: bigint;
  onPhase?: (phase: EncryptPhase) => void;
  signal?: AbortSignal;
}

export class EncryptCancelled extends Error {
  constructor() {
    super("Encryption was cancelled before anything was submitted");
    this.name = "EncryptCancelled";
  }
}

export async function encryptAmount(options: EncryptOptions): Promise<EncryptedAmount> {
  const { contractAddress, account, amount, onPhase, signal } = options;
  if (amount <= 0n) throw new RangeError("Refusing to encrypt a non-positive amount");

  const contract = getAddress(contractAddress);
  const user = getAddress(account);

  const throwIfCancelled = (): void => {
    if (signal?.aborted) throw new EncryptCancelled();
  };

  try {
    throwIfCancelled();
    onPhase?.("starting");
    const instance = await ensureFheInstance();

    throwIfCancelled();
    onPhase?.("encrypting");
    const buffer = instance.createEncryptedInput(contract, user);
    buffer.add64(amount);
    const encrypted = await buffer.encrypt();

    // Kiểm SAU khi encrypt xong cũng có nghĩa: đây là chỗ chặn không cho một
    // kết quả đã bị huỷ đi tiếp sang bước mở ví.
    throwIfCancelled();

    const handle = encrypted.handles[0];
    if (!handle) throw new Error("The encryption service returned no handle");
    onPhase?.("done");

    return { handle: hexlify(handle), inputProof: hexlify(encrypted.inputProof), boundTo: contract };
  } catch (e) {
    if (e instanceof EncryptCancelled) throw e;
    // Relayer chậm/hỏng là R7, và `classifyError` đã biết đường đó. Không tự
    // viết thông điệp ở đây — giữ đúng một nguồn copy cho mọi lỗi.
    throw classifyError(e);
  }
}
