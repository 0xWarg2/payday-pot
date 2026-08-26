import { JsonRpcProvider, Network } from "ethers";
import { SEPOLIA_CHAIN_ID } from "@payday-pot/shared";

export const SEPOLIA_HEX = "0xaa36a7";

/**
 * RPC cố định cho MỌI read.
 *
 * Không đọc qua `window.ethereum`: ví có thể đang đứng ở mạng khác, và khi đó
 * `eth_call` trả về rác hoặc `CALL_EXCEPTION` — đúng cái R8 cấm leak ra UI.
 * Tách read (RPC cố định) khỏi write (signer của ví) làm cho "sai mạng" chỉ ảnh
 * hưởng tới nút bấm, không ảnh hưởng tới dữ liệu hiển thị.
 */
export const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

let cached: JsonRpcProvider | undefined;

export function readProvider(): JsonRpcProvider {
  cached ??= new JsonRpcProvider(SEPOLIA_RPC, Network.from(SEPOLIA_CHAIN_ID), {
    staticNetwork: true,
    // Batch mặc định của ethers gộp nhiều eth_call vào một request; public RPC
    // hay rate-limit theo request nên giữ nguyên, chỉ hạ trần cho an toàn.
    batchMaxCount: 10,
  });
  return cached;
}

export function isSepolia(chainId: number | bigint | null | undefined): boolean {
  return chainId !== null && chainId !== undefined && Number(chainId) === SEPOLIA_CHAIN_ID;
}

export { SEPOLIA_CHAIN_ID };
