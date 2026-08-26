import { FhevmType } from "@fhevm/hardhat-plugin";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";

import { PayDayPot, TestConfidentialUSDC, TestUSDC } from "../types";

const M = 1_000_000n;
const PER_USER_CAP = 10_000n * M;
const EPOCH_DURATION = 7n * 24n * 3600n;
const SEED = 0xda72; // fixed seed — reproduce a failure by rerunning with the logged seed
const ROUNDS = 2;
const OPS_PER_ROUND = 20;

const PHASE = { Open: 0n, Snapshotting: 1n, Drawing: 2n, Settled: 3n } as const;

/** Deterministic PRNG so every CI run replays the exact same op sequence. */
function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type UserModel = {
  name: string;
  signer: HardhatEthersSigner;
  wallet: bigint; // confidential token balance
  principal: bigint; // pot balance
  registered: boolean;
};

describe("PayDayPot — solvency property", function () {
  this.timeout(240_000);

  it(`survives ${ROUNDS} epochs × ${OPS_PER_ROUND} random ops without ever becoming insolvent (seed 0x${SEED.toString(16)})`, async function () {
    if (!fhevm.isMock) {
      this.skip();
    }

    const s = await ethers.getSigners();
    const employer = s[4];
    const usdc: TestUSDC = await (await ethers.getContractFactory("TestUSDC")).deploy();
    const token: TestConfidentialUSDC = await (
      await ethers.getContractFactory("TestConfidentialUSDC")
    ).deploy(await usdc.getAddress());
    const tokenAddress = await token.getAddress();
    const pot: PayDayPot = await (
      await ethers.getContractFactory("PayDayPot")
    ).deploy(tokenAddress, employer.address, EPOCH_DURATION, PER_USER_CAP, 32);
    const potAddress = await pot.getAddress();

    // Same funding profile as the deterministic suite — warg is deliberately
    // underfunded so the token-side wallet clamp actually fires.
    const users: UserModel[] = [
      { name: "jimmer", signer: s[1], wallet: 25_000n * M, principal: 0n, registered: false },
      { name: "warg", signer: s[2], wallet: 5_000n * M, principal: 0n, registered: false },
      { name: "carol", signer: s[3], wallet: 20_000n * M, principal: 0n, registered: false },
    ];
    for (const u of users) {
      await usdc.mint(u.signer.address, u.wallet);
      await usdc.connect(u.signer).approve(tokenAddress, u.wallet);
      await token.connect(u.signer).wrap(u.signer.address, u.wallet);
    }
    let employerWallet = 0n; // confidential balance the employer got back from defunds

    const rand = mulberry32(SEED);
    const trace: string[] = [];
    const ctx = () => `\n${trace.join("\n")}`;

    // Coverage counters. A randomized solvency test that never funds a prize,
    // never pays a claim, or never observes the mid-draw window would pass
    // while proving nothing — these are asserted at the end.
    const seen = {
      funded: 0,
      defunded: 0,
      paidClaims: 0,
      capRefunds: 0,
      walletClamps: 0,
      midDrawPrizeOwed: 0,
      winnerEpochs: 0,
      winnerlessEpochs: 0,
    };

    /** 500-token quantized amounts in [0, 12_500e6] — crosses both the 10k cap and warg's 5k wallet. */
    const randAmount = () => BigInt(Math.floor(rand() * 26)) * 500n * M;
    /** Prize amounts in [0, 900e6] — includes 0, which must revert. */
    const randPrize = () => BigInt(Math.floor(rand() * 10)) * 100n * M;

    /** [mock-only] decrypt, treating the uninitialized zero handle as 0. */
    async function dec(handle: string): Promise<bigint> {
      return handle === ethers.ZeroHash ? 0n : fhevm.debugger.decryptEuint(FhevmType.euint64, handle);
    }

    // -----------------------------------------------------------------
    // Ops
    // -----------------------------------------------------------------

    async function opDeposit(u: UserModel, amount: bigint) {
      const enc = await fhevm.createEncryptedInput(tokenAddress, u.signer.address).add64(amount).encrypt();
      await token
        .connect(u.signer)
        ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](potAddress, enc.handles[0], enc.inputProof, "0x");
      // Model — clamp layer 1 (token wallet, all-or-nothing):
      const sent = amount <= u.wallet ? amount : 0n;
      if (sent !== amount) seen.walletClamps++;
      // Model — clamp layer 2 (pot cap, all-or-nothing refund):
      const credited = sent <= PER_USER_CAP - u.principal ? sent : 0n;
      if (sent > 0n && credited === 0n) seen.capRefunds++;
      u.principal += credited;
      u.wallet -= credited;
      u.registered = true; // plaintext-gated: registration sticks even on a zero credit
    }

    async function opWithdraw(u: UserModel, amount: bigint) {
      const enc = await fhevm.createEncryptedInput(potAddress, u.signer.address).add64(amount).encrypt();
      if (!u.registered) {
        await expect(pot.connect(u.signer).withdraw(enc.handles[0], enc.inputProof)).to.be.revertedWithCustomError(
          pot,
          "NotRegistered",
        );
        return;
      }
      await pot.connect(u.signer).withdraw(enc.handles[0], enc.inputProof);
      const actual = amount <= u.principal ? amount : u.principal; // contract-side FHE.min clamp
      u.principal -= actual;
      u.wallet += actual;
    }

    async function opWithdrawAll(u: UserModel) {
      if (!u.registered) {
        await expect(pot.connect(u.signer).withdrawAll()).to.be.revertedWithCustomError(pot, "NotRegistered");
        return;
      }
      await pot.connect(u.signer).withdrawAll();
      u.wallet += u.principal;
      u.principal = 0n;
    }

    /** Employer money in. Reverting ERC-20 pull, so the amount is exact. */
    async function opFund(amount: bigint) {
      if (amount === 0n) {
        await expect(pot.connect(employer).fundPrize(0)).to.be.revertedWithCustomError(pot, "InvalidAmount");
        return;
      }
      await usdc.mint(employer.address, amount);
      await usdc.connect(employer).approve(potAddress, amount);
      await pot.connect(employer).fundPrize(amount);
      seen.funded++;
    }

    /**
     * Employer money out — only while the prize is not yet committed.
     * The amount is drawn from what the epoch actually holds, otherwise
     * every defund would land on the over-withdraw revert and the success
     * path would never run (the first version of this test did exactly that).
     */
    async function opDefund(dice: number) {
      const funded = await pot.prizeAmountOf(await pot.currentEpochId());
      // A quarter of the time — and always when the epoch is unfunded —
      // probe the revert paths instead: zero, or more than is there.
      const probeRevert = dice < 0.25 || funded === 0n;
      const amount = probeRevert ? randPrize() : (funded * BigInt(2 + Math.floor(dice * 3))) / 4n;
      trace.push(`   defund ${amount / M} (of ${funded / M} funded)`);

      if (amount === 0n || amount > funded) {
        await expect(pot.connect(employer).defundPrize(amount)).to.be.revertedWithCustomError(pot, "InvalidAmount");
        return;
      }
      await pot.connect(employer).defundPrize(amount);
      employerWallet += amount;
      seen.defunded++;
    }

    /**
     * Winnings out. Uniform for everyone: the model does not know who won —
     * it reads the encrypted balance first and asserts the transfer matched.
     */
    async function opClaim(u: UserModel) {
      if (!u.registered) {
        await expect(pot.connect(u.signer).claim()).to.be.revertedWithCustomError(pot, "NotRegistered");
        return;
      }
      const handle = await pot.pendingPrizeOf(u.signer.address);
      if (handle === ethers.ZeroHash) {
        await expect(pot.connect(u.signer).claim()).to.be.revertedWithCustomError(pot, "NothingToClaim");
        return;
      }
      const owed = await dec(handle);
      if (owed > 0n) seen.paidClaims++;
      await pot.connect(u.signer).claim();
      expect(await dec(await pot.pendingPrizeOf(u.signer.address)), `claim left a residue (${u.name})${ctx()}`).to.eq(
        0n,
      );
      u.wallet += owed;
    }

    // -----------------------------------------------------------------
    // The invariant: the pot's token balance is EXACTLY what it owes.
    //
    // Purely observational — it derives every prize term from chain state
    // rather than a model, so it cannot agree with a bug by sharing one.
    // The three regimes differ in where the epoch's pool currently lives:
    //   • not yet drawn  → funded prize and carry are both still loose
    //   • drawn, scanning → both are fused into prizeCipher, which is owed
    //                       until someone crosses and it lands in their
    //                       pendingPrize (never both — that is the bug this
    //                       is here to catch)
    //   • settled         → prizeCipher is spent; whatever survived is carry
    // -----------------------------------------------------------------
    async function assertSolvency(label: string) {
      const epochId = await pot.currentEpochId();
      const info = await pot.epochInfo(epochId);
      const prog = await pot.drawProgress(epochId);

      let owed = 0n;
      for (const u of users) {
        if (!u.registered) continue;
        const principal = await dec(await pot.principalOf(u.signer.address));
        expect(principal, `${label}: principal(${u.name})${ctx()}`).to.eq(u.principal);
        expect(u.principal, `${label}: model cap invariant (${u.name})`).to.be.lte(PER_USER_CAP);
        owed += principal + (await dec(await pot.pendingPrizeOf(u.signer.address)));
      }

      const midDraw = prog.drawn && info.phase === PHASE.Drawing;
      if (midDraw) {
        const st = await pot.drawStateOf(epochId);
        const alreadyAwarded = await fhevm.debugger.decryptEbool(st.selectedAny);
        if (!alreadyAwarded) {
          const pool = await dec(await pot.prizeCipherOf(epochId));
          if (pool > 0n) seen.midDrawPrizeOwed++;
          owed += pool;
        }
      } else {
        owed += await dec(await pot.prizeCarry());
        if (info.phase !== PHASE.Settled) owed += await pot.prizeAmountOf(epochId);
      }

      const totalPrincipal = await dec(await pot.totalPrincipal());
      const modelPrincipal = users.reduce((sum, u) => sum + u.principal, 0n);
      expect(totalPrincipal, `${label}: totalPrincipal${ctx()}`).to.eq(modelPrincipal);

      const balance = await dec(await token.confidentialBalanceOf(potAddress));
      expect(balance, `${label}: pot is not solvent${ctx()}`).to.eq(owed);
    }

    /**
     * Close the epoch out: snapshot, draw, scan one participant at a time,
     * reopen. Returns whether the draw found a winner.
     */
    async function runEpochCycle(epochLabel: string): Promise<boolean> {
      const epochId = await pot.currentEpochId();
      await time.increaseTo((await pot.epochInfo(epochId)).end);
      let hadWinner = false;

      trace.push(`-- ${epochLabel}: beginSnapshot`);
      await pot.beginSnapshot();
      await assertSolvency(`${epochLabel} beginSnapshot`);

      const total = Number(await pot.participantCount());
      if (total > 0) {
        await pot.snapshotBatch(32);
        await assertSolvency(`${epochLabel} snapshotBatch`);
        await pot.requestRandom();
        // The riskiest moment: the pool is now fused into prizeCipher while
        // the old carry is still sitting in storage. Counting both would be
        // the double-count bug; counting neither would hide an insolvency.
        await assertSolvency(`${epochLabel} requestRandom`);
        for (let i = 0; i < total; i++) {
          await pot.selectBatch(1);
          await assertSolvency(`${epochLabel} selectBatch #${i + 1}`);
        }
        hadWinner = await fhevm.debugger.decryptEbool((await pot.drawStateOf(epochId)).selectedAny); // [mock-only]
        if (hadWinner) seen.winnerEpochs++;
        else seen.winnerlessEpochs++;
      }

      expect((await pot.epochInfo(epochId)).phase, `${epochLabel}: did not settle`).to.eq(PHASE.Settled);
      await pot.startNewEpoch();
      await assertSolvency(`${epochLabel} startNewEpoch`);
      return hadWinner;
    }

    // -----------------------------------------------------------------
    // Run
    // -----------------------------------------------------------------

    for (let round = 0; round < ROUNDS; round++) {
      // Each epoch opens with the employer sponsoring it, the way it happens
      // in production. Also guarantees the random defund op has something to
      // bite into — left to chance, it only ever hit the revert path.
      trace.push(`r${round} opening sponsorship`);
      await opFund(500n * M);
      await assertSolvency(`r${round} opening sponsorship`);

      for (let i = 0; i < OPS_PER_ROUND; i++) {
        const u = users[Math.floor(rand() * users.length)];
        const dice = rand();
        if (dice < 0.34) {
          const amount = randAmount();
          trace.push(`r${round}#${i} deposit ${u.name} ${amount / M}`);
          await opDeposit(u, amount);
        } else if (dice < 0.56) {
          const amount = randAmount();
          trace.push(`r${round}#${i} withdraw ${u.name} ${amount / M}`);
          await opWithdraw(u, amount);
        } else if (dice < 0.66) {
          trace.push(`r${round}#${i} withdrawAll ${u.name}`);
          await opWithdrawAll(u);
        } else if (dice < 0.82) {
          const amount = randPrize();
          trace.push(`r${round}#${i} fund ${amount / M}`);
          await opFund(amount);
        } else if (dice < 0.92) {
          trace.push(`r${round}#${i} defund`);
          await opDefund(rand());
        } else {
          trace.push(`r${round}#${i} claim ${u.name}`);
          await opClaim(u);
        }
        await assertSolvency(`r${round} after op #${i}`);
      }
      await runEpochCycle(`epoch ${round + 1}`);
    }

    // ---------------------------------------------------------------------
    // Winnerless finale — the carry path, made deterministic.
    //
    // Random ops are unlikely to ever produce a zero-weight draw, so the
    // carry term of the invariant would stay 0 and a bug that drops the
    // rollover would pass unseen. Force it: drain every principal, cycle once
    // so the drained state becomes the NEXT epoch's starting point, then fund
    // an epoch in which every participant is registered but weightless.
    // (Distinct from the D9 empty-pool path — here the scan really runs.)
    // ---------------------------------------------------------------------
    for (const u of users) {
      if (u.registered) await opWithdrawAll(u);
    }
    await runEpochCycle("drain epoch");
    for (const u of users) {
      expect(u.principal, `drain epoch left principal behind (${u.name})`).to.eq(0n);
    }
    expect(await pot.participantCount(), "the weightless epoch needs registered participants").to.be.greaterThan(0n);

    const carryBefore = await dec(await pot.prizeCarry());
    await opFund(700n * M);
    const wonWeightless = await runEpochCycle("weightless epoch");
    expect(wonWeightless, "a zero-weight epoch must not produce a winner").to.eq(false);
    expect(await dec(await pot.prizeCarry()), `the weightless epoch's prize did not roll over${ctx()}`).to.eq(
      carryBefore + 700n * M,
    );

    // Everyone exits: principals and winnings alike. The pot must end holding
    // nothing but the employer's money — the strongest statement of "the prize
    // never came out of the savings".
    for (const u of users) {
      if (!u.registered) continue;
      await opClaim(u);
      await opWithdrawAll(u);
    }
    // A final winnerless-epoch carry may remain; the employer's stake is the
    // only thing that can still be sitting in the pot.
    const residual = await dec(await token.confidentialBalanceOf(potAddress));
    const carry = await dec(await pot.prizeCarry());
    const openPrize = await pot.prizeAmountOf(await pot.currentEpochId());
    expect(residual, `final residue is prize money only${ctx()}`).to.eq(carry + openPrize);

    // Final sweep through the REAL user-decrypt path (EIP-712), not the debugger:
    // proves the product-facing ACL story end to end.
    for (const u of users) {
      const wallet = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        await token.confidentialBalanceOf(u.signer.address),
        tokenAddress,
        u.signer,
      );
      expect(wallet, `final: wallet(${u.name})${ctx()}`).to.eq(u.wallet);
      if (u.registered) {
        const principal = await fhevm.userDecryptEuint(
          FhevmType.euint64,
          await pot.principalOf(u.signer.address),
          potAddress,
          u.signer,
        );
        expect(principal, `final: principal(${u.name})${ctx()}`).to.eq(0n);
      }
    }
    const employerBalance = await dec(await token.confidentialBalanceOf(employer.address));
    expect(employerBalance, `final: employer wallet${ctx()}`).to.eq(employerWallet);

    // Conservation across the whole run: every confidential token that was
    // ever minted is now held by exactly one of the four parties.
    const minted = await dec(await token.confidentialTotalSupply());
    const held =
      users.reduce((sum, u) => sum + u.wallet, 0n) + employerWallet + residual;
    expect(minted, `final: token supply is fully accounted for${ctx()}`).to.eq(held);

    // Coverage: prove the run actually visited the states it claims to cover.
    // Without this a degenerate op sequence (never funds, never wins, never
    // claims) would report a green solvency property that tested nothing.
    console.log(`      coverage: ${JSON.stringify(seen)}`);
    expect(seen.funded, `no prize was ever funded${ctx()}`).to.be.greaterThan(0);
    expect(seen.defunded, `no prize was ever defunded${ctx()}`).to.be.greaterThan(0);
    expect(seen.walletClamps, `the token wallet clamp never fired${ctx()}`).to.be.greaterThan(0);
    expect(seen.capRefunds, `the per-user cap refund never fired${ctx()}`).to.be.greaterThan(0);
    expect(seen.midDrawPrizeOwed, `never observed a live prize mid-scan${ctx()}`).to.be.greaterThan(0);
    expect(seen.paidClaims, `no claim ever paid out${ctx()}`).to.be.greaterThan(0);
    expect(seen.winnerEpochs, `no epoch ever produced a winner${ctx()}`).to.be.greaterThan(0);
    expect(seen.winnerlessEpochs, `no epoch ever rolled its prize over${ctx()}`).to.be.greaterThan(0);
  });
});
