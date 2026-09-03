/**
 * Read model — mọi thứ UI cần đọc từ pot, ở dạng đã đặt tên tử tế.
 *
 * File này KHÔNG decrypt gì cả. Nó trả handle (bytes32) nguyên trạng và để
 * tầng reveal ở `apps/web` quyết định khi nào gọi relayer. Tách như vậy vì
 * non-negotiable #5: giá trị đã decrypt chỉ được sống trong bộ nhớ tab, nên nó
 * không được đi qua một lớp "sdk trả về number" — sẽ không có chỗ nào để cám dỗ
 * cache nó.
 */

import {
  PAYDAY_POT_ABI,
  PAYDAY_POT_ABI_HASH,
  assertDeploymentMatchesAbi,
  getPayDayPotDeployment,
} from "@payday-pot/shared";
import { Contract, type ContractRunner, type InterfaceAbi } from "ethers";

/** Thứ tự khớp `enum EpochPhase` trong PayDayPot.sol:38-43. */
export const EPOCH_PHASES = ["Open", "Snapshotting", "Drawing", "Settled"] as const;
export type EpochPhase = (typeof EPOCH_PHASES)[number];

export function phaseFromUint8(v: number | bigint): EpochPhase {
  const i = Number(v);
  const phase = EPOCH_PHASES[i];
  if (!phase) throw new RangeError(`unknown EpochPhase ${i} — ABI and contract are out of sync`);
  return phase;
}

/**
 * Trần batch an toàn cho UI. Trần ĐO ĐƯỢC là 21 step/tx cho `snapshotBatch` và
 * 22 cho `selectBatch` (HCU 20M global / 5M sequential — DRAW_PROTOCOL §4).
 * Gửi 32 trên pool đầy sẽ **revert**. 16 để lại biên an toàn cho mọi thay đổi
 * nhỏ về HCU sau này; pool đầy = 2 tx mỗi stage, đúng như R4 mô tả.
 */
export const MAX_BATCH_STEPS = 16;

/**
 * Handle của một giá trị mã hoá. `bytes32` — KHÔNG phải số.
 *
 * `HIDDEN_HANDLE` là handle chưa từng được khởi tạo onchain. Nó KHÔNG có nghĩa
 * là 0 (non-negotiable #8): nó có nghĩa là "chưa có gì ở đây". UI phải render
 * hai trạng thái đó khác nhau — "chưa mở khoá" vs "0".
 */
export type EncryptedHandle = string;
export const HIDDEN_HANDLE = "0x0000000000000000000000000000000000000000000000000000000000000000";

export function isUninitialized(handle: EncryptedHandle): boolean {
  return handle === HIDDEN_HANDLE;
}

/** Tham số immutable của pot — đọc một lần, cache thoải mái (không nhạy cảm). */
export interface PotConfig {
  address: string;
  token: string;
  underlying: string;
  employer: string;
  owner: string;
  rate: bigint;
  epochDuration: bigint;
  perUserCap: bigint;
  participantCap: number;
}

/**
 * Phần công khai của MỘT vòng, đọc được cho vòng bất kỳ — kể cả vòng đã xong.
 *
 * Tách khỏi `PotState` vì Draw Room của một vòng cũ cần đúng những trường này
 * và không cần (không được tin) `paused`/`participantCount`, vốn là trạng thái
 * TOÀN CỤC của lúc đọc chứ không phải của vòng đó. Trộn hai thứ lại là cách một
 * trang lịch sử bắt đầu kể chuyện hiện tại.
 */
export interface EpochView {
  epochId: bigint;
  start: bigint;
  end: bigint;
  phase: EpochPhase;
  /** uint64 plaintext, cố ý công khai (PRIVACY §1) — tiền của employer, không phải của user. */
  prizeAmount: bigint;
  snapshot: { cursor: number; total: number };
  draw: { drawn: boolean; cursor: number; total: number };
}

/** Trạng thái công khai của epoch hiện tại — cái UI poll. */
export interface PotState extends EpochView {
  paused: boolean;
  participantCount: number;
}

/** Phần của một ví — toàn handle, chưa decrypt. */
export interface AccountState {
  registered: boolean;
  lastCheckpoint: bigint;
  principal: EncryptedHandle;
  twabArea: EncryptedHandle;
  pendingPrize: EncryptedHandle;
}

/**
 * Dựng contract đã kiểm tra ABI khớp bản đã deploy.
 *
 * `assertDeploymentMatchesAbi` biến "web build đi sau contract một commit"
 * thành lỗi lúc khởi động với thông điệp đọc được, thay vì một revert khó hiểu
 * trong ví user ba bước sau đó.
 */
export function getPot(runner: ContractRunner): Contract {
  const deployment = getPayDayPotDeployment();
  assertDeploymentMatchesAbi(deployment, PAYDAY_POT_ABI_HASH);
  return new Contract(deployment.address, PAYDAY_POT_ABI as unknown as InterfaceAbi, runner);
}

