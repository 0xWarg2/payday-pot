/**
 * Seed một deposit thật lên Sepolia để UI có cái để reveal.
 *
 * Vì sao cần: một ví trắng chỉ đọc được `HIDDEN_HANDLE` từ `principalOf`, và
 * `HIDDEN_HANDLE` là trạng thái `unavailable` — đúng theo non-negotiable #8 thì
 * UI phải hiện "Not available yet", KHÔNG hiện 0. Nghĩa là trên một pot rỗng,
 * đường reveal (ký EIP-712 → userDecrypt → hiện số) không có gì để diễn cả.
 * Persona "seeded wallet" của exit gate cần đúng một handle đã init.
 *
 * Đường đi mirror y hệt cái onboarding sẽ làm trong app, không phải đường tắt:
 *   mint (faucet mở, quirk #21) → approve → wrap → confidentialTransferAndCall
 * Bước cuối là deposit: proof bind vào TOKEN chứ không phải pot, vì người gọi
 * `confidentialTransferAndCall` là token contract.
 *
 * Idempotent theo từng bước: chạy lại sẽ bỏ qua phần đã xong. Đây không phải
 * tiện nghi — nó là cái giữ cho một lần fail giữa chừng (relayer timeout ở bước
 * encrypt là chuyện thường) không biến thành double-deposit khi retry.
 *
 * Chạy:  pnpm --filter @payday-pot/contracts seed:sepolia
 *        SEED_AMOUNT=500 pnpm --filter @payday-pot/contracts seed:sepolia
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ethers, fhevm, network } from "hardhat";

const M = 1_000_000n; // 6 decimals
const REPO = resolve(__dirname, "../../..");
const MANIFEST = resolve(REPO, "deployments/sepolia.json");
const ZERO_HANDLE = `0x${"0".repeat(64)}`;

/** ABI tối thiểu, viết tay theo selector đã probe live — KHÔNG lấy từ artifact local. */
const WRAPPER_ABI = [
  "function wrap(address to, uint256 amount)",
  "function confidentialBalanceOf(address account) view returns (bytes32)",
  "function confidentialTransferAndCall(address to, bytes32 amount, bytes inputProof, bytes data) returns (bytes32)",
  "function isBlocked(address account) view returns (bool)",
  "function underlying() view returns (address)",
  "function rate() view returns (uint256)",
];
const USDC_ABI = [
  "function mint(address to, uint256 amount)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];
const POT_ABI = [
  "function principalOf(address user) view returns (bytes32)",
  "function twabAreaOf(address user) view returns (bytes32)",
  "function participantCount() view returns (uint256)",
  "function paused() view returns (bool)",
  "function currentEpochId() view returns (uint256)",
  "function epochInfo(uint256 epochId) view returns (uint64 start, uint64 end, uint8 phase)",
  "function PER_USER_CAP() view returns (uint64)",
  "function PARTICIPANT_CAP() view returns (uint256)",
];

function usdc(amount: bigint): string {
  return `${ethers.formatUnits(amount, 6)} USDC`;
}

async function main(): Promise<void> {
  if (network.name !== "sepolia") {
    throw new Error(`seed-deposit chỉ chạy trên sepolia, không phải "${network.name}"`);
  }

  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const potAddress: string = manifest.contracts?.PayDayPot?.address;
  const tokenAddress: string = manifest.official.cUSDCMock;
  const underlyingAddress: string = manifest.official.underlyingUSDCMock;
  if (!potAddress) throw new Error("Chưa có PayDayPot trong deployments/sepolia.json — deploy trước đã.");

  const amount = (process.env["SEED_AMOUNT"] ? BigInt(process.env["SEED_AMOUNT"]) : 1_000n) * M;
  const [signer] = await ethers.getSigners();
  if (!signer) throw new Error("Không có signer — MNEMONIC chưa set?");
  const me = signer.address;

  const token = new ethers.Contract(tokenAddress, WRAPPER_ABI, signer);
  const underlying = new ethers.Contract(underlyingAddress, USDC_ABI, signer);
  const pot = new ethers.Contract(potAddress, POT_ABI, signer);

  console.log(`\nseed-deposit → ${usdc(amount)}`);
  console.log(`  pot     ${potAddress}`);
  console.log(`  token   ${tokenAddress}`);
  console.log(`  signer  ${me}  (${ethers.formatEther(await ethers.provider.getBalance(me))} ETH)\n`);

  // --- Pre-flight: mọi lý do khiến deposit im lặng không làm gì -------------
  //
  // ERC-7984 clamp về encrypted zero thay vì revert, nên một deposit "thành
  // công" có thể chuyển đúng 0 và không có gì trên chain nói ra điều đó. Kiểm
  // trước, ở plaintext, là cách duy nhất biết được.
  if (await token["isBlocked"]!(me)) throw new Error(`${me} nằm trong deny-list của wrapper (R3).`);

  const perUserCap: bigint = await pot["PER_USER_CAP"]!();
  if (amount > perUserCap) throw new Error(`${usdc(amount)} vượt per-user cap ${usdc(perUserCap)} — sẽ bị clamp.`);

  const epochId: bigint = await pot["currentEpochId"]!();
  const [, end, phase] = await pot["epochInfo"]!(epochId);
  const now = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
  if (BigInt(phase) !== 0n) {
    throw new Error(`Epoch ${epochId} đang ở phase ${phase}, không nhận deposit (cần Open = 0).`);
  }
  if (now >= BigInt(end)) {
    throw new Error(`Epoch ${epochId} đã hết giờ (end=${end}, now=${now}) — deposit sẽ bị từ chối.`);
  }
  if (await pot["paused"]!()) throw new Error("Pot đang pause — deposit bị chặn (withdraw/claim thì không).");

  const already = await pot["principalOf"]!(me);
  if (already !== ZERO_HANDLE) {
    console.log(`✓ ${me} đã có principal handle ${already}`);
    console.log(`  Không deposit thêm. Xoá bước này bằng cách seed từ một index khác trong mnemonic.\n`);
    return;
  }

  // --- 1. mint ------------------------------------------------------------
  let balance: bigint = await underlying["balanceOf"]!(me);
  if (balance < amount) {
    const need = amount - balance;
    console.log(`1/4 mint ${usdc(need)} …`);
    const tx = await underlying["mint"]!(me, need);
    await tx.wait();
    balance = await underlying["balanceOf"]!(me);
    console.log(`    ${tx.hash} → balance ${usdc(balance)}`);
  } else {
    console.log(`1/4 mint — bỏ qua, đã có ${usdc(balance)}`);
  }

  // --- 2. approve ---------------------------------------------------------
  const allowance: bigint = await underlying["allowance"]!(me, tokenAddress);
  if (allowance < amount) {
    console.log(`2/4 approve ${usdc(amount)} cho wrapper …`);
    const tx = await underlying["approve"]!(tokenAddress, amount);
    await tx.wait();
    console.log(`    ${tx.hash}`);
  } else {
    console.log(`2/4 approve — bỏ qua, allowance ${usdc(allowance)}`);
  }

  // --- 3. wrap ------------------------------------------------------------
  //
  // Đây là bước CÔNG KHAI số tiền, và nó công khai theo thiết kế: `wrap` nhận
  // uint256 plaintext. PRIVACY §2 và ShieldWarning trong onboarding nói đúng
  // chuyện này. Sau bước này thì số biến mất khỏi tầm nhìn công cộng.
  const beforeWrap: string = await token["confidentialBalanceOf"]!(me);
  if (beforeWrap === ZERO_HANDLE) {
    console.log(`3/4 wrap ${usdc(amount)} → confidential …`);
    const tx = await token["wrap"]!(me, amount);
    const receipt = await tx.wait();
    console.log(`    ${tx.hash}  gas ${receipt!.gasUsed}`);
  } else {
    console.log(`3/4 wrap — bỏ qua, đã có confidential handle ${beforeWrap}`);
  }

  // --- 4. deposit ---------------------------------------------------------
  //
  // Proof bind vào (token, user): người gọi `confidentialTransferAndCall` là ví
  // của user trên contract TOKEN, nên contract address trong input phải là
  // token — dùng nhầm pot thì relayer sinh proof mà chain từ chối.
  console.log(`4/4 encrypt input qua relayer (bind vào token, không phải pot) …`);
  // `hardhat test` tự init plugin; `hardhat run` thì KHÔNG. Thiếu dòng này thì
  // `createEncryptedInput` ném "plugin is not initialized" — và nó ném ở bước 4,
  // sau khi 3 tx đầu đã tiêu gas thật.
  await fhevm.initializeCLIApi();
  const started = Date.now();
  const enc = await fhevm.createEncryptedInput(tokenAddress, me).add64(amount).encrypt();
  console.log(`    handle ${enc.handles[0] ? ethers.hexlify(enc.handles[0]) : "?"}  (${Date.now() - started}ms)`);

  console.log(`    confidentialTransferAndCall → pot …`);
  const depositTx = await token["confidentialTransferAndCall"]!(
    potAddress,
    enc.handles[0],
    enc.inputProof,
    "0x",
  );
  const depositReceipt = await depositTx.wait();
  console.log(`    ${depositTx.hash}  gas ${depositReceipt!.gasUsed}`);

  // --- Verify -------------------------------------------------------------
  //
  // `principalOf` khác zero-handle là bằng chứng DUY NHẤT có thể đọc từ ngoài.
  // Giá trị thì không đọc được ở đây và đó là đúng: script này không có ACL,
  // chỉ chủ ví mới decrypt được — chính là cái persona seeded-wallet sắp diễn.
  const principal: string = await pot["principalOf"]!(me);
  const twab: string = await pot["twabAreaOf"]!(me);
  const count: bigint = await pot["participantCount"]!();
  console.log(`\n✓ principalOf(${me}) = ${principal}`);
  console.log(`✓ twabAreaOf(${me})   = ${twab}`);
  console.log(`✓ participantCount = ${count}`);
  if (principal === ZERO_HANDLE) {
    throw new Error("Deposit chạy xong nhưng principal vẫn là zero-handle — clamp về 0? Kiểm tra wallet balance.");
  }
  console.log(`\nSeeded. Import mnemonic index 0 vào MetaMask để diễn reveal trên /app.\n`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
