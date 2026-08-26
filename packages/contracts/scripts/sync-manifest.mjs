#!/usr/bin/env node
/**
 * Bridge `deployments/<network>.json` (the ops-facing single source of truth)
 * into a typed module the browser can bundle.
 *
 *   pnpm manifest:sync    regenerate packages/shared/src/deployments/sepolia.ts
 *   pnpm manifest:check   fail if it has drifted, or if the manifest is invalid
 *
 * The web app must never read the JSON off disk (it has no fs) and must never
 * hardcode an address. It imports the generated module, and boot-time asserts
 * that `abiHash` matches the ABI it was compiled against.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../..");
const SRC = resolve(REPO, "deployments/sepolia.json");
const OUT = resolve(REPO, "packages/shared/src/deployments/sepolia.ts");
const ARTIFACT = resolve(HERE, "../artifacts/contracts/PayDayPot.sol/PayDayPot.json");

const check = process.argv.includes("--check");
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

const manifest = JSON.parse(readFileSync(SRC, "utf8"));

// --- validate -------------------------------------------------------------
if (manifest.chainId !== 11155111) fail(`chainId must be 11155111, got ${manifest.chainId}`);
if (manifest.network !== "sepolia") fail(`network must be "sepolia", got ${manifest.network}`);

const addr = /^0x[0-9a-fA-F]{40}$/;
const txh = /^0x[0-9a-fA-F]{64}$/;

const spike = manifest.contracts?.CompatSpike;
if (spike) {
  if (!addr.test(spike.address)) fail(`CompatSpike.address is not an address: ${spike.address}`);
  if (!txh.test(spike.deployTx)) fail(`CompatSpike.deployTx is not a tx hash`);
  if (typeof spike.note !== "string") fail(`CompatSpike.note is required (it records why the spike is kept)`);
}

const pot = manifest.contracts?.PayDayPot;
if (pot) {
  for (const f of ["address", "deployBlock", "deployTx", "kind", "commit", "abiHash", "verified"]) {
    if (pot[f] === undefined) fail(`PayDayPot.${f} is required`);
  }
  if (!addr.test(pot.address)) fail(`PayDayPot.address is not an address: ${pot.address}`);
  if (!txh.test(pot.deployTx)) fail(`PayDayPot.deployTx is not a tx hash`);
  if (pot.kind !== "dev" && pot.kind !== "rc") fail(`PayDayPot.kind must be "dev" or "rc", got ${pot.kind}`);
  if (pot.kind === "rc" && pot.verified !== true) fail(`an "rc" deployment must have verified source (Day 9 exit gate)`);
  try {
    const abi = JSON.parse(readFileSync(ARTIFACT, "utf8")).abi;
    const hash = createHash("sha256").update(JSON.stringify(abi)).digest("hex");
    if (pot.abiHash !== hash) {
      fail(
        `PayDayPot.abiHash in the manifest (${pot.abiHash.slice(0, 12)}…) does not match the compiled ` +
          `artifact (${hash.slice(0, 12)}…). Either the manifest points at an older contract, or the ` +
          `contract changed since it was deployed. Redeploy or fix the manifest — do not "fix" the hash.`,
      );
    }
  } catch (e) {
    if (e?.code !== "ENOENT") throw e; // no artifact = nothing to cross-check against
  }
}

// --- emit -----------------------------------------------------------------
const body = `// GENERATED FILE — do not edit by hand.
// Source:     deployments/sepolia.json
// Regenerate: pnpm --filter @payday-pot/contracts manifest:sync
// Drift gate: pnpm --filter @payday-pot/contracts manifest:check

import type { DeploymentManifest } from "../manifest.js";

export const SEPOLIA_MANIFEST = ${JSON.stringify(manifest, null, 2)} as const satisfies DeploymentManifest;
`;

if (check) {
  let current;
  try {
    current = readFileSync(OUT, "utf8");
  } catch {
    fail(`${OUT} is missing — run \`pnpm manifest:sync\`.`);
  }
  if (current !== body) fail(`manifest drift: packages/shared/src/deployments/sepolia.ts is stale — run \`pnpm manifest:sync\`.`);
  console.log(`✓ manifest in sync${pot ? ` — PayDayPot ${pot.kind} @ ${pot.address}` : " — PayDayPot not deployed yet"}`);
  process.exit(0);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, body);
console.log(`✓ wrote ${OUT}`);
console.log(pot ? `  PayDayPot ${pot.kind} @ ${pot.address} (block ${pot.deployBlock})` : `  PayDayPot: not deployed yet`);
