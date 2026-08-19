import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";

import { CompatSpike, CompatSpike__factory } from "../types";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
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
    signers = { deployer: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn("This suite runs only in the local FHE mock environment");
      this.skip();
    }
    ({ contract, contractAddress } = await deployFixture());
  });

  it("uninitialized value is the zero handle (not encrypted zero)", async function () {
    const handle = await contract.getValue(signers.alice.address);
    expect(handle).to.eq(ethers.ZeroHash);
  });

  it("setValue: alice writes and user-decrypts her exact value", async function () {
    const input = await encrypt64(contractAddress, signers.alice, 123_456n);
    await (await contract.connect(signers.alice).setValue(input.handles[0], input.inputProof)).wait();

    const handle = await contract.getValue(signers.alice.address);
    const clear = await fhevm.userDecryptEuint(FhevmType.euint64, handle, contractAddress, signers.alice);
    expect(clear).to.eq(123_456n);
  });

  it("addValue: accumulates across calls (FHE.add + deliberate zero init)", async function () {
    const first = await encrypt64(contractAddress, signers.alice, 100n);
    await (await contract.connect(signers.alice).addValue(first.handles[0], first.inputProof)).wait();

    const second = await encrypt64(contractAddress, signers.alice, 250n);
    await (await contract.connect(signers.alice).addValue(second.handles[0], second.inputProof)).wait();

    const handle = await contract.getValue(signers.alice.address);
    const clear = await fhevm.userDecryptEuint(FhevmType.euint64, handle, contractAddress, signers.alice);
    expect(clear).to.eq(350n);
  });

  it("NEGATIVE ACL: bob cannot decrypt alice's handle", async function () {
    const input = await encrypt64(contractAddress, signers.alice, 777n);
    await (await contract.connect(signers.alice).setValue(input.handles[0], input.inputProof)).wait();

    const handle = await contract.getValue(signers.alice.address);
    await expect(
      fhevm.userDecryptEuint(FhevmType.euint64, handle, contractAddress, signers.bob),
    ).to.be.rejected;
  });

  it("NEGATIVE ACL: deployer (admin) cannot decrypt alice's handle either", async function () {
    const input = await encrypt64(contractAddress, signers.alice, 999n);
    await (await contract.connect(signers.alice).setValue(input.handles[0], input.inputProof)).wait();

    const handle = await contract.getValue(signers.alice.address);
    await expect(
      fhevm.userDecryptEuint(FhevmType.euint64, handle, contractAddress, signers.deployer),
    ).to.be.rejected;
  });

  it("isolation: alice and bob values are independent", async function () {
    const a = await encrypt64(contractAddress, signers.alice, 11n);
    await (await contract.connect(signers.alice).setValue(a.handles[0], a.inputProof)).wait();
    const b = await encrypt64(contractAddress, signers.bob, 22n);
    await (await contract.connect(signers.bob).setValue(b.handles[0], b.inputProof)).wait();

    const aClear = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      await contract.getValue(signers.alice.address),
      contractAddress,
      signers.alice,
    );
    const bClear = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      await contract.getValue(signers.bob.address),
      contractAddress,
      signers.bob,
    );
    expect(aClear).to.eq(11n);
    expect(bClear).to.eq(22n);
  });

  it("input proof bound to another user is rejected", async function () {
    // Encrypted input created for alice must not be usable by bob.
    const input = await encrypt64(contractAddress, signers.alice, 555n);
    await expect(contract.connect(signers.bob).setValue(input.handles[0], input.inputProof)).to.be
      .reverted;
  });

  it("events contain no amount", async function () {
    const input = await encrypt64(contractAddress, signers.alice, 42n);
    await expect(contract.connect(signers.alice).setValue(input.handles[0], input.inputProof))
      .to.emit(contract, "ValueChanged")
      .withArgs(signers.alice.address);
  });
});
