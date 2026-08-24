import { FhevmType } from "@fhevm/hardhat-plugin";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";

import { PayDayPot, TestConfidentialUSDC, TestUSDC, TicketMathHarness } from "../types";

type Signers = {
  deployer: HardhatEthersSigner;
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

// EpochPhase enum — mirrors PayDayPot.EpochPhase order. RandomReady/Selecting
// are sub-states of Drawing: `drawn == false` / `drawn && cursor < count`.
const PHASE = { Open: 0n, Snapshotting: 1n, Drawing: 2n, Settled: 3n } as const;

describe("PayDayPot — draw engine (Day 4)", function () {
  let signers: Signers;
  let usdc: TestUSDC;
  let token: TestConfidentialUSDC;
  let pot: PayDayPot;
  let tokenAddress: string;
  let potAddress: string;

  // Epoch 1 window, read back from the chain each deploy.
  let S: bigint; // epoch start
  let E: bigint; // epoch end
  let t0: bigint; // canonical "early" deposit time: S + 1h

  before(async function () {
    const s = await ethers.getSigners();
    signers = { deployer: s[0], jimmer: s[1], warg: s[2], carol: s[3], employer: s[4], keeper: s[5] };
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

    const funding: Array<[HardhatEthersSigner, bigint]> = [
      [signers.jimmer, 25_000n * M],
      [signers.warg, 25_000n * M],
      [signers.carol, 25_000n * M],
    ];
    for (const [user, amount] of funding) {
      await usdc.mint(user.address, amount);
      await usdc.connect(user).approve(tokenAddress, amount);
      await token.connect(user).wrap(user.address, amount);
    }
  });

  // -------------------------------------------------------------------
  // Helpers — mutating txs are pinned (input encrypted BEFORE pinning),
  // draw-state reads go through the mock-only debugger where flagged.
  // -------------------------------------------------------------------

  /** Deposit pinned at `ts`. Input is encrypted BEFORE pinning the block. */
  async function depositAt(user: HardhatEthersSigner, amount: bigint, ts: bigint) {
    const enc = await fhevm.createEncryptedInput(tokenAddress, user.address).add64(amount).encrypt();
    await time.setNextBlockTimestamp(ts);
    return token
      .connect(user)
      ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](potAddress, enc.handles[0], enc.inputProof, "0x");
  }

  /** Move chain time to `target` unless it is already there or past it. */
  async function ensureAt(target: bigint) {
    if (BigInt(await time.latest()) < target) {
      await time.increaseTo(target);
    }
  }

  /** Whole snapshot in one sweep: begin + single clamped batch → Drawing. */
  async function finishSnapshot() {
    await ensureAt(E);
    await pot.beginSnapshot();
    if ((await pot.participantCount()) > 0n) {
      await pot.snapshotBatch(32);
    }
  }

  /** Mock-only ACL bypass — invariant inspection in tests, never a product path. */
  async function debugDecrypt(handle: string): Promise<bigint> {
    return fhevm.debugger.decryptEuint(FhevmType.euint64, handle);
  }

  /** Mock-only ebool inspection — the won/selectedAny flags are contract-only ACL. */
  async function debugDecryptBool(handle: string): Promise<boolean> {
    return fhevm.debugger.decryptEbool(handle);
  }

  async function phaseOf(epochId: bigint): Promise<bigint> {
    return (await pot.epochInfo(epochId)).phase;
  }

  /**
   * [mock-only inspection] Decrypt the epoch's R, T and ticket, plus every
   * participant's frozen area, and replicate the §6.3 cumulative-crossing
   * rule in plain bigint math: winner = first i with ticket < prefixSum(i).
   */
  async function predictWinner(participants: HardhatEthersSigner[]) {
    const st = await pot.drawStateOf(1);
    const R = await debugDecrypt(st.random);
    const T = await debugDecrypt(await pot.totalWeightOf(1));
    const ticket = await debugDecrypt(st.ticket);
    const areas: bigint[] = [];
    for (const u of participants) {
      areas.push(await debugDecrypt(await pot.twabAreaOf(u.address)));
    }
    let winnerIdx = -1;
    let cum = 0n;
    for (let i = 0; i < areas.length; i++) {
      cum += areas[i];
      if (ticket < cum) {
        winnerIdx = i;
        break;
      }
    }
    return { winnerIdx, R, T, ticket, areas };
  }

  /** [mock-only inspection] All participants' encrypted winner flags. */
  async function wonFlags(participants: HardhatEthersSigner[]): Promise<boolean[]> {
    const flags: boolean[] = [];
    for (const u of participants) {
      flags.push(await debugDecryptBool(await pot.wonOf(u.address)));
    }
    return flags;
  }

  // -------------------------------------------------------------------
  // requestRandom — one-shot randomness, the only pausable step besides
  // deposits. RandomReady ⇔ Drawing && !drawn (4-phase decision, Day 3).
  // -------------------------------------------------------------------

  describe("requestRandom gates", function () {
    it("reverts WrongPhase while the epoch is Open", async function () {
      await depositAt(signers.jimmer, 1_000n * M, t0);
      await expect(pot.requestRandom()).to.be.revertedWithCustomError(pot, "WrongPhase");
    });

    it("reverts WrongPhase while the snapshot is still running", async function () {
      await depositAt(signers.jimmer, 1_000n * M, t0);
      await ensureAt(E);
      await pot.beginSnapshot();
      expect(await phaseOf(1n)).to.eq(PHASE.Snapshotting);
      await expect(pot.requestRandom()).to.be.revertedWithCustomError(pot, "WrongPhase");
    });

    it("locks the randomness exactly once — a reroll reverts AlreadyDrawn and the handle stays put (R5)", async function () {
      await depositAt(signers.jimmer, 1_000n * M, t0);
      await finishSnapshot();

      await expect(pot.requestRandom()).to.emit(pot, "RandomRequested").withArgs(1n);
      const before = await pot.drawStateOf(1);

      await expect(pot.requestRandom()).to.be.revertedWithCustomError(pot, "AlreadyDrawn");
      await expect(pot.connect(signers.keeper).requestRandom()).to.be.revertedWithCustomError(pot, "AlreadyDrawn");

      const after = await pot.drawStateOf(1);
      expect(after.random).to.eq(before.random); // seed locked, never rerolled
      expect(after.ticket).to.eq(before.ticket);
    });

    it("is blocked by pause and works right after unpause — an in-flight epoch just waits (R10 boundary)", async function () {
      await depositAt(signers.jimmer, 1_000n * M, t0);
      await finishSnapshot();

      await pot.connect(signers.deployer).pause();
      await expect(pot.requestRandom()).to.be.revertedWithCustomError(pot, "EnforcedPause");
      // The epoch is NOT stuck in a hidden way: withdrawals still run (rule #1).
      await pot.connect(signers.jimmer).withdrawAll();

      await pot.connect(signers.deployer).unpause();
      await expect(pot.requestRandom()).to.emit(pot, "RandomRequested").withArgs(1n);
    });

    it("is permissionless and takes no parameters — the keeper cannot supply seed, weight or winner (rule #7)", async function () {
      await depositAt(signers.jimmer, 1_000n * M, t0);
      await finishSnapshot();

      // Signature-level guarantee: requestRandom() has no inputs at all.
      expect(pot.interface.getFunction("requestRandom").inputs.length).to.eq(0);
      await expect(pot.connect(signers.keeper).requestRandom()).to.emit(pot, "RandomRequested").withArgs(1n);

      const prog = await pot.drawProgress(1);
      expect(prog.drawn).to.eq(true);
      expect(prog.cursor).to.eq(0n);
      expect(prog.total).to.eq(1n);
      expect(await phaseOf(1n)).to.eq(PHASE.Drawing); // no new enum value — sub-state only
    });

    it("a zero-participant epoch draws and completes in the same tx — nothing to scan", async function () {
      await ensureAt(E);
      await pot.beginSnapshot(); // empty pool: lands directly in Drawing
      expect(await phaseOf(1n)).to.eq(PHASE.Drawing);

      const tx = await pot.requestRandom();
      await expect(tx).to.emit(pot, "RandomRequested").withArgs(1n);
      await expect(tx).to.emit(pot, "DrawCompleted").withArgs(1n);

      // The cursor gate keeps selectBatch consistently unusable afterwards.
      await expect(pot.selectBatch(1)).to.be.revertedWithCustomError(pot, "SelectionComplete");
      // [mock-only] ticket = ⌊R·0/2^64⌋ = 0 — no winner is even representable.
      const st = await pot.drawStateOf(1);
      expect(await debugDecrypt(st.ticket)).to.eq(0n);
    });
  });

  // -------------------------------------------------------------------
  // P-2 ticket math — multiply-high on the REAL contract path.
  // -------------------------------------------------------------------

  describe("ticket math (P-2)", function () {
    it("ticket == ⌊R·T/2^64⌋ exactly, and ticket < T [mock-only inspection]", async function () {
      const { jimmer, warg, carol } = signers;
      await depositAt(jimmer, 4_000n * M, t0);
      await depositAt(warg, 3_000n * M, t0 + 7_200n);
      await depositAt(carol, 9_000n * M, t0 + 86_400n);
      await finishSnapshot();
      await pot.requestRandom();

      const { R, T, ticket, areas } = await predictWinner([jimmer, warg, carol]);
      expect(T).to.eq(areas[0] + areas[1] + areas[2]);
      expect(ticket).to.eq((R * T) >> 64n); // exact multiply-high, no FHE.div anywhere
      expect(ticket).to.be.lessThan(T);
    });

    it("an all-refunded pool freezes T = 0 and the ticket collapses to 0", async function () {
      // Over-cap deposits are refunded by the encrypted cap check but still
      // occupy slots — the epoch ends with participants and zero total weight.
      await depositAt(signers.jimmer, PER_USER_CAP + 1n, t0);
      await depositAt(signers.warg, PER_USER_CAP + 1n, t0 + 3_600n);
      await finishSnapshot();
      await pot.requestRandom();

      const st = await pot.drawStateOf(1);
      expect(await debugDecrypt(await pot.totalWeightOf(1))).to.eq(0n);
      expect(await debugDecrypt(st.ticket)).to.eq(0n);
    });
  });

  // -------------------------------------------------------------------
  // selectBatch gates + cursor resume (R4).
  // -------------------------------------------------------------------

  describe("selectBatch gates & resume", function () {
    it("reverts NotDrawn in Drawing before the randomness is locked", async function () {
      await depositAt(signers.jimmer, 1_000n * M, t0);
      await finishSnapshot();
      expect(await phaseOf(1n)).to.eq(PHASE.Drawing);
      await expect(pot.selectBatch(8)).to.be.revertedWithCustomError(pot, "NotDrawn");
    });

    it("reverts WrongPhase outside Drawing (Open and Snapshotting alike)", async function () {
      await depositAt(signers.jimmer, 1_000n * M, t0);
      await expect(pot.selectBatch(8)).to.be.revertedWithCustomError(pot, "WrongPhase"); // Open
      await ensureAt(E);
      await pot.beginSnapshot();
      await expect(pot.selectBatch(8)).to.be.revertedWithCustomError(pot, "WrongPhase"); // Snapshotting
    });

    it("selectBatch(0) reverts InvalidConfig — checked before any other gate", async function () {
      await depositAt(signers.jimmer, 1_000n * M, t0);
      await finishSnapshot();
      // Not drawn yet — the maxSteps check still fires first (mirrors snapshotBatch).
      await expect(pot.selectBatch(0)).to.be.revertedWithCustomError(pot, "InvalidConfig");
      await pot.requestRandom();
      await expect(pot.selectBatch(0)).to.be.revertedWithCustomError(pot, "InvalidConfig");
    });

    it("the cursor advances monotonically, ANY wallet can continue, and a finished scan reverts SelectionComplete", async function () {
      const { jimmer, warg, carol, keeper, employer } = signers;
      await depositAt(jimmer, 4_000n * M, t0);
      await depositAt(warg, 3_000n * M, t0 + 7_200n);
      await depositAt(carol, 9_000n * M, t0 + 86_400n);
      await finishSnapshot();
      await pot.connect(keeper).requestRandom();

      await expect(pot.connect(keeper).selectBatch(1)).to.emit(pot, "SelectProgress").withArgs(1n, 1n);
      let prog = await pot.drawProgress(1);
      expect(prog.cursor).to.eq(1n);
      expect(await phaseOf(1n)).to.eq(PHASE.Drawing);

      // A completely different wallet resumes; the oversized request clamps.
      const tx = await pot.connect(employer).selectBatch(32);
      await expect(tx).to.emit(pot, "SelectProgress").withArgs(1n, 3n);
      await expect(tx).to.emit(pot, "DrawCompleted").withArgs(1n);
      prog = await pot.drawProgress(1);
      expect(prog.cursor).to.eq(3n);
      expect(prog.total).to.eq(3n);

      await expect(pot.selectBatch(1)).to.be.revertedWithCustomError(pot, "SelectionComplete");
      // Phase stays Drawing — Settled is Day 5's claim-side transition.
      expect(await phaseOf(1n)).to.eq(PHASE.Drawing);
    });
  });

  // -------------------------------------------------------------------
  // Winner selection — exactly one crossing, replicated in plain math.
  // -------------------------------------------------------------------

  describe("winner selection", function () {
    it("selects EXACTLY the participant the plain-math replication predicts [mock-only inspection]", async function () {
      const { jimmer, warg, carol } = signers;
      const participants = [jimmer, warg, carol];
      await depositAt(jimmer, 4_000n * M, t0);
      await depositAt(warg, 3_000n * M, t0 + 7_200n);
      await depositAt(carol, 9_000n * M, t0 + 86_400n);
      await finishSnapshot();
      await pot.requestRandom();
      await pot.selectBatch(32);

      const { winnerIdx, T, ticket } = await predictWinner(participants);
      expect(T).to.be.greaterThan(0n);
      expect(winnerIdx).to.be.at.least(0); // ticket < T guarantees a crossing

      const flags = await wonFlags(participants);
      expect(flags.filter(Boolean).length).to.eq(1); // structural exactly-one
      expect(flags[winnerIdx]).to.eq(true);
      const st = await pot.drawStateOf(1);
      expect(await debugDecryptBool(st.selectedAny)).to.eq(true);
      expect(await debugDecrypt(st.cumulative)).to.eq(T); // scan consumed every weight
      expect(ticket).to.be.lessThan(T);
    });

    it("carries cumulative/selectedAny across tx boundaries — batch(1)×3 equals one sweep [mock-only inspection]", async function () {
      const { jimmer, warg, carol } = signers;
      const participants = [jimmer, warg, carol];
      await depositAt(jimmer, 4_000n * M, t0);
      await depositAt(warg, 3_000n * M, t0 + 7_200n);
      await depositAt(carol, 9_000n * M, t0 + 86_400n);
      await finishSnapshot();
      await pot.requestRandom();

      const { winnerIdx, ticket, areas } = await predictWinner(participants);

      // Scan one participant per tx — the winner necessarily falls in some
      // LATER tx unless index 0 wins, so the carried latch/sum are exercised.
      await pot.selectBatch(1);
      // After tx 1: cumulative == area[0], latch == (ticket < area[0]).
      const st1 = await pot.drawStateOf(1);
      expect(await debugDecrypt(st1.cumulative)).to.eq(areas[0]);
      expect(await debugDecryptBool(st1.selectedAny)).to.eq(ticket < areas[0]);

      await pot.selectBatch(1);
      await pot.selectBatch(1);

      const flags = await wonFlags(participants);
      expect(flags.filter(Boolean).length).to.eq(1);
      expect(flags[winnerIdx]).to.eq(true);
    });

    it("a zero-weight participant in the middle of the list can never win and never breaks exactly-one", async function () {
      const { jimmer, warg, carol } = signers;
      const participants = [jimmer, warg, carol];
      await depositAt(jimmer, 4_000n * M, t0);
      await depositAt(warg, PER_USER_CAP + 1n, t0 + 3_600n); // refunded ⇒ weight 0, slot kept
      await depositAt(carol, 9_000n * M, t0 + 86_400n);
      await finishSnapshot();
      await pot.requestRandom();
      await pot.selectBatch(32);

      const { winnerIdx, areas } = await predictWinner(participants);
      expect(areas[1]).to.eq(0n);

      const flags = await wonFlags(participants);
      expect(flags[1]).to.eq(false); // zero weight adds nothing to the sum — no new crossing
      expect(flags.filter(Boolean).length).to.eq(1);
      expect(flags[winnerIdx]).to.eq(true);
      expect(winnerIdx).to.not.eq(1);
    });

    it("T = 0 (all weights zero): the scan completes with NO winner and the prize is untouched (§6.4 rollover)", async function () {
      const { jimmer, warg } = signers;
      await depositAt(jimmer, PER_USER_CAP + 1n, t0); // both refunded
      await depositAt(warg, PER_USER_CAP + 1n, t0 + 3_600n);
      await finishSnapshot();
      await pot.requestRandom();
      const tx = await pot.selectBatch(32);
      await expect(tx).to.emit(pot, "DrawCompleted").withArgs(1n);

      // ticket == 0 and lt(0, 0) is false at every step ⇒ nobody crosses.
      const flags = await wonFlags([jimmer, warg]);
      expect(flags).to.deep.eq([false, false]);
      const st = await pot.drawStateOf(1);
      expect(await debugDecryptBool(st.selectedAny)).to.eq(false);
      // No decrypt of the total was ever needed to conclude this onchain —
      // the epoch keeps its (Day 4: zero) prize; Day 5 re-runs this with a
      // positive prizeAmount to prove the actual rollover.
      expect(await pot.prizeAmountOf(1)).to.eq(0n);

      await expect(pot.selectBatch(1)).to.be.revertedWithCustomError(pot, "SelectionComplete");
    });

    it("withdrawAll BETWEEN two selectBatch txs changes nothing — frozen weights drive the draw (rule #1 + D1)", async function () {
      const { jimmer, warg, carol } = signers;
      const participants = [jimmer, warg, carol];
      await depositAt(jimmer, 4_000n * M, t0);
      await depositAt(warg, 3_000n * M, t0 + 7_200n);
      await depositAt(carol, 9_000n * M, t0 + 86_400n);
      await finishSnapshot();
      await pot.requestRandom();
      const { winnerIdx } = await predictWinner(participants);

      await pot.selectBatch(1);

      // carol (still unscanned) exits mid-draw: money leaves, weight stays.
      const areaHandleBefore = await pot.twabAreaOf(carol.address);
      await pot.connect(carol).withdrawAll();
      // Zero-elapsed short-circuit: the frozen area handle is untouched.
      expect(await pot.twabAreaOf(carol.address)).to.eq(areaHandleBefore);

      await pot.selectBatch(32);
      const flags = await wonFlags(participants);
      expect(flags.filter(Boolean).length).to.eq(1);
      expect(flags[winnerIdx]).to.eq(true); // same winner as the pre-withdraw prediction
    });

    it("pause DURING the scan blocks nothing that matters: selectBatch and withdrawAll both run (§17.8)", async function () {
      const { jimmer, warg, deployer } = signers;
      await depositAt(jimmer, 4_000n * M, t0);
      await depositAt(warg, 3_000n * M, t0 + 7_200n);
      await finishSnapshot();
      await pot.requestRandom();
      await pot.selectBatch(1);

      await pot.connect(deployer).pause();
      await pot.connect(jimmer).withdrawAll(); // rule #1: never gated
      const tx = await pot.selectBatch(32); // in-flight draw is bookkeeping — not pausable
      await expect(tx).to.emit(pot, "DrawCompleted").withArgs(1n);

      const flags = await wonFlags([jimmer, warg]);
      expect(flags.filter(Boolean).length).to.eq(1);
    });
  });

  // -------------------------------------------------------------------
  // Prize crediting — Day 4 ships the award line with prizeAmount == 0;
  // Day 5 adds funding (setter MUST reject once drawn — see handoff).
  // -------------------------------------------------------------------

  describe("prize crediting (award line, zero prize)", function () {
    it("pendingPrize is 'unavailable' (zero handle) before the scan and enc(0) after it — never a fake 0 (#8)", async function () {
      const { jimmer, warg } = signers;
      await depositAt(jimmer, 4_000n * M, t0);
      await depositAt(warg, 3_000n * M, t0 + 7_200n);
      expect(await pot.pendingPrizeOf(jimmer.address)).to.eq(ethers.ZeroHash); // uninitialized ≠ enc(0)

      await finishSnapshot();
      await pot.requestRandom();
      await pot.selectBatch(32);

      // After the scan every participant holds a REAL encrypted value the
      // user themself can decrypt (the user-facing reveal channel, §15.1).
      for (const user of [jimmer, warg]) {
        const handle = await pot.pendingPrizeOf(user.address);
        expect(handle).to.not.eq(ethers.ZeroHash);
        expect(await fhevm.userDecryptEuint(FhevmType.euint64, handle, potAddress, user)).to.eq(0n);
      }
      expect(await pot.prizeAmountOf(1)).to.eq(0n); // funding is Day 5 (P-4 public amount)
    });
  });

  // -------------------------------------------------------------------
  // ACL — draw state is contract-only; pendingPrize is user-only.
  // Divergent deposit histories keep handles distinct (quirk #10).
  // -------------------------------------------------------------------

  describe("ACL on draw state", function () {
    beforeEach(async function () {
      await depositAt(signers.jimmer, 4_000n * M, t0);
      await depositAt(signers.warg, 3_000n * M, t0 + 7_200n);
      await finishSnapshot();
      await pot.requestRandom();
      await pot.selectBatch(32);
    });

    it("random, ticket and cumulative are decryptable by NOBODY — user, employer, keeper or owner (#6)", async function () {
      const st = await pot.drawStateOf(1);
      const everyone = [signers.jimmer, signers.warg, signers.employer, signers.keeper, signers.deployer];
      for (const handle of [st.random, st.ticket, st.cumulative]) {
        expect(handle).to.not.eq(ethers.ZeroHash);
        for (const who of everyone) {
          await expect(fhevm.userDecryptEuint(FhevmType.euint64, handle, potAddress, who)).to.be.rejected;
        }
      }
    });

    it("selectedAny and each user's won flag are contract-only — EVEN the user cannot read their own flag (§15.1)", async function () {
      const st = await pot.drawStateOf(1);
      const everyone = [signers.jimmer, signers.warg, signers.employer, signers.keeper, signers.deployer];
      for (const who of everyone) {
        await expect(fhevm.userDecryptEbool(st.selectedAny, potAddress, who)).to.be.rejected;
      }
      for (const user of [signers.jimmer, signers.warg]) {
        const handle = await pot.wonOf(user.address);
        expect(handle).to.not.eq(ethers.ZeroHash);
        for (const who of everyone) {
          await expect(fhevm.userDecryptEbool(handle, potAddress, who)).to.be.rejected;
        }
      }
    });

    it("pendingPrize decrypts for its owner ONLY — employer, owner and other users are denied (#3)", async function () {
      const handle = await pot.pendingPrizeOf(signers.jimmer.address);
      expect(await fhevm.userDecryptEuint(FhevmType.euint64, handle, potAddress, signers.jimmer)).to.eq(0n);
      for (const who of [signers.warg, signers.employer, signers.deployer, signers.keeper]) {
        await expect(fhevm.userDecryptEuint(FhevmType.euint64, handle, potAddress, who)).to.be.rejected;
      }
    });
  });

  // -------------------------------------------------------------------
  // Event hygiene — draw events carry public counters only (#5).
  // -------------------------------------------------------------------

  describe("event hygiene", function () {
    it("no draw event ever carries an amount or a participant address — topics and data are counters only", async function () {
      const { jimmer, warg, keeper } = signers;
      await depositAt(jimmer, 4_000n * M, t0);
      await depositAt(warg, 3_000n * M, t0 + 7_200n);
      await finishSnapshot();

      const receipts = [
        await (await pot.connect(keeper).requestRandom()).wait(),
        await (await pot.connect(keeper).selectBatch(1)).wait(),
        await (await pot.connect(keeper).selectBatch(32)).wait(),
      ];

      const padded = [jimmer, warg, keeper].map((s) => ethers.zeroPadValue(s.address.toLowerCase(), 32));
      for (const receipt of receipts) {
        // Mock-mode receipts also carry FHEVM coprocessor/ACL bookkeeping logs
        // from other addresses; rule #5 governs what THE POT emits.
        const potLogs = receipt!.logs.filter((log) => log.address === potAddress);
        expect(potLogs.length).to.be.greaterThan(0);
        for (const log of potLogs) {
          const parsed = pot.interface.parseLog(log);
          expect(parsed, "unparseable pot event in a draw tx").to.not.eq(null);
          expect(["RandomRequested", "SelectProgress", "DrawCompleted"]).to.include(parsed!.name);
          for (const topic of log.topics.slice(1)) {
            expect(padded).to.not.include(topic.toLowerCase()); // no address, indexed or not
          }
          // Data is at most one uint32 cursor — a 32-byte word that is a small
          // counter, never a 20-byte address pattern or an amount.
          if (log.data !== "0x") {
            expect(BigInt(log.data)).to.be.lessThan(33n); // cursor ≤ participant cap
          }
        }
      }
    });
  });
});

