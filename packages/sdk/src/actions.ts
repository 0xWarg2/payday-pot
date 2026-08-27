/**
 * Write model — mọi tx PayDay Pot gửi đi, ở đúng một chỗ.
 *
 * Đối xứng với `pot.ts`: file kia trả handle chứ không trả số, file này nhận
 * handle chứ không nhận số. Ở giữa hai file đó không có chỗ nào cầm plaintext
 * của người dùng, và đó là chủ đích — mã hoá xảy ra ở `apps/web/lib/fhevm`
 * (nơi có relayer + WASM), còn tầng này chỉ biết `{handle, inputProof}`.
 *
 * BA CHỖ DỄ SAI, đã trả giá ở Day 1 và Day 5:
 *
 * 1. **Proof bind vào contract nào.** Deposit đi qua TOKEN
 *    (`confidentialTransferAndCall`), nên input phải được tạo cho địa chỉ
 *    **token**. Withdraw đi thẳng vào pot nên input tạo cho địa chỉ **pot**.
 *    Dùng nhầm thì relayer vẫn sinh proof bình thường và chain mới từ chối —
 *    tức là mất ~10 giây encrypt rồi mới biết. `DepositCall`/`WithdrawCall`
 *    mang theo `boundTo` để chỗ gọi không thể lẫn.
 *
 * 2. **Không có `CapExceeded` để bắt.** Deposit vượt `PER_USER_CAP` KHÔNG
 *    revert: ERC-7984 clamp all-or-nothing, token hoàn tiền, tx vẫn success
 *    (R2). Nên cách duy nhất biết trước là `preflightDeposit` — plaintext,
 *    trước khi ký. Và cách duy nhất biết sau là đọc lại handle.
 *
 * 3. **`withdrawAll` không cần input mã hoá.** Không encrypt, không reveal,
 *    không phase gate, không pause gate (non-negotiable #1). Nó là hàm rẻ nhất
 *    và luôn-chạy-được trong cả contract; giữ nó tách khỏi đường `withdraw`
 *    có proof là cách để nó không bao giờ bị kéo vào một precondition nào.
 */

import type { Contract, ContractTransactionResponse } from "ethers";

import { HIDDEN_HANDLE, type EncryptedHandle, type EpochPhase } from "./pot.js";
import type { PotError } from "./errors.js";

/** Kết quả của một lần encrypt — handle + proof, đã bind vào một contract. */
export interface EncryptedAmount {
  handle: string;
  inputProof: string;
  /** Địa chỉ contract mà proof này được tạo cho. Kiểm lại trước khi gửi. */
  boundTo: string;
}

function assertBoundTo(input: EncryptedAmount, expected: string, what: string): void {
  if (input.boundTo.toLowerCase() !== expected.toLowerCase()) {
    // Ném ở đây chứ không để chain revert: revert data của một proof sai chỗ
    // không nói được nó sai chỗ, và người dùng vừa mất 10 giây encrypt.
    throw new Error(
      `The encrypted ${what} was prepared for ${input.boundTo} but is being sent to ${expected}. ` +
        "This is a programming error — the input proof is bound to the contract it was created for.",
    );
  }
}

// ---------------------------------------------------------------------------
// Deposit
// ---------------------------------------------------------------------------

/**
 * Deposit = một `confidentialTransferAndCall` trên TOKEN, không phải một lời
 * gọi vào pot. Pot chỉ nhận callback `onConfidentialTransferReceived` và ghi
 * nhận **số đã chuyển thật**, không phải số đã yêu cầu (non-negotiable #2).
 *
 * `data` để rỗng có chủ đích: pot ghi có cho `from`, mọi thứ nhét vào `data`
 * đều bị bỏ qua — truyền gì vào đó chỉ tạo ảo giác là nó có tác dụng.
 */
export async function sendDeposit(
  token: Contract,
  potAddress: string,
  amount: EncryptedAmount,
): Promise<ContractTransactionResponse> {
  assertBoundTo(amount, await token.getAddress(), "deposit amount");
  return (await token["confidentialTransferAndCall"]!(
    potAddress,
    amount.handle,
    amount.inputProof,
    "0x",
  )) as ContractTransactionResponse;
}

// ---------------------------------------------------------------------------
// Withdraw / claim
// ---------------------------------------------------------------------------

/** Rút một phần. Yêu cầu vượt số dư được **clamp**, không revert. */
export async function sendWithdraw(pot: Contract, amount: EncryptedAmount): Promise<ContractTransactionResponse> {
  assertBoundTo(amount, await pot.getAddress(), "withdrawal amount");
  return (await pot["withdraw"]!(amount.handle, amount.inputProof)) as ContractTransactionResponse;
}

/**
 * Rút hết. Không encrypt, không reveal, không phase, không pause.
 *
 * Idempotent theo thiết kế của contract: gọi lần hai chuyển encrypted zero
 * chứ không revert — nên UI được phép để nút này bấm lại bao nhiêu lần cũng
 * được, kể cả khi không chắc lần trước đã vào block hay chưa.
 */
