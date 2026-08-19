import { FhevmType } from "@fhevm/hardhat-plugin";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";

import { PayDayPot, TestConfidentialUSDC, TestUSDC } from "../types";

const M = 1_000_000n;
const PER_USER_CAP = 10_000n * M;
const SEED = 0xda72; // fixed seed — reproduce a failure by rerunning with the logged seed
const OPS = 30;

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

describe("PayDayPot — principal conservation property", function () {
  this.timeout(120_000);

  it(`survives ${OPS} random deposit/withdraw ops without violating conservation (seed 0x${SEED.toString(16)})`, async function () {
    if (!fhevm.isMock) {
      this.skip();
    }

    const s = await ethers.getSigners();
    const usdc: TestUSDC = await (await ethers.getContractFactory("TestUSDC")).deploy();
    const token: TestConfidentialUSDC = await (
      await ethers.getContractFactory("TestConfidentialUSDC")
    ).deploy(await usdc.getAddress());
    const tokenAddress = await token.getAddress();
    const pot: PayDayPot = await (
      await ethers.getContractFactory("PayDayPot")
    ).deploy(tokenAddress, s[4].address, 7n * 24n * 3600n, PER_USER_CAP, 32);
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

    const rand = mulberry32(SEED);
    const trace: string[] = [];

    /** 500-token quantized amounts in [0, 12_500e6] — crosses both the 10k cap and warg's 5k wallet. */
    const randAmount = () => BigInt(Math.floor(rand() * 26)) * 500n * M;

    async function opDeposit(u: UserModel, amount: bigint) {
      const enc = await fhevm.createEncryptedInput(tokenAddress, u.signer.address).add64(amount).encrypt();
      await token
        .connect(u.signer)
        ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](potAddress, enc.handles[0], enc.inputProof, "0x");
      // Model — clamp layer 1 (token wallet, all-or-nothing):
      const sent = amount <= u.wallet ? amount : 0n;
      // Model — clamp layer 2 (pot cap, all-or-nothing refund):
      const credited = sent <= PER_USER_CAP - u.principal ? sent : 0n;
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

    /** Mock-only debugger sweep (no EIP-712 round trip) — fast mid-run invariant check. */
    async function assertInvariants(label: string) {
      let sum = 0n;
      for (const u of users) {
        if (u.registered) {
          const onchain = await fhevm.debugger.decryptEuint(FhevmType.euint64, await pot.principalOf(u.signer.address));
          expect(onchain, `${label}: principal(${u.name})\n${trace.join("\n")}`).to.eq(u.principal);
          expect(u.principal, `${label}: model cap invariant (${u.name})`).to.be.lte(PER_USER_CAP);
          sum += u.principal;
        }
      }
      const total = await fhevm.debugger.decryptEuint(FhevmType.euint64, await pot.totalPrincipal());
      const potBalance = await fhevm.debugger.decryptEuint(
        FhevmType.euint64,
        await token.confidentialBalanceOf(potAddress),
      );
      expect(total, `${label}: totalPrincipal\n${trace.join("\n")}`).to.eq(sum);
      expect(potBalance, `${label}: pot token balance\n${trace.join("\n")}`).to.eq(sum);
    }

    for (let i = 0; i < OPS; i++) {
      const u = users[Math.floor(rand() * users.length)];
      const dice = rand();
      if (dice < 0.5) {
        const amount = randAmount();
        trace.push(`#${i} deposit ${u.name} ${amount / M}`);
        await opDeposit(u, amount);
      } else if (dice < 0.85) {
        const amount = randAmount();
        trace.push(`#${i} withdraw ${u.name} ${amount / M}`);
        await opWithdraw(u, amount);
      } else {
        trace.push(`#${i} withdrawAll ${u.name}`);
        await opWithdrawAll(u);
      }
      if ((i + 1) % 10 === 0) {
        await assertInvariants(`after op #${i}`);
      }
    }

    // Final sweep through the REAL user-decrypt path (EIP-712), not the debugger:
    // proves the product-facing ACL story end to end.
    let finalSum = 0n;
    for (const u of users) {
      if (u.registered) {
        const principal = await fhevm.userDecryptEuint(
          FhevmType.euint64,
          await pot.principalOf(u.signer.address),
          potAddress,
          u.signer,
        );
        expect(principal, `final: principal(${u.name})\n${trace.join("\n")}`).to.eq(u.principal);
        finalSum += principal;
      }
      const wallet = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        await token.confidentialBalanceOf(u.signer.address),
        tokenAddress,
        u.signer,
      );
      expect(wallet, `final: wallet(${u.name})\n${trace.join("\n")}`).to.eq(u.wallet);
    }
    const total = await fhevm.debugger.decryptEuint(FhevmType.euint64, await pot.totalPrincipal());
    expect(total, "final: totalPrincipal").to.eq(finalSum);
  });
});
