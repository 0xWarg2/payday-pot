/**
 * Error taxonomy — mọi thứ hỏng được trên đường đi của PayDay Pot, ánh xạ về
 * đúng một dòng recovery.
 *
 * Vì sao file này tồn tại: tiêu chí chấm của bounty track có mục "does your app
 * handle errors gracefully?", và `docs/ERROR_RECOVERY_MATRIX.md` đặt luật — mỗi
 * failure mode phải có (1) user thấy gì, (2) nút bấm được, (3) test. File này là
 * vế (1) và (2) ở dạng code: UI không được tự chế thông điệp lỗi, nó gọi
 * `classifyError` rồi render `title`/`detail`/`action`.
 *
 * HAI LUẬT TUYỆT ĐỐI, có test pin ở Day 6:
 *
 * 1. KHÔNG bao giờ nhét số tiền vào thông điệp lỗi (non-negotiable #5). Kể cả
 *    số public như ERC-20 balance — UI tự đọc và hiển thị ở chỗ của nó, còn
 *    error string thì sạch. Như vậy log/telemetry/screenshot không bao giờ là
 *    kênh rò.
 * 2. KHÔNG có dead end: mọi `PotError` phải có `action` khác `"none"`, trừ đúng
 *    những case mà hành động tiếp theo thật sự không tồn tại — và những case đó
 *    phải mang `link` tới KNOWN_LIMITATIONS.
 *
 * BẪY KHÔNG PHẢI LỖI — đọc trước khi debug: deposit vượt `PER_USER_CAP` KHÔNG
 * revert. ERC-7984 clamp all-or-nothing, token hoàn tiền và tx vẫn thành công
 * (R2). Không có error nào để bắt ở đây; UI phải so `principalOf` trước/sau để
 * biết. Đừng đi tìm một `CapExceeded` không tồn tại.
 */

import { PAYDAY_POT_ABI, type PayDayPotErrorName } from "@payday-pot/shared";
import { Interface, type InterfaceAbi } from "ethers";

/** Dòng trong `docs/ERROR_RECOVERY_MATRIX.md` mà lỗi này thuộc về. */
export type MatrixRow = "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "R7" | "R8" | "R9" | "R10" | "R11" | "R12" | "R13" | "R14" | "R15";

/**
 * Hành động recovery UI phải cấp cho user. Mọi action đều idempotent — bấm hai
 * lần không hỏng — vì đó là ràng buộc của ERROR_RECOVERY_MATRIX.
 */
export type RecoveryAction =
  | { kind: "retry" }
  | { kind: "switch-network" }
  | { kind: "connect-wallet" }
  | { kind: "approve" }
  | { kind: "get-test-assets" }
  | { kind: "reveal-again" }
  | { kind: "continue-draw" }
  | { kind: "resume-unwrap" }
  | { kind: "edit-amount" }
  | { kind: "wait-for-epoch" }
  | { kind: "docs"; href: string };

export type PotErrorCode =
  // --- contract (PayDayPot + inherited) ---
  | "not-token"
  | "not-employer"
  | "pool-full"
  | "not-registered"
  | "wrong-phase"
  | "invalid-config"
  | "invalid-amount"
  | "zero-address"
  | "already-drawn"
  | "not-drawn"
  | "selection-complete"
  | "nothing-to-claim"
  | "paused"
  | "not-paused"
  | "not-owner"
  | "reentrancy"
  | "handle-not-allowed"
  | "protocol-unsupported"
  | "transfer-failed"
  // --- token / wrapper / underlying ---
  | "insufficient-allowance"
  | "insufficient-balance"
  | "token-rejected-address"
  | "wrapper-supply-cap"
  | "unwrap-request-gone"
  | "unauthorized-spender"
  // --- wallet ---
  | "user-rejected"
  | "wrong-network"
  | "wallet-missing"
  // --- relayer / rpc ---
  | "relayer-timeout"
  | "decryption-incomplete"
  | "network-unreachable"
  // --- fallback ---
  | "unknown";

