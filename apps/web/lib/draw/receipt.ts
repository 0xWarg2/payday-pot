"use client";

import { PAYDAY_POT_ABI, getPayDayPotDeployment } from "@payday-pot/shared";
import { Interface, toBeHex, zeroPadValue, type InterfaceAbi, type Log } from "ethers";

import { readProvider } from "../chain/rpc";

/**
 * Fairness Receipt — bằng chứng, không phải lời hứa.
 *
 * Mọi dòng dưới đây là một log onchain có tx hash, nên người xem không phải tin
 * màn hình này: họ mở explorer và đối chiếu. Đó là toàn bộ giá trị của nó.
 *
 * **Danh sách event bị lọc có chủ đích.** Chỉ vòng đời của VÒNG được lấy. Bốn
 * event theo địa chỉ — `Registered`, `Deposited`, `Withdrawn`, `PrizeClaimed`
 * — bị loại, dù chúng công khai và ai cũng query được. Lý do: một "biên lai
 * công bằng" liệt kê ai deposit rồi ngay bên dưới liệt kê ai claim, sắp theo
 * thời gian, chính là công cụ suy luận mà cả sản phẩm này được dựng để phủ
 * nhận. Chain lưu chúng; sản phẩm không đi tổng hợp lại giúp.
 *
 * Không backend, không indexer: một lời gọi `eth_getLogs` với topic lọc theo
 * `epochId`. Nếu RPC công cộng từ chối dải block, ta nói ra và đưa link
 * explorer — một ngõ cụt im lặng ở đây sẽ biến chính cái tab "bằng chứng"
 * thành thứ không kiểm chứng được.
 */

export interface ReceiptEvent {
  name: string;
  /** Câu người đọc được. Không bao giờ chứa số tiền hay địa chỉ người thắng. */
  label: string;
  blockNumber: number;
  txHash: string;
}

export type ReceiptResult =
  | { kind: "ok"; events: readonly ReceiptEvent[] }
  | { kind: "unavailable"; reason: string };

/** Chỉ vòng đời vòng đấu. Xem ghi chú ở đầu file về bốn event bị bỏ ra. */
const LIFECYCLE = [
  "EpochStarted",
  "PrizeFunded",
  "PrizeDefunded",
  "SnapshotStarted",
  "SnapshotProgress",
  "SnapshotCompleted",
  "RandomRequested",
  "SelectProgress",
  "DrawCompleted",
  "EpochSettled",
] as const;

const LABEL: Record<string, (args: readonly unknown[]) => string> = {
  EpochStarted: () => "Round opened",
  PrizeFunded: () => "Sponsor funded the prize",
  PrizeDefunded: () => "Sponsor pulled back unspent prize money",
  SnapshotStarted: (a) => `Round closed with ${String(a[1] ?? "?")} savers frozen in`,
  SnapshotProgress: (a) => `Weights frozen up to saver ${String(a[1] ?? "?")}`,
  SnapshotCompleted: () => "All weights frozen",
  RandomRequested: () => "Random seed drawn — once, and only once",
  SelectProgress: (a) => `Pool scanned up to saver ${String(a[1] ?? "?")}`,
  DrawCompleted: () => "Scan finished",
  EpochSettled: () => "Round settled",
};

export async function readFairnessReceipt(epochId: bigint): Promise<ReceiptResult> {
  let deployment: ReturnType<typeof getPayDayPotDeployment>;
  try {
    deployment = getPayDayPotDeployment();
  } catch {
    return { kind: "unavailable", reason: "No pool is deployed in this build, so there is nothing to prove yet." };
  }

  const iface = new Interface(PAYDAY_POT_ABI as unknown as InterfaceAbi);
  const topic0 = LIFECYCLE.map((name) => iface.getEvent(name)?.topicHash).filter(
    (t): t is string => typeof t === "string",
  );

  try {
    const logs = await readProvider().getLogs({
      address: deployment.address,
      fromBlock: deployment.deployBlock,
      toBlock: "latest",
      // Cả mười event đều có `epochId` là tham số indexed ĐẦU TIÊN, nên một
      // topic filter hai tầng là đủ để lọc đúng một vòng ở phía node — không
      // phải kéo cả lịch sử về rồi lọc trong trình duyệt.
      topics: [topic0, zeroPadValue(toBeHex(epochId), 32)],
    });
    return { kind: "ok", events: logs.map(decode).filter((e): e is ReceiptEvent => e !== null) };
  } catch {
    return {
      kind: "unavailable",
      reason: "The public RPC would not serve this block range. The same events are readable on the explorer.",
    };
  }

  function decode(log: Log): ReceiptEvent | null {
    const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
    if (!parsed) return null;
    const label = LABEL[parsed.name];
    if (!label) return null;
    return {
      name: parsed.name,
      label: label(parsed.args as unknown as readonly unknown[]),
      blockNumber: log.blockNumber,
      txHash: log.transactionHash,
    };
  }
}

export function explorerTx(hash: string): string {
  return `https://sepolia.etherscan.io/tx/${hash}`;
}

export function explorerAddress(address: string): string {
  return `https://sepolia.etherscan.io/address/${address}`;
}
