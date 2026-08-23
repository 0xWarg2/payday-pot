/**
 * Day 3 EOD demo — encrypted TWAB: weight = balance × time, frozen at payday.
 *
 *   pnpm demo:day3   (trong packages/contracts)
 *
 * Nằm trong demo/ (ngoài test/) nên KHÔNG chạy cùng `pnpm test`.
 * Dùng hardhat test runner vì đó là đường duy nhất plugin FHEVM init mock in-process (quirk #6).
 *
 * Flow: Jimmer deposits 6,000 at epoch open → Warg deposits the SAME 6,000 at
 *       the exact midpoint ("same money, half the time") → past payday a late
 *       deposit is rejected → an anonymous wallet starts the snapshot
 *       (permissionless) → batch(1) freezes Jimmer → Jimmer withdrawAll MID-
 *       SNAPSHOT (no-loss) → the employer of all people finishes the batch →
 *       decrypt: exactly 2:1, employer denied → HCU recap.
 */
import { FhevmType } from "@fhevm/hardhat-plugin";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { ethers, fhevm } from "hardhat";

const line = (s = "") => console.log(s);
const ok = (s: string) => console.log(`   ✅ ${s}`);
const no = (s: string) => console.log(`   🔒 ${s}`);
const info = (s: string) => console.log(`   ▸ ${s}`);

const M = 1_000_000n;
const fmt = (v: bigint) => `${(v / M).toLocaleString("en-US")} ctUSDC`;
const days = (v: bigint) => `${(Number(v) / 86_400).toFixed(2)} days`;

