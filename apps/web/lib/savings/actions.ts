"use client";

import { getAddress } from "ethers";
import {
  getPot,
  phaseFromUint8,
  preflightDeposit,
  sendClaim,
  sendDeposit,
  sendWithdraw,
  sendWithdrawAll,
  type DepositFacts,
  type EncryptedAmount,
  type PotError,
} from "@payday-pot/sdk";

import { readProvider } from "../chain/rpc";
import { CUSDC_ADDRESS, getCusdc } from "../chain/tokens";
import { refreshPotReads } from "../pot/reads";
import { refreshAssets } from "../tokens/assets";
import { sendTx } from "../tx/send";

/**
 * Tầng nối giữa máy trạng thái và chain.
 *
 * Ba thứ ở đây không được rút gọn:
 *
 * 1. **Pre-flight đọc TƯƠI, không dùng snapshot của poll.** Poll 15 giây là đủ
 *    cho một dashboard, không đủ cho một quyết định. Một epoch vừa hết giờ hoặc
 *    một pool vừa đầy trong mười lăm giây vừa rồi sẽ biến pre-flight thành một
 *    lời nói dối đúng lúc nó quan trọng nhất.
 *
 * 2. **`now` lấy từ block, không lấy từ máy người dùng.** Deposit đóng theo
 *    `block.timestamp >= ep.end`, tức theo giờ của chain. Đồng hồ lệch vài phút
 *    là chuyện thường, và lệch theo chiều nào cũng cho ra một thông điệp sai:
 *    hoặc chặn một deposit còn hợp lệ, hoặc mời người dùng đi tiêu mười giây
 *    encrypt cho một tx sẽ revert.
 *
 * 3. **Sau mọi tx đổi vị thế: `refreshPotReads` + `refreshAssets`.** Đây là vế
 *    thực thi của non-negotiable #2 — số dư mới đến từ chain, không đến từ ô
 *    input. Handle mới cũng làm `reads.ts` tự dọn reveal cũ, nên giá trị quay
 *    về masked cho tới khi người dùng ký lại. Không có đường nào để một con số
 *    cũ ở lại trên màn hình và trông như mới.
 */

export interface DepositContext {
  account: string;
  amount: bigint;
}

/** Đọc mọi sự thật công khai cần cho `preflightDeposit`. Không cần chữ ký. */
export async function collectDepositFacts(ctx: DepositContext): Promise<DepositFacts> {
  const provider = readProvider();
  const pot = getPot(provider);
  const token = getCusdc(provider);
  const account = getAddress(ctx.account);

  const epochId = (await pot["currentEpochId"]!()) as bigint;
  const [info, paused, count, participantCap, perUserCap, registered, shieldedHandle, blocked, block] =
    await Promise.all([
      pot["epochInfo"]!(epochId) as Promise<[bigint, bigint, bigint]>,
      pot["paused"]!() as Promise<boolean>,
      pot["participantCount"]!() as Promise<bigint>,
      pot["PARTICIPANT_CAP"]!() as Promise<bigint>,
      pot["PER_USER_CAP"]!() as Promise<bigint>,
      pot["isRegistered"]!(account) as Promise<boolean>,
      token["confidentialBalanceOf"]!(account) as Promise<string>,
      token["isBlocked"]!(account) as Promise<boolean>,
      provider.getBlock("latest"),
    ]);

  return {
    amount: ctx.amount,
    perUserCap,
    shieldedHandle,
    blocked,
    paused,
    phase: phaseFromUint8(info[2]),
    epochEnd: info[1],
    now: BigInt(block?.timestamp ?? Math.floor(Date.now() / 1000)),
    participantCount: Number(count),
    participantCap: Number(participantCap),
    registered,
  };
}

/** Pre-flight đầy đủ: đọc rồi phán. `null` = đi tiếp được. */
export async function checkDeposit(ctx: DepositContext): Promise<PotError | null> {
  return preflightDeposit(await collectDepositFacts(ctx));
}

/** Epoch hiện tại — chỉ để ghi vào tx center (công khai). */
async function currentEpochId(): Promise<bigint | undefined> {
  try {
    return (await getPot(readProvider())["currentEpochId"]!()) as bigint;
  } catch {
    // Không đọc được epoch thì tx vẫn phải gửi được. Một record thiếu nhãn
    // round vẫn tra được bằng hash; một tx bị chặn vì không đọc được nhãn thì
    // không.
    return undefined;
  }
}

export interface SubmitOptions {
  onHash?: (txHash: string) => void;
}

/**
 * Deposit — gửi qua TOKEN, không qua pot. Địa chỉ mà proof phải bind vào là
 * `CUSDC_ADDRESS`; `sendDeposit` tự kiểm lại và ném sớm nếu lệch.
 */
export async function submitDeposit(
  account: string,
  encrypted: EncryptedAmount,
  options: SubmitOptions = {},
): Promise<void> {
  const potAddress = await getPot(readProvider()).getAddress();
  const epochId = await currentEpochId();
  await sendTx(
    { action: "deposit", ...(epochId === undefined ? {} : { epochId }), ...options },
    async (signer) => sendDeposit(getCusdc(signer), potAddress, encrypted),
  );
  await afterPositionChange(account);
}

/** Rút một phần — proof bind vào POT. */
export async function submitWithdraw(
  account: string,
  encrypted: EncryptedAmount,
  options: SubmitOptions = {},
): Promise<void> {
  const epochId = await currentEpochId();
  await sendTx(
    { action: "withdraw", ...(epochId === undefined ? {} : { epochId }), ...options },
    async (signer) => sendWithdraw(getPot(signer), encrypted),
  );
  await afterPositionChange(account);
}

/**
 * Rút hết. KHÔNG encrypt, KHÔNG reveal, KHÔNG phase gate, KHÔNG pause gate.
 *
 * Đó là non-negotiable #1, và ở tầng code nó có hình dạng rất cụ thể: hàm này
 * không nhận `EncryptedAmount`, nên không có cách nào để một precondition về
 * encrypt/reveal bò vào đường rút tiền — kể cả do vô tình.
 */
export async function submitWithdrawAll(account: string, options: SubmitOptions = {}): Promise<void> {
  const epochId = await currentEpochId();
  await sendTx(
    { action: "withdraw", ...(epochId === undefined ? {} : { epochId }), ...options },
    async (signer) => sendWithdrawAll(getPot(signer)),
  );
  await afterPositionChange(account);
}

/** Claim. Winner và non-winner đi cùng một đường, cùng gas — xem Day 5. */
export async function submitClaim(account: string, options: SubmitOptions = {}): Promise<void> {
  const epochId = await currentEpochId();
  await sendTx(
    { action: "claim", ...(epochId === undefined ? {} : { epochId }), ...options },
    async (signer) => sendClaim(getPot(signer)),
  );
  await afterPositionChange(account);
}

/**
 * Đọc lại chain sau khi vị thế đổi.
 *
 * Cả hai lời gọi đều cần: pot cho principal/TWAB/pendingPrize, token cho số dư
 * shielded còn lại. `refreshPotReads` là chỗ reveal cũ bị dọn khi handle đổi.
 */
async function afterPositionChange(account: string): Promise<void> {
  await Promise.all([refreshPotReads(account, SEPOLIA), refreshAssets(account)]);
}

// `refreshPotReads` cần chainId để khoá reveal cache. Read luôn đi qua RPC
// Sepolia cố định, nên hằng số ở đây là đúng — không phải chain hiện tại của ví.
const SEPOLIA = 11155111;

export { CUSDC_ADDRESS };