export async function sendWithdrawAll(pot: Contract): Promise<ContractTransactionResponse> {
  return (await pot["withdrawAll"]!()) as ContractTransactionResponse;
}

/**
 * Claim. Cũng idempotent, và cố ý **giống nhau y hệt** cho winner và non-winner
 * — cùng code path, cùng gas, cùng HCU (đo ở Day 5). UI không được suy ra ai
 * thắng từ việc claim thành công hay không.
 */
export async function sendClaim(pot: Contract): Promise<ContractTransactionResponse> {
  return (await pot["claim"]!()) as ContractTransactionResponse;
}

// ---------------------------------------------------------------------------
// Sponsor
// ---------------------------------------------------------------------------

/**
 * Nạp giải. `amount` là **plaintext uint64** và điều đó là cố ý (PRIVACY §1):
 * đây là tiền của nhà tài trợ, không phải tiết kiệm của ai, và một giải thưởng
 * không ai kiểm chứng được thì không phải giải thưởng.
 *
 * Hai bước: `approve` trên underlying ERC-20 cho **pot** (không phải cho
 * wrapper — pot tự pull rồi tự wrap), rồi `fundPrize`. Thiếu bước 1 thì revert
 * là `ERC20InsufficientAllowance`, tức R13 lại lần nữa nhưng ở một cặp
 * (spender, owner) khác.
 */
export async function sendFundPrize(pot: Contract, amount: bigint): Promise<ContractTransactionResponse> {
  return (await pot["fundPrize"]!(amount)) as ContractTransactionResponse;
}

/** Rút giải về. Escape hatch, xem `defundPrize` trong contract. */
export async function sendDefundPrize(pot: Contract, amount: bigint): Promise<ContractTransactionResponse> {
  return (await pot["defundPrize"]!(amount)) as ContractTransactionResponse;
}

// ---------------------------------------------------------------------------
// Pre-flight — plaintext, TRƯỚC khi ký
// ---------------------------------------------------------------------------

/**
 * Mọi sự thật công khai quyết định một deposit có làm được gì hay không.
 *
 * Tất cả đều plaintext và đọc được không cần chữ ký. Đó chính là lý do
 * pre-flight tồn tại: phía mã hoá thì clamp im lặng, còn phía công khai thì
 * nói thẳng — nên hỏi phía công khai trước khi tiêu 10 giây encrypt và một
 * lần mở ví.
 *
 * `shieldedHandle` là ngoại lệ duy nhất: nó là ciphertext handle, và ở đây chỉ
 * dùng để phân biệt "chưa từng có cUSDC" với "có, không biết bao nhiêu". Không
 * bao giờ so sánh nó với một con số.
 */
export interface DepositFacts {
  amount: bigint;
  perUserCap: bigint;
  /** Handle cUSDC của người gửi. `HIDDEN_HANDLE` = chưa từng shield gì. */
  shieldedHandle: EncryptedHandle | null;
  /** Wrapper có chặn địa chỉ này không (`isBlocked`). */
  blocked: boolean;
  paused: boolean;
  phase: EpochPhase;
  /** Thời điểm epoch đóng cửa nhận tiền, và giờ hiện tại — cùng đơn vị giây. */
  epochEnd: bigint;
  now: bigint;
  participantCount: number;
  participantCap: number;
  /** Người này đã có slot rồi thì `PoolFull` không áp dụng. */
  registered: boolean;
}

/**
 * `null` = không có gì chặn. Ngược lại trả về đúng một `PotError`, để UI render
 * bằng `ErrorPanel` giống mọi lỗi khác — không có kênh thông điệp thứ hai.
 *
 * Thứ tự kiểm là thứ tự "cái nào không sửa được bằng cách gõ lại số thì nói
 * trước": chặn địa chỉ và phase là chuyện của thế giới, cap và số dư là chuyện
 * của ô input.
 */