describe("PayDay Pot — Day 3 Encrypted TWAB Demo", () => {
  it("weight = balance × time, frozen at payday — and nobody can peek", async function () {
    this.timeout(120_000);
    if (!fhevm.isMock) {
      this.skip();
    }
    const signers = await ethers.getSigners();
    const [, jimmer, warg, keeper, employer] = signers;

    line("\n  ━━━ PayDay Pot — Day 3: your lottery weight is balance × time, and it's encrypted ━━━\n");

    // 1. Deploy the stack
    const usdc = await (await ethers.getContractFactory("TestUSDC")).deploy();
    const token = await (await ethers.getContractFactory("TestConfidentialUSDC")).deploy(await usdc.getAddress());
    const tokenAddress = await token.getAddress();
    const pot = await (
      await ethers.getContractFactory("PayDayPot")
    ).deploy(tokenAddress, employer.address, 7n * 24n * 3600n, 10_000n * M, 32);
    const potAddress = await pot.getAddress();
    const { start, end } = await pot.epochInfo(1);
    ok(`Stack deployed — 7-day epoch, payday at t+7d (PayDayPot ${potAddress})`);

    for (const user of [jimmer, warg]) {
      await usdc.mint(user.address, 10_000n * M);
      await usdc.connect(user).approve(tokenAddress, 10_000n * M);
      await token.connect(user).wrap(user.address, 10_000n * M);
    }
    ok("Jimmer and Warg each wrap 10,000 USDC → ctUSDC (the last public numbers you'll see)");

    const deposit = async (user: HardhatEthersSigner, amount: bigint, at?: bigint) => {
      const enc = await fhevm.createEncryptedInput(tokenAddress, user.address).add64(amount).encrypt();
      if (at !== undefined) await time.setNextBlockTimestamp(at);
      return token
        .connect(user)
        ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](potAddress, enc.handles[0], enc.inputProof, "0x");
    };
    const twabOf = async (user: HardhatEthersSigner) =>
      fhevm.userDecryptEuint(FhevmType.euint64, await pot.twabAreaOf(user.address), potAddress, user);
    const walletOf = async (user: HardhatEthersSigner) =>
      fhevm.userDecryptEuint(FhevmType.euint64, await token.confidentialBalanceOf(user.address), tokenAddress, user);

    // 2. Two identical deposits, two very different holding times
    const t0 = start + 3600n; // one hour into the epoch
    const tMid = t0 + (end - t0) / 2n; // the exact midpoint of what's left
    await (await deposit(jimmer, 6_000n * M, t0)).wait();
    ok(`Hour 1 — Jimmer deposits enc(6,000). Clock starts: his money will work ${days(end - t0)}`);
    await (await deposit(warg, 6_000n * M, tMid)).wait();
    ok(`Midpoint — Warg deposits enc(6,000). Same money, HALF the time: ${days(end - tMid)}`);
    info("The chain sees two ciphertexts. Amounts, balances, weights: all encrypted euint64.");

    // 3. Payday passes — the entry window is closed even before anyone snapshots
    await time.increaseTo(end + 86_400n);
    try {
      await deposit(warg, 1_000n * M);
      throw new Error("BUG: deposit passed after payday!");
    } catch (e) {
      if ((e as Error).message.includes("BUG")) throw e;
      no("A day after payday, Warg tries one more deposit → WrongPhase. Entries closed AT the bell.");
    }

    // 4. Snapshot — anyone can run it, in pieces
    const beginTx = await pot.connect(keeper).beginSnapshot();
    const beginHcu = fhevm.computeTransactionHCU((await beginTx.wait())!);
    ok("A random wallet (call it the keeper) starts the snapshot — permissionless, no privileges");
    const batch1Tx = await pot.connect(keeper).snapshotBatch(1);
    const batch1Hcu = fhevm.computeTransactionHCU((await batch1Tx.wait())!);
    const [cursor, total] = await pot.snapshotProgress(1);
    ok(`snapshotBatch(1) freezes participant #1 of ${total} — cursor at ${cursor}/${total}, resumable by anyone`);

    // 5. No-loss, mid-snapshot: Jimmer takes every cent home
    await (await pot.connect(jimmer).withdrawAll()).wait();
    ok(`MID-SNAPSHOT, Jimmer withdraws everything → wallet back to ${fmt(await walletOf(jimmer))}`);
    info("Withdraw is never gated — not by phase, not by pause. His frozen weight stays in the draw.");

    // 6. The employer finishes the queue — and learns nothing for it
    const batch2Tx = await pot.connect(employer).snapshotBatch(32);
    const batch2Hcu = fhevm.computeTransactionHCU((await batch2Tx.wait())!);
    ok("The EMPLOYER pushes the last batch — anyone may turn the crank, nobody gets a peek");

    // 7. The reveal: exactly 2:1, and only to the owners
    const areaJimmer = await twabOf(jimmer);
    const areaWarg = await twabOf(warg);
    ok(`Jimmer decrypts his weight: ${areaJimmer.toLocaleString("en-US")} (6,000 × ${days(end - t0)})`);
    ok(`Warg decrypts his weight:   ${areaWarg.toLocaleString("en-US")} (6,000 × ${days(end - tMid)})`);
    if (areaJimmer !== 2n * areaWarg) throw new Error("TWAB BROKEN: expected an exact 2:1 ratio");
    ok("Exactly 2:1 — half the time in the pool means half the ticket. To the second, to the unit.");

    const handle = await pot.twabAreaOf(jimmer.address);
    try {
      await fhevm.userDecryptEuint(FhevmType.euint64, handle, potAddress, employer);
      throw new Error("PRIVACY BREACH: employer decrypted a weight!");
    } catch (e) {
      if ((e as Error).message.includes("PRIVACY BREACH")) throw e;
      no("Employer tries to decrypt Jimmer's weight → DENIED by ACL");
    }

    // Mock-only inspection — bypasses ACL, never a product path.
    const totalWeight = await fhevm.debugger.decryptEuint(FhevmType.euint64, await pot.totalWeightOf(1));
    info(`[mock-only inspection] totalWeight = ${totalWeight.toLocaleString("en-US")} == Jimmer + Warg exactly`);
    if (totalWeight !== areaJimmer + areaWarg) throw new Error("TOTAL WEIGHT MISMATCH");

    // 8. HCU recap
    info(
      `HCU: beginSnapshot ${beginHcu.globalHCU.toLocaleString("en-US")}, batch(1) ${batch1Hcu.globalHCU.toLocaleString("en-US")}, ` +
        `final batch ${batch2Hcu.globalHCU.toLocaleString("en-US")} — all far under the 20M global / 5M depth limits`,
    );

    line("\n  ━━━ Day 3: weights frozen at payday, not at draw time — and never in plaintext ━━━\n");
  });
});
