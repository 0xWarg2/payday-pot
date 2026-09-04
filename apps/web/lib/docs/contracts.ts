/**
 * Hằng số cho trang Contracts — thuần, không "use client", không ethers.
 *
 * `lib/draw/receipt.ts` cũng biết explorer, nhưng nó là client module kéo theo
 * ethers; trang docs là server component nên không được nhập nó. Hai chỗ cùng
 * một URL gốc là chấp nhận được; hai chỗ cùng một thư viện nặng thì không.
 */
export const ETHERSCAN = "https://sepolia.etherscan.io";

export function explorerAddressUrl(address: string): string {
  return `${ETHERSCAN}/address/${address}`;
}

export function explorerTxUrl(hash: string): string {
  return `${ETHERSCAN}/tx/${hash}`;
}

/**
 * Tham số của pool đang chạy. Manifest chỉ ghi chúng trong `note` dạng chữ, nên
 * ba con số này được chép tay — và một vitest so chúng với `note` để bản chép
 * không lệch khỏi bản deploy lúc nào không hay.
 */
export const POOL_PARAMETERS = {
  epochSeconds: 3600,
  /** 6 decimals — 10,000 USDC. */
  perUserCapRaw: 10_000_000_000n,
  participantCap: 32,
} as const;
