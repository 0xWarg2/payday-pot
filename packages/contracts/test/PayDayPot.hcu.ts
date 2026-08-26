import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";

import { PayDayPot, TestConfidentialUSDC, TestUSDC } from "../types";

const M = 1_000_000n;

/**
 * HCU budget measurements (mock coprocessor replays the exact op graph, so the
 * numbers match what Sepolia will charge). Hard limits per tx:
 *   - global: 20_000_000
 *   - sequential depth: 5_000_000
 * Results are printed so they can be copied into the Day 2 handoff, and
 * asserted with generous headroom so a Day 3 checkpoint change that blows the
 * budget fails loudly here instead of on Sepolia.
 */
describe("PayDayPot — HCU budget", function () {
  let jimmer: HardhatEthersSigner;
  let usdc: TestUSDC;
  let token: TestConfidentialUSDC;
  let pot: PayDayPot;
  let tokenAddress: string;
  let potAddress: string;

  const GLOBAL_LIMIT = 20_000_000;
  const DEPTH_LIMIT = 5_000_000;

  before(async function () {
    if (!fhevm.isMock) {
      this.skip();
    }
    const s = await ethers.getSigners();
    jimmer = s[1];
    usdc = await (await ethers.getContractFactory("TestUSDC")).deploy();
    token = await (await ethers.getContractFactory("TestConfidentialUSDC")).deploy(await usdc.getAddress());
    tokenAddress = await token.getAddress();
    pot = await (
      await ethers.getContractFactory("PayDayPot")
    ).deploy(tokenAddress, s[4].address, 7n * 24n * 3600n, 10_000n * M, 32);
    potAddress = await pot.getAddress();

    await usdc.mint(jimmer.address, 25_000n * M);
    await usdc.connect(jimmer).approve(tokenAddress, 25_000n * M);
    await token.connect(jimmer).wrap(jimmer.address, 25_000n * M);
  });

  async function measureDeposit(amount: bigint) {
    const enc = await fhevm.createEncryptedInput(tokenAddress, jimmer.address).add64(amount).encrypt();
    const tx = await token
      .connect(jimmer)
      ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](potAddress, enc.handles[0], enc.inputProof, "0x");
    return fhevm.computeTransactionHCU((await tx.wait())!);
  }

  function report(label: string, hcu: { globalHCU: number; maxHCUDepth: number }) {
    // eslint-disable-next-line no-console
    console.log(
      `      HCU ${label}: global=${hcu.globalHCU.toLocaleString("en-US")} depth=${hcu.maxHCUDepth.toLocaleString("en-US")}`,
    );
    expect(hcu.globalHCU).to.be.lessThan(GLOBAL_LIMIT);
    expect(hcu.maxHCUDepth).to.be.lessThan(DEPTH_LIMIT);
  }

  it("first deposit (registration + credit) fits the budget", async function () {
    report("first deposit", await measureDeposit(6_000n * M));
  });

  it("repeat deposit fits the budget", async function () {
    report("repeat deposit", await measureDeposit(1_000n * M));
  });

  it("partial withdraw fits the budget", async function () {
    const enc = await fhevm.createEncryptedInput(potAddress, jimmer.address).add64(1_500n * M).encrypt();
    const tx = await pot.connect(jimmer).withdraw(enc.handles[0], enc.inputProof);
    report("partial withdraw", fhevm.computeTransactionHCU((await tx.wait())!));
  });

  it("withdrawAll fits the budget", async function () {
    const tx = await pot.connect(jimmer).withdrawAll();
    report("withdrawAll", fhevm.computeTransactionHCU((await tx.wait())!));
  });
});

/**
 * Day 3 measurements: TWAB accrual (scalar mul now runs inside _checkpoint on
 * every principal mutation) and the snapshot pipeline. The 8-participant batch
 * yields the marginal per-participant cost, from which the Day 4 keeper batch
 * ceiling is derived with 20% headroom on BOTH axes. Numbers go verbatim into
 * docs/DRAW_PROTOCOL.md.
 */
