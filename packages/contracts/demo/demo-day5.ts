/**
 * Day 5 EOD demo — protocol complete: a sponsored prize goes in, one winner
 * comes out, and nobody's savings ever moved.
 *
 *   pnpm demo:day5   (trong packages/contracts)
 *
 * Nằm trong demo/ (ngoài test/) nên KHÔNG chạy cùng `pnpm test`.
 * Dùng hardhat test runner vì đó là đường duy nhất plugin FHEVM init mock in-process (quirk #6).
 *
 * Flow: the employer sponsors a PUBLIC prize (a real ERC-20 pull, so an
 *       underfunded sponsor bounces in plaintext) → three savers deposit
 *       encrypted amounts → the prize can still be trimmed, until payday locks
 *       it and the random commits it for good → the draw settles the epoch in
 *       the same tx that finishes the scan → each saver decrypts their OWN
 *       outcome and nobody else's → the owner pauses and the winner claims
 *       ANYWAY → a non-winner's claim is byte-for-byte the same transaction →
 *       total principal is untouched by the whole prize flow → everyone
 *       withdraws in full and the pot ends empty → the next epoch opens.
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
const usd = (v: bigint) => (v / M).toLocaleString("en-US");

describe("PayDay Pot — Day 5 Protocol Complete Demo", () => {
  it("a sponsored prize, one private winner, and every principal comes home", async function () {
    this.timeout(180_000);
    if (!fhevm.isMock) {
      this.skip();
    }
    const signers = await ethers.getSigners();
    const [deployer, jimmer, warg, carol, employer, keeper] = signers;
    const savers = [jimmer, warg, carol];
    const names = ["Jimmer", "Warg", "Carol"];

    line("\n  ━━━ PayDay Pot — Day 5: the prize is public, the winner is not ━━━\n");

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
    ok("Jimmer, Warg and Carol each wrap 10,000 USDC → ctUSDC (the last public balance you'll see)");

    const walletOf = async (user: HardhatEthersSigner) =>
      fhevm.userDecryptEuint(FhevmType.euint64, await token.confidentialBalanceOf(user.address), tokenAddress, user);
    const potBalance = async () =>
      fhevm.debugger.decryptEuint(FhevmType.euint64, await token.confidentialBalanceOf(potAddress));
    const totalPrincipal = async () => fhevm.debugger.decryptEuint(FhevmType.euint64, await pot.totalPrincipal());

    // 2. The sponsor funds the prize — in public, with real money
    info("The prize is EMPLOYER-SPONSORED yield: a public number, deliberately. Only savings are secret.");
    await usdc.mint(employer.address, 1_000n * M);
    await usdc.connect(employer).approve(potAddress, 5_000n * M);
    try {
      await pot.connect(employer).fundPrize(5_000n * M);
      throw new Error("BUG: the pot accepted a prize the sponsor could not pay!");
    } catch (e) {
      if ((e as Error).message.includes("BUG")) throw e;
      no("R12 — the employer pledges 5,000 holding only 1,000 → the ERC-20 pull REVERTS, in plaintext.");
    }
    info("That revert is the whole design: allocation ≡ funding ≡ an actual transfer. No silent shortfall.");
    await (await pot.connect(employer).fundPrize(1_000n * M)).wait();
    ok(`The employer sponsors ${usd(await pot.prizeAmountOf(1))} USDC — pulled, wrapped, and held by the pot`);

    // 3. Three staggered deposits — three weights, all ciphertext
    const deposit = async (user: HardhatEthersSigner, amount: bigint, at: bigint) => {
      const enc = await fhevm.createEncryptedInput(tokenAddress, user.address).add64(amount).encrypt();
      await time.setNextBlockTimestamp(at);
      return token
        .connect(user)
        ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](potAddress, enc.handles[0], enc.inputProof, "0x");
    };
    const t0 = start + 3600n;
    await (await deposit(jimmer, 4_000n * M, t0)).wait();
    await (await deposit(warg, 3_000n * M, t0 + 7_200n)).wait();
    await (await deposit(carol, 9_000n * M, t0 + 86_400n)).wait();
    ok("Hour 1 / hour 3 / day 1 — enc(4,000), enc(3,000), enc(9,000). Different money, different clocks.");

    const principalBefore = await totalPrincipal();
    info(`[mock-only inspection] Total principal the pot owes its savers: ${usd(principalBefore)} USDC. Remember it.`);

    // 4. The sponsor can still change their mind — until the prize is committed
    await (await pot.connect(employer).defundPrize(200n * M)).wait();
    ok(`The employer trims the prize back to ${usd(await pot.prizeAmountOf(1))} — money in, money out, while it's open`);

    // 5. Payday: the prize locks, then the random commits it for good
    await time.increaseTo(end);
    await (await pot.connect(keeper).beginSnapshot()).wait();
    await (await pot.connect(keeper).snapshotBatch(32)).wait();
    ok("Payday. The keeper freezes all 3 weights — the draw will use THESE, whatever happens next.");
    try {
      await pot.connect(employer).fundPrize(100n * M);
      throw new Error("BUG: the prize grew after the epoch closed!");
    } catch (e) {
      if ((e as Error).message.includes("BUG")) throw e;
      no("The employer tries to top up after payday → WrongPhase. The pool is what it was at the bell.");
    }
    info("Withdrawing it is still allowed here — that stays open until the random lands (the pause escape hatch).");

    await (await pot.connect(keeper).requestRandom()).wait();
    try {
      await pot.connect(employer).defundPrize(1n * M);
      throw new Error("BUG: the employer clawed back a committed prize!");
    } catch (e) {
      if ((e as Error).message.includes("BUG")) throw e;
      no("Random drawn → the employer tries to claw the prize back → WrongPhase. Committed is committed.");
    }

    // 6. The scan finishes and the epoch settles itself — same tx
    const scanTx = await pot.connect(signers[9]).selectBatch(32);
    const scanReceipt = (await scanTx.wait())!;
    const settled = scanReceipt.logs.some((l) => {
      try {
        return pot.interface.parseLog(l)?.name === "EpochSettled";
      } catch {
        return false;
      }
    });
    if (!settled) throw new Error("BUG: the scan finished without settling the epoch!");
    if ((await pot.epochInfo(1)).phase !== 3n) throw new Error("BUG: the epoch did not reach Settled!");
    ok("A wallet nobody has seen finishes the scan → the epoch SETTLES in the same tx. No admin closes it.");

    // 7. Each saver learns their OWN outcome — and only their own
    const prize = await pot.prizeAmountOf(1);
    const pending: bigint[] = [];
    for (const user of savers) {
      pending.push(
        await fhevm.userDecryptEuint(FhevmType.euint64, await pot.pendingPrizeOf(user.address), potAddress, user),
      );
    }
    const winners = pending.filter((p) => p > 0n).length;
    if (winners !== 1) throw new Error(`DRAW BROKEN: expected exactly 1 winner, got ${winners}`);
    const w = pending.findIndex((p) => p > 0n);
    if (pending[w] !== prize) throw new Error(`DRAW BROKEN: winner holds ${pending[w]}, prize was ${prize}`);
    ok(`Each saver decrypts their own line and sees the truth: ${names[w]} → ${usd(pending[w])}, the others → 0`);
    info("Three identical-looking transactions produced it. The chain never wrote the winner's name.");

    for (const [who, whoName] of [
      [employer, "The employer"],
      [keeper, "The keeper"],
      [deployer, "The owner"],
    ] as Array<[HardhatEthersSigner, string]>) {
      try {
        await fhevm.userDecryptEuint(FhevmType.euint64, await pot.pendingPrizeOf(savers[w].address), potAddress, who);
        throw new Error(`PRIVACY BREACH: ${whoName} read a user's winnings!`);
      } catch (e) {
        if ((e as Error).message.includes("PRIVACY BREACH")) throw e;
        no(`${whoName} tries to read ${names[w]}'s winnings → DENIED by ACL`);
      }
    }

    // 8. The owner pauses. The winner gets paid anyway. (non-negotiable #1)
    await (await pot.connect(deployer).pause()).wait();
    const walletBefore = await walletOf(savers[w]);
    const winnerClaim = (await (await pot.connect(savers[w]).claim()).wait())!;
    const walletAfter = await walletOf(savers[w]);
    if (walletAfter - walletBefore !== prize) {
      throw new Error(`BUG: claim moved ${walletAfter - walletBefore}, expected ${prize}`);
    }
    ok(`Owner pauses the pot → ${names[w]} claims ANYWAY: +${usd(prize)} USDC. Claim is never pausable.`);
    await (await pot.connect(deployer).unpause()).wait();

    // 9. Claiming twice pays nothing, and a non-winner's claim is the same tx
    const walletAfterSecond = await (async () => {
      await (await pot.connect(savers[w]).claim()).wait();
      return walletOf(savers[w]);
    })();
    if (walletAfterSecond !== walletAfter) throw new Error("BUG: the winner was paid twice!");
    ok("R9 — the same winner claims a second time: the transfer moves 0. Paid exactly once, no revert.");

    const loser = savers[(w + 1) % 3];
    const loserName = names[(w + 1) % 3];
    const loserBefore = await walletOf(loser);
    const loserClaim = (await (await pot.connect(loser).claim()).wait())!;
    if ((await walletOf(loser)) !== loserBefore) throw new Error(`BUG: ${loserName} was paid without winning!`);
    if (loserClaim.gasUsed !== winnerClaim.gasUsed) {
      throw new Error(`PRIVACY BREACH: winning costs ${winnerClaim.gasUsed} gas, losing costs ${loserClaim.gasUsed}`);
    }
    ok(
      `${loserName} claims too — moves 0, doesn't revert, and burns EXACTLY ` +
        `${winnerClaim.gasUsed.toLocaleString("en-US")} gas: the same as the winner`,
    );
    info("One data-independent code path. An observer watching gas cannot tell a payout from a no-op.");

    // 10. The prize never touched the savings
    const principalAfter = await totalPrincipal();
    if (principalAfter !== principalBefore) {
      throw new Error(`BUG: the prize flow changed principal from ${principalBefore} to ${principalAfter}`);
    }
    ok(`[mock-only inspection] Principal owed after the whole prize flow: ${usd(principalAfter)} — unchanged, to the unit`);

    // 11. Everyone goes home with everything
    for (const [i, user] of savers.entries()) {
      await (await pot.connect(user).withdrawAll()).wait();
      const wallet = await walletOf(user);
      const expected = 10_000n * M + (i === w ? prize : 0n);
      if (wallet !== expected) throw new Error(`BUG: ${names[i]} ended with ${wallet}, expected ${expected}`);
    }
    ok(`All three withdraw: everyone is back to their full 10,000 — and the winner is ${usd(prize)} ahead`);
    const dust = await potBalance();
    if (dust !== 0n) throw new Error(`BUG: the pot kept ${dust} behind!`);
    ok("[mock-only inspection] The pot's balance is exactly 0. Nothing stuck, nothing swept, no admin key needed.");

    // 12. Next payday
    await (await pot.connect(signers[9]).startNewEpoch()).wait();
    const e2 = await pot.epochInfo(2);
    if (e2.phase !== 0n) throw new Error("BUG: the new epoch did not open!");
    await (await deposit(jimmer, 1_000n * M, BigInt(await time.latest()) + 60n)).wait();
    ok(`Any wallet opens epoch 2 → deposits are live again (Jimmer is already back in). Weights reset, savings did not.`);

    line("\n  ━━━ Day 5: protocol complete — public prize in, private winner out, every principal home ━━━\n");
  });
});
