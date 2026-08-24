/**
 * Day 4 EOD demo — the draw: one immutable random, one encrypted winner.
 *
 *   pnpm demo:day4   (trong packages/contracts)
 *
 * Nằm trong demo/ (ngoài test/) nên KHÔNG chạy cùng `pnpm test`.
 * Dùng hardhat test runner vì đó là đường duy nhất plugin FHEVM init mock in-process (quirk #6).
 *
 * Flow: three savers deposit staggered amounts → payday → snapshot freezes the
 *       weights → owner pauses (maintenance) and the draw WAITS, then unpause →
 *       the keeper triggers requestRandom with ZERO parameters (can't cheat) →
 *       a reroll attempt bounces off AlreadyDrawn → a total stranger finishes
 *       the scan (permissionless resume) → exactly ONE encrypted winner exists,
 *       the ticket matches ⌊R·T/2^64⌋ to the unit — and neither the employer,
 *       the keeper, nor even the winner themself can decrypt who won.
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

describe("PayDay Pot — Day 4 Draw Engine Demo", () => {
  it("one random, one scan, one encrypted winner — and nobody can peek", async function () {
    this.timeout(120_000);
    if (!fhevm.isMock) {
      this.skip();
    }
    const signers = await ethers.getSigners();
    const [deployer, jimmer, warg, carol, employer, keeper] = signers;
    const stranger = signers[9];
    const savers = [jimmer, warg, carol];
    const names = ["Jimmer", "Warg", "Carol"];

    line("\n  ━━━ PayDay Pot — Day 4: the draw is one locked random and one encrypted scan ━━━\n");

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

    for (const user of savers) {
      await usdc.mint(user.address, 10_000n * M);
      await usdc.connect(user).approve(tokenAddress, 10_000n * M);
      await token.connect(user).wrap(user.address, 10_000n * M);
    }
    ok("Jimmer, Warg and Carol each wrap 10,000 USDC → ctUSDC (the last public numbers you'll see)");

    const deposit = async (user: HardhatEthersSigner, amount: bigint, at: bigint) => {
      const enc = await fhevm.createEncryptedInput(tokenAddress, user.address).add64(amount).encrypt();
      await time.setNextBlockTimestamp(at);
      return token
        .connect(user)
        ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](potAddress, enc.handles[0], enc.inputProof, "0x");
    };

    // 2. Three staggered deposits — three different weights, all ciphertext
    const t0 = start + 3600n;
    await (await deposit(jimmer, 4_000n * M, t0)).wait();
    await (await deposit(warg, 3_000n * M, t0 + 7_200n)).wait();
    await (await deposit(carol, 9_000n * M, t0 + 86_400n)).wait();
    ok("Hour 1 / hour 3 / day 1 — enc(4,000), enc(3,000), enc(9,000). Different money, different clocks.");
    info("Weight = balance × time (Day 3). The chain holds three ciphertexts and one encrypted total.");

    // 3. Payday → snapshot freezes the weights (Day 3 machinery)
    await time.increaseTo(end);
    await (await pot.connect(keeper).beginSnapshot()).wait();
    await (await pot.connect(keeper).snapshotBatch(32)).wait();
    ok("Payday. The keeper freezes all 3 weights — the draw will use THESE, whatever happens next.");

    // 4. Maintenance pause — the draw start waits, it never breaks (R10)
    await (await pot.connect(deployer).pause()).wait();
    try {
      await pot.connect(keeper).requestRandom();
      throw new Error("BUG: requestRandom ran while paused!");
    } catch (e) {
      if ((e as Error).message.includes("BUG")) throw e;
      no("Owner pauses for maintenance → requestRandom is blocked. The epoch just WAITS, nothing is lost.");
    }
    await (await pot.connect(deployer).unpause()).wait();
    ok("Unpause → the same epoch resumes exactly where it stood (withdrawals never paused at all)");

    // 5. The keeper locks the randomness — with an empty argument list
    const randTx = await pot.connect(keeper).requestRandom();
    const randHcu = fhevm.computeTransactionHCU((await randTx.wait())!);
    ok("The keeper calls requestRandom() — ZERO parameters. No seed, no weight, no winner to smuggle in.");
    info("Same tx: onchain FHE randomness R, then ticket = ⌊R × totalWeight / 2^64⌋ — all ciphertext.");

    // 6. Reroll? There is no reroll. (R5)
    try {
      await pot.connect(keeper).requestRandom();
      throw new Error("BUG: the randomness was rerolled!");
    } catch (e) {
      if ((e as Error).message.includes("BUG")) throw e;
      no("The keeper tries requestRandom AGAIN → AlreadyDrawn. One epoch, one seed, forever.");
    }

    // 7. The scan — resumable by anyone, finished by a total stranger (R4)
    const batch1Tx = await pot.connect(keeper).selectBatch(1);
    const batch1Hcu = fhevm.computeTransactionHCU((await batch1Tx.wait())!);
    let prog = await pot.drawProgress(1);
    ok(`selectBatch(1) scans participant #1 — cursor at ${prog.cursor}/${prog.total}, anyone may continue`);
    const batch2Tx = await pot.connect(stranger).selectBatch(32);
    const batch2Hcu = fhevm.computeTransactionHCU((await batch2Tx.wait())!);
    prog = await pot.drawProgress(1);
    ok(`A WALLET NOBODY HAS SEEN finishes the scan → DrawCompleted at ${prog.cursor}/${prog.total}`);
    info("Every participant costs the identical 7 FHE ops — the scan's shape leaks nothing about who won.");

    // 8. Mock-only inspection — the math holds and EXACTLY one winner exists
    const st = await pot.drawStateOf(1);
    const R = await fhevm.debugger.decryptEuint(FhevmType.euint64, st.random);
    const ticket = await fhevm.debugger.decryptEuint(FhevmType.euint64, st.ticket);
    const T = await fhevm.debugger.decryptEuint(FhevmType.euint64, await pot.totalWeightOf(1));
    if (ticket !== (R * T) >> 64n) throw new Error("TICKET MATH BROKEN: ticket != floor(R*T / 2^64)");
    info(`[mock-only inspection] R=${R} → ticket=${ticket.toLocaleString("en-US")} == ⌊R·T/2^64⌋ exactly, ticket < T`);

    const flags: boolean[] = [];
    for (const user of savers) {
      flags.push(await fhevm.debugger.decryptEbool(await pot.wonOf(user.address)));
    }
    const winners = flags.filter(Boolean).length;
    if (winners !== 1) throw new Error(`DRAW BROKEN: expected exactly 1 winner, got ${winners}`);
    const winnerIdx = flags.findIndex(Boolean);
    // Replicate §6.3 in plain math: the winner is the first cumulative crossing.
    let cum = 0n;
    let predicted = -1;
    for (const [i, user] of savers.entries()) {
      cum += await fhevm.debugger.decryptEuint(FhevmType.euint64, await pot.twabAreaOf(user.address));
      if (predicted === -1 && ticket < cum) predicted = i;
    }
    if (predicted !== winnerIdx) throw new Error("DRAW BROKEN: winner does not match the cumulative math");
    ok(`[mock-only inspection] EXACTLY one winner flag is true — ${names[winnerIdx]}, precisely where the math says`);

    // 9. And onchain? Nobody can read any of it — not even the winner.
    for (const [who, whoName] of [
      [employer, "The employer"],
      [keeper, "The keeper"],
    ] as Array<[HardhatEthersSigner, string]>) {
      try {
        await fhevm.userDecryptEuint(FhevmType.euint64, st.random, potAddress, who);
        throw new Error(`PRIVACY BREACH: ${whoName} decrypted the randomness!`);
      } catch (e) {
        if ((e as Error).message.includes("PRIVACY BREACH")) throw e;
        no(`${whoName} tries to decrypt the randomness → DENIED by ACL`);
      }
    }
    try {
      await fhevm.userDecryptEbool(await pot.wonOf(savers[winnerIdx].address), potAddress, savers[winnerIdx]);
      throw new Error("PRIVACY BREACH: a winner flag was user-decryptable!");
    } catch (e) {
      if ((e as Error).message.includes("PRIVACY BREACH")) throw e;
      no(`${names[winnerIdx]} tries to decrypt their OWN winner flag → DENIED. Winner flags are contract-only.`);
    }
    const pending = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      await pot.pendingPrizeOf(savers[winnerIdx].address),
      potAddress,
      savers[winnerIdx],
    );
    ok(`The user-facing channel is pendingPrize: ${names[winnerIdx]} decrypts ${pending} (prize funding lands Day 5)`);

    // 10. HCU recap
    info(
      `HCU: requestRandom ${randHcu.globalHCU.toLocaleString("en-US")} (the u128 multiply-high, once per epoch), ` +
        `selectBatch(1) ${batch1Hcu.globalHCU.toLocaleString("en-US")}, final batch ${batch2Hcu.globalHCU.toLocaleString("en-US")} ` +
        `— all far under the 20M global / 5M depth limits`,
    );

    line("\n  ━━━ Day 4: one locked random, one uniform scan, one winner only the contract knows ━━━\n");
  });
});
