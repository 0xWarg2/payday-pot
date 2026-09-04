import { OFFICIAL_SEPOLIA, PAYDAY_POT_ABI_HASH, getPayDayPotDeployment, isPayDayPotDeployed } from "@payday-pot/shared";

import { explorerAddressUrl, explorerTxUrl, POOL_PARAMETERS } from "../contracts";
import type { DocBlock, DocPageDef } from "../types";

function poolBlocks(): DocBlock[] {
  if (!isPayDayPotDeployed()) {
    return [
      {
        kind: "callout",
        tone: "warning",
        title: "No pool address in this build",
        text: "The deployment manifest has no PayDayPot entry, so this build cannot point at a live pool. Deploy one and regenerate the manifest to fill this page in.",
      },
    ];
  }
  const d = getPayDayPotDeployment();
  const verification = d.verification;
  const rows: DocBlock = {
    kind: "table",
    head: ["", ""],
    rows: [
      ["Network", "Ethereum Sepolia (chain id 11155111)"],
      ["Deployed at block", String(d.deployBlock)],
      ["Deploy transaction", <a key="tx" className="underline underline-offset-4 break-all" href={explorerTxUrl(d.deployTx)} target="_blank" rel="noreferrer">{d.deployTx}</a>],
      ["Source commit", <code key="c" className="font-mono text-[13px] break-all">{d.commit}</code>],
      ["Release", d.kind === "rc" ? "Release candidate" : d.kind],
      ["Upgradeable", "No — there is no proxy and no upgrade path"],
      [
        "Source verified",
        d.verified && verification ? (
          <span key="v">
            Yes{verification.blockscout ? <> — <a className="underline underline-offset-4" href={verification.blockscout} target="_blank" rel="noreferrer">Blockscout</a></> : null}
            {verification.sourcify ? <>, <a className="underline underline-offset-4" href={verification.sourcify} target="_blank" rel="noreferrer">Sourcify</a></> : null}
          </span>
        ) : d.verified ? "Yes" : "Not yet",
      ],
    ],
  };
  return [
    { kind: "code", code: d.address, label: "PayDayPot", href: explorerAddressUrl(d.address), hrefLabel: "View on Etherscan" },
    rows,
  ];
}

export const CONTRACTS: DocPageDef = {
  slug: "contracts",
  title: "Contracts and parameters",
  group: "reference",
  summary: "Addresses, the numbers the live pool was deployed with, and how to run the whole thing yourself.",
  source: ["deployments/sepolia.json", "packages/contracts/README.md"],
  sections: [
    { id: "pool", title: "The pool", blocks: poolBlocks() },
    {
      id: "token",
      title: "The confidential token",
      blocks: [
        {
          kind: "p",
          text: "The pool holds a confidential wrapper of a test USDC. Both are Zama's official Sepolia mocks, and the app checks the wrapper against the on-chain registry at runtime rather than trusting the number written here.",
        },
        { kind: "code", code: OFFICIAL_SEPOLIA.cUSDCMock, label: "Confidential USDC (wrapper)", href: explorerAddressUrl(OFFICIAL_SEPOLIA.cUSDCMock), hrefLabel: "View on Etherscan" },
        { kind: "code", code: OFFICIAL_SEPOLIA.underlyingUSDCMock, label: "Test USDC (underlying)", href: explorerAddressUrl(OFFICIAL_SEPOLIA.underlyingUSDCMock), hrefLabel: "View on Etherscan" },
        { kind: "code", code: OFFICIAL_SEPOLIA.confidentialWrapperRegistry, label: "Wrapper registry", href: explorerAddressUrl(OFFICIAL_SEPOLIA.confidentialWrapperRegistry), hrefLabel: "View on Etherscan" },
      ],
    },
    {
      id: "parameters",
      title: "Parameters of the live pool",
      blocks: [
        {
          kind: "table",
          head: ["Parameter", "Value", "Why"],
          rows: [
            ["Round length", `${POOL_PARAMETERS.epochSeconds / 60} minutes`, "Short on purpose, so a full round can be watched inside an hour."],
            ["Cap per saver", `${(Number(POOL_PARAMETERS.perUserCapRaw) / 1_000_000).toLocaleString("en-US")} USDC`, "Keeps every encrypted total far below the point where it could wrap around."],
            ["Savers per round", String(POOL_PARAMETERS.participantCap), "Encrypted arithmetic has a hard budget per transaction; the draw runs in batches under it."],
          ],
        },
        {
          kind: "p",
          text: "All three are set at deployment and cannot be changed afterwards. A different pool with different numbers means a different contract at a different address.",
        },
      ],
    },
    {
      id: "abi",
      title: "Interface",
      blocks: [
        {
          kind: "p",
          text: "The app is built against a fixed interface and refuses to start if the hash below does not match the contract it is pointed at, so a stale front end can never talk to a newer pool by accident.",
        },
        { kind: "code", code: PAYDAY_POT_ABI_HASH, label: "ABI hash (sha-256)" },
      ],
    },
    {
      id: "run-it",
      title: "Run it yourself",
      blocks: [
        { kind: "p", text: "The repository is a pnpm workspace. Contract tests run against a local FHE mock; nothing here needs Sepolia except the deploy step." },
        { kind: "code", code: "pnpm install --frozen-lockfile\npnpm -r build && pnpm -r test\ncd packages/contracts && npx hardhat test", label: "From the repository root" },
      ],
    },
  ],
};
