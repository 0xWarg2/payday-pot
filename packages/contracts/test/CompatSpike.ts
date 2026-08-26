import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";

import { CompatSpike, CompatSpike__factory, TestConfidentialUSDC, TestUSDC } from "../types";

type Signers = {
  deployer: HardhatEthersSigner;
  jimmer: HardhatEthersSigner;
  warg: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("CompatSpike")) as CompatSpike__factory;
  const contract = (await factory.deploy()) as CompatSpike;
  const contractAddress = await contract.getAddress();
  return { contract, contractAddress };
}

/** Encrypt a clear uint64 as external input bound to (contract, user). */
async function encrypt64(contractAddress: string, user: HardhatEthersSigner, value: number | bigint) {
  return fhevm.createEncryptedInput(contractAddress, user.address).add64(value).encrypt();
}

describe("CompatSpike (Day 1 compatibility spike)", function () {
  let signers: Signers;
  let contract: CompatSpike;
  let contractAddress: string;

  before(async function () {
    const ethSigners = await ethers.getSigners();
    signers = { deployer: ethSigners[0], jimmer: ethSigners[1], warg: ethSigners[2] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn("This suite runs only in the local FHE mock environment");
      this.skip();
    }
    ({ contract, contractAddress } = await deployFixture());
  });

  it("uninitialized value is the zero handle (not encrypted zero)", async function () {
    const handle = await contract.getValue(signers.jimmer.address);
    expect(handle).to.eq(ethers.ZeroHash);
  });

  it("setValue: jimmer writes and user-decrypts her exact value", async function () {
    const input = await encrypt64(contractAddress, signers.jimmer, 123_456n);
    await (await contract.connect(signers.jimmer).setValue(input.handles[0], input.inputProof)).wait();

    const handle = await contract.getValue(signers.jimmer.address);
    const clear = await fhevm.userDecryptEuint(FhevmType.euint64, handle, contractAddress, signers.jimmer);
    expect(clear).to.eq(123_456n);
  });

  it("addValue: accumulates across calls (FHE.add + deliberate zero init)", async function () {
    const first = await encrypt64(contractAddress, signers.jimmer, 100n);
    await (await contract.connect(signers.jimmer).addValue(first.handles[0], first.inputProof)).wait();

    const second = await encrypt64(contractAddress, signers.jimmer, 250n);
    await (await contract.connect(signers.jimmer).addValue(second.handles[0], second.inputProof)).wait();

    const handle = await contract.getValue(signers.jimmer.address);
    const clear = await fhevm.userDecryptEuint(FhevmType.euint64, handle, contractAddress, signers.jimmer);
    expect(clear).to.eq(350n);
  });

  it("NEGATIVE ACL: warg cannot decrypt jimmer's handle", async function () {
    const input = await encrypt64(contractAddress, signers.jimmer, 777n);
    await (await contract.connect(signers.jimmer).setValue(input.handles[0], input.inputProof)).wait();

    const handle = await contract.getValue(signers.jimmer.address);
    await expect(
      fhevm.userDecryptEuint(FhevmType.euint64, handle, contractAddress, signers.warg),
    ).to.be.rejected;
  });

  it("NEGATIVE ACL: deployer (admin) cannot decrypt jimmer's handle either", async function () {
    const input = await encrypt64(contractAddress, signers.jimmer, 999n);
    await (await contract.connect(signers.jimmer).setValue(input.handles[0], input.inputProof)).wait();

    const handle = await contract.getValue(signers.jimmer.address);
    await expect(
      fhevm.userDecryptEuint(FhevmType.euint64, handle, contractAddress, signers.deployer),
    ).to.be.rejected;
  });

  it("isolation: jimmer and warg values are independent", async function () {
    const a = await encrypt64(contractAddress, signers.jimmer, 11n);
    await (await contract.connect(signers.jimmer).setValue(a.handles[0], a.inputProof)).wait();
    const b = await encrypt64(contractAddress, signers.warg, 22n);
    await (await contract.connect(signers.warg).setValue(b.handles[0], b.inputProof)).wait();

    const aClear = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      await contract.getValue(signers.jimmer.address),
      contractAddress,
      signers.jimmer,
    );
    const bClear = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      await contract.getValue(signers.warg.address),
      contractAddress,
      signers.warg,
    );
    expect(aClear).to.eq(11n);
    expect(bClear).to.eq(22n);
  });

  it("input proof bound to another user is rejected", async function () {
    // Encrypted input created for jimmer must not be usable by warg.
    const input = await encrypt64(contractAddress, signers.jimmer, 555n);
    await expect(contract.connect(signers.warg).setValue(input.handles[0], input.inputProof)).to.be
      .reverted;
  });

  it("events contain no amount", async function () {
    const input = await encrypt64(contractAddress, signers.jimmer, 42n);
    await expect(contract.connect(signers.jimmer).setValue(input.handles[0], input.inputProof))
      .to.emit(contract, "ValueChanged")
      .withArgs(signers.jimmer.address);
  });
});

/**
 * Day 5 gate: PayDayPot.fundPrize will make the POT itself call
 * ERC7984ERC20Wrapper.wrap — a shape this repo has never exercised (every
 * wrap so far was an EOA wrapping for itself). The whole employer-funding
 * design rests on three claims proven below; if any breaks, Day 5 changes
 * direction before a line of product code is written.
 */
