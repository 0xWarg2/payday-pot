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
    },
    "PayDayPot": {
      "address": "0x792c77D9A2052ED03aaB6B392364c3e17f52a035",
      "deployBlock": 11620820,
      "deployTx": "0x90d62c3f3dda75ed2bec6094e745943793541c00bb0b21a7f224be19003c62d5",
      "kind": "rc",
      "commit": "15d703d37e1a0e672f0602535d3832e524fe1020",
      "abiHash": "1043e9dc3870da6762b138f093bcb0857e1e59be3a821eaf6ebd3ed7d4f2732b",
      "verified": true,
      "token": "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639",
      "tokenImpl": "0xAe37b998d453E1FaBE85DD46cf04295ca4A3af04",
      "note": "rc-1 — epoch 3600s (short on purpose: a full draw cycle is demoable inside an hour), perUserCap 10000000000, participantCap 32; supersedes dev 0xFF8c126d12715b4fe069728A3f8a24142726ec25",
      "verification": {
        "blockscout": "https://eth-sepolia.blockscout.com/address/0x792c77D9A2052ED03aaB6B392364c3e17f52a035#code",
        "sourcify": "https://repo.sourcify.dev/11155111/0x792c77D9A2052ED03aaB6B392364c3e17f52a035",
        "sourcifyMatch": "creationMatch=match runtimeMatch=match (2026-09-02T16:50:34Z)",
        "note": "Etherscan bo qua: khong co API key. Blockscout khong doi key va tu propagate sang Sourcify."
      }
    }
  },
  "official": {
    "confidentialWrapperRegistry": "0x2f0750Bbb0A246059d80e94c454586a7F27a128e",
    "cUSDCMock": "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639",
    "underlyingUSDCMock": "0x9b5Cd13b8eFbB58Dc25A05CF411D8056058aDFfF"
  },
  "updatedAt": "2026-09-02T16:44:49.546Z"
} as const satisfies DeploymentManifest;
