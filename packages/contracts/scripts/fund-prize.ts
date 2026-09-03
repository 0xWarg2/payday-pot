/**
 * Employer nạp prize cho epoch đang mở — bước "sponsored yield" của sản phẩm.
 *
 * Prize KHÔNG đi vào pot dưới dạng confidential transfer, và đó là câu trả lời
 * cho R12 chứ không phải một lối tắt: một confidential transfer thiếu tiền sẽ
 * clamp về encrypted zero thay vì revert, nên `prizeAmount += amount` chạy sau
 * nó có thể hứa một prize không có token nào đỡ — và người thắng đi claim sẽ ăn
 * vào principal của người khác (non-negotiable #1). Vì thế `fundPrize` PULL
 * underlying ERC-20 (revert nếu thiếu) rồi tự wrap trong cùng tx: cấp phát
 * CHÍNH LÀ chuyển tiền, solvency đúng do cấu trúc.
 *
 * Nên employer cần hai tx, và script này làm cả hai:
 *   mint underlying (faucet mock mở) → approve pot → fundPrize
 *
 * Cửa sổ thời gian: `fundPrize` đòi `phase == Open`. Với epoch ngắn (RC dùng
 * 3600s) thì nạp prize SAU khi hết giờ vẫn được — nhưng chỉ tới lúc ai đó gọi
 * `beginSnapshot()`. Sau đó thì tiền vào epoch sau, không phải epoch này.
 *
 * Chạy:  PRIZE_AMOUNT=50 npx hardhat run scripts/fund-prize.ts --network sepolia
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ethers, network } from "hardhat";

const M = 1_000_000n; // 6 decimals
const REPO = resolve(__dirname, "../../..");
const MANIFEST = resolve(REPO, "deployments/sepolia.json");

const USDC_ABI = [
  "function mint(address to, uint256 amount)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];
const POT_ABI = [
  "function fundPrize(uint64 amount)",
  "function EMPLOYER() view returns (address)",
  "function paused() view returns (bool)",
  "function currentEpochId() view returns (uint256)",
  "function epochInfo(uint256 epochId) view returns (uint64 start, uint64 end, uint8 phase)",
  "function prizeAmountOf(uint256 epochId) view returns (uint64)",
  "function RATE() view returns (uint256)",
];

const PHASES = ["Open", "Snapshotting", "Drawing", "Settled"];

function usdc(amount: bigint): string {
  return `${ethers.formatUnits(amount, 6)} USDC`;
}

async function main(): Promise<void> {
  if (network.name !== "sepolia") {
    throw new Error(`fund-prize chỉ chạy trên sepolia, không phải "${network.name}"`);
  }

  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const potAddress: string = manifest.contracts?.PayDayPot?.address;
  const underlyingAddress: string = manifest.official.underlyingUSDCMock;
  if (!potAddress) throw new Error("Chưa có PayDayPot trong deployments/sepolia.json — deploy trước đã.");

  const amount = (process.env["PRIZE_AMOUNT"] ? BigInt(process.env["PRIZE_AMOUNT"]) : 50n) * M;
  const signers = await ethers.getSigners();

  // Employer là địa chỉ CHÍNH XÁC contract giữ, không phải một named account
  // trong config: nếu hai thứ lệch nhau thì `onlyEmployer` revert và dấu vết
  // duy nhất là "execution reverted" — nên tra ngược từ chain rồi khớp lại.
  const potRead = new ethers.Contract(potAddress, POT_ABI, ethers.provider);
  const employerAddress: string = await potRead["EMPLOYER"]!();
  const signer = signers.find((s) => s.address.toLowerCase() === employerAddress.toLowerCase());
  if (!signer) {
    throw new Error(
      `Không có ví employer ${employerAddress} trong ${signers.length} ví của mnemonic — sai mnemonic hoặc pot deploy với POT_EMPLOYER khác.`,
    );
  }

  const pot = new ethers.Contract(potAddress, POT_ABI, signer);
  const underlying = new ethers.Contract(underlyingAddress, USDC_ABI, signer);
  const me = signer.address;

  console.log(`\nfund-prize → ${usdc(amount)}`);
  console.log(`  pot       ${potAddress}`);
  console.log(`  employer  ${me}  (${ethers.formatEther(await ethers.provider.getBalance(me))} ETH)`);

  // --- Pre-flight ---------------------------------------------------------
  const epochId: bigint = await pot["currentEpochId"]!();
  const [, end, phase] = await pot["epochInfo"]!(epochId);
  const now = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
  const before: bigint = await pot["prizeAmountOf"]!(epochId);
  console.log(
    `  epoch     #${epochId} · ${PHASES[Number(phase)] ?? phase} · ends ${new Date(Number(end) * 1000).toISOString()} · prize ${usdc(before)}\n`,
  );
  if (BigInt(phase) !== 0n) {
    throw new Error(
      `Epoch ${epochId} ở phase ${PHASES[Number(phase)]}. fundPrize cần Open — snapshot đã bắt đầu thì prize này phải vào epoch sau.`,
    );
  }
  if (await pot["paused"]!()) throw new Error("Pot đang pause — fundPrize bị chặn (withdraw/claim thì không).");
  if (now >= BigInt(end)) {
    console.log(`  ⚠ epoch đã hết giờ ${now - BigInt(end)}s nhưng chưa beginSnapshot — vẫn nạp được, nhanh lên.\n`);
  }

  const rate: bigint = await pot["RATE"]!();
  const need = amount * rate;

  // --- 1. mint underlying -------------------------------------------------
  let balance: bigint = await underlying["balanceOf"]!(me);
  if (balance < need) {
    console.log(`1/3 mint ${usdc(need - balance)} underlying …`);
    const tx = await underlying["mint"]!(me, need - balance);
    await tx.wait();
    balance = await underlying["balanceOf"]!(me);
    console.log(`    ${tx.hash} → ${usdc(balance)}`);
  } else {
    console.log(`1/3 mint — bỏ qua, đã có ${usdc(balance)}`);
  }

  // --- 2. approve pot -----------------------------------------------------
  const allowance: bigint = await underlying["allowance"]!(me, potAddress);
  if (allowance < need) {
    console.log(`2/3 approve ${usdc(need)} cho pot …`);
    const tx = await underlying["approve"]!(potAddress, need);
    await tx.wait();
    console.log(`    ${tx.hash}`);
  } else {
    console.log(`2/3 approve — bỏ qua, allowance ${usdc(allowance)}`);
  }

  // --- 3. fundPrize -------------------------------------------------------
  console.log(`3/3 fundPrize(${amount}) …`);
  const tx = await pot["fundPrize"]!(amount);
  const receipt = await tx.wait();
  console.log(`    ${tx.hash}  gas ${receipt!.gasUsed}`);

  const after: bigint = await pot["prizeAmountOf"]!(epochId);
  console.log(`\n✓ epoch #${epochId} prize ${usdc(before)} → ${usdc(after)}`);
  if (after !== before + amount) {
    throw new Error(`prize không tăng đúng ${usdc(amount)} — đọc lại prizeAmountOf.`);
  }
  console.log(`  Prize là PUBLIC theo thiết kế: judge phải xác minh được pool có tiền đỡ.\n`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
