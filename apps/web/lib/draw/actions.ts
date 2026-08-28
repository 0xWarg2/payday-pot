"use client";

import { getPot, sendDrawStep, type DrawStep } from "@payday-pot/sdk";

import { SEPOLIA_CHAIN_ID, readProvider } from "../chain/rpc";
import { refreshPotReads } from "../pot/reads";
import { sendTx } from "../tx/send";

/**
 * Gửi một bước draw. Bất kỳ ví nào cũng gọi được — đó là cả điểm của nó (#7).
 *
 * Không có tham số nào ở đây mang seed, weight hay winner: `DrawStep` chỉ có
 * `action` và `steps`, và `steps` chỉ là "làm bao nhiêu người trong tx này".
 * Người bấm không đóng góp gì vào kết quả ngoài gas.
 *
 * Sau tx: `refreshPotReads` — và đó là cách duy nhất cursor mới đi vào màn hình.
 * Không có setState lạc quan, không có bộ đếm cục bộ. Nếu tx được mine mà read
 * hỏng, UI ở lại con số cũ và người dùng bấm Retry; nếu thay vào đó ta tự tăng
 * cursor, màn hình sẽ nói dối rất thuyết phục cho tới lần reload tiếp theo.
 */
export async function runDrawStep(
  step: DrawStep,
  epochId: bigint | undefined,
  options: { account?: string | null; onHash?: (txHash: string) => void } = {},
): Promise<void> {
  await sendTx(
    {
      action: step.action,
      ...(epochId === undefined ? {} : { epochId }),
      ...(options.onHash ? { onHash: options.onHash } : {}),
    },
    async (signer) => sendDrawStep(getPot(signer), step),
  );
  await refreshPotReads(options.account ?? null, SEPOLIA_CHAIN_ID);
}

/** Epoch id tươi từ chain — chỉ để dán nhãn tx center (công khai). */
export async function currentEpochIdOrUndefined(): Promise<bigint | undefined> {
  try {
    return (await getPot(readProvider())["currentEpochId"]!()) as bigint;
  } catch {
    return undefined;
  }
}
