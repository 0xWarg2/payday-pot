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