describe("PayDayPot — HCU budget (Day 3: TWAB + snapshot)", function () {
  const GLOBAL_LIMIT = 20_000_000;
  const DEPTH_LIMIT = 5_000_000;
  const M6 = 1_000_000n;

  let users: HardhatEthersSigner[]; // 8 participants, worst-case batch fixture
  let usdc: TestUSDC;
  let token: TestConfidentialUSDC;
  let pot: PayDayPot;
  let tokenAddress: string;
  let potAddress: string;
  let epochEnd: bigint;

  let single: { globalHCU: number; maxHCUDepth: number }; // snapshotBatch(1)

  before(async function () {
    if (!fhevm.isMock) {
      this.skip();
    }
    const s = await ethers.getSigners();
    users = s.slice(10, 18); // clear of the personas used elsewhere
    usdc = await (await ethers.getContractFactory("TestUSDC")).deploy();
    token = await (await ethers.getContractFactory("TestConfidentialUSDC")).deploy(await usdc.getAddress());
    tokenAddress = await token.getAddress();
    pot = await (
      await ethers.getContractFactory("PayDayPot")
    ).deploy(tokenAddress, s[4].address, 7n * 24n * 3600n, 10_000n * M6, 32);
    potAddress = await pot.getAddress();
    epochEnd = (await pot.epochInfo(1)).end;

    for (const [i, user] of users.entries()) {
      await usdc.mint(user.address, 10_000n * M6);
      await usdc.connect(user).approve(tokenAddress, 10_000n * M6);
      await token.connect(user).wrap(user.address, 10_000n * M6);
      const enc = await fhevm
        .createEncryptedInput(tokenAddress, user.address)
        .add64(BigInt(i + 1) * 1_000n * M6)
        .encrypt();
      await token
        .connect(user)
        ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](potAddress, enc.handles[0], enc.inputProof, "0x");
    }
  });

  function report(label: string, hcu: { globalHCU: number; maxHCUDepth: number }) {
    // eslint-disable-next-line no-console
    console.log(
      `      HCU ${label}: global=${hcu.globalHCU.toLocaleString("en-US")} depth=${hcu.maxHCUDepth.toLocaleString("en-US")}`,
    );
    expect(hcu.globalHCU).to.be.lessThan(GLOBAL_LIMIT);
    expect(hcu.maxHCUDepth).to.be.lessThan(DEPTH_LIMIT);
    return hcu;
  }

  it("repeat deposit WITH accrual (a day of TWAB folded in) fits the budget", async function () {
    await time.increase(86_400);
    const enc = await fhevm.createEncryptedInput(tokenAddress, users[0].address).add64(500n * M6).encrypt();
    const tx = await token
      .connect(users[0])
      ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](potAddress, enc.handles[0], enc.inputProof, "0x");
    report("deposit + accrual", fhevm.computeTransactionHCU((await tx.wait())!));
  });

  it("withdrawAll WITH accrual fits the budget", async function () {
    await time.increase(86_400);
    const tx = await pot.connect(users[1]).withdrawAll();
    report("withdrawAll + accrual", fhevm.computeTransactionHCU((await tx.wait())!));
  });

  it("beginSnapshot is a single trivialEncrypt — near-free", async function () {
    await time.increaseTo(epochEnd);
    const tx = await pot.beginSnapshot();
    report("beginSnapshot", fhevm.computeTransactionHCU((await tx.wait())!));
  });

  it("snapshotBatch(1) — worst-case single participant (full accrual + fold)", async function () {
    const tx = await pot.snapshotBatch(1);
    single = report("snapshotBatch(1)", fhevm.computeTransactionHCU((await tx.wait())!));
  });

  it("snapshotBatch over the remaining 7 — marginal cost derives the Day 4 batch ceiling", async function () {
    const tx = await pot.snapshotBatch(32); // clamps to the 7 left
    const batch = report("snapshotBatch(7)", fhevm.computeTransactionHCU((await tx.wait())!));

    // Every participant here is "unfrozen" (accrual mul runs for all — the
    // users[1] withdrawAll left an encrypted zero, same op count), so the
    // marginal figures are worst-case.
    const margGlobal = Math.ceil(batch.globalHCU / 7);
    const margDepth = Math.ceil((batch.maxHCUDepth - single.maxHCUDepth) / 6);
    const ceilGlobal = Math.floor((0.8 * GLOBAL_LIMIT) / margGlobal);
    const ceilDepth = Math.floor((0.8 * DEPTH_LIMIT - single.maxHCUDepth) / margDepth) + 1;
    const ceiling = Math.min(ceilGlobal, ceilDepth);
    // eslint-disable-next-line no-console
    console.log(
      `      HCU marginal/participant: global≈${margGlobal.toLocaleString("en-US")} depth≈${margDepth.toLocaleString("en-US")}` +
        ` → batch ceiling @80% headroom: min(global ${ceilGlobal}, depth ${ceilDepth}) = ${ceiling}`,
    );
    // Day 4's default batch of 8 must sit comfortably under the ceiling.
    expect(ceiling).to.be.at.least(8);
  });
});