// -----------------------------------------------------------------------
// P-2 boundary math on the TEST-ONLY harness. The pot's randomness cannot
// be injected by design (rule #7), so max-R × max-T runs the identical
// promote → mul → shr(64) → downcast chain with caller-supplied inputs.
// -----------------------------------------------------------------------

describe("TicketMathHarness — P-2 multiply-high boundaries", function () {
  const U64_MAX = 2n ** 64n - 1n;
  // The exact worst-case weight from the Day 3 max-accrual test: a full-cap
  // deposit held for a whole 30-day epoch — ~99.85% of 2^64.
  const T_MAX = 7_116_000_000_000n * (2_592_000n - 3_600n);

  let caller: HardhatEthersSigner;
  let harness: TicketMathHarness;
  let harnessAddress: string;

  before(async function () {
    if (!fhevm.isMock) {
      this.skip();
    }
    caller = (await ethers.getSigners())[6];
    harness = await (await ethers.getContractFactory("TicketMathHarness")).deploy();
    harnessAddress = await harness.getAddress();
  });

  async function ticketOf(r: bigint, t: bigint): Promise<bigint> {
    const enc = await fhevm.createEncryptedInput(harnessAddress, caller.address).add64(r).add64(t).encrypt();
    await (await harness.connect(caller).computeTicket(enc.handles[0], enc.handles[1], enc.inputProof)).wait();
    return fhevm.userDecryptEuint(FhevmType.euint64, await harness.lastTicket(), harnessAddress, caller);
  }

  it("max random × max weight: the euint128 product does not wrap and the downcast is exact", async function () {
    expect(T_MAX).to.be.lessThan(2n ** 64n);
    expect(T_MAX * 1000n).to.be.greaterThan(2n ** 64n * 998n); // really ~99.85% of the domain
    const ticket = await ticketOf(U64_MAX, T_MAX);
    expect(ticket).to.eq((U64_MAX * T_MAX) >> 64n); // any wrap would miss by ~2^64
    expect(ticket).to.eq(T_MAX - 1n); // ⌊(2^64−1)·T/2^64⌋ = T−1 exactly, i.e. ticket < T holds at the ceiling
  });

  it("sweeps the random domain edges: R ∈ {0, 1, 2^63, 2^64−1} all land on ⌊R·T/2^64⌋ exactly", async function () {
    this.timeout(120_000);
    const T = 18_419_054_400_000_000_000n; // Day 3 measured max accrual
    for (const r of [0n, 1n, 2n ** 63n, U64_MAX]) {
      const ticket = await ticketOf(r, T);
      expect(ticket).to.eq((r * T) >> 64n);
      expect(ticket).to.be.lessThan(T); // ticket ∈ [0, T) for every seed
    }
  });
});

