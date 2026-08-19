import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
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
