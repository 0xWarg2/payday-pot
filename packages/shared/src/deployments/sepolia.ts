// GENERATED FILE — do not edit by hand.
// Source:     deployments/sepolia.json
// Regenerate: pnpm --filter @payday-pot/contracts manifest:sync
// Drift gate: pnpm --filter @payday-pot/contracts manifest:check

import type { DeploymentManifest } from "../manifest.js";

export const SEPOLIA_MANIFEST = {
  "chainId": 11155111,
  "network": "sepolia",
  "contracts": {
    "CompatSpike": {
      "address": "0xceEee18891D4d53699E2Ab28C402fA0C5D721603",
      "deployBlock": 11522269,
      "deployTx": "0x57de19501d680781c7791f0008e6035231cd0ed5791dea253739d93c434c3cbc",
      "note": "Day-1 throwaway spike — sẽ thay bằng PayDayPot"
    }
  },
  "official": {
    "confidentialWrapperRegistry": "0x2f0750Bbb0A246059d80e94c454586a7F27a128e",
    "cUSDCMock": "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639",
    "underlyingUSDCMock": "0x9b5Cd13b8eFbB58Dc25A05CF411D8056058aDFfF"
  },
  "updatedAt": "2026-08-19T00:00:00Z"
} as const satisfies DeploymentManifest;