export interface PotError {
  code: PotErrorCode;
  /** Dòng ERROR_RECOVERY_MATRIX tương ứng — `null` nếu chưa được liệt kê ở đó. */
  row: MatrixRow | null;
  /** Tiêu đề ngắn cho UI. Tiếng Anh (sản phẩm nộp cho judge quốc tế). */
  title: string;
  /** Một câu giải thích. KHÔNG chứa số tiền. */
  detail: string;
  action: RecoveryAction;
  /** Bấm lại đúng thao tác cũ có ý nghĩa không. */
  retryable: boolean;
  /** Lỗi gốc — chỉ dùng để debug, KHÔNG render thẳng ra UI. */
  cause?: unknown;
}

type Spec = Omit<PotError, "code" | "cause">;

const DOCS_LIMITATIONS = "/docs/known-limitations";

/**
 * Bảng dịch cho MỌI custom error của contract. `satisfies Record<...>` là cố ý:
 * thêm một error vào PayDayPot.sol sẽ làm `pnpm -r build` gãy ở đây cho tới khi
 * ai đó quyết định user nhìn thấy gì — không có đường để một revert mới lặng lẽ
 * rơi vào nhánh "unknown".
 */
const CONTRACT_ERRORS = {
  NotToken: {
    row: "R15",
    title: "Wrong token",
    detail: "This pool only accepts its own confidential token. Whatever sent this transfer is not it.",
    action: { kind: "docs", href: DOCS_LIMITATIONS },
    retryable: false,
  },
  NotEmployer: {
    row: null,
    title: "Sponsor-only action",
    detail: "Funding and defunding the prize is restricted to the sponsor wallet for this pool.",
    action: { kind: "connect-wallet" },
    retryable: false,
  },
  PoolFull: {
    row: null,
    title: "Pool is full",
    detail: "This round has reached its participant cap. You can join the next round once it opens.",
    action: { kind: "wait-for-epoch" },
    retryable: false,
  },
  NotRegistered: {
    row: null,
    title: "Not in this pool yet",
    detail: "You have to make a first deposit before this action is available.",
    action: { kind: "retry" },
    retryable: false,
  },
  WrongPhase: {
    row: "R10",
    title: "Round is not open for this",
    detail:
      "Deposits are closed between the moment a round ends and the moment the next one starts. Withdrawing is never blocked.",
    action: { kind: "wait-for-epoch" },
    retryable: false,
  },
  InvalidConfig: {
    row: null,
    title: "Pool is misconfigured",
    detail: "The pool rejected its own parameters. This is a deployment bug, not something you did.",
    action: { kind: "docs", href: DOCS_LIMITATIONS },
    retryable: false,
  },
  InvalidAmount: {
    row: null,
    title: "Amount is not usable",
    detail: "The pool rejected this amount. Enter a value above zero and try again.",
    action: { kind: "edit-amount" },
    retryable: true,
  },
  ZeroAddress: {
    row: null,
    title: "Missing address",
    detail: "A required address was empty.",
    action: { kind: "retry" },
    retryable: false,
  },
  AlreadyDrawn: {
    row: "R5",
    title: "The seed for this round is already fixed",
    detail: "Randomness is drawn exactly once per round and is never re-rolled. Continue the draw instead.",
    action: { kind: "continue-draw" },
    retryable: false,
  },
  NotDrawn: {
    row: "R5",
    title: "Draw has not started",
    detail: "The winner scan cannot run until this round's randomness has been requested.",
    action: { kind: "continue-draw" },
    retryable: false,
  },
  SelectionComplete: {
    row: "R4",
    title: "Draw already finished",
    detail: "Every participant in this round has been scanned. There is nothing left to continue.",
    action: { kind: "retry" },
    retryable: false,
  },
  NothingToClaim: {
    row: "R9",
    title: "Nothing to claim yet",
    detail: "This round has not been scanned for you yet, so there is no result to collect.",
    action: { kind: "continue-draw" },
    retryable: false,
  },
  EnforcedPause: {
    row: "R10",
    title: "Deposits are paused",
    detail: "The pool is paused, which stops new deposits. Withdrawing and claiming stay available.",
    action: { kind: "wait-for-epoch" },
    retryable: false,
  },
  ExpectedPause: {
    row: null,
    title: "Pool is not paused",
    detail: "This action is only valid while the pool is paused.",
    action: { kind: "retry" },
    retryable: false,
  },
  OwnableUnauthorizedAccount: {
    row: null,
    title: "Admin-only action",
    detail: "This wallet is not the pool administrator.",
    action: { kind: "connect-wallet" },
    retryable: false,
  },
  OwnableInvalidOwner: {
    row: null,
    title: "Invalid owner",
    detail: "The pool rejected that owner address.",
    action: { kind: "retry" },
    retryable: false,
  },
  ReentrancyGuardReentrantCall: {
    row: null,
    title: "Transaction blocked",
    detail: "The pool refused a re-entrant call. Submit the action on its own.",
    action: { kind: "retry" },
    retryable: true,
  },
  SafeERC20FailedOperation: {
    row: "R13",
    title: "Token transfer failed",
    detail: "The underlying token refused the transfer. Check that the approval is in place, then try again.",
    action: { kind: "approve" },
    retryable: true,
  },
  SenderNotAllowedToUseHandle: {
    row: "R6",
    title: "That encrypted value is not yours to use",
    detail: "The value this action referenced belongs to another account, or the permission for it has expired.",
    action: { kind: "reveal-again" },
    retryable: true,
  },
  ZamaProtocolUnsupported: {
    row: "R8",
    title: "Wrong network",
    detail: "The confidential protocol is not available on the chain this wallet is connected to.",
    action: { kind: "switch-network" },
    retryable: false,
  },
} as const satisfies Record<PayDayPotErrorName, Spec>;

