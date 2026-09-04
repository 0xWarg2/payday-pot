"use client";

import type { ContractTransactionResponse, JsonRpcSigner, TransactionReceipt } from "ethers";
import { classifyError, type PotError } from "@payday-pot/sdk";

import { SEPOLIA_CHAIN_ID } from "../chain/rpc";
import { getSigner } from "../wallet/connect";
import { walletStore } from "../wallet/store";
import { recordTx, setTxStatus, type TxAction } from "./store";

export interface SendOptions {
  action: TxAction;
  /** Epoch liên quan — công khai, được phép ghi vào tx center. */
  epochId?: bigint;
  /**
   * Gọi ngay khi có hash, TRƯỚC `wait()`.
   *
   * Cần vì máy trạng thái ở `lib/savings/machine.ts` phân biệt "đang chờ bạn
   * ký" với "đã lên chain, đang chờ block" — hai việc mà người đang nhìn màn
   * hình cảm nhận rất khác nhau, và chỉ có hash mới chia được chúng. Không thay
   * thế cho tx center: `recordTx` vẫn chạy ở đây, độc lập với callback này.
   */
  onHash?: (txHash: string) => void;
}

/**
 * Đường duy nhất để gửi tx.
 *
 * Ba việc, đúng thứ tự này: (1) chặn trước khi mở ví nếu sai mạng — mở ví rồi
 * mới báo lỗi là cách nhanh nhất làm người dùng mất niềm tin; (2) ghi vào tx
 * center NGAY khi có hash, trước khi `wait()`, để đóng tab giữa chừng vẫn còn
 * dấu vết mà resume (R11); (3) mọi lỗi đi qua `classifyError`, không có `catch`
 * nào tự chế thông điệp (kickoff §5 #9).
 */
export async function sendTx(
  options: SendOptions,
  run: (signer: JsonRpcSigner) => Promise<ContractTransactionResponse>,
): Promise<TransactionReceipt> {
  const wallet = walletStore.get();
  if (wallet.status !== "connected" || !wallet.address) {
    throw classifyError(new Error("No injected ethereum provider found"));
  }
  if (wallet.chainId !== SEPOLIA_CHAIN_ID) {
    throw classifyError({ code: 4902, message: "wrong network" });
  }

  let hash: string | undefined;
  try {
    const signer = await getSigner();
    const response = await run(signer);
    hash = response.hash;
    recordTx({
      chainId: SEPOLIA_CHAIN_ID,
      action: options.action,
      txHash: response.hash,
      ...(options.epochId === undefined ? {} : { epochId: options.epochId.toString() }),
      createdAt: Date.now(),
    });
    options.onHash?.(response.hash);

    const receipt = await response.wait();
    if (!receipt) throw new Error("The transaction was replaced before it was mined");
    setTxStatus(response.hash, receipt.status === 1 ? "success" : "reverted", receipt.blockNumber);
    return receipt;
  } catch (e) {
    if (hash) setTxStatus(hash, "unknown");
    throw classifyError(e);
  }
}

/** `unknown` trong taxonomy = bug của taxonomy (kickoff §5 #9), không phải của user. */
export function isTaxonomyGap(error: PotError): boolean {
  return error.code === "unknown";
}
