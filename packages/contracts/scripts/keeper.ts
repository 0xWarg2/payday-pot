/**
 * Keeper — chạy vòng draw tới khi Settled, hoặc một bước một.
 *
 * Đây là "documented keeper/admin flow" mà brief đòi, và điểm quan trọng nhất
 * của nó là điểm KHÔNG có trong code: script này không nắm quyền gì cả. Cả năm
 * hàm nó gọi đều `external` không modifier quyền, nên bất kỳ ví nào có ETH đều
 * chạy được y hệt — kể cả khi repo này biến mất. Nó là tiện nghi, không phải
 * hạ tầng. Cùng năm bước đó cũng có nút bấm trong UI (`/draw`), nên không có
 * đường nào chỉ mình chủ dự án đi được.
 *
 * Vòng đời một epoch:
 *
 *   Open ──(hết giờ)──▶ beginSnapshot() ──▶ Snapshotting
 *   Snapshotting ──▶ snapshotBatch(n) × k ──(cursor == total)──▶ Drawing
 *   Drawing ──▶ requestRandom() ──▶ selectBatch(n) × k ──▶ Settled
 *   Settled ──▶ startNewEpoch() ──▶ Open
 *
 * Ba thứ script này cố tình KHÔNG làm:
 *
 *   - không tự `startNewEpoch()`. Mở epoch mới là quyết định vận hành (prize
 *     của epoch mới chưa ai nạp), không phải bước dọn dẹp. Muốn thì
 *     `KEEPER_NEW_EPOCH=1`.
 *   - không retry mù. `requestRandom` rút seed đúng một lần; một `selectBatch`
 *     revert thì đúng cách xử lý là GỬI LẠI cùng bước — không phải quay về đầu
 *     vòng, vì quay về đầu vòng là đòi seed mới, tức là chọn lại người thắng
 *     (contract chặn bằng `AlreadyDrawn`, nhưng người vận hành nên hiểu vì sao).
 *   - không giữ state cục bộ về tiến độ. Cursor nằm trên chain; giết script
 *     giữa vòng rồi chạy lại là nó tiếp đúng chỗ cũ.
 *
 * Chạy:
 *   npx hardhat run scripts/keeper.ts --network sepolia
 *   KEEPER_ONCE=1 npx hardhat run scripts/keeper.ts --network sepolia
 *   KEEPER_BATCH=4 npx hardhat run scripts/keeper.ts --network sepolia
 *   KEEPER_ACCOUNT_INDEX=2 npx hardhat run scripts/keeper.ts --network sepolia
 *   KEEPER_NEW_EPOCH=1 npx hardhat run scripts/keeper.ts --network sepolia
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ethers, network } from "hardhat";

const REPO = resolve(__dirname, "../../..");
const MANIFEST = resolve(REPO, "deployments/sepolia.json");

const POT_ABI = [
  "function currentEpochId() view returns (uint256)",
  "function epochInfo(uint256 epochId) view returns (uint64 start, uint64 end, uint8 phase)",
  "function snapshotProgress(uint256 epochId) view returns (uint32 cursor, uint32 total)",
  "function drawProgress(uint256 epochId) view returns (bool drawn, uint32 cursor, uint32 total)",
  "function prizeAmountOf(uint256 epochId) view returns (uint64)",
  "function participantCount() view returns (uint256)",
  "function paused() view returns (bool)",
  "function beginSnapshot()",
  "function snapshotBatch(uint32 maxSteps)",
  "function requestRandom()",
  "function selectBatch(uint32 maxSteps)",
  "function startNewEpoch()",
];

const PHASES = ["Open", "Snapshotting", "Drawing", "Settled"] as const;

type Step =
  | { call: "beginSnapshot"; label: string }
  | { call: "snapshotBatch"; label: string }
  | { call: "requestRandom"; label: string }
  | { call: "selectBatch"; label: string }
  | { call: "startNewEpoch"; label: string };

type Snapshot = {
  epochId: bigint;
  phase: number;
  end: bigint;
  now: bigint;
  paused: boolean;
  people: bigint;
  prize: bigint;
  snap: { cursor: number; total: number };
  draw: { drawn: boolean; cursor: number; total: number };
};

async function read(pot: ethers.Contract): Promise<Snapshot> {
  const epochId: bigint = await pot["currentEpochId"]!();
  const [, end, phase] = await pot["epochInfo"]!(epochId);
  const [sCursor, sTotal] = await pot["snapshotProgress"]!(epochId);
  const [drawn, dCursor, dTotal] = await pot["drawProgress"]!(epochId);
  return {
    epochId,
    phase: Number(phase),
    end: BigInt(end),
    now: BigInt((await ethers.provider.getBlock("latest"))!.timestamp),
    paused: await pot["paused"]!(),
    people: await pot["participantCount"]!(),
    prize: await pot["prizeAmountOf"]!(epochId),
    snap: { cursor: Number(sCursor), total: Number(sTotal) },
    draw: { drawn, cursor: Number(dCursor), total: Number(dTotal) },
  };
}

/**
 * Bước kế tiếp suy ra TỪ CHAIN, không từ biến đếm trong script.
 *
 * `null` nghĩa là "không có gì chạy được lúc này" và lý do được in ra — im lặng
 * không làm gì là cách một keeper trông giống như đang hoạt động trong lúc pool
 * đứng bánh.
 */