/** Ánh xạ tên error → code ổn định để UI/test tham chiếu. */
const CONTRACT_CODES = {
  NotToken: "not-token",
  NotEmployer: "not-employer",
  PoolFull: "pool-full",
  NotRegistered: "not-registered",
  WrongPhase: "wrong-phase",
  InvalidConfig: "invalid-config",
  InvalidAmount: "invalid-amount",
  ZeroAddress: "zero-address",
  AlreadyDrawn: "already-drawn",
  NotDrawn: "not-drawn",
  SelectionComplete: "selection-complete",
  NothingToClaim: "nothing-to-claim",
  EnforcedPause: "paused",
  ExpectedPause: "not-paused",
  OwnableUnauthorizedAccount: "not-owner",
  OwnableInvalidOwner: "zero-address",
  ReentrancyGuardReentrantCall: "reentrancy",
  SafeERC20FailedOperation: "transfer-failed",
  SenderNotAllowedToUseHandle: "handle-not-allowed",
  ZamaProtocolUnsupported: "protocol-unsupported",
} as const satisfies Record<PayDayPotErrorName, PotErrorCode>;

/**
 * Error của token/wrapper/underlying. Chúng KHÔNG nằm trong ABI của pot — chúng
 * bubble lên từ contract khác, nên nếu chỉ decode bằng ABI pot thì cả nhóm này
 * rơi vào "unknown". Đây đúng là 2 trong 4 case brief nêu tên (missing approval,
 * insufficient balance), nên không được để lọt.
 */
const FOREIGN_ERROR_ABI = [
  "error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)",
  "error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)",
  "error ERC20InvalidApprover(address approver)",
  "error ERC20InvalidReceiver(address receiver)",
  "error ERC20InvalidSender(address sender)",
  "error ERC20InvalidSpender(address spender)",
  "error ERC7984InvalidReceiver(address receiver)",
  "error ERC7984InvalidSender(address sender)",
  "error ERC7984UnauthorizedCaller(address caller)",
  "error ERC7984UnauthorizedSpender(address holder, address spender)",
  "error ERC7984UnauthorizedUseOfEncryptedAmount(bytes32 amount, address user)",
  "error ERC7984TotalSupplyOverflow()",
  "error InvalidUnwrapRequest(bytes32 unwrapRequestId)",
];

