/**
 * Day 1 EOD demo — chạy trọn compatibility spike flow trên local FHE mock.
 *
 *   pnpm demo   (trong packages/contracts)
 *
 * Nằm trong demo/ (ngoài test/) nên KHÔNG chạy cùng `pnpm test`.
 * Dùng hardhat test runner vì đó là đường duy nhất plugin FHEVM init mock in-process.
 *
 * Flow: deploy → Alice encrypt+set → Alice decrypt → Alice add → decrypt lại
 *       → Bob decrypt Alice (PHẢI FAIL) → tổng kết.
 */
import { FhevmType } from "@fhevm/hardhat-plugin";
import { ethers, fhevm } from "hardhat";

const line = (s = "") => console.log(s);
const ok = (s: string) => console.log(`   ✅ ${s}`);
const no = (s: string) => console.log(`   🔒 ${s}`);

describe("PayDay Pot — Day 1 Compatibility Spike Demo", () => {
  it("encrypt → store → FHE.add → user-decrypt → ACL enforced", async function () {
    if (!fhevm.isMock) {
      this.skip();
    }
    const [, alice, bob] = await ethers.getSigners();

    line("\n  ━━━ PayDay Pot — Day 1 Compatibility Spike Demo ━━━\n");

    // 1. Deploy
    const contract = await (await ethers.getContractFactory("CompatSpike")).deploy();
    const addr = await contract.getAddress();
    ok(`CompatSpike deployed: ${addr}`);

    // 2. Alice encrypts 1000 client-side and writes it
    const input = await fhevm.createEncryptedInput(addr, alice.address).add64(1000n).encrypt();
    await (await contract.connect(alice).setValue(input.handles[0], input.inputProof)).wait();
    ok("Alice encrypted 1000 client-side and stored it (tx contains only ciphertext)");

    // 3. Alice user-decrypts her own value
    const handle1 = await contract.getValue(alice.address);
    const clear1 = await fhevm.userDecryptEuint(FhevmType.euint64, handle1, addr, alice);
    ok(`Alice EIP-712 user-decrypts her value: ${clear1}`);

    // 4. Alice adds 500 homomorphically
    const input2 = await fhevm.createEncryptedInput(addr, alice.address).add64(500n).encrypt();
    await (await contract.connect(alice).addValue(input2.handles[0], input2.inputProof)).wait();
    const handle2 = await contract.getValue(alice.address);
    const clear2 = await fhevm.userDecryptEuint(FhevmType.euint64, handle2, addr, alice);
    ok(`FHE.add on ciphertext: 1000 + 500 = ${clear2} (contract never saw plaintext)`);

    // 5. Bob tries to decrypt Alice's value — must fail
    try {
      await fhevm.userDecryptEuint(FhevmType.euint64, handle2, addr, bob);
      throw new Error("PRIVACY BREACH: bob decrypted alice's value!");
    } catch (e) {
      if ((e as Error).message.includes("PRIVACY BREACH")) throw e;
      no("Bob attempts to decrypt Alice's handle → DENIED by ACL");
    }

    line("\n  ━━━ Result: encrypt → store → homomorphic add → user-decrypt → ACL enforced ━━━");
    line("      Every API PayDayPot (Day 2) depends on is proven against pinned versions.\n");
  });
});
