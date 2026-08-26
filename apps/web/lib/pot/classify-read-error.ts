import { classifyError, type PotError } from "@payday-pot/sdk";

/**
 * Bộ đệm phân loại lỗi cho ĐƯỜNG ĐỌC.
 *
 * `classifyError` map ethers `NETWORK_ERROR` sang `wrong-network` (R8). Với một
 * write đi qua ví thì đúng. Với một read thì sai: read luôn dùng RPC Sepolia cố
 * định (`lib/chain/rpc`), nên "sai mạng" là chuyện không thể xảy ra ở đây —
 * `NETWORK_ERROR` chỉ có thể là RPC không với tới được, tức R7. Bảo người dùng
 * "đổi mạng đi" khi thật ra public RPC đang chết là một dead end.
 *
 * Sửa ở tầng web chứ không sửa taxonomy trong SDK: ABI và SDK đã freeze từ
 * Day 5, và cùng một `NETWORK_ERROR` trên đường write thì R8 vẫn là câu trả lời
 * đúng. Khác biệt nằm ở ngữ cảnh gọi, không nằm ở lỗi.
 */
export function classifyReadError(e: unknown): PotError {
  const classified = classifyError(e);
  if (classified.code !== "wrong-network") return classified;

  const code = (e as { code?: unknown } | null)?.code;
  if (code !== "NETWORK_ERROR") return classified;

  return {
    ...classified,
    code: "network-unreachable",
    row: "R7",
    title: "Cannot reach the network",
    detail: "The connection to Sepolia dropped while reading the pool. Nothing was submitted.",
    action: { kind: "retry" },
    retryable: true,
  };
}