const FOREIGN_ERRORS: Record<string, Spec & { code: PotErrorCode }> = {
  ERC20InsufficientAllowance: {
    code: "insufficient-allowance",
    row: "R13",
    title: "Approval needed first",
    detail: "This is a two-step action: approve the token, then submit. Nothing has left your wallet yet.",
    action: { kind: "approve" },
    retryable: true,
  },
  ERC20InsufficientBalance: {
    code: "insufficient-balance",
    row: "R14",
    title: "Not enough test USDC",
    detail: "Your wallet does not hold enough of the underlying test token for this action.",
    action: { kind: "get-test-assets" },
    retryable: true,
  },
  ERC20InvalidApprover: {
    code: "insufficient-allowance",
    row: "R13",
    title: "Approval rejected",
    detail: "The token refused the approval from this account.",
    action: { kind: "approve" },
    retryable: true,
  },
  ERC20InvalidReceiver: {
    code: "token-rejected-address",
    row: "R3",
    title: "Token rejected this address",
    detail: "The token contract refuses to send to that address.",
    action: { kind: "docs", href: DOCS_LIMITATIONS },
    retryable: false,
  },
  ERC20InvalidSender: {
    code: "token-rejected-address",
    row: "R3",
    title: "Token rejected this address",
    detail: "The token contract refuses to move funds from that address.",
    action: { kind: "docs", href: DOCS_LIMITATIONS },
    retryable: false,
  },
  ERC20InvalidSpender: {
    code: "token-rejected-address",
    row: "R3",
    title: "Token rejected this spender",
    detail: "The token contract refuses to grant an allowance to that address.",
    action: { kind: "docs", href: DOCS_LIMITATIONS },
    retryable: false,
  },
  ERC7984InvalidReceiver: {
    code: "token-rejected-address",
    row: "R3",
    title: "Confidential token rejected this address",
    detail: "The confidential token refuses this recipient — it may be on the token's deny list.",
    action: { kind: "docs", href: DOCS_LIMITATIONS },
    retryable: false,
  },
  ERC7984InvalidSender: {
    code: "token-rejected-address",
    row: "R3",
    title: "Confidential token rejected this address",
    detail: "The confidential token refuses this sender — it may be on the token's deny list.",
    action: { kind: "docs", href: DOCS_LIMITATIONS },
    retryable: false,
  },
  ERC7984UnauthorizedCaller: {
    code: "unauthorized-spender",
    row: null,
    title: "Not allowed to call that",
    detail: "The confidential token refused this caller.",
    action: { kind: "connect-wallet" },
    retryable: false,
  },
  ERC7984UnauthorizedSpender: {
    code: "unauthorized-spender",
    row: null,
    title: "Not allowed to move those funds",
    detail: "This wallet is neither the holder nor an approved operator for that balance.",
    action: { kind: "connect-wallet" },
    retryable: false,
  },
  ERC7984UnauthorizedUseOfEncryptedAmount: {
    code: "handle-not-allowed",
    row: "R6",
    title: "That encrypted value is not yours to use",
    detail: "The encrypted amount this action referenced is not readable by this wallet any more.",
    action: { kind: "reveal-again" },
    retryable: true,
  },
  ERC7984TotalSupplyOverflow: {
    code: "wrapper-supply-cap",
    row: "R3",
    title: "Token supply cap reached",
    detail: "The confidential token cannot mint any more supply, so wrapping is unavailable right now.",
    action: { kind: "docs", href: DOCS_LIMITATIONS },
    retryable: false,
  },
  InvalidUnwrapRequest: {
    code: "unwrap-request-gone",
    row: "R1",
    title: "This unwrap is already finished",
    detail: "The pending unwrap you tried to resume has already been finalized — the tokens are in the destination wallet.",
    action: { kind: "retry" },
    retryable: false,
  },
};

const potInterface = new Interface(PAYDAY_POT_ABI as unknown as InterfaceAbi);
const foreignInterface = new Interface(FOREIGN_ERROR_ABI);

/** `parseError` ném khi data méo (không đủ 4 byte selector) — coi như không khớp. */
function tryParse(iface: Interface, data: string): string | null {
  try {
    return iface.parseError(data)?.name ?? null;
  } catch {
    return null;
  }
}

function make(code: PotErrorCode, spec: Spec, cause: unknown): PotError {
  return cause === undefined ? { code, ...spec } : { code, ...spec, cause };
}

/** Moi ra revert data từ hình dạng lỗi của ethers/EIP-1193/viem. */
function revertData(e: unknown): string | undefined {
  if (typeof e !== "object" || e === null) return undefined;
  const anyE = e as Record<string, unknown>;
  for (const key of ["data", "error", "info", "cause"]) {
    const v = anyE[key];
    if (typeof v === "string" && v.startsWith("0x") && v.length >= 10) return v;
    if (typeof v === "object" && v !== null) {
      const nested = revertData(v);
      if (nested) return nested;
    }
  }
  return undefined;
}

