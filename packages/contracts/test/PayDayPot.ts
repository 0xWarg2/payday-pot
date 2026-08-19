import { FhevmType } from "@fhevm/hardhat-plugin";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
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

describe("PayDayPot fixtures — wrap path sanity", function () {
  let signers: Signers;
  let usdc: TestUSDC;
  let token: TestConfidentialUSDC;
  let tokenAddress: string;

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
  });

  it("mint → approve → wrap gives a user-decryptable confidential balance", async function () {
    const { jimmer } = signers;
    await usdc.mint(jimmer.address, 25_000n * M);
    await usdc.connect(jimmer).approve(tokenAddress, 25_000n * M);
    await token.connect(jimmer).wrap(jimmer.address, 25_000n * M);

    const handle = await token.confidentialBalanceOf(jimmer.address);
    const balance = await fhevm.userDecryptEuint(FhevmType.euint64, handle, tokenAddress, jimmer);
    expect(balance).to.eq(25_000n * M);
    expect(await token.decimals()).to.eq(6);
    expect(await token.rate()).to.eq(1n);
  });
});

describe("PayDayPot — deposit / withdraw / invariants", function () {
  let signers: Signers;
  let usdc: TestUSDC;
  let token: TestConfidentialUSDC;
  let pot: PayDayPot;
  let tokenAddress: string;
  let potAddress: string;

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

    // Funding path mirrors live Sepolia exactly: mint → approve → wrap.
    // warg deliberately wraps only 5k so wallet-clamp tests have real teeth.
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

  /** Deposit = confidentialTransferAndCall on the TOKEN — proof binds to the token address. */
  async function deposit(user: HardhatEthersSigner, amount: bigint) {
    const enc = await fhevm.createEncryptedInput(tokenAddress, user.address).add64(amount).encrypt();
    return token
      .connect(user)
      ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](potAddress, enc.handles[0], enc.inputProof, "0x");
  }

  /** Partial withdraw on the POT — proof binds to the pot address. */
  async function withdraw(user: HardhatEthersSigner, amount: bigint) {
    const enc = await fhevm.createEncryptedInput(potAddress, user.address).add64(amount).encrypt();
    return pot.connect(user).withdraw(enc.handles[0], enc.inputProof);
  }

  async function decryptPrincipal(user: HardhatEthersSigner): Promise<bigint> {
    const handle = await pot.principalOf(user.address);
    return fhevm.userDecryptEuint(FhevmType.euint64, handle, potAddress, user);
  }

  async function decryptWallet(user: HardhatEthersSigner): Promise<bigint> {
    const handle = await token.confidentialBalanceOf(user.address);
    return fhevm.userDecryptEuint(FhevmType.euint64, handle, tokenAddress, user);
  }

  /** Mock-only ACL bypass — inspection of invariants, never a product path. */
  async function debugDecrypt(handle: string): Promise<bigint> {
    return fhevm.debugger.decryptEuint(FhevmType.euint64, handle);
  }

  async function expectConservation(users: HardhatEthersSigner[]) {
    let sum = 0n;
    for (const user of users) {
      sum += await decryptPrincipal(user);
    }
    const total = await debugDecrypt(await pot.totalPrincipal());
    const potBalance = await debugDecrypt(await token.confidentialBalanceOf(potAddress));
    expect(total).to.eq(sum);
    expect(potBalance).to.eq(sum);
  }

  // -------------------------------------------------------------------
  // Deposit
  // -------------------------------------------------------------------

  describe("deposit", function () {
    it("credits the encrypted amount, registers the user, and emits amount-free events", async function () {
      const { jimmer } = signers;
      const tx = await deposit(jimmer, 6_000n * M);

      await expect(tx).to.emit(pot, "Registered").withArgs(jimmer.address, 1n);
      await expect(tx).to.emit(pot, "Deposited").withArgs(jimmer.address, 1n);

      expect(await pot.isRegistered(jimmer.address)).to.eq(true);
      expect(await pot.participantCount()).to.eq(1n);
      expect(await pot.participantAt(0)).to.eq(jimmer.address);
      expect(await decryptPrincipal(jimmer)).to.eq(6_000n * M);
      expect(await decryptWallet(jimmer)).to.eq(19_000n * M);
    });

    it("pot events carry no data beyond user + epoch (no amount, encrypted or plaintext)", async function () {
      const tx = await deposit(signers.jimmer, 6_000n * M);
      const receipt = await tx.wait();
      const potLogs = receipt!.logs.filter((l) => l.address === potAddress);
      expect(potLogs.length).to.be.greaterThan(0);
      for (const log of potLogs) {
        // Registered/Deposited: topics = [sig, user, epoch], data must be empty.
        expect(log.data).to.eq("0x");
      }
    });

    it("second deposit accumulates without re-registering", async function () {
      const { jimmer } = signers;
      await deposit(jimmer, 2_000n * M);
      const tx = await deposit(jimmer, 3_000n * M);
      await expect(tx).to.not.emit(pot, "Registered");
      expect(await pot.participantCount()).to.eq(1n);
      expect(await decryptPrincipal(jimmer)).to.eq(5_000n * M);
    });

    it("zero deposit registers the user with an explicit encrypted-zero principal", async function () {
      const { jimmer } = signers;
      await deposit(jimmer, 0n);
      expect(await pot.isRegistered(jimmer.address)).to.eq(true);
      expect(await decryptPrincipal(jimmer)).to.eq(0n);
    });

    it("wallet-clamp: requesting more than the wallet credits zero, never reverts (non-negotiable #2)", async function () {
      const { warg } = signers; // wrapped only 5k
      await deposit(warg, 6_000n * M);
      expect(await pot.isRegistered(warg.address)).to.eq(true);
      expect(await decryptPrincipal(warg)).to.eq(0n);
      expect(await decryptWallet(warg)).to.eq(5_000n * M); // untouched
    });
  });

  // -------------------------------------------------------------------
  // Deposit — negatives and cap boundaries
  // -------------------------------------------------------------------

  describe("deposit negatives", function () {
    it("rejects a proof bound to the wrong contract (pot instead of token)", async function () {
      const { jimmer } = signers;
      // Deposit proofs must bind to the TOKEN (it calls fromExternal) — binding
      // to the pot is the realistic frontend mistake this guards against.
      const enc = await fhevm.createEncryptedInput(potAddress, jimmer.address).add64(1_000n * M).encrypt();
      await expect(
        token
          .connect(jimmer)
          ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](
            potAddress,
            enc.handles[0],
            enc.inputProof,
            "0x",
          ),
      ).to.be.reverted;
    });

    it("rejects deposits routed through a different ERC-7984 token (NotToken)", async function () {
      const { jimmer } = signers;
      const usdc2 = await (await ethers.getContractFactory("TestUSDC")).deploy();
      const token2 = await (await ethers.getContractFactory("TestConfidentialUSDC")).deploy(await usdc2.getAddress());
      const token2Address = await token2.getAddress();
      await usdc2.mint(jimmer.address, 1_000n * M);
      await usdc2.connect(jimmer).approve(token2Address, 1_000n * M);
      await token2.connect(jimmer).wrap(jimmer.address, 1_000n * M);

      const enc = await fhevm.createEncryptedInput(token2Address, jimmer.address).add64(500n * M).encrypt();
      // Pot reverts NotToken; ERC7984Utils re-raises the exact reason bytes,
      // so the custom error selector survives the token's try/catch.
      await expect(
        token2
          .connect(jimmer)
          ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](
            potAddress,
            enc.handles[0],
            enc.inputProof,
            "0x",
          ),
      ).to.be.revertedWithCustomError(pot, "NotToken");
    });

    it("rejects a direct EOA call to the callback (NotToken)", async function () {
      const { jimmer } = signers;
      await expect(
        pot.connect(jimmer).onConfidentialTransferReceived(jimmer.address, jimmer.address, ethers.ZeroHash, "0x"),
      ).to.be.revertedWithCustomError(pot, "NotToken");
    });

    it("accepts a deposit of exactly the per-user cap", async function () {
      const { jimmer } = signers;
      await deposit(jimmer, PER_USER_CAP);
      expect(await decryptPrincipal(jimmer)).to.eq(PER_USER_CAP);
    });

    it("refunds cap+1 in full — tx succeeds, principal unchanged, wallet untouched (R2)", async function () {
      const { jimmer } = signers;
      await deposit(jimmer, PER_USER_CAP + 1n);
      expect(await pot.isRegistered(jimmer.address)).to.eq(true); // slot occupied (KNOWN_LIMITATIONS)
      expect(await decryptPrincipal(jimmer)).to.eq(0n);
      expect(await decryptWallet(jimmer)).to.eq(25_000n * M);
    });

    it("refunds a cap-crossing deposit in full — no partial fill (5k then 6k stays 5k)", async function () {
      const { jimmer } = signers;
      await deposit(jimmer, 5_000n * M);
      await deposit(jimmer, 6_000n * M); // headroom is 5k → all-or-nothing refund
      expect(await decryptPrincipal(jimmer)).to.eq(5_000n * M);
      expect(await decryptWallet(jimmer)).to.eq(20_000n * M);
    });

    it("reverts PoolFull for a new wallet once participantCap is reached; existing users unaffected", async function () {
      const { jimmer, warg, carol, employer } = signers;
      const smallPot: PayDayPot = await (
        await ethers.getContractFactory("PayDayPot")
      ).deploy(tokenAddress, employer.address, EPOCH_DURATION, PER_USER_CAP, 3);
      const smallPotAddress = await smallPot.getAddress();
      await usdc.mint(employer.address, 1_000n * M);
      await usdc.connect(employer).approve(tokenAddress, 1_000n * M);
      await token.connect(employer).wrap(employer.address, 1_000n * M);

      const depositTo = async (user: HardhatEthersSigner, amount: bigint) => {
        const enc = await fhevm.createEncryptedInput(tokenAddress, user.address).add64(amount).encrypt();
        return token
          .connect(user)
          ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](
            smallPotAddress,
            enc.handles[0],
            enc.inputProof,
            "0x",
          );
      };

      await depositTo(jimmer, 1_000n * M);
      await depositTo(warg, 1_000n * M);
      await depositTo(carol, 1_000n * M);
      await expect(depositTo(employer, 500n * M)).to.be.revertedWithCustomError(smallPot, "PoolFull");

      // A registered user can still deposit into the full pool.
      await depositTo(jimmer, 500n * M);
      const handle = await smallPot.principalOf(jimmer.address);
      expect(await fhevm.userDecryptEuint(FhevmType.euint64, handle, smallPotAddress, jimmer)).to.eq(1_500n * M);
    });
  });

  // -------------------------------------------------------------------
  // Withdraw (partial)
  // -------------------------------------------------------------------

  describe("withdraw (partial)", function () {
    beforeEach(async function () {
      await deposit(signers.jimmer, 6_000n * M);
    });

    it("moves exactly the requested amount back to the wallet", async function () {
      const { jimmer } = signers;
      const tx = await withdraw(jimmer, 1_500n * M);
      await expect(tx).to.emit(pot, "Withdrawn").withArgs(jimmer.address, 1n);
      expect(await decryptPrincipal(jimmer)).to.eq(4_500n * M);
      expect(await decryptWallet(jimmer)).to.eq(20_500n * M);
    });

    it("clamps a request above the principal to a full withdrawal — no revert, no leak", async function () {
      const { jimmer } = signers;
      await withdraw(jimmer, 9_000n * M); // principal is only 6k
      expect(await decryptPrincipal(jimmer)).to.eq(0n);
      expect(await decryptWallet(jimmer)).to.eq(25_000n * M);
    });

    it("rejects a proof bound to the wrong contract (token instead of pot)", async function () {
      const { jimmer } = signers;
      const enc = await fhevm.createEncryptedInput(tokenAddress, jimmer.address).add64(1_000n * M).encrypt();
      await expect(pot.connect(jimmer).withdraw(enc.handles[0], enc.inputProof)).to.be.reverted;
    });

    it("reverts NotRegistered before consuming the proof for an unregistered user", async function () {
      const { carol } = signers;
      const enc = await fhevm.createEncryptedInput(potAddress, carol.address).add64(1_000n * M).encrypt();
      await expect(pot.connect(carol).withdraw(enc.handles[0], enc.inputProof)).to.be.revertedWithCustomError(
        pot,
        "NotRegistered",
      );
    });
  });

  // -------------------------------------------------------------------
  // ACL — who can decrypt what
  // -------------------------------------------------------------------

  describe("ACL", function () {
    beforeEach(async function () {
      await deposit(signers.jimmer, 6_000n * M);
    });

    it("owner of the balance can decrypt it", async function () {
      expect(await decryptPrincipal(signers.jimmer)).to.eq(6_000n * M);
    });

    it("another user cannot decrypt it", async function () {
      const handle = await pot.principalOf(signers.jimmer.address);
      await expect(fhevm.userDecryptEuint(FhevmType.euint64, handle, potAddress, signers.warg)).to.be.rejected;
    });

    it("employer cannot decrypt it (non-negotiable #3)", async function () {
      const handle = await pot.principalOf(signers.jimmer.address);
      await expect(fhevm.userDecryptEuint(FhevmType.euint64, handle, potAddress, signers.employer)).to.be.rejected;
    });

    it("single-depositor totalPrincipal ALIASES the depositor's principal handle (known FHEVM artifact)", async function () {
      // Handles are deterministic: keccak(op, lhs, rhs, scalar, acl, chainId) — no
      // counter. With one depositor, total and principal share the exact same op
      // chain add(zero, credited), so they are the SAME ciphertext and share ACL.
      // Harmless: aliasing requires identical histories, i.e. the reader already
      // knows the value. Pinned here so a future change that breaks the alias
      // (or relies on it) is caught. See COMPATIBILITY_NOTES quirk #10.
      expect(await pot.totalPrincipal()).to.eq(await pot.principalOf(signers.jimmer.address));
    });

    it("totalPrincipal is contract-only once histories diverge — no user, employer or owner can decrypt", async function () {
      await deposit(signers.warg, 3_000n * M); // second depositor → op chains diverge
      const handle = await pot.totalPrincipal();
      expect(handle).to.not.eq(await pot.principalOf(signers.jimmer.address));
      expect(handle).to.not.eq(await pot.principalOf(signers.warg.address));
      await expect(fhevm.userDecryptEuint(FhevmType.euint64, handle, potAddress, signers.jimmer)).to.be.rejected;
      await expect(fhevm.userDecryptEuint(FhevmType.euint64, handle, potAddress, signers.warg)).to.be.rejected;
      await expect(fhevm.userDecryptEuint(FhevmType.euint64, handle, potAddress, signers.employer)).to.be.rejected;
      await expect(fhevm.userDecryptEuint(FhevmType.euint64, handle, potAddress, signers.deployer)).to.be.rejected;
    });
  });

  // -------------------------------------------------------------------
  // Withdraw
  // -------------------------------------------------------------------

  describe("withdrawAll", function () {
    it("returns the full principal to the wallet and zeroes the pot balance", async function () {
      const { jimmer } = signers;
      await deposit(jimmer, 6_000n * M);

      const tx = await pot.connect(jimmer).withdrawAll();
      await expect(tx).to.emit(pot, "Withdrawn").withArgs(jimmer.address, 1n);

      expect(await decryptPrincipal(jimmer)).to.eq(0n);
      expect(await decryptWallet(jimmer)).to.eq(25_000n * M); // fully restored
    });

    it("is idempotent — a second call transfers encrypted zero and changes nothing", async function () {
      const { jimmer } = signers;
      await deposit(jimmer, 6_000n * M);
      await pot.connect(jimmer).withdrawAll();
      await pot.connect(jimmer).withdrawAll(); // must not revert

      expect(await decryptPrincipal(jimmer)).to.eq(0n);
      expect(await decryptWallet(jimmer)).to.eq(25_000n * M);
    });

    it("reverts NotRegistered for a user who never deposited", async function () {
      await expect(pot.connect(signers.carol).withdrawAll()).to.be.revertedWithCustomError(pot, "NotRegistered");
    });

    it("deposit works again after a full withdraw (headroom restored)", async function () {
      const { jimmer } = signers;
      await deposit(jimmer, PER_USER_CAP);
      await pot.connect(jimmer).withdrawAll();
      await deposit(jimmer, 4_000n * M);
      expect(await decryptPrincipal(jimmer)).to.eq(4_000n * M);
    });
  });

  // -------------------------------------------------------------------
  // Pause — R10: pause must NEVER block withdraw
  // -------------------------------------------------------------------

  describe("pause", function () {
    it("blocks deposits while paused and allows them again after unpause", async function () {
      const { jimmer, deployer } = signers;
      await deposit(jimmer, 1_000n * M);

      await pot.connect(deployer).pause();
      await expect(deposit(jimmer, 1_000n * M)).to.be.revertedWithCustomError(pot, "EnforcedPause");

      await pot.connect(deployer).unpause();
      await deposit(jimmer, 1_000n * M);
      expect(await decryptPrincipal(jimmer)).to.eq(2_000n * M);
    });

    it("never blocks withdrawAll nor partial withdraw (R10, non-negotiable #1)", async function () {
      const { jimmer, warg, deployer } = signers;
      await deposit(jimmer, 6_000n * M);
      await deposit(warg, 4_000n * M);

      await pot.connect(deployer).pause();

      await withdraw(warg, 1_500n * M); // partial while paused
      expect(await decryptPrincipal(warg)).to.eq(2_500n * M);

      await pot.connect(jimmer).withdrawAll(); // full while paused
      expect(await decryptPrincipal(jimmer)).to.eq(0n);
      expect(await decryptWallet(jimmer)).to.eq(25_000n * M);
    });

    it("only the owner can pause", async function () {
      await expect(pot.connect(signers.employer).pause()).to.be.revertedWithCustomError(
        pot,
        "OwnableUnauthorizedAccount",
      );
    });
  });

  // -------------------------------------------------------------------
  // Conservation — deterministic sweep
  // -------------------------------------------------------------------

  describe("conservation", function () {
    it("Σ principals == totalPrincipal == pot token balance after a mixed sequence", async function () {
      const { jimmer, warg, carol } = signers;
      await deposit(jimmer, 6_000n * M);
      await deposit(warg, 3_000n * M);
      await deposit(carol, 9_000n * M);
      await withdraw(jimmer, 1_500n * M);
      await pot.connect(warg).withdrawAll();
      await deposit(warg, 2_000n * M);
      await withdraw(carol, 20_000n * M); // over-balance → clamps to full 9k

      expect(await decryptPrincipal(jimmer)).to.eq(4_500n * M);
      expect(await decryptPrincipal(warg)).to.eq(2_000n * M);
      expect(await decryptPrincipal(carol)).to.eq(0n);
      await expectConservation([jimmer, warg, carol]);
    });
  });
});