function nextStep(s: Snapshot, allowNewEpoch: boolean): { step: Step | null; why: string } {
  if (s.phase === 0) {
    if (s.now < s.end) return { step: null, why: `deposits còn mở ${s.end - s.now}s nữa` };
    return { step: { call: "beginSnapshot", label: "beginSnapshot()" }, why: "epoch hết giờ" };
  }
  if (s.phase === 1) {
    return {
      step: { call: "snapshotBatch", label: "snapshotBatch()" },
      why: `snapshot ${s.snap.cursor}/${s.snap.total}`,
    };
  }
  if (s.phase === 2) {
    if (!s.draw.drawn) {
      // `requestRandom` là hàm draw DUY NHẤT có whenNotPaused. Gửi lúc pause
      // chỉ để thu về một revert, nên nói ra thay vì thử.
      if (s.paused) return { step: null, why: "pot đang pause — requestRandom bị chặn (withdraw/claim thì không)" };
      return { step: { call: "requestRandom", label: "requestRandom()" }, why: "chưa rút seed" };
    }
    return { step: { call: "selectBatch", label: "selectBatch()" }, why: `scan ${s.draw.cursor}/${s.draw.total}` };
  }
  if (s.phase === 3) {
    if (!allowNewEpoch) return { step: null, why: "đã Settled — mở epoch mới bằng KEEPER_NEW_EPOCH=1" };
    return { step: { call: "startNewEpoch", label: "startNewEpoch()" }, why: "Settled" };
  }
  return { step: null, why: `phase ${s.phase} không nhận ra` };
}

function line(s: Snapshot): string {
  const eta = s.now < s.end ? `${s.end - s.now}s left` : `ended ${s.now - s.end}s ago`;
  return [
    `epoch #${s.epochId}`,
    PHASES[s.phase] ?? `phase ${s.phase}`,
    eta,
    `prize ${ethers.formatUnits(s.prize, 6)} USDC`,
    `${s.people} people`,
    `snapshot ${s.snap.cursor}/${s.snap.total}`,
    `draw ${s.draw.cursor}/${s.draw.total}${s.draw.drawn ? " · seed locked" : ""}`,
    s.paused ? "PAUSED" : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

async function main(): Promise<void> {
  if (network.name !== "sepolia") {
    throw new Error(`keeper chỉ chạy trên sepolia, không phải "${network.name}"`);
  }

  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const potAddress: string = manifest.contracts?.PayDayPot?.address;
  if (!potAddress) throw new Error("Chưa có PayDayPot trong deployments/sepolia.json");

  const batch = Number(process.env["KEEPER_BATCH"] ?? 8);
  const once = process.env["KEEPER_ONCE"] === "1";
  const allowNewEpoch = process.env["KEEPER_NEW_EPOCH"] === "1";
  const accountIndex = Number(process.env["KEEPER_ACCOUNT_INDEX"] ?? 0);

  const signers = await ethers.getSigners();
  const signer = signers[accountIndex];
  if (!signer) throw new Error(`Không có signer ở index ${accountIndex}`);
  const pot = new ethers.Contract(potAddress, POT_ABI, signer);

  console.log(`\nkeeper → ${potAddress}`);
  console.log(
    `  signer  ${signer.address}  index ${accountIndex}  (${ethers.formatEther(await ethers.provider.getBalance(signer.address))} ETH)`,
  );
  console.log(`  batch   ${batch}${once ? " · một bước rồi dừng" : ""}\n`);

  const hashes: string[] = [];

  for (let i = 0; ; i += 1) {
    const s = await read(pot);
    console.log(`  ${line(s)}`);
    const { step, why } = nextStep(s, allowNewEpoch);
    if (!step) {
      console.log(`  → dừng: ${why}\n`);
      break;
    }
    console.log(`  → ${step.label}  (${why})`);

    // HCU 20M global / 5M sequential mỗi tx là hard limit của FHEVM, và vượt nó
    // KHÔNG hiện ra như một lỗi gas thường. Batch nhỏ hơn luôn là câu trả lời
    // đúng khi một batch revert mà cursor không nhích.
    const tx =
      step.call === "snapshotBatch" || step.call === "selectBatch"
        ? await pot[step.call]!(batch)
        : await pot[step.call]!();
    const receipt = await tx.wait();
    hashes.push(tx.hash);
    console.log(`    ${tx.hash}  gas ${receipt!.gasUsed}`);

    if (once) {
      console.log(`\n  KEEPER_ONCE=1 → dừng sau một bước.\n`);
      break;
    }
    // Chặn vòng lặp vô hạn nếu một bước "thành công" mà không nhích cursor:
    // thà dừng và để người đọc log, hơn là đốt gas trong im lặng.
    if (i > 64) throw new Error("quá 64 bước — cursor không tiến, đọc log rồi giảm KEEPER_BATCH.");
  }

  const s = await read(pot);
  console.log(`  final: ${line(s)}`);
  if (hashes.length) {
    console.log(`\n  tx hashes (dán vào RUNBOOK):`);
    for (const h of hashes) console.log(`    https://eth-sepolia.blockscout.com/tx/${h}`);
  }
  console.log();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
