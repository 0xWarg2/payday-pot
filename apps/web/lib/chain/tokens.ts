import { Contract, type ContractRunner } from "ethers";
import { OFFICIAL_SEPOLIA } from "@payday-pot/shared";

/**
 * Token layer — cUSDC (wrapper ERC-7984) + USDCMock (underlying ERC-20).
 *
 * Mọi selector dưới đây đã được probe trên bản LIVE Sepolia (26/08), không lấy
 * từ artifact local: wrapper là proxy UUPS của Zama và đã upgrade một lần, nên
 * ABI local của OZ `ERC7984ERC20Wrapper` KHÔNG phải nguồn tin cậy.
 *
 * Đã xác nhận có: wrap(address,uint256) 0xbf376c7a · unwrap(address,address,bytes32)
 * · unwrap(address,address,bytes32,bytes) · finalizeUnwrap(bytes32,uint64,bytes)
 * · unwrapRequester · unwrapAmount · confidentialTransferAndCall · setOperator
 * · isBlocked · rate() = 1 · decimals() = 6.
 * Đã xác nhận KHÔNG có: unwrap(address,address,uint64) — bản live không phải OZ
 * thuần (COMPATIBILITY_NOTES quirk #22), đừng thêm lại overload đó.
 */

export const CUSDC_ADDRESS = OFFICIAL_SEPOLIA.cUSDCMock;
export const UNDERLYING_ADDRESS = OFFICIAL_SEPOLIA.underlyingUSDCMock;

/** cUSDC và USDCMock đều 6 chữ số thập phân, `rate()` = 1 (live-probed). */
export const UNDERLYING_DECIMALS = 6;

export const CUSDC_ABI = [
  "function wrap(address to, uint256 amount)",
  "function unwrap(address from, address to, bytes32 amount)",
  "function finalizeUnwrap(bytes32 requestId, uint64 amount, bytes signatures)",
  "function unwrapRequester(bytes32 requestId) view returns (address)",
  "function confidentialTransferAndCall(address to, bytes32 amount, bytes inputProof, bytes data) returns (bytes32)",
  "function confidentialBalanceOf(address account) view returns (bytes32)",
  "function setOperator(address operator, uint48 until)",
  "function isBlocked(address account) view returns (bool)",
  "function rate() view returns (uint256)",
  "function decimals() view returns (uint8)",
  // `amount` là euint64 → bytes32 trong ABI. requestId CHÍNH LÀ handle đó
  // (quirk #23) nên nó tuyệt đối không được persist ở đâu.
  "event UnwrapRequested(address indexed receiver, bytes32 indexed unwrapRequestId, bytes32 amount)",
] as const;

export const UNDERLYING_ABI = [
  // Faucet mở, không owner-gated — probe 26/08 xác nhận contract không có owner().
  "function mint(address to, uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
] as const;

export function getCusdc(runner: ContractRunner): Contract {
  return new Contract(CUSDC_ADDRESS, [...CUSDC_ABI], runner);
}

export function getUnderlying(runner: ContractRunner): Contract {
  return new Contract(UNDERLYING_ADDRESS, [...UNDERLYING_ABI], runner);
}

/** Lượng test USDC một lần bấm faucet cấp — 1,000 USDCMock. */
export const FAUCET_AMOUNT = 1_000_000_000n;
