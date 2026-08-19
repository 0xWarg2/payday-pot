/**
 * Day 2 EOD demo — PayDayPot deposit/withdraw trọn vòng đời trên local FHE mock.
 *
 *   pnpm demo:day2   (trong packages/contracts)
 *
 * Nằm trong demo/ (ngoài test/) nên KHÔNG chạy cùng `pnpm test`.
 * Dùng hardhat test runner vì đó là đường duy nhất plugin FHEVM init mock in-process (quirk #6).
 *
 * Flow: deploy stack → Jimmer wrap (số public cuối cùng) → deposit enc(6000)
 *       → decrypt chính chủ ✅ / Warg ✗ / employer ✗ → partial withdraw 1500
 *       → over-cap deposit refund im lặng → pause: deposit chặn, withdrawAll VẪN chạy
 *       → recap conservation + HCU.
 */
import { FhevmType } from "@fhevm/hardhat-plugin";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";

const line = (s = "") => console.log(s);
const ok = (s: string) => console.log(`   ✅ ${s}`);
const no = (s: string) => console.log(`   🔒 ${s}`);
const info = (s: string) => console.log(`   ▸ ${s}`);

const M = 1_000_000n;
const fmt = (v: bigint) => `${(v / M).toLocaleString("en-US")} ctUSDC`;

describe("PayDay Pot — Day 2 Deposit/Withdraw Demo", () => {
  it("confidential deposit → ACL → partial withdraw → silent cap refund → pause-proof exit", async function () {
    this.timeout(120_000);
    if (!fhevm.isMock) {
      this.skip();
    }
    const signers = await ethers.getSigners();
    const [, jimmer, warg, , employer] = signers;

    line("\n  ━━━ PayDay Pot — Day 2: tiền vào/ra vault, không ai thấy số ━━━\n");

    // 1. Deploy the full stack
    const usdc = await (await ethers.getContractFactory("TestUSDC")).deploy();
    const token = await (await ethers.getContractFactory("TestConfidentialUSDC")).deploy(await usdc.getAddress());
    const tokenAddress = await token.getAddress();
    const pot = await (
      await ethers.getContractFactory("PayDayPot")
    ).deploy(tokenAddress, employer.address, 7n * 24n * 3600n, 10_000n * M, 32);
    const potAddress = await pot.getAddress();
    ok(`Stack deployed — TestUSDC → ctUSDC wrapper → PayDayPot ${potAddress}`);
    info("Config: cap 10,000 ctUSDC/người, 32 người, epoch 7 ngày");

    // 2. Jimmer wraps — the LAST number anyone sees in plaintext
    await usdc.mint(jimmer.address, 15_000n * M);
    await usdc.connect(jimmer).approve(tokenAddress, 15_000n * M);
    await token.connect(jimmer).wrap(jimmer.address, 15_000n * M);
    ok("Jimmer wrap 15,000 USDC → ctUSDC (wrap amount là con số public CUỐI CÙNG)");

    const deposit = async (user: HardhatEthersSigner, amount: bigint) => {
      const enc = await fhevm.createEncryptedInput(tokenAddress, user.address).add64(amount).encrypt();
      return token
        .connect(user)
        ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](potAddress, enc.handles[0], enc.inputProof, "0x");
    };
    const principalOf = async (user: HardhatEthersSigner) =>
      fhevm.userDecryptEuint(FhevmType.euint64, await pot.principalOf(user.address), potAddress, user);
    const walletOf = async (user: HardhatEthersSigner) =>
      fhevm.userDecryptEuint(FhevmType.euint64, await token.confidentialBalanceOf(user.address), tokenAddress, user);

    // 3. Deposit enc(6000) — chain only sees ciphertext
    const depositTx = await deposit(jimmer, 6_000n * M);
    const depositReceipt = (await depositTx.wait())!;
    const potLogs = depositReceipt.logs.filter((l) => l.address === potAddress);
    ok(`Jimmer deposits enc(6,000) — pot emits ${potLogs.length} events, data field: "${potLogs[0].data}" (KHÔNG amount)`);
    ok(`Jimmer tự decrypt principal: ${fmt(await principalOf(jimmer))}`);

    // 4. ACL: nobody else can read it
    const handle = await pot.principalOf(jimmer.address);
    for (const [who, signer] of [
      ["Warg (người chơi khác)", warg],
      ["Employer (người tài trợ)", employer],
    ] as const) {
      try {
        await fhevm.userDecryptEuint(FhevmType.euint64, handle, potAddress, signer);
        throw new Error(`PRIVACY BREACH: ${who} decrypted jimmer's principal!`);
      } catch (e) {
        if ((e as Error).message.includes("PRIVACY BREACH")) throw e;
        no(`${who} thử decrypt principal của Jimmer → DENIED by ACL`);
      }
    }

    // 5. Partial withdraw 1,500
    const wenc = await fhevm.createEncryptedInput(potAddress, jimmer.address).add64(1_500n * M).encrypt();
    await (await pot.connect(jimmer).withdraw(wenc.handles[0], wenc.inputProof)).wait();
    ok(`Partial withdraw enc(1,500) → principal còn ${fmt(await principalOf(jimmer))}, ví ${fmt(await walletOf(jimmer))}`);

    // 6. Over-cap deposit — silently refunded, all-or-nothing
    await (await deposit(jimmer, 8_000n * M)).wait(); // headroom chỉ 5,500
    ok(`Deposit enc(8,000) vượt headroom 5,500 → token TỰ refund toàn bộ, principal vẫn ${fmt(await principalOf(jimmer))}`);
    info("Tx vẫn thành công — không revert, không lộ bit nào về lý do");

    // 7. Pause: deposits blocked, withdrawals NEVER blocked
    await (await pot.pause()).wait();
    try {
      await deposit(jimmer, 100n * M);
      throw new Error("BUG: deposit passed while paused!");
    } catch (e) {
      if ((e as Error).message.includes("BUG")) throw e;
      no("Pot paused → deposit bị chặn (EnforcedPause)");
    }
    const wAllTx = await pot.connect(jimmer).withdrawAll();
    const wAllHcu = fhevm.computeTransactionHCU((await wAllTx.wait())!);
    ok(`withdrawAll() CHẠY XUYÊN PAUSE → principal ${fmt(await principalOf(jimmer))}, ví phục hồi ${fmt(await walletOf(jimmer))}`);

    // 8. Recap: conservation + HCU
    const total = await fhevm.debugger.decryptEuint(FhevmType.euint64, await pot.totalPrincipal());
    const potBalance = await fhevm.debugger.decryptEuint(
      FhevmType.euint64,
      await token.confidentialBalanceOf(potAddress),
    );
    const depositHcu = fhevm.computeTransactionHCU(depositReceipt);
    if (total !== 0n || potBalance !== 0n) throw new Error("CONSERVATION VIOLATED");
    ok(`Conservation: totalPrincipal = ${total}, pot token balance = ${potBalance} — khớp tuyệt đối`);
    info(
      `HCU thật: deposit ${depositHcu.globalHCU.toLocaleString("en-US")}/20M, withdrawAll ${wAllHcu.globalHCU.toLocaleString("en-US")}/20M — còn ~90% headroom cho TWAB Day 3`,
    );

    line("\n  ━━━ Day 2: deposit/withdraw confidential end-to-end, no-loss bằng chứng property test ━━━\n");
  });
});
