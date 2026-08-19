/** Single source of truth cho chain/address. Web + SDK + scripts đều đọc từ đây. */

export const SEPOLIA_CHAIN_ID = 11155111 as const;

export interface ContractDeployment {
  address: `0x${string}`;
  deployBlock: number;
  /** git commit của source đã deploy */
  commit: string;
  /** keccak256 của ABI json — phát hiện web build lệch contract */
  abiHash: string;
  verified: boolean;
}

export interface DeploymentManifest {
  chainId: typeof SEPOLIA_CHAIN_ID;
  network: "sepolia";
  contracts: {
    CompatSpike?: ContractDeployment;
    PayDayPot?: ContractDeployment;
  };
  /** Official Zama/OZ addresses — luôn validate qua registry lúc runtime */
  official: typeof OFFICIAL_SEPOLIA;
  updatedAt: string;
}

/**
 * Địa chỉ official trên Sepolia theo docs Zama (17.4 implementation plan).
 * KHÔNG tin cứng — script validate-registry.ts xác nhận lại lúc runtime.
 */
export const OFFICIAL_SEPOLIA = {
  confidentialWrapperRegistry: "0x2f0750Bbb0A246059d80e94c454586a7F27a128e",
  cUSDCMock: "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639",
  underlyingUSDCMock: "0x9b5Cd13b8eFbB58Dc25A05CF411D8056058aDFfF",
} as const;
