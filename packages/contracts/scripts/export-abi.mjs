#!/usr/bin/env node
/**
 * Freeze the PayDayPot ABI into @payday-pot/shared.
 *
 * The ABI was frozen on Day 5 (25/08/2026). The web app and the SDK must NOT
 * depend on hardhat artifacts — they build from a checked-in file so that
 * `pnpm -r build` works without compiling Solidity, and so that any change to
 * the ABI shows up as a reviewable diff instead of silently re-generating.
 *
 *   pnpm abi:export   regenerate the file
 *   pnpm abi:check    fail if the checked-in file has drifted from the artifact
 *
 * The hash is sha256(JSON.stringify(abi)) — the same value recorded in
 * deployments/<network>.json. If it changes, the deployed contract and this
 * file are no longer the same contract, and the manifest is a lie.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ARTIFACT = resolve(HERE, "../artifacts/contracts/PayDayPot.sol/PayDayPot.json");
const OUT = resolve(HERE, "../../shared/src/abi/payday-pot.ts");

const check = process.argv.includes("--check");

let artifact;
try {
  artifact = JSON.parse(readFileSync(ARTIFACT, "utf8"));
} catch {
  console.error(`✗ artifact not found: ${ARTIFACT}\n  run \`pnpm compile\` first.`);
  process.exit(1);
}

const abi = artifact.abi;
const hash = createHash("sha256").update(JSON.stringify(abi)).digest("hex");

const names = (type) =>
  abi
    .filter((e) => e.type === type)
    .map((e) => e.name)
    .sort();

const errors = names("error");
const events = names("event");
const functions = abi.filter((e) => e.type === "function").length;

const list = (arr) => arr.map((n) => `  "${n}",`).join("\n");

const body = `// GENERATED FILE — do not edit by hand.
// Source:     packages/contracts/artifacts/contracts/PayDayPot.sol/PayDayPot.json
// Regenerate: pnpm --filter @payday-pot/contracts abi:export
// Drift gate: pnpm --filter @payday-pot/contracts abi:check
//
// ABI frozen Day 5 (25/08/2026): ${abi.length} entries · ${functions} functions ·
// ${events.length} events · ${errors.length} errors.

/** sha256(JSON.stringify(abi)) — must match the \`abiHash\` in deployments/<network>.json. */
export const PAYDAY_POT_ABI_HASH = "${hash}";

/**
 * Every custom error the pot can revert with, including the ones it inherits
 * (Ownable/Pausable/ReentrancyGuard/SafeERC20) and the ones the FHEVM library
 * throws. The SDK's error taxonomy switches exhaustively over this union, so
 * adding an error to the contract breaks the SDK build until it is classified.
 */
export const PAYDAY_POT_ERRORS = [
${list(errors)}
] as const;
export type PayDayPotErrorName = (typeof PAYDAY_POT_ERRORS)[number];

/** Every event the pot emits. None of them carries an amount — see PRIVACY.md §1. */
export const PAYDAY_POT_EVENTS = [
${list(events)}
] as const;
export type PayDayPotEventName = (typeof PAYDAY_POT_EVENTS)[number];

export const PAYDAY_POT_ABI = ${JSON.stringify(abi, null, 2)} as const;
`;

if (check) {
  let current;
  try {
    current = readFileSync(OUT, "utf8");
  } catch {
    console.error(`✗ ${OUT} is missing — run \`pnpm abi:export\`.`);
    process.exit(1);
  }
  if (current !== body) {
    console.error(
      `✗ ABI drift: packages/shared/src/abi/payday-pot.ts does not match the compiled artifact.\n` +
        `  artifact hash: ${hash}\n` +
        `  run \`pnpm abi:export\` and review the diff — a changed hash invalidates every deployment manifest.`,
    );
    process.exit(1);
  }
  console.log(`✓ ABI in sync — ${abi.length} entries, hash ${hash.slice(0, 12)}…`);
  process.exit(0);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, body);
console.log(`✓ wrote ${OUT}`);
console.log(`  ${abi.length} entries · ${functions} functions · ${events.length} events · ${errors.length} errors`);
console.log(`  hash ${hash}`);