// -----------------------------------------------------------------------
// Monte Carlo — weighted fairness over the REAL contract path. The mock's
// FheRand is ethers.randomBytes (crypto-random, NOT seedable, source-read
// in @fhevm/mock-utils 0.4.2): runs are not replayable, so every sample
// logs its R/ticket/winner for post-mortem. Bands are ±3.5σ (~0.05%
// false-fail per band) around the exact 1:3:6 expectations.
// -----------------------------------------------------------------------

describe("PayDayPot — Monte Carlo weighted fairness (1:3:6)", function () {
  const SAMPLES = 64;
  // Binomial bands at n=64, p ∈ {0.1, 0.3, 0.6}, ±3.5σ, clamped to [0, n]:
  const BANDS = [
    { lo: 0, hi: 15 }, // E=6.4,  σ≈2.40 — the UPPER bound is the teeth: catches "first always wins" & uniform 21.3
    { lo: 4, hi: 34 }, // E=19.2, σ≈4.10
    { lo: 24, hi: 53 }, // E=38.4, σ≈3.92 — the LOWER bound catches uniform (21.3) and "never wins"
  ];

  it(`over ${SAMPLES} fresh epochs, win counts stay inside ±3.5σ of the 1:3:6 weights [mock-only inspection]`, async function () {
    this.timeout(300_000);
    if (!fhevm.isMock) {
      this.skip();
    }
    const s = await ethers.getSigners();
    const [jimmer, warg, carol] = [s[1], s[2], s[3]];
    const employer = s[4];
    const M6 = 1_000_000n;

    const usdc = await (await ethers.getContractFactory("TestUSDC")).deploy();
    const token = await (await ethers.getContractFactory("TestConfidentialUSDC")).deploy(await usdc.getAddress());
    const tokenAddress = await token.getAddress();

    // Fund each wallet once for all samples (deposits: 1k/3k/6k per sample).
    const need: Array<[HardhatEthersSigner, bigint]> = [
      [jimmer, BigInt(SAMPLES) * 1_000n * M6 + M6],
      [warg, BigInt(SAMPLES) * 3_000n * M6 + M6],
      [carol, BigInt(SAMPLES) * 6_000n * M6 + M6],
    ];
    for (const [user, amount] of need) {
      await usdc.mint(user.address, amount);
      await usdc.connect(user).approve(tokenAddress, amount);
      await token.connect(user).wrap(user.address, amount);
    }

    const wins = [0, 0, 0];
    for (let i = 0; i < SAMPLES; i++) {
      // Fresh pot ⇒ fresh participant list, fresh epoch, fresh randomness.
      const pot: PayDayPot = await (
        await ethers.getContractFactory("PayDayPot")
      ).deploy(tokenAddress, employer.address, 7n * 24n * 3600n, 10_000n * M6, 32);
      const potAddress = await pot.getAddress();
      const end = (await pot.epochInfo(1)).end;

      // LIGHTEST weight deposits FIRST — the tightest band sits on index 0,
      // which is exactly where a "first participant always wins" bug lands.
      const deposits: Array<[HardhatEthersSigner, bigint]> = [
        [jimmer, 1_000n * M6],
        [warg, 3_000n * M6],
        [carol, 6_000n * M6],
      ];
      for (const [user, amount] of deposits) {
        const enc = await fhevm.createEncryptedInput(tokenAddress, user.address).add64(amount).encrypt();
        await token
          .connect(user)
          ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](
            potAddress,
            enc.handles[0],
            enc.inputProof,
            "0x",
          );
      }

      await time.increaseTo(end);
      await pot.beginSnapshot();
      await pot.snapshotBatch(32);
      await pot.requestRandom();
      await pot.selectBatch(32);

      // [mock-only inspection] — the product path never decrypts any of this.
      const st = await pot.drawStateOf(1);
      const R = await fhevm.debugger.decryptEuint(FhevmType.euint64, st.random);
      const ticket = await fhevm.debugger.decryptEuint(FhevmType.euint64, st.ticket);
      const T = await fhevm.debugger.decryptEuint(FhevmType.euint64, await pot.totalWeightOf(1));
      expect(ticket).to.eq((R * T) >> 64n); // every sample re-proves P-2 on the way through
      const flags: boolean[] = [];
      for (const user of [jimmer, warg, carol]) {
        flags.push(await fhevm.debugger.decryptEbool(await pot.wonOf(user.address)));
      }
      const winner = flags.findIndex(Boolean);
      expect(flags.filter(Boolean).length, `sample ${i}: not exactly one winner`).to.eq(1);
      wins[winner]++;
      // Not replayable (crypto-random seed) — log everything for post-mortem.
      // eslint-disable-next-line no-console
      console.log(`      MC sample ${String(i).padStart(2, "0")}: R=${R} ticket=${ticket} T=${T} winner=#${winner}`);
    }

    // eslint-disable-next-line no-console
    console.log(`      MC wins @1:3:6 → [${wins.join(", ")}] of ${SAMPLES} (expected ≈ [6.4, 19.2, 38.4])`);
    expect(wins[0] + wins[1] + wins[2]).to.eq(SAMPLES);
    for (const [idx, band] of BANDS.entries()) {
      expect(wins[idx], `weight-${[1, 3, 6][idx]} win count ${wins[idx]} outside [${band.lo}, ${band.hi}]`).to.be.within(
        band.lo,
        band.hi,
      );
    }
  });
});
