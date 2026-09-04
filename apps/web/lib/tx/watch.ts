"use client";

import { readProvider } from "../chain/rpc";
import { setTxStatus, txStore } from "./store";

/**
 * Đối chiếu lại trạng thái của các tx đã lưu.
 *
 * `status` không được persist (xem `store.ts`), nên sau mỗi lần reload mọi
 * record đều bắt đầu ở "unknown" và hàm này dựng lại sự thật từ receipt. Đó
 * cũng là điều kiện để R11 hoạt động: một tx đã gửi rồi mới bị đóng tab vẫn
 * phải hiện ra đúng kết quả của nó khi quay lại, chứ không biến mất.
 *
 * Chỉ hỏi những record chưa có kết luận — receipt của một tx đã confirm không
 * đổi nữa, hỏi lại mỗi 15 giây chỉ tốn quota RPC.
 */
export async function reconcileTxStatuses(): Promise<void> {
  const { records, status } = txStore.get();
  const undecided = records.filter((r) => {
    const s = status.get(r.txHash);
    return s === undefined || s === "pending" || s === "unknown";
  });
  if (undecided.length === 0) return;

  const provider = readProvider();
  await Promise.all(
    undecided.map(async (record) => {
      try {
        const receipt = await provider.getTransactionReceipt(record.txHash);
        if (!receipt) {
          // Chưa vào block, hoặc node này chưa thấy nó. "pending" là câu trả lời
          // trung thực cho cả hai — không được suy ra "thất bại".
          setTxStatus(record.txHash, "pending");
          return;
        }
        setTxStatus(record.txHash, receipt.status === 1 ? "success" : "reverted", receipt.blockNumber);
      } catch {
        setTxStatus(record.txHash, "unknown");
      }
    }),
  );
}
