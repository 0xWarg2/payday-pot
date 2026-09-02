/**
 * Trạng thái live của pot, đọc từ chain — công cụ vận hành, không phải test.
 *
 * Đây là thứ đầu tiên chạy trước mọi việc tay trên Sepolia (RUNBOOK §1). Nó chỉ
 * đọc PUBLIC state: phase, mốc thời gian, cursor, prize plaintext, số dư ETH của
 * các ví vận hành. **Không giải mã gì cả** — principal/TWAB/winner của user là
 * việc của chính user trong browser, và script này không có ACL để đọc chúng dù
 * có muốn (non-negotiable #3).
 *
 * Chạy:  npx hardhat run scripts/pot-state.ts --network sepolia
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ethers, network } from "hardhat";

const MANIFEST = resolve(__dirname, "../../../deployments/sepolia.json");
const PHASES = ["Open", "Snapshotting", "Drawing", "Settled"] as const;

function clock(seconds: bigint, now: bigint): string {
  const delta = seconds - now;
  const abs = delta < 0n ? -delta : delta;
  const h = abs / 3600n;
  const m = (abs % 3600n) / 60n;
  return `${delta < 0n ? "-" : "+"}${h}h${m.toString().padStart(2, "0")}m`;
}

async function main(): Promise<void> {
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const entry = manifest.contracts.PayDayPot;
  const pot = await ethers.getContractAt("PayDayPot", entry.address);

  const [head, block] = await Promise.all([
    ethers.provider.getBlockNumber(),
    ethers.provider.getBlock("latest"),
  ]);
  const now = BigInt(block?.timestamp ?? 0);

  console.log(`network   ${network.name} · block ${head}`);
  console.log(`pot       ${entry.address} (kind=${entry.kind}, verified=${entry.verified})`);
  console.log(`commit    ${String(entry.commit).slice(0, 8)} · abiHash ${String(entry.abiHash).slice(0, 12)}…`);

  const epochId = await pot.currentEpochId();
  const [start, end, phase] = await pot.epochInfo(epochId);
  const count = await pot.participantCount();
  const [snapCursor, snapTotal] = await pot.snapshotProgress(epochId);
  const [drawn, drawCursor, drawTotal] = await pot.drawProgress(epochId);
  const prize = await pot.prizeAmountOf(epochId);
  const paused = await pot.paused();

  console.log("");
  console.log(`epoch     #${epochId} · phase ${PHASES[Number(phase)]}${paused ? " · PAUSED" : ""}`);
  console.log(`window    start ${clock(start, now)} · end ${clock(end, now)} (${end - start}s epoch)`);
  console.log(`deposits  ${phase === 0n && now < end ? "OPEN" : "closed"}`);
  console.log(`prize     ${ethers.formatUnits(prize, 6)} USDC (plaintext, public by design — P-4)`);
  console.log(`people    ${count} registered · snapshot ${snapCursor}/${snapTotal} · draw ${drawCursor}/${drawTotal} · drawn=${drawn}`);

  // Bước kế tiếp là một hàm cụ thể, và MỌI bước dưới đây đều permissionless
  // trừ fundPrize (employer). Nói ra tên hàm để runbook không phải đoán.
  const next =
    phase === 3n
      ? "startNewEpoch()"
      : phase === 0n
        ? now < end
          ? `chờ tới hết epoch (${clock(end, now)}) rồi beginSnapshot()`
          : "beginSnapshot()"
        : phase === 1n
          ? `snapshotBatch(${Math.min(16, Number(snapTotal - snapCursor)) || 1})`
          : !drawn
            ? "requestRandom()"
            : `selectBatch(${Math.min(16, Number(drawTotal - drawCursor)) || 1})`;
  console.log(`next      ${next}`);

  const signers = await ethers.getSigners();
  console.log("");
  for (const [i, label] of [
    [0, "deployer"],
    [4, "employer"],
  ] as const) {
    const signer = signers[i];
    if (!signer) continue;
    const balance = await ethers.provider.getBalance(signer.address);
    console.log(`${label.padEnd(9)} ${signer.address} · ${ethers.formatEther(balance)} ETH`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