export function preflightDeposit(facts: DepositFacts): PotError | null {
  if (facts.blocked) {
    return {
      code: "token-rejected-address",
      row: "R3",
      title: "The token contract has blocked this address",
      detail: "The confidential token refuses to move funds for this account, so a deposit cannot go through.",
      action: { kind: "docs", href: "/docs/known-limitations" },
      retryable: false,
    };
  }
  if (facts.paused) {
    return {
      code: "paused",
      row: "R10",
      title: "Deposits are paused",
      detail: "The pool is paused, which stops new deposits. Withdrawing and claiming stay available.",
      action: { kind: "wait-for-epoch" },
      retryable: false,
    };
  }
  if (facts.phase !== "Open" || facts.now >= facts.epochEnd) {
    return {
      code: "wrong-phase",
      row: "R10",
      title: "This round has stopped taking deposits",
      detail:
        "Entries close when a round ends and open again when the next one starts. Withdrawing is never blocked.",
      action: { kind: "wait-for-epoch" },
      retryable: false,
    };
  }
  if (!facts.registered && facts.participantCount >= facts.participantCap) {
    return {
      code: "pool-full",
      row: null,
      title: "Pool is full",
      detail: "This round has reached its participant cap. You can join the next round once it opens.",
      action: { kind: "wait-for-epoch" },
      retryable: false,
    };
  }
  if (facts.shieldedHandle === null || facts.shieldedHandle === HIDDEN_HANDLE) {
    return {
      code: "insufficient-balance",
      row: "R14",
      title: "You have no shielded balance yet",
      detail: "Deposits are made in the confidential token. Get test USDC and shield some of it first.",
      action: { kind: "get-test-assets" },
      retryable: true,
    };
  }
  if (facts.amount <= 0n) {
    return {
      code: "invalid-amount",
      row: null,
      title: "Enter an amount first",
      detail: "The pool rejects a deposit of zero. Type an amount above zero and try again.",
      action: { kind: "edit-amount" },
      retryable: true,
    };
  }
  if (facts.amount > facts.perUserCap) {
    return {
      code: "invalid-amount",
      row: "R2",
      title: "That is above the per-wallet limit for this pool",
      detail:
        "The pool would accept the transfer and then hand the whole amount straight back, so nothing would change. " +
        "Lower the amount to at most the limit shown below and it will go through.",
      action: { kind: "edit-amount" },
      retryable: true,
    };
  }
  return null;
}

/**
 * Headroom còn lại theo cap **nếu** biết principal hiện tại.
 *
 * Chỉ gọi được sau khi người dùng đã reveal principal của chính mình — nghĩa
 * là con số này chỉ tồn tại trong bộ nhớ tab của chủ ví. Không reveal thì
 * pre-flight chỉ so được với cap tuyệt đối, và phần còn lại do clamp lo: đúng
 * là một deposit có thể bị hoàn về, và đó là lý do sau deposit BẮT BUỘC đọc lại
 * handle chứ không echo số đã nhập (non-negotiable #2).
 */
export function capHeadroom(perUserCap: bigint, revealedPrincipal: bigint): bigint {
  const left = perUserCap - revealedPrincipal;
  return left > 0n ? left : 0n;
}

/** Sự thật công khai quyết định `fundPrize` có chạy được không. */
export interface FundFacts {
  amount: bigint;
  paused: boolean;
  phase: EpochPhase;
  /** Ví đang kết nối có đúng là `EMPLOYER` của pot không. */
  isEmployer: boolean;
  /** Số dư và hạn mức của underlying ERC-20 — cả hai công khai. */
  underlyingBalance: bigint;
  allowanceToPot: bigint;
  /** `RATE` của pot: 1 đơn vị prize cần bao nhiêu đơn vị underlying. */
  rate: bigint;
}

export type FundBlock = PotError | { needsApproval: true } | null;

/**
 * `{needsApproval: true}` KHÔNG phải lỗi — nó là bước 1 trong 2 (R13), và gọi
 * nó là lỗi thì UI sẽ hiện một panel đỏ cho một việc hoàn toàn bình thường.
 */
export function preflightFundPrize(facts: FundFacts): FundBlock {
  if (!facts.isEmployer) {
    return {
      code: "not-employer",
      row: null,
      title: "This wallet is not the sponsor",
      detail: "Funding the prize is restricted on chain to the sponsor address configured for this pool.",
      action: { kind: "connect-wallet" },
      retryable: false,
    };
  }
  if (facts.paused) {
    return {
      code: "paused",
      row: "R10",
      title: "The pool is paused",
      detail: "Funding is unavailable while the pool is paused. Savers can still withdraw and claim.",
      action: { kind: "wait-for-epoch" },
      retryable: false,
    };
  }
  if (facts.phase !== "Open") {
    return {
      code: "wrong-phase",
      row: "R12",
      title: "This round is past funding",
      detail:
        "A prize can only be added while entries are open — after that the savers could no longer respond to it. " +
        "Fund the next round instead.",
      action: { kind: "wait-for-epoch" },
      retryable: false,
    };
  }
  if (facts.amount <= 0n) {
    return {
      code: "invalid-amount",
      row: null,
      title: "Enter an amount first",
      detail: "The pool rejects a prize of zero.",
      action: { kind: "edit-amount" },
      retryable: true,
    };
  }
  const needed = facts.amount * facts.rate;
  if (facts.underlyingBalance < needed) {
    return {
      code: "insufficient-balance",
      row: "R12",
      title: "Not enough test USDC to back this prize",
      detail:
        "The pool pulls the full prize from this wallet and wraps it, so the prize is always fully backed. " +
        "Top the wallet up and try again.",
      action: { kind: "get-test-assets" },
      retryable: true,
    };
  }
  if (facts.allowanceToPot < needed) return { needsApproval: true };
  return null;
}