/**
 * Gom MỌI mã lỗi trong cây, không chỉ mã ngoài cùng.
 *
 * ethers bọc lỗi của ví lại: một "user rejected" của EIP-1193 (4001) đi ra
 * ngoài dưới lớp `code: "UNKNOWN_ERROR"` với bản gốc nằm ở `error`/`info`. Chỉ
 * đọc mã ngoài cùng thì mọi lần user bấm Reject đều rơi vào nhánh `unknown` —
 * tức app nói "Something went wrong" cho một việc người dùng vừa cố ý làm.
 */
function errorCodesOf(e: unknown, depth = 0): (string | number)[] {
  if (depth > 6 || typeof e !== "object" || e === null) return [];
  const anyE = e as Record<string, unknown>;
  const out: (string | number)[] = [];
  const own = anyE["code"];
  if (typeof own === "string" || typeof own === "number") out.push(own);
  for (const key of ["info", "error", "cause", "data"]) {
    const v = anyE[key];
    if (typeof v === "object" && v !== null) out.push(...errorCodesOf(v, depth + 1));
  }
  return out;
}

function hasCode(e: unknown, ...wanted: (string | number)[]): boolean {
  const codes = errorCodesOf(e);
  return wanted.some((w) => codes.includes(w));
}

/**
 * Message của lỗi CỘNG toàn bộ chuỗi `cause`, dẹt thành một chuỗi.
 *
 * `messageOf` cố ý không đi theo `cause`: đổi nó sẽ đổi cách phân loại của mọi
 * lỗi đã có, và một `cause` tình cờ chứa chữ "network" đủ để kéo một lỗi hợp
 * đồng sang nhánh RPC. Nhưng có đúng một họ lỗi mà thông tin CHỈ nằm ở `cause`:
 * `@zama-fhe/relayer-sdk` bọc mọi thất bại của bước decrypt lại thành cùng một
 * câu ("An error occured during decryption"), nên nếu chỉ đọc lớp ngoài thì mọi
 * nguyên nhân khác nhau đều rơi vào `unknown`. Nhánh đó — và chỉ nhánh đó —
 * đọc chuỗi này.
 */
function messageChainOf(e: unknown, depth = 0): string {
  if (depth > 5) return "";
  const head = messageOf(e);
  const cause = typeof e === "object" && e !== null ? (e as Record<string, unknown>)["cause"] : undefined;
  const tail = cause === undefined || cause === null ? "" : messageChainOf(cause, depth + 1);
  return tail === "" ? head : `${head} ${tail}`;
}

function messageOf(e: unknown): string {
  if (typeof e === "string") return e;
  if (typeof e === "object" && e !== null) {
    const m = (e as Record<string, unknown>)["message"];
    if (typeof m === "string") return m;
  }
  return "";
}

/**
 * Biến bất kỳ thứ gì ném ra được thành đúng một dòng recovery.
 *
 * Thứ tự có chủ đích: revert data trước (chính xác nhất), rồi tới mã lỗi ví,
 * rồi tới nhận dạng theo message (mong manh nhất — chỉ dùng cho relayer/RPC vốn
 * không có mã ổn định).
 */