/**
 * Day 4 measurements: the draw pipeline. requestRandom carries the single most
 * expensive op in the system (euint128 non-scalar mul ≈ 1.69M HCU) but runs
 * exactly once per epoch; selectBatch's per-participant marginal cost sets the
 * keeper batch ceiling for the scan, derived with the same 20%-headroom
 * formula as the snapshot. Numbers go verbatim into docs/DRAW_PROTOCOL.md §4.
 */
describe("PayDayPot — HCU budget (Day 4: draw)", function () {
  const GLOBAL_LIMIT = 20_000_000;
  const DEPTH_LIMIT = 5_000_000;
  const M6 = 1_000_000n;

  let users: HardhatEthersSigner[]; // 8 participants, same fixture shape as Day 3
  let usdc: TestUSDC;
  let token: TestConfidentialUSDC;
  let pot: PayDayPot;
  let tokenAddress: string;
  let potAddress: string;

  let single: { globalHCU: number; maxHCUDepth: number }; // selectBatch(1)

  before(async function () {
    if (!fhevm.isMock) {
      this.skip();
    }
    const s = await ethers.getSigners();
    users = s.slice(10, 18);
    usdc = await (await ethers.getContractFactory("TestUSDC")).deploy();
    token = await (await ethers.getContractFactory("TestConfidentialUSDC")).deploy(await usdc.getAddress());
    tokenAddress = await token.getAddress();
    pot = await (
      await ethers.getContractFactory("PayDayPot")
    ).deploy(tokenAddress, s[4].address, 7n * 24n * 3600n, 10_000n * M6, 32);
    potAddress = await pot.getAddress();

    for (const [i, user] of users.entries()) {
      await usdc.mint(user.address, 10_000n * M6);
      await usdc.connect(user).approve(tokenAddress, 10_000n * M6);
      await token.connect(user).wrap(user.address, 10_000n * M6);
      const enc = await fhevm
        .createEncryptedInput(tokenAddress, user.address)
        .add64(BigInt(i + 1) * 1_000n * M6)
        .encrypt();
      await token
        .connect(user)
        ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](potAddress, enc.handles[0], enc.inputProof, "0x");
    }
    // Snapshot completely — its cost is Day 3's measurement, not this one's.
    await time.increaseTo((await pot.epochInfo(1)).end);
    await pot.beginSnapshot();
    await pot.snapshotBatch(32);
  });

  function report(label: string, hcu: { globalHCU: number; maxHCUDepth: number }, gasUsed?: bigint) {
    // eslint-disable-next-line no-console
    console.log(
      `      HCU ${label}: global=${hcu.globalHCU.toLocaleString("en-US")} depth=${hcu.maxHCUDepth.toLocaleString("en-US")}` +
        (gasUsed !== undefined ? ` gas=${gasUsed.toLocaleString("en-US")}` : ""),
    );
    expect(hcu.globalHCU).to.be.lessThan(GLOBAL_LIMIT);
    expect(hcu.maxHCUDepth).to.be.lessThan(DEPTH_LIMIT);
    return hcu;
  }

  it("requestRandom (rand + u128 multiply-high ticket) fits the budget — once per epoch", async function () {
    const receipt = (await (await pot.requestRandom()).wait())!;
    const hcu = report("requestRandom", fhevm.computeTransactionHCU(receipt), receipt.gasUsed);
    // Regression guard: the euint128 non-scalar mul (the P-2 core) really ran.
    expect(hcu.globalHCU).to.be.greaterThan(1_686_000);
  });

  it("selectBatch(1) — single participant (scan step + prize credit + ACL grants)", async function () {
    const receipt = (await (await pot.selectBatch(1)).wait())!;
    single = report("selectBatch(1)", fhevm.computeTransactionHCU(receipt), receipt.gasUsed);
  });

  it("selectBatch over the remaining 7 — marginal cost derives the scan batch ceiling", async function () {
    const receipt = (await (await pot.selectBatch(32)).wait())!; // clamps to the 7 left
    const batch = report("selectBatch(7)", fhevm.computeTransactionHCU(receipt), receipt.gasUsed);

    // Same worst-case shape as the snapshot derivation: every scanned
    // participant runs the identical 7-op sequence (add/lt/not/and/select/
    // add/or), so the marginal figures are uniform by construction.
    const margGlobal = Math.ceil(batch.globalHCU / 7);
    const margDepth = Math.ceil((batch.maxHCUDepth - single.maxHCUDepth) / 6);
    const ceilGlobal = Math.floor((0.8 * GLOBAL_LIMIT) / margGlobal);
    const ceilDepth = Math.floor((0.8 * DEPTH_LIMIT - single.maxHCUDepth) / margDepth) + 1;
    const ceiling = Math.min(ceilGlobal, ceilDepth);
    const txsForFullPool = Math.ceil(32 / ceiling);
    // eslint-disable-next-line no-console
    console.log(
      `      HCU marginal/participant: global≈${margGlobal.toLocaleString("en-US")} depth≈${margDepth.toLocaleString("en-US")}` +
        ` → scan ceiling @80% headroom: min(global ${ceilGlobal}, depth ${ceilDepth}) = ${ceiling}` +
        ` (full 32-pool scan: ${txsForFullPool} tx)`,
    );
    // Exit gate: the default batch of 8 fits, and a full 32-participant pool
    // completes in a bounded handful of permissionless txs.
    expect(ceiling).to.be.at.least(8);
    expect(txsForFullPool).to.be.at.most(4);
  });
});

