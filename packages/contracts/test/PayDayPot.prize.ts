import { FhevmType } from "@fhevm/hardhat-plugin";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";

import { PayDayPot, TestConfidentialUSDC, TestUSDC } from "../types";

type Signers = {
  deployer: HardhatEthersSigner; // also the owner
  jimmer: HardhatEthersSigner;
  warg: HardhatEthersSigner;
  carol: HardhatEthersSigner;
  employer: HardhatEthersSigner;
  keeper: HardhatEthersSigner;
};

const M = 1_000_000n; // 6 decimals
const EPOCH_DURATION = 7n * 24n * 3600n;
const PER_USER_CAP = 10_000n * M;
const PARTICIPANT_CAP = 32;

const PHASE = { Open: 0n, Snapshotting: 1n, Drawing: 2n, Settled: 3n } as const;

describe("PayDayPot — prize funding, claim & epoch lifecycle (Day 5)", function () {
  let signers: Signers;
  let usdc: TestUSDC;
  let token: TestConfidentialUSDC;
  let pot: PayDayPot;
  let tokenAddress: string;
  let potAddress: string;

  let S: bigint; // epoch 1 start
  let E: bigint; // epoch 1 end
  let t0: bigint; // canonical "early" deposit time: S + 1h

  before(async function () {
    const s = await ethers.getSigners();
    signers = {
      deployer: s[0],
      jimmer: s[1],
      warg: s[2],
      carol: s[3],
      employer: s[4],
      keeper: s[5],
    };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      this.skip();
    }
    usdc = await (await ethers.getContractFactory("TestUSDC")).deploy();
    token = await (await ethers.getContractFactory("TestConfidentialUSDC")).deploy(await usdc.getAddress());
    tokenAddress = await token.getAddress();
    pot = await (
      await ethers.getContractFactory("PayDayPot")
    ).deploy(tokenAddress, signers.employer.address, EPOCH_DURATION, PER_USER_CAP, PARTICIPANT_CAP);
    potAddress = await pot.getAddress();

    const info = await pot.epochInfo(1);
    S = info.start;
    E = info.end;
    t0 = S + 3600n;

    for (const user of [signers.jimmer, signers.warg, signers.carol]) {
      await usdc.mint(user.address, 25_000n * M);
      await usdc.connect(user).approve(tokenAddress, 25_000n * M);
      await token.connect(user).wrap(user.address, 25_000n * M);
    }
  });

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  async function depositAt(user: HardhatEthersSigner, amount: bigint, ts: bigint) {
    const enc = await fhevm.createEncryptedInput(tokenAddress, user.address).add64(amount).encrypt();
    await time.setNextBlockTimestamp(ts);
    return token
      .connect(user)
      ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](potAddress, enc.handles[0], enc.inputProof, "0x");
  }

  async function ensureAt(target: bigint) {
    if (BigInt(await time.latest()) < target) {
      await time.increaseTo(target);
    }
  }

  /** Open → Snapshotting → Drawing (drawn == false). The D3 escape window. */
  async function finishSnapshot() {
    await ensureAt((await pot.epochInfo(await pot.currentEpochId())).end);
    await pot.beginSnapshot();
    if ((await pot.participantCount()) > 0n) {
      await pot.snapshotBatch(32);
    }
  }

  /** Drawing → Settled: randomness plus a single clamped scan sweep. */
  async function runDraw() {
    await pot.connect(signers.keeper).requestRandom();
    await pot.connect(signers.keeper).selectBatch(32);
  }

  /**
   * Employer funding, exactly as a real sponsor does it: acquire public USDC,
   * approve the pot, then fundPrize. Two txs on purpose (R13) — the pot pulls
   * a REVERTING ERC-20 rather than accepting a clamping confidential transfer.
   */
  async function fund(amount: bigint, sponsor: HardhatEthersSigner = signers.employer) {
    await usdc.mint(sponsor.address, amount);
    await usdc.connect(sponsor).approve(potAddress, amount);
    return pot.connect(sponsor).fundPrize(amount);
  }

  /** [mock-only inspection] — bypasses ACL; never a product path. */
  async function debugDecrypt(handle: string): Promise<bigint> {
    return handle === ethers.ZeroHash ? 0n : fhevm.debugger.decryptEuint(FhevmType.euint64, handle);
  }

  async function debugDecryptBool(handle: string): Promise<boolean> {
    return fhevm.debugger.decryptEbool(handle);
  }

  /** The real product path: EIP-712 user decryption of one's own winnings. */
  async function pendingOf(user: HardhatEthersSigner): Promise<bigint> {
    const handle = await pot.pendingPrizeOf(user.address);
    return fhevm.userDecryptEuint(FhevmType.euint64, handle, potAddress, user);
  }

  async function walletOf(user: HardhatEthersSigner): Promise<bigint> {
    const handle = await token.confidentialBalanceOf(user.address);
    return fhevm.userDecryptEuint(FhevmType.euint64, handle, tokenAddress, user);
  }

  async function principalOf(user: HardhatEthersSigner): Promise<bigint> {
    return debugDecrypt(await pot.principalOf(user.address));
  }

  async function potBalance(): Promise<bigint> {
    return debugDecrypt(await token.confidentialBalanceOf(potAddress));
  }

  async function phaseOf(epochId: bigint): Promise<bigint> {
    return (await pot.epochInfo(epochId)).phase;
  }

  /**
   * A draw with a DETERMINISTIC outcome despite an unpredictable R (quirk #17):
   * jimmer is the only participant holding weight, warg registers through a
   * deposit the encrypted cap refunds in full and ends the epoch at weight 0.
   * ticket = ⌊R·T/2^64⌋ < T for every R < 2^64, so the first — and only —
   * positive-weight participant always crosses. jimmer wins, warg never does.
   */
  async function soleWinnerSetup() {
    await depositAt(signers.jimmer, 4_000n * M, t0);
    await depositAt(signers.warg, PER_USER_CAP + 1n, t0 + 3_600n);
  }

  // ===================================================================
  // Employer funding
  // ===================================================================

  describe("employer funding", function () {
    it("moves PUBLIC usdc in, wraps it in the same tx, and publishes the prize amount", async function () {
      expect(await pot.prizeAmountOf(1)).to.eq(0n);

      await expect(fund(1_000n * M)).to.emit(pot, "PrizeFunded").withArgs(1n);

      // Prize size is public by design (P-4) — only user balances are secret.
      expect(await pot.prizeAmountOf(1)).to.eq(1_000n * M);
      // The underlying left the sponsor and is now locked in the wrapper; the
      // pot holds the confidential claim on it.
      expect(await usdc.balanceOf(signers.employer.address)).to.eq(0n);
      expect(await usdc.balanceOf(potAddress)).to.eq(0n);
      expect(await usdc.balanceOf(tokenAddress)).to.eq(76_000n * M); // 75k wrapped by savers + 1k prize
      expect(await potBalance()).to.eq(1_000n * M);
    });

    it("top-ups accumulate within the open epoch", async function () {
      await fund(1_000n * M);
      await fund(250n * M);
      expect(await pot.prizeAmountOf(1)).to.eq(1_250n * M);
      expect(await potBalance()).to.eq(1_250n * M);
    });

    it("only the employer may fund — the owner, a keeper and a saver are all refused", async function () {
      for (const stranger of [signers.deployer, signers.keeper, signers.jimmer]) {
        await usdc.mint(stranger.address, 100n * M);
        await usdc.connect(stranger).approve(potAddress, 100n * M);
        await expect(pot.connect(stranger).fundPrize(100n * M))
          .to.be.revertedWithCustomError(pot, "NotEmployer")
          .withArgs(stranger.address);
      }
      expect(await pot.prizeAmountOf(1)).to.eq(0n);
    });

    it("fundPrize(0) reverts InvalidAmount", async function () {
      await expect(pot.connect(signers.employer).fundPrize(0)).to.be.revertedWithCustomError(pot, "InvalidAmount");
    });

    it("R12 — a sponsor who cannot cover the amount reverts in PLAINTEXT; nothing is allocated", async function () {
      // The whole reason funding is an ERC-20 pull: a confidential transfer
      // would clamp a short balance to encrypted zero and let the pot promise
      // a prize no token backs — the winner would then be paid out of someone
      // else's principal (non-negotiable #1).
      await usdc.mint(signers.employer.address, 400n * M);
      await usdc.connect(signers.employer).approve(potAddress, 1_000n * M);

      await expect(pot.connect(signers.employer).fundPrize(1_000n * M)).to.be.revertedWithCustomError(
        usdc,
        "ERC20InsufficientBalance",
      );

      expect(await pot.prizeAmountOf(1)).to.eq(0n);
      expect(await potBalance()).to.eq(0n);
      expect(await usdc.balanceOf(signers.employer.address)).to.eq(400n * M);
    });

    it("R13 — funding without an ERC-20 approval reverts (the sponsor panel's step 1 of 2)", async function () {
      await usdc.mint(signers.employer.address, 1_000n * M);
      await expect(pot.connect(signers.employer).fundPrize(1_000n * M)).to.be.revertedWithCustomError(
        usdc,
        "ERC20InsufficientAllowance",
      );
    });

    it("is pausable — funding is money IN, like a deposit", async function () {
      await pot.connect(signers.deployer).pause();
      await usdc.mint(signers.employer.address, 1_000n * M);
      await usdc.connect(signers.employer).approve(potAddress, 1_000n * M);
      await expect(pot.connect(signers.employer).fundPrize(1_000n * M)).to.be.revertedWithCustomError(
        pot,
        "EnforcedPause",
      );

      await pot.connect(signers.deployer).unpause();
      await expect(pot.connect(signers.employer).fundPrize(1_000n * M)).to.emit(pot, "PrizeFunded");
    });

    it("defund returns the prize to the employer as confidential tokens", async function () {
      await fund(1_000n * M);

      await expect(pot.connect(signers.employer).defundPrize(600n * M))
        .to.emit(pot, "PrizeDefunded")
        .withArgs(1n);

      expect(await pot.prizeAmountOf(1)).to.eq(400n * M);
      expect(await potBalance()).to.eq(400n * M);
      // The employer holds a normal confidential balance and can unwrap it
      // outside the pot (ERC-7984 unwrap is an async 2-tx dance we never enter).
      expect(await walletOf(signers.employer)).to.eq(600n * M);
    });

    it("defund above the funded amount reverts — the pot never over-refunds a sponsor", async function () {
      await fund(1_000n * M);
      await expect(pot.connect(signers.employer).defundPrize(1_000n * M + 1n)).to.be.revertedWithCustomError(
        pot,
        "InvalidAmount",
      );
      await expect(pot.connect(signers.employer).defundPrize(0)).to.be.revertedWithCustomError(pot, "InvalidAmount");
      expect(await pot.prizeAmountOf(1)).to.eq(1_000n * M);
    });

    it("only the employer may defund", async function () {
      await fund(1_000n * M);
      for (const stranger of [signers.deployer, signers.keeper, signers.jimmer]) {
        await expect(pot.connect(stranger).defundPrize(100n * M))
          .to.be.revertedWithCustomError(pot, "NotEmployer")
          .withArgs(stranger.address);
      }
    });

    it("D3 — defund works WHILE PAUSED: the sponsor's exit must outlive the pause", async function () {
      // If the owner pauses and walks away, user principal still leaves via
      // withdrawAll (#1). The prize needs the same guarantee, or a paused pool
      // becomes a money trap for the employer too.
      await fund(1_000n * M);
      await pot.connect(signers.deployer).pause();

      await expect(pot.connect(signers.employer).defundPrize(1_000n * M)).to.emit(pot, "PrizeDefunded");
      expect(await pot.prizeAmountOf(1)).to.eq(0n);
      expect(await walletOf(signers.employer)).to.eq(1_000n * M);
    });
  });

  // ===================================================================
  // The carry-commit gate — the P0 that closes the "defund a promise" hole
  // ===================================================================

  describe("the carry-commit gate", function () {
    it("B2 — once the randomness is drawn, neither fund nor defund can move the prize", async function () {
      await soleWinnerSetup();
      await fund(1_000n * M);
      await finishSnapshot();
      await pot.connect(signers.keeper).requestRandom();

      // The award handle is frozen at requestRandom, so a mid-scan change
      // would let two batches see two different prizes: double liability.
      await usdc.mint(signers.employer.address, 500n * M);
      await usdc.connect(signers.employer).approve(potAddress, 500n * M);
      await expect(pot.connect(signers.employer).fundPrize(500n * M)).to.be.revertedWithCustomError(
        pot,
        "WrongPhase",
      );
      await expect(pot.connect(signers.employer).defundPrize(500n * M)).to.be.revertedWithCustomError(
        pot,
        "WrongPhase",
      );

      // …and it stays frozen after the scan, too.
      await pot.connect(signers.keeper).selectBatch(32);
      await expect(pot.connect(signers.employer).defundPrize(500n * M)).to.be.revertedWithCustomError(
        pot,
        "WrongPhase",
      );
      expect(await pot.prizeAmountOf(1)).to.eq(1_000n * M);
    });

    it("D3 — defund still works at Drawing-before-random, the one window a stalled pool needs", async function () {
      await soleWinnerSetup();
      await fund(1_000n * M);
      await finishSnapshot();
      expect(await phaseOf(1n)).to.eq(PHASE.Drawing);

      // The Day 4 limitation: an owner who pauses here and renounces freezes
      // the draw forever. Users still withdraw; this is the sponsor's way out.
      await pot.connect(signers.deployer).pause();
      await expect(pot.connect(signers.keeper).requestRandom()).to.be.revertedWithCustomError(pot, "EnforcedPause");
      await expect(pot.connect(signers.employer).defundPrize(1_000n * M)).to.emit(pot, "PrizeDefunded");

      expect(await pot.prizeAmountOf(1)).to.eq(0n);
      expect(await walletOf(signers.employer)).to.eq(1_000n * M);
      // Nothing was taken from the savers to do it.
      expect(await potBalance()).to.eq(4_000n * M);
    });

    it("funding closes at beginSnapshot — a late top-up belongs to the next epoch, not this one", async function () {
      await soleWinnerSetup();
      await fund(1_000n * M);
      await ensureAt(E);
      await pot.beginSnapshot();
      expect(await phaseOf(1n)).to.eq(PHASE.Snapshotting);

      await usdc.mint(signers.employer.address, 500n * M);
      await usdc.connect(signers.employer).approve(potAddress, 500n * M);
      await expect(pot.connect(signers.employer).fundPrize(500n * M)).to.be.revertedWithCustomError(
        pot,
        "WrongPhase",
      );
    });

    it("F1 — an empty epoch commits its prize to the carry, and defund cannot claw it back", async function () {
      // The subtle one. The empty-pool fast path settles WITHOUT ever setting
      // `drawn`, so a gate written as `!ep.drawn` alone would wave this
      // through — and the carry would then be promising money the pot no
      // longer holds.
      await fund(1_000n * M);
      await ensureAt(E);
      await pot.beginSnapshot();
      expect(await phaseOf(1n)).to.eq(PHASE.Settled);
      expect(await pot.drawProgress(1)).to.deep.eq([false, 0n, 0n]);

      await expect(pot.connect(signers.employer).defundPrize(1_000n * M)).to.be.revertedWithCustomError(
        pot,
        "WrongPhase",
      );
      expect(await potBalance()).to.eq(1_000n * M);
      expect(await debugDecrypt(await pot.prizeCarry())).to.eq(1_000n * M); // [mock-only]
    });

    it("F2 — and fund cannot orphan fresh money into a settled epoch either", async function () {
      await ensureAt(E);
      await pot.beginSnapshot(); // empty pool → Settled
      await usdc.mint(signers.employer.address, 500n * M);
      await usdc.connect(signers.employer).approve(potAddress, 500n * M);
      await expect(pot.connect(signers.employer).fundPrize(500n * M)).to.be.revertedWithCustomError(
        pot,
        "WrongPhase",
      );
      expect(await usdc.balanceOf(signers.employer.address)).to.eq(500n * M);
    });

    it("F1 end-to-end — the carry a defund could have stolen is paid to the NEXT epoch's winner, and every principal still leaves in full", async function () {
      await fund(1_000n * M);
      await ensureAt(E);
      await pot.beginSnapshot(); // empty → Settled, 1000 into the carry
      await pot.startNewEpoch();

      const e2 = await pot.epochInfo(2);
      await depositAt(signers.jimmer, 4_000n * M, e2.start + 3_600n);
      await depositAt(signers.warg, PER_USER_CAP + 1n, e2.start + 7_200n);
      await fund(500n * M); // epoch 2's own sponsorship
      await finishSnapshot();
      await runDraw();

      // The winner is paid last epoch's stranded prize PLUS this one's.
      expect(await pendingOf(signers.jimmer)).to.eq(1_500n * M);
      expect(await pendingOf(signers.warg)).to.eq(0n);
      expect(await debugDecrypt(await pot.prizeCarry())).to.eq(0n); // [mock-only] carry emptied

      await pot.connect(signers.jimmer).claim();
      await pot.connect(signers.jimmer).withdrawAll();
      await pot.connect(signers.warg).withdrawAll();

      // Exit gate: prize money never came out of anybody's principal.
      expect(await walletOf(signers.jimmer)).to.eq(25_000n * M + 1_500n * M);
      expect(await walletOf(signers.warg)).to.eq(25_000n * M);
      expect(await potBalance()).to.eq(0n);
    });
  });

  // ===================================================================
  // Claim — R9
  // ===================================================================

  describe("claim (R9)", function () {
    beforeEach(async function () {
      await soleWinnerSetup();
      await fund(1_000n * M);
      await finishSnapshot();
      await runDraw();
    });

    it("the winner claims the exact prize, exactly once", async function () {
      expect(await pendingOf(signers.jimmer)).to.eq(1_000n * M);

      await expect(pot.connect(signers.jimmer).claim())
        .to.emit(pot, "PrizeClaimed")
        .withArgs(signers.jimmer.address, 1n);

      expect(await walletOf(signers.jimmer)).to.eq(21_000n * M + 1_000n * M); // 25k − 4k deposited + prize
      expect(await pendingOf(signers.jimmer)).to.eq(0n);
      expect(await potBalance()).to.eq(4_000n * M); // only principal left
    });

    it("a second claim moves encrypted zero — idempotent, never a revert", async function () {
      await pot.connect(signers.jimmer).claim();
      const walletAfterFirst = await walletOf(signers.jimmer);

      await expect(pot.connect(signers.jimmer).claim()).to.emit(pot, "PrizeClaimed");
      expect(await walletOf(signers.jimmer)).to.eq(walletAfterFirst);
      expect(await pendingOf(signers.jimmer)).to.eq(0n);
    });

    it("a non-winner's claim SUCCEEDS and moves zero — a revert here would name the winner", async function () {
      expect(await pendingOf(signers.warg)).to.eq(0n);
      const before = await walletOf(signers.warg);

      await expect(pot.connect(signers.warg).claim())
        .to.emit(pot, "PrizeClaimed")
        .withArgs(signers.warg.address, 1n);

      expect(await walletOf(signers.warg)).to.eq(before);
    });

    it("claim works while paused (non-negotiable #1)", async function () {
      await pot.connect(signers.deployer).pause();
      await expect(pot.connect(signers.jimmer).claim()).to.emit(pot, "PrizeClaimed");
      expect(await walletOf(signers.jimmer)).to.eq(22_000n * M);
    });

    it("claim moves nobody's principal — not the claimer's, not anyone else's", async function () {
      const before = {
        jimmer: await principalOf(signers.jimmer),
        warg: await principalOf(signers.warg),
        total: await debugDecrypt(await pot.totalPrincipal()),
      };

      await pot.connect(signers.jimmer).claim();
      await pot.connect(signers.warg).claim();

      expect(await principalOf(signers.jimmer)).to.eq(before.jimmer);
      expect(await principalOf(signers.warg)).to.eq(before.warg);
      expect(await debugDecrypt(await pot.totalPrincipal())).to.eq(before.total);
      // …and the principal is still fully withdrawable afterwards.
      await pot.connect(signers.jimmer).withdrawAll();
      expect(await walletOf(signers.jimmer)).to.eq(26_000n * M);
    });
  });

  describe("claim — the cases that legitimately revert", function () {
    it("a saver who has never been scanned gets NothingToClaim (a PUBLIC fact, not a verdict)", async function () {
      await depositAt(signers.jimmer, 1_000n * M, t0);
      // No draw has run, so no winnings handle exists for anyone. Whether a
      // scan has happened is public (drawProgress) — this reveals nothing.
      await expect(pot.connect(signers.jimmer).claim()).to.be.revertedWithCustomError(pot, "NothingToClaim");
    });

    it("a wallet that never deposited gets NotRegistered", async function () {
      await expect(pot.connect(signers.carol).claim())
        .to.be.revertedWithCustomError(pot, "NotRegistered")
        .withArgs(signers.carol.address);
    });
  });

  // ===================================================================
  // Uniform claim — the anti-leak argument, measured
  // ===================================================================

  describe("uniform claim", function () {
    it("winner and non-winner claims are indistinguishable: same events, same FHE work", async function () {
      await soleWinnerSetup();
      await fund(1_000n * M);
      await finishSnapshot();
      await runDraw();

      const winner = (await pot.connect(signers.jimmer).claim()).wait();
      const loser = (await pot.connect(signers.warg).claim()).wait();
      const [winReceipt, loseReceipt] = [await winner, await loser];

      const potEvents = (r: NonNullable<Awaited<typeof winReceipt>>) =>
        r.logs.filter((log) => log.address === potAddress).map((log) => pot.interface.parseLog(log)!.name);

      // Same log shape from the pot: an observer sees "someone claimed", full stop.
      expect(potEvents(winReceipt!)).to.deep.eq(["PrizeClaimed"]);
      expect(potEvents(loseReceipt!)).to.deep.eq(potEvents(winReceipt!));

      // Same FHE work: the ops are chosen by the code path, never by the data.
      const winHCU = fhevm.computeTransactionHCU(winReceipt!);
      const loseHCU = fhevm.computeTransactionHCU(loseReceipt!);
      expect(loseHCU.globalHCU).to.eq(winHCU.globalHCU);
      expect(loseHCU.maxHCUDepth).to.eq(winHCU.maxHCUDepth);

      // eslint-disable-next-line no-console
      console.log(
        `      HCU claim: global=${winHCU.globalHCU.toLocaleString("en-US")} depth=${winHCU.maxHCUDepth.toLocaleString("en-US")} | gas winner=${winReceipt!.gasUsed.toLocaleString("en-US")} non-winner=${loseReceipt!.gasUsed.toLocaleString("en-US")}`,
      );
      // And the same gas, to the unit. Nothing about this tx branches on the
      // data: identical opcodes over identically-shaped storage. A gas
      // observer — the strongest passive attacker available onchain — learns
      // nothing here. If a future change breaks this equality it has
      // introduced a side channel, which is exactly when this should fail.
      expect(loseReceipt!.gasUsed).to.eq(winReceipt!.gasUsed);
    });
  });

  // ===================================================================
  // Rollover with a real prize — B4
  // ===================================================================

  describe("rollover (B4)", function () {
    it("nobody holds weight ⇒ nobody is credited and the WHOLE prize rides into the next epoch", async function () {
      // Day 4 proved "no winner ⇒ nobody is credited" with a zero prize.
      // With real money on the table, the question is where it goes.
      await depositAt(signers.jimmer, PER_USER_CAP + 1n, t0); // refunded → weight 0
      await depositAt(signers.warg, PER_USER_CAP + 1n, t0 + 60n); // refunded → weight 0
      await fund(1_000n * M);
      await finishSnapshot();
      await runDraw();

      expect(await debugDecryptBool((await pot.drawStateOf(1)).selectedAny)).to.eq(false); // [mock-only]
      expect(await pendingOf(signers.jimmer)).to.eq(0n);
      expect(await pendingOf(signers.warg)).to.eq(0n);
      expect(await debugDecrypt(await pot.prizeCarry())).to.eq(1_000n * M); // [mock-only]
      expect(await potBalance()).to.eq(1_000n * M); // prize still fully backed

      // Epoch 2: real weight, more sponsorship — the winner takes both.
      await pot.startNewEpoch();
      const e2 = await pot.epochInfo(2);
      await depositAt(signers.jimmer, 4_000n * M, e2.start + 3_600n);
      await fund(500n * M);
      await finishSnapshot();
      await runDraw();

      expect(await pendingOf(signers.jimmer)).to.eq(1_500n * M);
      expect(await pendingOf(signers.warg)).to.eq(0n);
      expect(await debugDecrypt(await pot.prizeCarry())).to.eq(0n); // [mock-only]
    });

    it("two winnerless epochs in a row accumulate — the eventual winner takes the lot", async function () {
      const carryNow = async () => debugDecrypt(await pot.prizeCarry()); // [mock-only]

      // Epoch 1 & 2: registered but weightless, prize funded each time.
      for (const epoch of [1n, 2n]) {
        const info = await pot.epochInfo(epoch);
        await depositAt(signers.jimmer, PER_USER_CAP + 1n, info.start + 3_600n);
        await fund(300n * M);
        await finishSnapshot();
        await runDraw();
        expect(await carryNow(), `carry after epoch ${epoch}`).to.eq(300n * M * epoch);
        await pot.startNewEpoch();
      }

      // Epoch 3: jimmer finally holds a balance.
      const e3 = await pot.epochInfo(3);
      await depositAt(signers.jimmer, 4_000n * M, e3.start + 3_600n);
      await finishSnapshot();
      await runDraw();

      // 300 + 300 carried, 0 funded this epoch.
      expect(await pot.prizeAmountOf(3)).to.eq(0n);
      expect(await pendingOf(signers.jimmer)).to.eq(600n * M);
      expect(await carryNow()).to.eq(0n);

      await pot.connect(signers.jimmer).claim();
      await pot.connect(signers.jimmer).withdrawAll();
      expect(await walletOf(signers.jimmer)).to.eq(25_000n * M + 600n * M);
      expect(await potBalance()).to.eq(0n);
    });
  });

  // ===================================================================
  // Epoch lifecycle
  // ===================================================================

  describe("epoch lifecycle", function () {
    it("startNewEpoch before Settled reverts — no orphaned epoch, no stranded prize (B3)", async function () {
      await soleWinnerSetup();
      await fund(1_000n * M);

      await expect(pot.startNewEpoch()).to.be.revertedWithCustomError(pot, "WrongPhase"); // Open
      await ensureAt(E);
      await pot.beginSnapshot();
      await expect(pot.startNewEpoch()).to.be.revertedWithCustomError(pot, "WrongPhase"); // Snapshotting
      await pot.snapshotBatch(32);
      await expect(pot.startNewEpoch()).to.be.revertedWithCustomError(pot, "WrongPhase"); // Drawing, undrawn
      await pot.connect(signers.keeper).requestRandom();
      await expect(pot.startNewEpoch()).to.be.revertedWithCustomError(pot, "WrongPhase"); // drawn, unscanned
      await pot.connect(signers.keeper).selectBatch(1); // partial scan
      await expect(pot.startNewEpoch()).to.be.revertedWithCustomError(pot, "WrongPhase"); // mid-scan

      await pot.connect(signers.keeper).selectBatch(32);
      await expect(pot.startNewEpoch()).to.emit(pot, "EpochStarted");
    });

    it("resets weight and checkpoint, and touches NEITHER principal NOR unclaimed winnings (B3)", async function () {
      await soleWinnerSetup();
      await fund(1_000n * M);
      await finishSnapshot();
      await runDraw();

      const principals = {
        jimmer: await principalOf(signers.jimmer),
        warg: await principalOf(signers.warg),
      };
      const totalBefore = await debugDecrypt(await pot.totalPrincipal());

      const tx = await pot.connect(signers.keeper).startNewEpoch();
      expect(await pot.currentEpochId()).to.eq(2n);

      const e2 = await pot.epochInfo(2);
      expect(e2.phase).to.eq(PHASE.Open);
      expect(e2.end).to.eq(e2.start + EPOCH_DURATION);
      // The window starts NOW, not at epoch 1's end — a long-delayed draw must
      // not hand the next epoch a stub of a savings window (or none at all).
      expect(e2.start).to.eq(BigInt(await time.latest()));
      expect(e2.start).to.be.greaterThan(E);
      await expect(tx).to.emit(pot, "EpochStarted").withArgs(2n, e2.start, e2.end);

      // Savings roll over untouched — that IS the product.
      expect(await principalOf(signers.jimmer)).to.eq(principals.jimmer);
      expect(await principalOf(signers.warg)).to.eq(principals.warg);
      expect(await debugDecrypt(await pot.totalPrincipal())).to.eq(totalBefore);

      // Unclaimed winnings are a liability that crosses the boundary (B3).
      expect(await pendingOf(signers.jimmer)).to.eq(1_000n * M);

      // Epoch-scoped state is back to zero — and readable, not "unavailable" (#8).
      for (const user of [signers.jimmer, signers.warg]) {
        const area = await pot.twabAreaOf(user.address);
        expect(area).to.not.eq(ethers.ZeroHash);
        expect(await fhevm.userDecryptEuint(FhevmType.euint64, area, potAddress, user)).to.eq(0n);
        expect(await pot.lastCheckpointOf(user.address)).to.eq(e2.start);
      }
      expect(await pot.prizeAmountOf(2)).to.eq(0n);
      expect(await pot.prizeCipherOf(2)).to.eq(ethers.ZeroHash);
    });

    it("two keepers race to open the epoch — one lands it, the other reverts", async function () {
      await soleWinnerSetup();
      await finishSnapshot();
      await runDraw();

      await pot.connect(signers.keeper).startNewEpoch();
      await expect(pot.connect(signers.carol).startNewEpoch()).to.be.revertedWithCustomError(pot, "WrongPhase");
      expect(await pot.currentEpochId()).to.eq(2n);
    });

    it("deposits reopen and a second full draw runs end to end", async function () {
      await soleWinnerSetup();
      await fund(1_000n * M);
      await finishSnapshot();
      await runDraw();
      await pot.startNewEpoch();

      // A fresh saver can still register in epoch 2.
      const e2 = await pot.epochInfo(2);
      await depositAt(signers.carol, 6_000n * M, e2.start + 3_600n);
      expect(await pot.participantCount()).to.eq(3n);
      expect(await principalOf(signers.carol)).to.eq(6_000n * M);

      // jimmer kept 4k in the pot from epoch 1 and re-accrues weight for free.
      await fund(750n * M);
      await finishSnapshot();
      await runDraw();
      expect(await phaseOf(2n)).to.eq(PHASE.Settled);

      // Exactly one winner, paid exactly the epoch-2 pool.
      const pendings = [
        await pendingOf(signers.jimmer),
        await pendingOf(signers.warg),
        await pendingOf(signers.carol),
      ];
      // jimmer still holds epoch 1's unclaimed 1000 on top of anything new.
      const newlyCredited = [pendings[0] - 1_000n * M, pendings[1], pendings[2]];
      expect(newlyCredited.filter((v) => v > 0n).length).to.eq(1);
      expect(newlyCredited.reduce((a, b) => a + b, 0n)).to.eq(750n * M);
    });

    it("B3 — winnings survive the epoch boundary: win, skip the claim, collect next epoch", async function () {
      await soleWinnerSetup();
      await fund(1_000n * M);
      await finishSnapshot();
      await runDraw();

      await pot.startNewEpoch(); // deliberately no claim first
      expect(await pendingOf(signers.jimmer)).to.eq(1_000n * M);

      await expect(pot.connect(signers.jimmer).claim())
        .to.emit(pot, "PrizeClaimed")
        .withArgs(signers.jimmer.address, 2n); // logged against the CURRENT epoch
      expect(await walletOf(signers.jimmer)).to.eq(22_000n * M);
      expect(await pendingOf(signers.jimmer)).to.eq(0n);
    });
  });

  // ===================================================================
  // Privacy
  // ===================================================================

  describe("privacy", function () {
    it("the prize pool and the carry are decryptable by NOBODY — user, employer, keeper or owner (#6)", async function () {
      await soleWinnerSetup();
      await fund(1_000n * M);
      await finishSnapshot();
      await runDraw();

      // Their VALUES would betray whether an earlier epoch found a winner,
      // which is a statement about every participant's balance history.
      const secrets = [await pot.prizeCipherOf(1), await pot.prizeCarry()];
      for (const handle of secrets) {
        for (const who of [signers.jimmer, signers.warg, signers.employer, signers.keeper, signers.deployer]) {
          await expect(fhevm.userDecryptEuint(FhevmType.euint64, handle, potAddress, who)).to.be.rejected;
        }
      }
    });

    it("the employer never gains ACL over a saver's principal, weight or winnings (#3)", async function () {
      await soleWinnerSetup();
      await fund(1_000n * M);
      await finishSnapshot();
      await runDraw();

      const handles = [
        await pot.principalOf(signers.jimmer.address),
        await pot.twabAreaOf(signers.jimmer.address),
        await pot.pendingPrizeOf(signers.jimmer.address),
      ];
      for (const handle of handles) {
        await expect(fhevm.userDecryptEuint(FhevmType.euint64, handle, potAddress, signers.employer)).to.be.rejected;
      }
      // Paying for the prize buys no visibility into who won it: the winner
      // flag is contract-only, so not even jimmer can read his own (§15.1).
      const won = await pot.wonOf(signers.jimmer.address);
      for (const who of [signers.employer, signers.jimmer, signers.deployer]) {
        await expect(fhevm.userDecryptEbool(won, potAddress, who)).to.be.rejected;
      }
    });

    it("no prize or lifecycle event carries an amount — public or encrypted (#5)", async function () {
      await soleWinnerSetup();
      const receipts = [
        await (await fund(1_000n * M)).wait(),
        await (await pot.connect(signers.employer).defundPrize(200n * M)).wait(),
      ];
      await finishSnapshot();
      await runDraw();
      receipts.push(await (await pot.connect(signers.jimmer).claim()).wait());
      receipts.push(await (await pot.startNewEpoch()).wait());

      const allowed = ["PrizeFunded", "PrizeDefunded", "PrizeClaimed", "EpochSettled", "EpochStarted"];
      const e2 = await pot.epochInfo(2);
      for (const receipt of receipts) {
        const potLogs = receipt!.logs.filter((log) => log.address === potAddress);
        expect(potLogs.length).to.be.greaterThan(0);
        for (const log of potLogs) {
          const parsed = pot.interface.parseLog(log)!;
          expect(allowed, `unexpected pot event ${parsed.name}`).to.include(parsed.name);
          if (parsed.name === "EpochStarted") {
            // The only one with a payload, and it is the epoch's own public
            // window — the same two numbers epochInfo already serves.
            expect(parsed.args.slice(1)).to.deep.eq([e2.start, e2.end]);
          } else {
            // Everything else is indexed-only: there is no data word at all
            // to smuggle an amount, a handle, or a winner into.
            expect(log.data, `${parsed.name} carries a data payload`).to.eq("0x");
          }
        }
      }
    });
  });
});
