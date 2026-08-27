"use client";

import { getAddress } from "ethers";
import {
  getPot,
  phaseFromUint8,
  preflightFundPrize,
  sendFundPrize,
  type FundBlock,
  type FundFacts,
} from "@payday-pot/sdk";

import { readProvider } from "../chain/rpc";
import { getUnderlying } from "../chain/tokens";
import { refreshPotReads } from "../pot/reads";
import { sendTx } from "../tx/send";

/**
 * Đường nạp prize của employer.
 *
 * Chi tiết dễ làm sai nhất, và là lý do file này tồn tại riêng thay vì tái dùng
 * `lib/tokens/assets.ts`: `fundPrize` làm `safeTransferFrom(UNDERLYING,
 * msg.sender, address(this))` rồi mới tự wrap. Nghĩa là allowance phải trỏ vào
 * **POT**, không phải vào wrapper cUSDC — ngược với đường shield của người dùng.
 * Approve đúng số nhưng sai spender thì tx vẫn revert, và người ký sẽ mất tiền
 * gas cho một bước họ tưởng đã làm xong.
 *
 * Và số tiền ở đây **công khai**: `prizeAmountOf(epochId)` là `uint64`
 * plaintext, cố ý (PRIVACY §1) — đây là tiền của employer, không phải của
 * người tham gia. UI phải nói thẳng điều đó ra trước khi ký, chứ không để một
 * người quen với "mọi thứ đều mã hoá" tự suy ra sai.
 */

export interface FundContext {
  account: string;
  /** Số prize, base unit 6 chữ số — công khai. */
  amount: bigint;
}

export async function collectFundFacts(ctx: FundContext): Promise<FundFacts> {
  const provider = readProvider();
  const pot = getPot(provider);
  const underlying = getUnderlying(provider);
  const account = getAddress(ctx.account);
  const potAddress = await pot.getAddress();

  const epochId = (await pot["currentEpochId"]!()) as bigint;
  const [info, paused, employer, rate, balance, allowance] = await Promise.all([
    pot["epochInfo"]!(epochId) as Promise<[bigint, bigint, bigint]>,
    pot["paused"]!() as Promise<boolean>,
    pot["EMPLOYER"]!() as Promise<string>,
    pot["RATE"]!() as Promise<bigint>,
    underlying["balanceOf"]!(account) as Promise<bigint>,
    underlying["allowance"]!(account, potAddress) as Promise<bigint>,
  ]);

  return {
    amount: ctx.amount,
    paused,
    phase: phaseFromUint8(info[2]),
    isEmployer: getAddress(employer) === account,
    underlyingBalance: balance,
    allowanceToPot: allowance,
    rate,
  };
}

/** `null` = ký được ngay · `{needsApproval:true}` = còn bước 1/2 · còn lại = chặn. */
export async function checkFundPrize(ctx: FundContext): Promise<FundBlock> {
  return preflightFundPrize(await collectFundFacts(ctx));
}

export interface FundOptions {
  onHash?: (txHash: string) => void;
}

/** Bước 1/2 — approve UNDERLYING cho POT. Số này công khai như mọi allowance ERC-20. */
export async function approvePotForPrize(amount: bigint, rate: bigint, options: FundOptions = {}): Promise<void> {
  const potAddress = await getPot(readProvider()).getAddress();
  await sendTx({ action: "approve", ...options }, async (signer) =>
    getUnderlying(signer)["approve"]!(potAddress, amount * rate),
  );
}

/** Bước 2/2 — nạp prize. */
export async function submitFundPrize(account: string, amount: bigint, options: FundOptions = {}): Promise<void> {
  const pot = getPot(readProvider());
  const epochId = (await pot["currentEpochId"]!()) as bigint;
  await sendTx({ action: "fund-prize", epochId, ...options }, async (signer) =>
    sendFundPrize(getPot(signer), amount),
  );
  // Prize là public state của epoch: đọc lại pot là đủ, không có handle nào của
  // employer để đồng bộ (và employer không có ACL nào để mà đọc).
  await refreshPotReads(account, 11155111);
}
