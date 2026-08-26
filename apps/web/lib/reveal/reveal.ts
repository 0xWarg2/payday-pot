"use client";

import { getAddress } from "ethers";
import { HIDDEN_HANDLE, classifyError } from "@payday-pot/sdk";

import { ensureFheInstance } from "../fhevm/instance";
import { getSigner } from "../wallet/connect";
import {
  commitReveals,
  currentGeneration,
  revealKey,
  setFlight,
  setNotice,
} from "./store";

export interface RevealTarget {
  handle: string;
  /** Nhãn người đọc được — chỉ dùng cho thông báo, không bao giờ kèm giá trị. */
  label: string;
}

export interface RevealParams {
  chainId: number;
  contractAddress: string;
  account: string;
  targets: readonly RevealTarget[];
}

/**
 * Mở khoá một hoặc nhiều handle bằng ĐÚNG MỘT chữ ký EIP-712.
 *
 * Vì sao gộp: principal và TWAB luôn được xem cùng nhau, và bắt ký hai lần cho
 * một hành động là cách nhanh nhất để người dùng học được thói quen bấm "Sign"
 * mà không đọc. `userDecrypt` nhận nhiều cặp trong một request, nên gộp là
 * đường tự nhiên chứ không phải mẹo.
 *
 * Nhưng phải LỌC handle chưa khởi tạo trước khi gửi: `HIDDEN_HANDLE` không phải
 * ciphertext, relayer sẽ từ chối cả batch vì nó. Nên số cặp gửi đi là "tối đa
 * hai", không phải "luôn hai".
 *
 * Các phase dưới đây map 1:1 với máy trạng thái §12.1 và cố ý KHÔNG gộp thành
 * một spinner: "đang nạp WASM" và "ví đang đợi bạn ký" là hai việc rất khác
 * nhau đối với người đang nhìn màn hình.
 */
export async function revealHandles(params: RevealParams): Promise<void> {
  const generation = currentGeneration();
  const contractAddress = getAddress(params.contractAddress);
  const account = getAddress(params.account);

  const usable = params.targets.filter((t) => t.handle !== HIDDEN_HANDLE);
  if (usable.length === 0) {
    setNotice({
      kind: "nothing-to-reveal",
      title: "Nothing to reveal yet",
      detail: "This pool has no encrypted value for your wallet so far. Make a deposit and it will appear here.",
    });
    return;
  }

  const keys = usable.map((t) => revealKey(params.chainId, contractAddress, account, t.handle));

  try {
    setFlight({ phase: "SDK_INITIALIZING", keys });
    const instance = await ensureFheInstance();

    setFlight({ phase: "ACL_CHECKING", keys });
    const signer = await getSigner();
    const signerAddress = getAddress(await signer.getAddress());
    if (signerAddress !== account) {
      // Người dùng đổi account trong ví giữa chừng. Ký bằng ví mới cho handle
      // của ví cũ chỉ dẫn tới một lỗi relayer khó hiểu — dừng sạch ở đây.
      setNotice({
        kind: "stale-handle",
        title: "Your wallet changed",
        detail: "The connected account is not the one this position belongs to. Nothing was revealed or sent.",
      });
      return;
    }

    setFlight({ phase: "AWAITING_EIP712_SIGNATURE", keys });
    const keypair = instance.generateKeypair();
    const start = Math.floor(Date.now() / 1000);
    const days = 1;
    const eip712 = instance.createEIP712(keypair.publicKey, [contractAddress], start, days);
    const signature = await signer.signTypedData(
      eip712.domain as never,
      // Chỉ giữ đúng một type. Truyền nguyên `eip712.types` sẽ kéo theo
      // `EIP712Domain` và ethers từ chối ký (gotcha spike Day 1).
      { UserDecryptRequestVerification: eip712.types["UserDecryptRequestVerification"] } as never,
      eip712.message as never,
    );

    setFlight({ phase: "DECRYPTING", keys });
    const decrypted = await instance.userDecrypt(
      usable.map((t) => ({ handle: t.handle, contractAddress })),
      keypair.privateKey,
      keypair.publicKey,
      signature.replace("0x", ""),
      [contractAddress],
      account,
      start,
      days,
    );

    const values = new Map<string, bigint>();
    usable.forEach((target, i) => {
      const key = keys[i];
      const raw = decrypted[target.handle];
      if (key === undefined || raw === undefined) return;
      values.set(key, BigInt(raw as bigint | string));
    });

    if (values.size === 0) {
      setNotice({
        kind: "error",
        title: "The decryption service returned nothing",
        detail: "Nothing was revealed. Try again — your position is unchanged.",
      });
      return;
    }

    commitReveals(generation, values);
  } catch (e) {
    const error = classifyError(e);
    // Copy LUÔN lấy từ taxonomy, kể cả nhánh user-rejected.
    //
    // Trước đây chỗ này tự viết một câu riêng cho "cancelled" — và câu đó không
    // bao giờ được hiện: thẻ render `ErrorPanel` (tức `error.title`/`error.detail`)
    // bất cứ khi nào notice có `error`. Hai bản copy cho cùng một tình huống, một
    // bản chết, là cách chắc chắn để chúng lệch khỏi ERROR_RECOVERY_MATRIX mà
    // không có test nào đỏ.
    setNotice({
      kind: error.code === "user-rejected" ? "rejected" : "error",
      title: error.title,
      detail: error.detail,
      error,
    });
  }
}
