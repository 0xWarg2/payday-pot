import { FhevmType } from "@fhevm/hardhat-plugin";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";

import { PayDayPot, TestConfidentialUSDC, TestUSDC } from "../types";

type Signers = {
  deployer: HardhatEthersSigner;
  jimmer: HardhatEthersSigner;
  warg: HardhatEthersSigner;
  carol: HardhatEthersSigner;
  employer: HardhatEthersSigner;
};

const M = 1_000_000n; // 6 decimals
const EPOCH_DURATION = 7n * 24n * 3600n;
const PER_USER_CAP = 10_000n * M;
const PARTICIPANT_CAP = 32;

// EpochPhase enum — mirrors PayDayPot.EpochPhase order.
const PHASE = { Open: 0n, Snapshotting: 1n, Drawing: 2n, Settled: 3n } as const;

describe("PayDayPot — encrypted TWAB (Day 3)", function () {
  let signers: Signers;
  let usdc: TestUSDC;
  let token: TestConfidentialUSDC;
  let pot: PayDayPot;
  let tokenAddress: string;
  let potAddress: string;

  // Epoch 1 window, read back from the chain each deploy.
  let S: bigint; // epoch start
  let E: bigint; // epoch end
  let t0: bigint; // canonical "early" deposit time: S + 1h (funding txs live in S..S+~10)
  let tMid: bigint; // exact midpoint of [t0, E] — (E - t0) = 601200 is even by construction

  before(async function () {
    const s = await ethers.getSigners();
    signers = { deployer: s[0], jimmer: s[1], warg: s[2], carol: s[3], employer: s[4] };
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
    tMid = t0 + (E - t0) / 2n; // (E - t0) = 604800 - 3600 = 601200, always even

    const funding: Array<[HardhatEthersSigner, bigint]> = [
      [signers.jimmer, 25_000n * M],
      [signers.warg, 5_000n * M],
      [signers.carol, 20_000n * M],
    ];
    for (const [user, amount] of funding) {
      await usdc.mint(user.address, amount);
      await usdc.connect(user).approve(tokenAddress, amount);
      await token.connect(user).wrap(user.address, amount);
    }
  });

  // -------------------------------------------------------------------
  // Helpers — every mutating tx is pinned with setNextBlockTimestamp so
  // all TWAB assertions are EXACT bigint equalities, never approximations.
  // -------------------------------------------------------------------

  /** Deposit pinned at `ts`. Input is encrypted BEFORE pinning the block. */
  async function depositAt(user: HardhatEthersSigner, amount: bigint, ts: bigint) {
    const enc = await fhevm.createEncryptedInput(tokenAddress, user.address).add64(amount).encrypt();
    await time.setNextBlockTimestamp(ts);
    return token
      .connect(user)
      ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](potAddress, enc.handles[0], enc.inputProof, "0x");
  }

  /** Partial withdraw pinned at `ts` (proof binds to the pot). */
  async function withdrawAt(user: HardhatEthersSigner, amount: bigint, ts: bigint) {
    const enc = await fhevm.createEncryptedInput(potAddress, user.address).add64(amount).encrypt();
    await time.setNextBlockTimestamp(ts);
    return pot.connect(user).withdraw(enc.handles[0], enc.inputProof);
  }

  async function withdrawAllAt(user: HardhatEthersSigner, ts: bigint) {
    await time.setNextBlockTimestamp(ts);
    return pot.connect(user).withdrawAll();
  }

  /** Move chain time to `target` unless it is already there or past it. */
  async function ensureAt(target: bigint) {
    if (BigInt(await time.latest()) < target) {
      await time.increaseTo(target);
    }
  }

  /** Whole snapshot in one sweep: begin + single clamped batch. */
  async function finishSnapshot() {
    await ensureAt(E);
    await pot.beginSnapshot();
    if ((await pot.participantCount()) > 0n) {
      await pot.snapshotBatch(32);
    }
  }

  async function decryptTwab(user: HardhatEthersSigner): Promise<bigint> {
    const handle = await pot.twabAreaOf(user.address);
    return fhevm.userDecryptEuint(FhevmType.euint64, handle, potAddress, user);
  }

  async function decryptPrincipal(user: HardhatEthersSigner): Promise<bigint> {
    const handle = await pot.principalOf(user.address);
    return fhevm.userDecryptEuint(FhevmType.euint64, handle, potAddress, user);
  }

  async function decryptWallet(user: HardhatEthersSigner): Promise<bigint> {
    const handle = await token.confidentialBalanceOf(user.address);
    return fhevm.userDecryptEuint(FhevmType.euint64, handle, tokenAddress, user);
  }

  /** Mock-only ACL bypass — invariant inspection in tests, never a product path. */
  async function debugDecrypt(handle: string): Promise<bigint> {
    return fhevm.debugger.decryptEuint(FhevmType.euint64, handle);
  }

  async function phaseOf(epochId: bigint): Promise<bigint> {
    return (await pot.epochInfo(epochId)).phase;
  }

  // -------------------------------------------------------------------
  // Accrual & freeze — weight = encrypted principal × public time,
  // frozen exactly at epochEnd (P-1: raw area IS the weight, no division).
  // -------------------------------------------------------------------

  describe("accrual & freeze", function () {
    it("same amount, half the time ⇒ exactly half the weight (2:1)", async function () {
      const { jimmer, warg } = signers;
      await depositAt(jimmer, 100n * M, t0);
      await depositAt(warg, 100n * M, tMid);
      await finishSnapshot();

      const areaJimmer = await decryptTwab(jimmer);
      const areaWarg = await decryptTwab(warg);
      expect(areaJimmer).to.eq(100n * M * (E - t0));
      expect(areaWarg).to.eq(100n * M * (E - tMid));
      expect(areaJimmer).to.eq(2n * areaWarg); // (E - t0) == 2 × (E - tMid) by construction
    });

    it("50 early + 50 at the exact midpoint ≡ 75 held flat for the whole window", async function () {
      const { jimmer } = signers;
      await depositAt(jimmer, 50n * M, t0);
      await depositAt(jimmer, 50n * M, tMid);
      await finishSnapshot();

      const area = await decryptTwab(jimmer);
      // Step area: 50·(tMid − t0) + 100·(E − tMid). With tMid the midpoint this
      // is arithmetically identical to a flat 75 over [t0, E].
      expect(area).to.eq(50n * M * (tMid - t0) + 100n * M * (E - tMid));
      expect(area).to.eq(75n * M * (E - t0));
    });

    it("a last-second deposit earns weight = amount × 1s — tiny but never zero", async function () {
      const { carol } = signers;
      await depositAt(carol, 777n * M, E - 1n);
      await finishSnapshot();

      expect(await decryptTwab(carol)).to.eq(777n * M * 1n);
    });

    it("a snapshot 3 days late freezes the SAME weight as an on-time one (clamped at epochEnd)", async function () {
      const { jimmer } = signers;
      await depositAt(jimmer, 100n * M, t0);

      await ensureAt(E + 3n * 24n * 3600n); // keeper oversleeps 3 days
      await pot.beginSnapshot();
      await pot.snapshotBatch(32);

      // Not a second more than the epoch window — accrual stopped at E.
      expect(await decryptTwab(jimmer)).to.eq(100n * M * (E - t0));
    });

    it("deposit then withdrawAll mid-epoch keeps weight = amount × holding window (no-loss, weight kept)", async function () {
      const { jimmer } = signers;
      const tExit = t0 + 86_400n; // held for exactly one day
      await depositAt(jimmer, 6_000n * M, t0);
      await withdrawAllAt(jimmer, tExit);

      expect(await decryptPrincipal(jimmer)).to.eq(0n);
      expect(await decryptWallet(jimmer)).to.eq(25_000n * M); // fully restored
      expect(await decryptTwab(jimmer)).to.eq(6_000n * M * (tExit - t0));

      await finishSnapshot();
      // Snapshot accrues principal 0 over [tExit, E] — adds nothing.
      expect(await decryptTwab(jimmer)).to.eq(6_000n * M * (tExit - t0));
      expect(await debugDecrypt(await pot.totalWeightOf(1))).to.eq(6_000n * M * (tExit - t0));
    });

    it("withdrawAll after epochEnd but before the snapshot leaves the frozen weight intact", async function () {
      const { jimmer } = signers;
      await depositAt(jimmer, 6_000n * M, t0);

      // Money leaves AFTER payday — the weight was already earned up to E.
      await withdrawAllAt(jimmer, E + 100n);
      expect(await pot.lastCheckpointOf(jimmer.address)).to.eq(E); // clamped, not E+100
      expect(await decryptTwab(jimmer)).to.eq(6_000n * M * (E - t0));
      expect(await decryptWallet(jimmer)).to.eq(25_000n * M);

      await pot.beginSnapshot();
      await pot.snapshotBatch(32);
      expect(await decryptTwab(jimmer)).to.eq(6_000n * M * (E - t0));
      expect(await debugDecrypt(await pot.totalWeightOf(1))).to.eq(6_000n * M * (E - t0));
    });

    it("a partial withdraw DURING Snapshotting, before the user's batch slot, cannot change the frozen weight", async function () {
      const { jimmer, warg, carol } = signers;
      await depositAt(jimmer, 4_000n * M, t0); // participant index 0
      await depositAt(warg, 3_000n * M, tMid); // participant index 1

      await ensureAt(E);
      await pot.beginSnapshot();
      await pot.snapshotBatch(1); // freezes jimmer only; warg still pending

      // warg races a withdraw in before their slot — _checkpoint clamps to E
      // first, so the weight freezes at the earned value before the debit.
      await pot.connect(warg).withdrawAll();
      const frozenHandle = await pot.twabAreaOf(warg.address);
      expect(await decryptTwab(warg)).to.eq(3_000n * M * (E - tMid));

      await pot.connect(carol).snapshotBatch(32); // anyone finishes (R4)
      // Zero-elapsed short-circuit: warg's handle is untouched, not re-derived.
      expect(await pot.twabAreaOf(warg.address)).to.eq(frozenHandle);
      expect(await decryptTwab(warg)).to.eq(3_000n * M * (E - tMid));
      expect(await debugDecrypt(await pot.totalWeightOf(1))).to.eq(
        4_000n * M * (E - t0) + 3_000n * M * (E - tMid),
      );
    });

    it("a registrant whose only deposit was refunded ends the epoch with weight 0 (and 'unavailable' before it)", async function () {
      const { jimmer } = signers;
      await depositAt(jimmer, PER_USER_CAP + 1n, t0); // over cap ⇒ refunded, still registered

      // No accrual ever ran — the handle must be uninitialized ("unavailable"),
      // which the UI must never render as the number 0 (non-negotiable #8).
      expect(await pot.twabAreaOf(jimmer.address)).to.eq(ethers.ZeroHash);

      await finishSnapshot();
      expect(await decryptTwab(jimmer)).to.eq(0n); // now initialized: enc(0)
      expect(await debugDecrypt(await pot.totalWeightOf(1))).to.eq(0n);
    });
  });

  // -------------------------------------------------------------------
  // Snapshot phase machine — Open → Snapshotting → Drawing, cursor batching.
  // -------------------------------------------------------------------

  describe("snapshot phase machine", function () {
    it("beginSnapshot before epochEnd reverts WrongPhase — even one second early", async function () {
      await depositAt(signers.jimmer, 1_000n * M, t0);
      await expect(pot.beginSnapshot()).to.be.revertedWithCustomError(pot, "WrongPhase");

      await time.setNextBlockTimestamp(E - 1n);
      await expect(pot.beginSnapshot()).to.be.revertedWithCustomError(pot, "WrongPhase");
    });

    it("beginSnapshot at exactly epochEnd flips to Snapshotting and announces the frozen participant count", async function () {
      await depositAt(signers.jimmer, 1_000n * M, t0);
      await depositAt(signers.warg, 2_000n * M, tMid);

      await time.setNextBlockTimestamp(E);
      await expect(pot.beginSnapshot()).to.emit(pot, "SnapshotStarted").withArgs(1n, 2n);
      expect(await phaseOf(1n)).to.eq(PHASE.Snapshotting);

      const [cursor, total] = await pot.snapshotProgress(1);
      expect(cursor).to.eq(0n);
      expect(total).to.eq(2n);
    });

    it("deposits close at epochEnd even while the phase is still Open (WrongPhase bubbles through the token)", async function () {
      const { jimmer } = signers;
      await depositAt(jimmer, 1_000n * M, E - 1n); // last second: still accepted

      // One second later — end reached, nobody called beginSnapshot yet.
      const enc = await fhevm.createEncryptedInput(tokenAddress, jimmer.address).add64(1_000n * M).encrypt();
      await time.setNextBlockTimestamp(E);
      await expect(
        token
          .connect(jimmer)
          ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](
            potAddress,
            enc.handles[0],
            enc.inputProof,
            "0x",
          ),
      ).to.be.revertedWithCustomError(pot, "WrongPhase"); // selector survives the token (quirk #12)
    });

    it("deposits during Snapshotting revert WrongPhase", async function () {
      await depositAt(signers.jimmer, 1_000n * M, t0);
      await ensureAt(E);
      await pot.beginSnapshot();

      const enc = await fhevm.createEncryptedInput(tokenAddress, signers.warg.address).add64(500n * M).encrypt();
      await expect(
        token
          .connect(signers.warg)
          ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](
            potAddress,
            enc.handles[0],
            enc.inputProof,
            "0x",
          ),
      ).to.be.revertedWithCustomError(pot, "WrongPhase");
    });

    it("beginSnapshot cannot run twice", async function () {
      await depositAt(signers.jimmer, 1_000n * M, t0);
      await ensureAt(E);
      await pot.beginSnapshot();
      await expect(pot.beginSnapshot()).to.be.revertedWithCustomError(pot, "WrongPhase");
    });

    it("an epoch with zero participants completes its snapshot in the same tx and lands in Drawing", async function () {
      await ensureAt(E);
      const tx = await pot.beginSnapshot();
      await expect(tx).to.emit(pot, "SnapshotStarted").withArgs(1n, 0n);
      await expect(tx).to.emit(pot, "SnapshotCompleted").withArgs(1n);
      expect(await phaseOf(1n)).to.eq(PHASE.Drawing);

      await expect(pot.snapshotBatch(1)).to.be.revertedWithCustomError(pot, "WrongPhase");
    });

    it("snapshotBatch outside Snapshotting reverts WrongPhase (Open and Drawing alike)", async function () {
      await depositAt(signers.jimmer, 1_000n * M, t0);
      await expect(pot.snapshotBatch(8)).to.be.revertedWithCustomError(pot, "WrongPhase"); // Open

      await finishSnapshot(); // → Drawing
      expect(await phaseOf(1n)).to.eq(PHASE.Drawing);
      await expect(pot.snapshotBatch(8)).to.be.revertedWithCustomError(pot, "WrongPhase");
    });

    it("snapshotBatch(0) reverts InvalidConfig", async function () {
      await depositAt(signers.jimmer, 1_000n * M, t0);
      await ensureAt(E);
      await pot.beginSnapshot();
      await expect(pot.snapshotBatch(0)).to.be.revertedWithCustomError(pot, "InvalidConfig");
    });

    it("the batch cursor advances monotonically and ANY wallet can continue and finish (R4)", async function () {
      const { jimmer, warg, carol, employer } = signers;
      await depositAt(jimmer, 1_000n * M, t0);
      await depositAt(warg, 2_000n * M, t0 + 7_200n);
      await depositAt(carol, 3_000n * M, tMid);

      await ensureAt(E);
      await pot.connect(employer).beginSnapshot(); // permissionless — employer is fine

      await expect(pot.connect(jimmer).snapshotBatch(2)).to.emit(pot, "SnapshotProgress").withArgs(1n, 2n);
      let [cursor, total] = await pot.snapshotProgress(1);
      expect(cursor).to.eq(2n);
      expect(total).to.eq(3n);
      expect(await phaseOf(1n)).to.eq(PHASE.Snapshotting);

      // A completely different wallet finishes; oversized request is clamped.
      const tx = await pot.connect(carol).snapshotBatch(32);
      await expect(tx).to.emit(pot, "SnapshotProgress").withArgs(1n, 3n);
      await expect(tx).to.emit(pot, "SnapshotCompleted").withArgs(1n);
      [cursor, total] = await pot.snapshotProgress(1);
      expect(cursor).to.eq(3n);
      expect(await phaseOf(1n)).to.eq(PHASE.Drawing);

      await expect(pot.snapshotBatch(1)).to.be.revertedWithCustomError(pot, "WrongPhase");
    });

    it("totalWeight equals the sum of all frozen individual weights — exactly", async function () {
      const { jimmer, warg, carol } = signers;
      const tWarg = t0 + 86_400n;
      await depositAt(jimmer, 6_000n * M, t0);
      await depositAt(warg, 3_000n * M, tWarg);
      await depositAt(carol, 9_000n * M, tMid);

      await finishSnapshot();

      const areas = [
        await decryptTwab(jimmer),
        await decryptTwab(warg),
        await decryptTwab(carol),
      ];
      expect(areas[0]).to.eq(6_000n * M * (E - t0));
      expect(areas[1]).to.eq(3_000n * M * (E - tWarg));
      expect(areas[2]).to.eq(9_000n * M * (E - tMid));

      // Mock-only debugger decrypt — the product path never decrypts this.
      const total = await debugDecrypt(await pot.totalWeightOf(1));
      expect(total).to.eq(areas[0] + areas[1] + areas[2]);
    });
  });

  // -------------------------------------------------------------------
  // R10 — withdraw must survive EVERY phase, including paused + Snapshotting.
  // -------------------------------------------------------------------

  describe("R10 — withdraw lives through snapshot and pause", function () {
    it("withdrawAll succeeds while the epoch is Snapshotting", async function () {
      const { jimmer } = signers;
      await depositAt(jimmer, 6_000n * M, t0);
      await ensureAt(E);
      await pot.beginSnapshot();
      expect(await phaseOf(1n)).to.eq(PHASE.Snapshotting);

      await pot.connect(jimmer).withdrawAll();
      expect(await decryptPrincipal(jimmer)).to.eq(0n);
      expect(await decryptWallet(jimmer)).to.eq(25_000n * M);

      await pot.snapshotBatch(32); // snapshot still completes afterwards
      expect(await phaseOf(1n)).to.eq(PHASE.Drawing);
      expect(await debugDecrypt(await pot.totalWeightOf(1))).to.eq(6_000n * M * (E - t0));
    });

    it("withdrawAll AND partial withdraw succeed while paused AND Snapshotting at the same time", async function () {
      const { jimmer, warg, deployer } = signers;
      await depositAt(jimmer, 6_000n * M, t0);
      await depositAt(warg, 2_000n * M, tMid);

      await ensureAt(E);
      await pot.beginSnapshot();
      await pot.connect(deployer).pause(); // both brakes on at once

      const enc = await fhevm.createEncryptedInput(potAddress, warg.address).add64(500n * M).encrypt();
      await pot.connect(warg).withdraw(enc.handles[0], enc.inputProof);
      expect(await decryptPrincipal(warg)).to.eq(1_500n * M);

      await pot.connect(jimmer).withdrawAll();
      expect(await decryptPrincipal(jimmer)).to.eq(0n);
      expect(await decryptWallet(jimmer)).to.eq(25_000n * M);

      await pot.snapshotBatch(32); // bookkeeping is deliberately not pausable
      expect(await phaseOf(1n)).to.eq(PHASE.Drawing);
    });
  });

  // -------------------------------------------------------------------
  // ACL — weights follow the same policy as principal: user-only.
  // Two users with different amounts AND times ⇒ divergent handle
  // histories, so no deterministic-aliasing false positives (quirk #10).
  // -------------------------------------------------------------------

  describe("ACL on weights", function () {
    beforeEach(async function () {
      await depositAt(signers.jimmer, 6_000n * M, t0);
      await depositAt(signers.warg, 3_000n * M, tMid);
      await finishSnapshot();
    });

    it("each user decrypts their own weight — and only theirs", async function () {
      const { jimmer, warg } = signers;
      expect(await decryptTwab(jimmer)).to.eq(6_000n * M * (E - t0));
      expect(await decryptTwab(warg)).to.eq(3_000n * M * (E - tMid));

      const handleJimmer = await pot.twabAreaOf(jimmer.address);
      const handleWarg = await pot.twabAreaOf(warg.address);
      expect(handleJimmer).to.not.eq(handleWarg);
      await expect(fhevm.userDecryptEuint(FhevmType.euint64, handleJimmer, potAddress, warg)).to.be.rejected;
    });

    it("employer and deployer (owner) have NO ACL on any user's weight (non-negotiable #3)", async function () {
      const handle = await pot.twabAreaOf(signers.jimmer.address);
      await expect(fhevm.userDecryptEuint(FhevmType.euint64, handle, potAddress, signers.employer)).to.be.rejected;
      await expect(fhevm.userDecryptEuint(FhevmType.euint64, handle, potAddress, signers.deployer)).to.be.rejected;
    });

    it("totalWeight is contract-only: distinct handle, undecryptable by users, employer and owner", async function () {
      const handle = await pot.totalWeightOf(1);
      expect(handle).to.not.eq(await pot.twabAreaOf(signers.jimmer.address));
      expect(handle).to.not.eq(await pot.twabAreaOf(signers.warg.address));
      for (const who of [signers.jimmer, signers.warg, signers.employer, signers.deployer]) {
        await expect(fhevm.userDecryptEuint(FhevmType.euint64, handle, potAddress, who)).to.be.rejected;
      }
    });
  });

  // -------------------------------------------------------------------
  // P-3 overflow boundaries — FHE arithmetic wraps silently, so the
  // constructor budget participantCap·perUserCap·epochDuration < 2^64
  // is the only thing standing between us and corrupted weights.
  // -------------------------------------------------------------------

  describe("P-3 overflow boundaries", function () {
    it("constructor rejects a config whose worst-case area budget reaches 2^64, accepts just below", async function () {
      const factory = await ethers.getContractFactory("PayDayPot");
      const duration = 2n ** 21n; // 2,097,152 s ≈ 24.3 days (≤ 30 days)
      const capAtLimit = 2n ** 38n; // 32 · 2^38 · 2^21 == 2^64 exactly

      await expect(
        factory.deploy(tokenAddress, signers.employer.address, duration, capAtLimit, 32),
      ).to.be.revertedWithCustomError(factory, "InvalidConfig");

      const okPot = await factory.deploy(tokenAddress, signers.employer.address, duration, capAtLimit - 1n, 32);
      expect(await okPot.PER_USER_CAP()).to.eq(capAtLimit - 1n);
    });

    it("max-config accrual lands at ~99.9% of 2^64 without wrapping — exact to the unit", async function () {
      const { jimmer, employer } = signers;
      // 1 participant, 30-day epoch, cap 7,116,000 USDC: budget
      // 7.116e12 × 2,592,000 = 18,444,672e12 < 2^64 − 1 ≈ 18,446,744e12.
      const duration = 2_592_000n;
      const cap = 7_116_000_000_000n;
      const bigPot: PayDayPot = await (
        await ethers.getContractFactory("PayDayPot")
      ).deploy(tokenAddress, employer.address, duration, cap, 1);
      const bigPotAddress = await bigPot.getAddress();

      await usdc.mint(jimmer.address, cap);
      await usdc.connect(jimmer).approve(tokenAddress, cap);
      await token.connect(jimmer).wrap(jimmer.address, cap);

      const info = await bigPot.epochInfo(1);
      const tDep = info.start + 3600n;
      const enc = await fhevm.createEncryptedInput(tokenAddress, jimmer.address).add64(cap).encrypt();
      await time.setNextBlockTimestamp(tDep);
      await token
        .connect(jimmer)
        ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](
          bigPotAddress,
          enc.handles[0],
          enc.inputProof,
          "0x",
        );

      await time.increaseTo(info.end);
      await bigPot.beginSnapshot();
      await bigPot.snapshotBatch(1);

      // 18,419,054,400,000,000,000 — any wrap would miss by ~2^64, not by 1.
      const expected = cap * (info.end - tDep);
      expect(expected).to.be.lessThan(2n ** 64n);
      const handle = await bigPot.twabAreaOf(jimmer.address);
      expect(await fhevm.userDecryptEuint(FhevmType.euint64, handle, bigPotAddress, jimmer)).to.eq(expected);
    });

    it("a full-cap deposit held to epochEnd accrues cap × window exactly (standard config)", async function () {
      const { jimmer } = signers;
      await depositAt(jimmer, PER_USER_CAP, t0);
      await finishSnapshot();
      expect(await decryptTwab(jimmer)).to.eq(PER_USER_CAP * (E - t0));
    });
  });
});
