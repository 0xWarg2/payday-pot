export {
  type ContractDeployment,
  type DeploymentKind,
  type DeploymentManifest,
  type SpikeDeployment,
  SEPOLIA_CHAIN_ID,
  OFFICIAL_SEPOLIA,
  ManifestMismatchError,
  assertDeploymentMatchesAbi,
} from "./manifest.js";

export {
  PAYDAY_POT_ABI,
  PAYDAY_POT_ABI_HASH,
  PAYDAY_POT_ERRORS,
  PAYDAY_POT_EVENTS,
  type PayDayPotErrorName,
  type PayDayPotEventName,
} from "./abi/payday-pot.js";

export { SEPOLIA_MANIFEST } from "./deployments/sepolia.js";

import type { ContractDeployment, DeploymentManifest } from "./manifest.js";
import { SEPOLIA_MANIFEST } from "./deployments/sepolia.js";

// SEPOLIA_MANIFEST giữ literal type (mỗi address là một string literal), nên khi
// PayDayPot chưa deploy thì key đó không tồn tại về mặt type. Đọc qua alias đã
// widen để code chạy được ở cả hai trạng thái mà không cần cast từng chỗ.
const manifest: DeploymentManifest = SEPOLIA_MANIFEST;

export class NotDeployedError extends Error {
  constructor() {
    super(
      "PayDayPot is not in deployments/sepolia.json yet. Deploy it with " +
        "`pnpm --filter @payday-pot/contracts deploy:sepolia:dev` — that writes the " +
        "manifest and regenerates this module in the same run.",
    );
    this.name = "NotDeployedError";
  }
}

/**
 * Địa chỉ pot đang dùng. Ném lỗi có hướng dẫn thay vì trả `undefined` — mọi
 * caller đều cần địa chỉ, và một `undefined` trôi vào ethers sẽ nổ ở chỗ khác
 * với thông điệp vô nghĩa.
 */
export function getPayDayPotDeployment(): ContractDeployment {
  const d = manifest.contracts.PayDayPot;
  if (!d) throw new NotDeployedError();
  return d;
}

/** Có deploy chưa — dùng cho UI/banner, không ném lỗi. */
export function isPayDayPotDeployed(): boolean {
  return manifest.contracts.PayDayPot !== undefined;
}
