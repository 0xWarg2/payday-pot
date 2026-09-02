"use client";

import { ZeroAddress, getAddress } from "ethers";

import { getCusdc } from "../chain/tokens";
import { readProvider } from "../chain/rpc";

/**
 * R1 — phát hiện unwrap còn treo.
 *
 * Cơ chế (probe live 26/08 + 02/09, COMPATIBILITY_NOTES quirk #22/#44): `unwrap`
 * bắn `UnwrapRequested(receiver, unwrapRequestId, amount)` rồi để tiền nằm ở
 * token contract cho tới khi ai đó gọi `finalizeUnwrap`. `unwrapRequester(id)`
 * còn địa chỉ ⇒ chưa finalize; trả `address(0)` ⇒ đã xong.
 *
 * NGUỒN LÀ CHAIN, KHÔNG PHẢI localStorage. Bản trước lọc `txStore` theo kind
 * `"unwrap"` — mà không có chỗ nào trong app ghi kind đó (app không có action
 * unwrap), nên banner này **chưa từng có khả năng hiện ra**. Đúng ra thì thế mới
 * hợp: một unwrap treo hầu như luôn được tạo ở NGOÀI app này (script, dApp khác,
 * UI của wrapper), và người dùng mở app lên chính là để hỏi "tiền tôi đâu".
 * `receiver` là indexed topic nên một `getLogs` trả lời được câu đó, không cần
 * backend, không cần đã từng mở app trên máy này.
 *
 * `requestId` chỉ sống trong bộ nhớ tab: trên bản live nó CHÍNH LÀ ciphertext
 * handle của số đã burn (quirk #23). Nó publicly-decryptable theo thiết kế của
 * wrapper nên không phải secret — nhưng nó vẫn không có việc gì phải nằm trong
 * URL, analytics hay localStorage.
 */
export interface PendingUnwrap {
  /** Tx đã tạo yêu cầu — để link ra explorer. */
  txHash: string;
  /** Chỉ sống trong bộ nhớ. Cũng là handle để `publicDecrypt`. */
  requestId: string;
  receiver: string;
}

/**
 * Cửa sổ `getLogs` rộng nhất mà RPC read của app cho phép — **đo thật**, không
 * đoán: publicnode trả đúng `exceed maximum block range: 50000` ở 100k và OK ở
 * 50k (02/09). ≈6.9 ngày Sepolia, một request duy nhất.
 *
 * Hệ quả phải nói ra chứ không được ỉm: một unwrap treo từ trước cửa sổ này thì
 * banner không thấy. Ghi ở KNOWN_LIMITATIONS §unwrap. Không tự động phân trang
 * ngược vô hạn — 40 request lúc mount để phục vụ một trường hợp gần như không
 * xảy ra trên testnet là đánh đổi sai.
 */
export const UNWRAP_LOOKBACK_BLOCKS = 50_000;

export async function findPendingUnwraps(account: string | null): Promise<PendingUnwrap[]> {
  if (account === null) return [];

  let receiver: string;
  try {
    receiver = getAddress(account);
  } catch {
    return [];
  }

  const provider = readProvider();
  const cusdc = getCusdc(provider);

  try {
    const head = await provider.getBlockNumber();
    const logs = await cusdc.queryFilter(
      cusdc.filters["UnwrapRequested"]!(receiver),
      Math.max(0, head - UNWRAP_LOOKBACK_BLOCKS),
      head,
    );

    // Một request đã finalize vẫn còn log của nó mãi mãi, nên log KHÔNG phải câu
    // trả lời — `unwrapRequester` mới là. Hỏi song song: thường 0–1 kết quả, và
    // nhiều nhất là số lần user bấm unwrap trong một tuần.
    const checked = await Promise.all(
      logs.map(async (log) => {
        if (!("args" in log)) return null;
        const requestId = String(log.args["unwrapRequestId"]);
        const requester = (await cusdc["unwrapRequester"]!(requestId)) as string;
        if (requester === ZeroAddress) return null;
        return { txHash: log.transactionHash, requestId, receiver };
      }),
    );

    return checked.filter((r): r is PendingUnwrap => r !== null);
  } catch {
    // RPC chớp thì im lặng: banner sai còn tệ hơn banner thiếu, và lần "Check
    // again" sau sẽ bắt được.
    return [];
  }
}

export interface FinalizedUnwrap {
  txHash: string;
  /** Số cUSDC thật sự đã burn/chuyển, đơn vị nhỏ nhất (6 dp). CÓ THỂ LÀ 0. */
  amount: bigint;
}

/**
 * Hoàn tất bước hai — mảnh cuối của R1.
 *
 * Ẩn số duy nhất hồi Day 7 là tham số thứ ba của `finalizeUnwrap`. Đã đóng ở hai
 * đường độc lập: đọc source OZ `ERC7984ERC20Wrapper` (nó tên đúng là
 * `decryptionProof`, và `cleartexts` do contract tự `abi.encode(uint64)`), và
 * chạy thật trên Sepolia 02/09 — request + finalize, contract nhận proof do
 * `publicDecrypt` trả về.
 *
 * Không cần ACL, không cần chữ ký người dùng cho bước decrypt: wrapper gọi
 * `FHE.makePubliclyDecryptable` lên chính handle này khi tạo request (đó là lý
 * do bước hai permissionless được — bất kỳ ai cũng finalize hộ được).
 *
 * Trả về số THẬT. Gọi hàm này rồi hiện "done" mà không nói số là mở đường cho
 * đúng cái bẫy đã gặp lúc probe: unwrap từ ví có 0 cUSDC KHÔNG revert — nó clamp
 * về encrypted zero, tạo request bình thường, rồi finalize chuyển 0. Giống hệt
 * ngữ nghĩa clamp ở deposit (NON-NEGOTIABLE #2), chỉ là ở biên unwrap.
 */
export async function resumeUnwrap(pending: PendingUnwrap): Promise<FinalizedUnwrap> {
  const { ensureFheInstance } = await import("../fhevm/instance");
  const { sendTx } = await import("./send");
  const { getCusdc: cusdcFor } = await import("../chain/tokens");

  const fhe = await ensureFheInstance();
  const decrypted = await fhe.publicDecrypt([pending.requestId]);
  const raw = decrypted.clearValues[pending.requestId] ?? Object.values(decrypted.clearValues)[0];
  const amount = BigInt(raw ?? 0);

  const receipt = await sendTx({ action: "finalize-unwrap" }, (signer) =>
    cusdcFor(signer)["finalizeUnwrap"]!(pending.requestId, amount, decrypted.decryptionProof),
  );

  return { txHash: receipt.hash, amount };
}