/**
 * Day 5 measurements: the money paths that close the protocol.
 *
 * Two things are being watched here, and they are not the same thing:
 *   - HCU, for fundPrize / claim, which run FHE ops;
 *   - GAS, for startNewEpoch, which runs almost no FHE but touches storage
 *     and the ACL for every participant in one unsplittable transaction.
 *     A pool that cannot start its next epoch inside one block is bricked,
 *     so this is measured at the full 32-participant cap, not at 8.
 *
 * Numbers go verbatim into docs/DRAW_PROTOCOL.md §6 and the Day 5 handoff.
 */
describe("PayDayPot — HCU + gas budget (Day 5: prize, claim, lifecycle)", function () {
  this.timeout(300_000);

  const GLOBAL_LIMIT = 20_000_000;
  const DEPTH_LIMIT = 5_000_000;
  const M6 = 1_000_000n;
  const PER_USER_CAP = 10_000n * M6;

  function report(label: string, hcu: { globalHCU: number; maxHCUDepth: number }, gasUsed?: bigint) {
    // eslint-disable-next-line no-console
    console.log(
      `      HCU ${label}: global=${hcu.globalHCU.toLocaleString("en-US")} depth=${hcu.maxHCUDepth.toLocaleString("en-US")}` +
        (gasUsed !== undefined ? ` gas=${gasUsed.toLocaleString("en-US")}` : ""),
    );
    expect(hcu.globalHCU).to.be.lessThan(GLOBAL_LIMIT);
    expect(hcu.maxHCUDepth).to.be.lessThan(DEPTH_LIMIT);
    return hcu;
  }

  describe("prize funding and claim", function () {
    let employer: HardhatEthersSigner;
    let winner: HardhatEthersSigner; // the only participant with positive weight
    let loser: HardhatEthersSigner; // registered, weight 0 — a refunded deposit
    let usdc: TestUSDC;
    let token: TestConfidentialUSDC;
    let pot: PayDayPot;
    let tokenAddress: string;
    let potAddress: string;

    let winnerClaim: { globalHCU: number; maxHCUDepth: number; gas: bigint };

    before(async function () {
      if (!fhevm.isMock) {
        this.skip();
      }
      const s = await ethers.getSigners();
      employer = s[4];
      winner = s[18];
      loser = s[19];
      usdc = await (await ethers.getContractFactory("TestUSDC")).deploy();
      token = await (await ethers.getContractFactory("TestConfidentialUSDC")).deploy(await usdc.getAddress());
      tokenAddress = await token.getAddress();
      pot = await (
        await ethers.getContractFactory("PayDayPot")
      ).deploy(tokenAddress, employer.address, 7n * 24n * 3600n, PER_USER_CAP, 32);
      potAddress = await pot.getAddress();

      for (const user of [winner, loser]) {
        await usdc.mint(user.address, 25_000n * M6);
        await usdc.connect(user).approve(tokenAddress, 25_000n * M6);
        await token.connect(user).wrap(user.address, 25_000n * M6);
      }
      // Deterministic winner without touching the draw: `winner` registers
      // first with real weight; `loser` registers with a deposit the cap
      // refunds in full, so its weight is zero. Since ticket = ⌊R·T/2^64⌋ < T,
      // the scan always crosses the first positive-weight participant.
      for (const [user, amount] of [
        [winner, 4_000n * M6],
        [loser, PER_USER_CAP + 1n],
      ] as const) {
        const enc = await fhevm.createEncryptedInput(tokenAddress, user.address).add64(amount).encrypt();
        await token
          .connect(user)
          ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](potAddress, enc.handles[0], enc.inputProof, "0x");
      }
    });

    it("fundPrize (ERC-20 pull + wrap by the contract) fits the budget", async function () {
      await usdc.mint(employer.address, 1_000n * M6);
      await usdc.connect(employer).approve(potAddress, 1_000n * M6);
      const receipt = (await (await pot.connect(employer).fundPrize(1_000n * M6)).wait())!;
      report("fundPrize", fhevm.computeTransactionHCU(receipt), receipt.gasUsed);
    });

    it("defundPrize (trivial encrypt + transfer out) fits the budget", async function () {
      const receipt = (await (await pot.connect(employer).defundPrize(100n * M6)).wait())!;
      report("defundPrize", fhevm.computeTransactionHCU(receipt), receipt.gasUsed);
    });

    it("claim by the winner fits the budget", async function () {
      await time.increaseTo((await pot.epochInfo(1)).end);
      await pot.beginSnapshot();
      await pot.snapshotBatch(32);
      await pot.requestRandom();
      await pot.selectBatch(32);

      const receipt = (await (await pot.connect(winner).claim()).wait())!;
      const hcu = report("claim (winner)", fhevm.computeTransactionHCU(receipt), receipt.gasUsed);
      winnerClaim = { ...hcu, gas: receipt.gasUsed };
    });

    it("claim by a non-winner costs EXACTLY the same — the tx shape leaks nothing", async function () {
      const receipt = (await (await pot.connect(loser).claim()).wait())!;
      const hcu = report("claim (non-winner)", fhevm.computeTransactionHCU(receipt), receipt.gasUsed);

      // The anti-leak claim, measured rather than argued: claim() runs one
      // data-independent code path, so an observer watching gas or HCU cannot
      // tell a payout from a zero transfer. Exact equality, not a tolerance —
      // any divergence means a branch crept in.
      expect(hcu.globalHCU, "claim HCU differs between winner and non-winner").to.eq(winnerClaim.globalHCU);
      expect(hcu.maxHCUDepth, "claim HCU depth differs between winner and non-winner").to.eq(winnerClaim.maxHCUDepth);
      expect(receipt.gasUsed, "claim gas differs between winner and non-winner").to.eq(winnerClaim.gas);
    });
  });

  describe("startNewEpoch at the 32-participant cap — the gas ceiling", function () {
    const POOL = 32;
    let employer: HardhatEthersSigner;
    let participants: HardhatEthersSigner[];
    let usdc: TestUSDC;
    let token: TestConfidentialUSDC;
    let pot: PayDayPot;

    before(async function () {
      if (!fhevm.isMock) {
        this.skip();
      }
      const s = await ethers.getSigners();
      employer = s[4];
      usdc = await (await ethers.getContractFactory("TestUSDC")).deploy();
      token = await (await ethers.getContractFactory("TestConfidentialUSDC")).deploy(await usdc.getAddress());
      const tokenAddress = await token.getAddress();
      pot = await (
        await ethers.getContractFactory("PayDayPot")
      ).deploy(tokenAddress, employer.address, 7n * 24n * 3600n, PER_USER_CAP, POOL);
      const potAddress = await pot.getAddress();

      // Hardhat hands out 20 accounts; the rest are derived deterministically
      // and funded from the deployer so the fixture is reproducible.
      participants = [...s.slice(0, POOL)];
      for (let i = participants.length; i < POOL; i++) {
        const wallet = new ethers.Wallet(ethers.zeroPadValue(ethers.toBeHex(0xda720000 + i), 32), ethers.provider);
        await s[0].sendTransaction({ to: wallet.address, value: ethers.parseEther("1") });
        participants.push(wallet as unknown as HardhatEthersSigner);
      }

      for (const [i, user] of participants.entries()) {
        await usdc.mint(user.address, 2_000n * M6);
        await usdc.connect(user).approve(tokenAddress, 2_000n * M6);
        await token.connect(user).wrap(user.address, 2_000n * M6);
        const enc = await fhevm
          .createEncryptedInput(tokenAddress, user.address)
          .add64(BigInt(i + 1) * 10n * M6)
          .encrypt();
        await token
          .connect(user)
          ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](potAddress, enc.handles[0], enc.inputProof, "0x");
      }
      expect(await pot.participantCount()).to.eq(BigInt(POOL));

      // Run the epoch to Settled so startNewEpoch is measured on the real
      // post-draw state: every twabArea and won flag holds a live handle.
      //
      // Batches of 16, not 32: a full-pool sweep blows the 5M sequential-depth
      // limit outright (the measured ceilings above are 21 for snapshot and 22
      // for scan). That is exactly why both are cursor-driven — this fixture is
      // the keeper's real 2-tx-per-stage shape, not a shortcut around it.
      await time.increaseTo((await pot.epochInfo(1)).end);
      await pot.beginSnapshot();
      await pot.snapshotBatch(16);
      await pot.snapshotBatch(16);
      await pot.requestRandom();
      await pot.selectBatch(16);
      await pot.selectBatch(16);
      expect((await pot.epochInfo(1)).phase, "the fixture epoch did not settle").to.eq(3n);
    });

    it(`startNewEpoch resets all ${POOL} participants in ONE tx, well under a block`, async function () {
      const receipt = (await (await pot.startNewEpoch()).wait())!;
      const hcu = report(`startNewEpoch(${POOL})`, fhevm.computeTransactionHCU(receipt), receipt.gasUsed);

      const perParticipant = Number(receipt.gasUsed) / POOL;
      // eslint-disable-next-line no-console
      console.log(
        `      gas/participant ≈ ${Math.round(perParticipant).toLocaleString("en-US")}` +
          ` — a 30M-gas block fits a pool of ${Math.floor((0.8 * 30_000_000) / perParticipant)} at 80% headroom`,
      );

      // Exit gate: the reset is one unsplittable tx, so it must sit far below
      // a block. 10M leaves 3× headroom against Sepolia's 36M limit and holds
      // even if a client is configured with a 30M ceiling.
      expect(receipt.gasUsed, "startNewEpoch approaches the block gas limit").to.be.lessThan(10_000_000n);
      // Almost no FHE here: two shared handles, reused for every participant.
      expect(hcu.globalHCU).to.be.lessThan(1_000_000);
    });
  });
});
