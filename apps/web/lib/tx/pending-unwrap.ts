"use client";

import { Interface, ZeroAddress } from "ethers";

import { CUSDC_ABI, getCusdc } from "../chain/tokens";
import { readProvider } from "../chain/rpc";

/**
 * R1 — phát hiện unwrap còn treo.
 *
 * Cách detect (thiết kế chốt 26/08, COMPATIBILITY_NOTES quirk #22): `unwrap`
 * bắn `UnwrapRequested(receiver, unwrapRequestId, amount)`; wrapper giữ view mở
 * `unwrapRequester(id)`. Còn địa chỉ ⇒ chưa finalize. Hết ⇒ xong. Một view call,
 * không backend, không index event, sống qua reload.
 *
 * `requestId` chỉ tồn tại trong bộ nhớ tab và chỉ được lấy lại bằng cách parse
 * receipt từ `txHash` đã lưu. Không bao giờ persist nó: trên bản live nó CHÍNH
 * LÀ ciphertext handle của số đã burn (quirk #23).
 */
export interface PendingUnwrap {
  /** Tx đã tạo yêu cầu — cái duy nhất được phép lưu xuống đĩa. */
  txHash: string;
  /** Chỉ sống trong bộ nhớ. */
  requestId: string;
  receiver: string;
}

const cusdcInterface = new Interface([...CUSDC_ABI]);

/**
 * Nhận tx hash chứ không nhận `TxRecord`: tất cả những gì cần là hash, và một
 * mảng record được filter lại mỗi lần render là một dependency không ổn định —
 * chữ ký này khiến caller không thể vô tình truyền identity mới vào một hook.
 */
export async function findPendingUnwraps(txHashes: readonly string[]): Promise<PendingUnwrap[]> {
  const provider = readProvider();
  const pot = getCusdc(provider);

  const results = await Promise.all(
    txHashes.map(async (txHash): Promise<PendingUnwrap | null> => {
      try {
        const receipt = await provider.getTransactionReceipt(txHash);
        if (!receipt) return null;
        for (const log of receipt.logs) {
          const parsed = cusdcInterface.parseLog({ topics: [...log.topics], data: log.data });
          if (parsed?.name !== "UnwrapRequested") continue;
          const requestId = String(parsed.args["unwrapRequestId"]);
          const requester = (await pot["unwrapRequester"]!(requestId)) as string;
          if (requester === ZeroAddress) return null;
          return { txHash, requestId, receiver: String(parsed.args["receiver"]) };
        }
        return null;
      } catch {
        // Không đọc được receipt (RPC chớp) thì im lặng — banner sai còn tệ hơn
        // banner thiếu, và lần poll sau sẽ bắt được.
        return null;
      }
    }),
  );

  return results.filter((r): r is PendingUnwrap => r !== null);
}
