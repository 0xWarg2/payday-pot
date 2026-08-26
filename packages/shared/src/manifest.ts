/** Single source of truth cho chain/address. Web + SDK + scripts đều đọc từ đây. */

export const SEPOLIA_CHAIN_ID = 11155111 as const;

/**
 * Một deploy được đánh dấu là `dev` hay `rc`.
 *
 * - `dev`  — bản dùng để dựng UI (Day 6–8). Có thể deploy đè bất cứ lúc nào,
 *            không verify explorer, KHÔNG dùng cho submission.
 * - `rc`   — release candidate của Day 9: source verified, epoch ngắn cho demo,
 *            commit + abiHash chốt, là bản đi kèm bài nộp.
 *
 * Web đọc field này để hiện badge môi trường — người xem link demo phải biết
 * mình đang nhìn bản nào, không đoán.
 */
export type DeploymentKind = "dev" | "rc";

export interface ContractDeployment {
  address: `0x${string}`;
  deployBlock: number;
  deployTx: `0x${string}`;
  kind: DeploymentKind;
  /** git commit của source đã deploy */
  commit: string;
  /** sha256(JSON.stringify(abi)) — phát hiện web build lệch contract */
  abiHash: string;
  /** source đã verify trên explorer chưa (bắt buộc `true` cho `rc`) */
  verified: boolean;
  note?: string;
}

/**
 * Day-1 throwaway spike. Cố tình KHÔNG mang commit/abiHash/verified: nó không
 * phải sản phẩm, chỉ giữ lại để truy vết lịch sử compatibility probe.
 */
export interface SpikeDeployment {
  address: `0x${string}`;
  deployBlock: number;
  deployTx: `0x${string}`;
  note: string;
}

export interface DeploymentManifest {
  chainId: typeof SEPOLIA_CHAIN_ID;
  network: "sepolia";
  contracts: {
    CompatSpike?: SpikeDeployment;
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

export class ManifestMismatchError extends Error {
  constructor(
    readonly expected: string,
    readonly actual: string,
  ) {
    super(
      `Deployment manifest does not match this build: manifest abiHash ${expected.slice(0, 12)}… ` +
        `but the bundled ABI hashes to ${actual.slice(0, 12)}…. ` +
        `The UI would be talking to a different contract than it was compiled against.`,
    );
    this.name = "ManifestMismatchError";
  }
}

/**
 * Chốt "web build đúng manifest" (exit gate Day 9) ngay lúc boot thay vì để
 * người dùng phát hiện bằng một tx revert khó hiểu. Gọi một lần khi khởi tạo
 * client — nếu ai đó deploy lại contract mà quên chạy `abi:export`, hoặc build
 * web từ commit cũ, thì hỏng ở đây chứ không hỏng ở ví người dùng.
 */
export function assertDeploymentMatchesAbi(deployment: ContractDeployment, bundledAbiHash: string): void {
  if (deployment.abiHash !== bundledAbiHash) {
    throw new ManifestMismatchError(deployment.abiHash, bundledAbiHash);
  }
}