describe("CompatSpike — wrap BY CONTRACT (Day 5 fundPrize gate)", function () {
  const M = 1_000_000n; // 6 decimals

  let signers: Signers;
  let spike: CompatSpike;
  let spikeAddress: string;
  let usdc: TestUSDC;
  let token: TestConfidentialUSDC;
  let tokenAddress: string;

  before(async function () {
    const ethSigners = await ethers.getSigners();
    signers = { deployer: ethSigners[0], jimmer: ethSigners[1], warg: ethSigners[2] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      this.skip();
    }
    ({ contract: spike, contractAddress: spikeAddress } = await deployFixture());
    usdc = await (await ethers.getContractFactory("TestUSDC")).deploy();
    token = await (await ethers.getContractFactory("TestConfidentialUSDC")).deploy(await usdc.getAddress());
    tokenAddress = await token.getAddress();
  });

  it("(a) a contract can wrap on its own behalf — and the wrapped balance is the contract's", async function () {
    const { jimmer } = signers;
    await usdc.mint(jimmer.address, 1_000n * M);
    await usdc.connect(jimmer).approve(spikeAddress, 1_000n * M);

    const tx = await spike.connect(jimmer).spikeWrap(tokenAddress, 1_000n * M);
    const receipt = (await tx.wait())!;

    // The underlying moved sponsor → spike → wrapper; the spike keeps none.
    expect(await usdc.balanceOf(jimmer.address)).to.eq(0n);
    expect(await usdc.balanceOf(spikeAddress)).to.eq(0n);
    expect(await usdc.balanceOf(tokenAddress)).to.eq(1_000n * M);

    // The confidential balance landed on the CONTRACT, not the caller.
    const spikeHandle = await token.confidentialBalanceOf(spikeAddress);
    expect(spikeHandle).to.not.eq(ethers.ZeroHash);
    expect(await token.confidentialBalanceOf(jimmer.address)).to.eq(ethers.ZeroHash);

    // [mock-only inspection] rate is 1, so 1000 USDC ⇒ 1000 confidential units.
    expect(await fhevm.debugger.decryptEuint(FhevmType.euint64, spikeHandle)).to.eq(1_000n * M);

    const hcu = fhevm.computeTransactionHCU(receipt);
    // eslint-disable-next-line no-console
    console.log(
      `      HCU wrap-by-contract: global=${hcu.globalHCU.toLocaleString("en-US")} depth=${hcu.maxHCUDepth.toLocaleString("en-US")} gas=${receipt.gasUsed.toLocaleString("en-US")}`,
    );
    expect(hcu.globalHCU).to.be.lessThan(20_000_000);
    expect(hcu.maxHCUDepth).to.be.lessThan(5_000_000);
  });

  it("(b) R12 backing: an underfunded sponsor REVERTS in plaintext — no silent clamp", async function () {
    const { jimmer } = signers;
    // Approves 1000 but holds only 400: the ERC-20 pull must revert, which is
    // exactly the plaintext backing check ERC-7984's all-or-nothing clamp
    // cannot give us (a confidential transfer would quietly move enc(0)).
    await usdc.mint(jimmer.address, 400n * M);
    await usdc.connect(jimmer).approve(spikeAddress, 1_000n * M);

    await expect(spike.connect(jimmer).spikeWrap(tokenAddress, 1_000n * M)).to.be.revertedWithCustomError(
      usdc,
      "ERC20InsufficientBalance",
    );

    // Nothing moved, nothing minted.
    expect(await usdc.balanceOf(jimmer.address)).to.eq(400n * M);
    expect(await token.confidentialBalanceOf(spikeAddress)).to.eq(ethers.ZeroHash);
  });

  it("(b') a missing ERC-20 approval reverts too (R13 — the 2-step funding shape)", async function () {
    const { jimmer } = signers;
    await usdc.mint(jimmer.address, 1_000n * M);
    // Deliberately no approve() — the employer panel must surface "step 1 of 2".
    await expect(spike.connect(jimmer).spikeWrap(tokenAddress, 1_000n * M)).to.be.revertedWithCustomError(
      usdc,
      "ERC20InsufficientAllowance",
    );
  });

  it("(c) wrapping twice accumulates, and the contract can spend what it wrapped", async function () {
    const { jimmer, warg } = signers;
    await usdc.mint(jimmer.address, 1_500n * M);
    await usdc.connect(jimmer).approve(spikeAddress, 1_500n * M);

    await (await spike.connect(jimmer).spikeWrap(tokenAddress, 1_000n * M)).wait();
    await (await spike.connect(jimmer).spikeWrap(tokenAddress, 500n * M)).wait();

    const handle = await token.confidentialBalanceOf(spikeAddress);
    // [mock-only inspection] forceApprove leaves no stranded allowance and the
    // second wrap folds into the same balance.
    expect(await fhevm.debugger.decryptEuint(FhevmType.euint64, handle)).to.eq(1_500n * M);
    expect(await usdc.allowance(spikeAddress, tokenAddress)).to.eq(0n);

    // The wrapped balance is genuinely the spike's to move: transferring it out
    // is what defundPrize will do. Uses the caller's own ACL over its balance.
    const handleBefore = await token.confidentialBalanceOf(warg.address);
    expect(handleBefore).to.eq(ethers.ZeroHash);
    await (await spike.connect(jimmer).spikeTransfer(tokenAddress, warg.address, 600n * M)).wait();

    expect(
      await fhevm.userDecryptEuint(
        FhevmType.euint64,
        await token.confidentialBalanceOf(warg.address),
        tokenAddress,
        warg,
      ),
    ).to.eq(600n * M);
    expect(
      await fhevm.debugger.decryptEuint(FhevmType.euint64, await token.confidentialBalanceOf(spikeAddress)),
    ).to.eq(900n * M);
  });
});