export function classifyError(e: unknown): PotError {
  const data = revertData(e);
  if (data) {
    const potName = tryParse(potInterface, data);
    if (potName !== null && potName in CONTRACT_ERRORS) {
      const name = potName as PayDayPotErrorName;
      return make(CONTRACT_CODES[name], CONTRACT_ERRORS[name], e);
    }
    const foreignName = tryParse(foreignInterface, data);
    const foreign = foreignName !== null ? FOREIGN_ERRORS[foreignName] : undefined;
    if (foreign) {
      const { code, ...spec } = foreign;
      return make(code, spec, e);
    }
  }

  // EIP-1193: 4001 user rejected · 4902 chain chưa được thêm vào ví.
  // ethers gói lại thành "ACTION_REJECTED".
  if (hasCode(e, 4001, "ACTION_REJECTED")) {
    return make(
      "user-rejected",
      {
        row: "R6",
        title: "You cancelled",
        detail: "Nothing was sent and nothing changed. You can start the same action again whenever you want.",
        action: { kind: "retry" },
        retryable: true,
      },
      e,
    );
  }
  if (hasCode(e, 4902, "NETWORK_ERROR") || /unrecognized chain|wrong network|chain mismatch/i.test(messageOf(e))) {
    return make(
      "wrong-network",
      {
        row: "R8",
        title: "Wrong network",
        detail: "This pool lives on Ethereum Sepolia. Switch the network and the page will pick up where it was.",
        action: { kind: "switch-network" },
        retryable: false,
      },
      e,
    );
  }

  const msg = messageOf(e);
  if (/no (injected )?(ethereum|wallet)|window\.ethereum|no provider/i.test(msg)) {
    return make(
      "wallet-missing",
      {
        row: "R8",
        title: "No wallet detected",
        detail: "This page needs a browser wallet to read your own encrypted balance.",
        action: { kind: "connect-wallet" },
        retryable: true,
      },
      e,
    );
  }
  // Trước nhánh relayer/timeout: một reconstruction hỏng KHÔNG phải timeout, và
  // gọi nó là "service is slow" thì người dùng sẽ ngồi đợi thay vì bấm lại.
  if (/gao decoding|error reconstructing|user_decryption_wasm|error occured during decryption/i.test(messageChainOf(e))) {
    return make(
      "decryption-incomplete",
      {
        row: "R7",
        title: "The decryption service could not finish",
        detail:
          "It answered with an incomplete result, so nothing could be opened. Nothing was sent and nothing changed. Try again — a second attempt almost always goes through.",
        action: { kind: "retry" },
        retryable: true,
      },
      e,
    );
  }
  if (/relayer|timeout|timed out|aborted/i.test(msg)) {
    return make(
      "relayer-timeout",
      {
        row: "R7",
        title: "The encryption service is slow",
        detail: "Your input is still here. Retry when you are ready — nothing was submitted.",
        action: { kind: "retry" },
        retryable: true,
      },
      e,
    );
  }
  if (/fetch failed|network|econnrefused|failed to fetch|rpc/i.test(msg)) {
    return make(
      "network-unreachable",
      {
        row: "R7",
        title: "Cannot reach the network",
        detail: "The connection to Sepolia dropped. Nothing was submitted.",
        action: { kind: "retry" },
        retryable: true,
      },
      e,
    );
  }

  return make(
    "unknown",
    {
      row: null,
      title: "Something went wrong",
      detail: "The action did not go through. Nothing was submitted, so it is safe to try again.",
      action: { kind: "retry" },
      retryable: true,
    },
    e,
  );
}

/** Mọi code đã được phân loại — dùng cho test đảm bảo không có dead end. */
export const ALL_CONTRACT_ERROR_SPECS = CONTRACT_ERRORS;
export const ALL_FOREIGN_ERROR_SPECS = FOREIGN_ERRORS;
export { FOREIGN_ERROR_ABI };

/**
 * Cổng duy nhất để một thứ ném ra được đi vào UI.
 *
 * `classifyError` biết cách đọc revert data và mã ví, nhưng ở tầng component thì
 * cái ném ra không phải lúc nào cũng là lỗi của chain: một `TypeError` do state
 * chưa nạp xong cũng ném ra ở đúng chỗ đó. Cast nó thành `PotError` là cách
 * thẳng nhất để đổi một lỗi nhỏ thành một trang trắng — `ErrorPanel` đọc
 * `error.action.kind` và `Error` không có `action`.
 *
 * Nên: nhận diện `PotError` thật (có `code` và `action`), còn lại đưa hết qua
 * `classifyError`. Không có nhánh nào trả về thứ không render được.
 */
export function toPotError(e: unknown): PotError {
  if (
    typeof e === "object" &&
    e !== null &&
    typeof (e as { code?: unknown }).code === "string" &&
    typeof (e as { action?: unknown }).action === "object" &&
    (e as { action?: { kind?: unknown } }).action?.kind !== undefined
  ) {
    return e as PotError;
  }
  return classifyError(e);
}