export async function readPotConfig(pot: Contract): Promise<PotConfig> {
  const [token, underlying, employer, owner, rate, epochDuration, perUserCap, participantCap] = await Promise.all([
    pot["TOKEN"]!() as Promise<string>,
    pot["UNDERLYING"]!() as Promise<string>,
    pot["EMPLOYER"]!() as Promise<string>,
    pot["owner"]!() as Promise<string>,
    pot["RATE"]!() as Promise<bigint>,
    pot["EPOCH_DURATION"]!() as Promise<bigint>,
    pot["PER_USER_CAP"]!() as Promise<bigint>,
    pot["PARTICIPANT_CAP"]!() as Promise<bigint>,
  ]);
  return {
    address: await pot.getAddress(),
    token,
    underlying,
    employer,
    owner,
    rate,
    epochDuration,
    perUserCap,
    participantCap: Number(participantCap),
  };
}

/**
 * Một vòng bất kỳ theo id.
 *
 * CẢNH BÁO cho chỗ gọi: một `epochId` chưa tồn tại KHÔNG revert — mapping trả
 * struct rỗng, và struct rỗng đọc ra `phase: "Open"`, `start: 0`, `end: 0`.
 * Nghĩa là "vòng 99" trông y hệt một vòng đang mở nhận tiền. So với
 * `currentEpochId` trước khi tin bất cứ thứ gì ở đây.
 */
export async function readEpoch(pot: Contract, epochId: bigint): Promise<EpochView> {
  const [info, prizeAmount, snap, draw] = await Promise.all([
    pot["epochInfo"]!(epochId) as Promise<[bigint, bigint, bigint]>,
    pot["prizeAmountOf"]!(epochId) as Promise<bigint>,
    pot["snapshotProgress"]!(epochId) as Promise<[bigint, bigint]>,
    pot["drawProgress"]!(epochId) as Promise<[boolean, bigint, bigint]>,
  ]);
  return {
    epochId,
    start: info[0],
    end: info[1],
    phase: phaseFromUint8(info[2]),
    prizeAmount,
    snapshot: { cursor: Number(snap[0]), total: Number(snap[1]) },
    draw: { drawn: draw[0], cursor: Number(draw[1]), total: Number(draw[2]) },
  };
}

export async function readPotState(pot: Contract): Promise<PotState> {
  const epochId = (await pot["currentEpochId"]!()) as bigint;
  const [epoch, paused, count] = await Promise.all([
    readEpoch(pot, epochId),
    pot["paused"]!() as Promise<boolean>,
    pot["participantCount"]!() as Promise<bigint>,
  ]);
  return { ...epoch, paused, participantCount: Number(count) };
}

/** Id vòng đang chạy. Tách ra vì Draw Room cần nó để biết mình đang xem quá khứ hay hiện tại. */
export async function readCurrentEpochId(pot: Contract): Promise<bigint> {
  return (await pot["currentEpochId"]!()) as bigint;
}

export async function readAccount(pot: Contract, user: string): Promise<AccountState> {
  const [registered, lastCheckpoint, principal, twabArea, pendingPrize] = await Promise.all([
    pot["isRegistered"]!(user) as Promise<boolean>,
    pot["lastCheckpointOf"]!(user) as Promise<bigint>,
    pot["principalOf"]!(user) as Promise<string>,
    pot["twabAreaOf"]!(user) as Promise<string>,
    pot["pendingPrizeOf"]!(user) as Promise<string>,
  ]);
  return { registered, lastCheckpoint, principal, twabArea, pendingPrize };
}

/**
 * Việc gì đang chờ được làm trên pot, ai cũng bấm được (#7 permissionless).
 * Draw Room render thẳng từ đây — R4 đòi tiến độ và nút Continue phải hiện ra
 * cho **bất kỳ ví nào**, không riêng keeper.
 */
export type PendingWork =
  | { kind: "none" }
  | { kind: "begin-snapshot" }
  | { kind: "snapshot"; done: number; total: number; steps: number }
  | { kind: "request-random" }
  | { kind: "select"; done: number; total: number; steps: number }
  | { kind: "start-new-epoch" };

export function pendingWork(state: PotState, now: bigint): PendingWork {
  switch (state.phase) {
    case "Open":
      return now >= state.end ? { kind: "begin-snapshot" } : { kind: "none" };
    case "Snapshotting": {
      const { cursor, total } = state.snapshot;
      if (cursor >= total) return { kind: "request-random" };
      return { kind: "snapshot", done: cursor, total, steps: Math.min(MAX_BATCH_STEPS, total - cursor) };
    }
    case "Drawing": {
      if (!state.draw.drawn) return { kind: "request-random" };
      const { cursor, total } = state.draw;
      if (cursor >= total) return { kind: "none" };
      return { kind: "select", done: cursor, total, steps: Math.min(MAX_BATCH_STEPS, total - cursor) };
    }
    case "Settled":
      return { kind: "start-new-epoch" };
  }
}
