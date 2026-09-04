import {
  HIDDEN_HANDLE,
  drawStepFor,
  pendingWork,
  type DrawStep,
  type EncryptedHandle,
  type EpochView,
  type PotState,
} from "@payday-pot/sdk";

import type { ConfidentialView } from "../format";

/**
 * View model của Draw Room — thuần, không React, không ethers, không fetch.
 *
 * Tách ra khỏi component vì đây là chỗ dễ làm rò rỉ nhất trong cả sản phẩm và
 * chỗ rò rỉ thì phải test được. Ba luật chi phối mọi thứ dưới đây:
 *
 * 1. **Cursor onchain là sự thật.** Không có state cục bộ nào ở đây nhớ "tôi
 *    vừa bấm Continue". Giết keeper giữa chừng rồi F5 phải ra đúng con số cũ,
 *    và cách rẻ nhất để bảo đảm điều đó là không có gì để mất đi khi reload.
 *
 * 2. **Người thắng và người thua nhìn thấy y hệt nhau trước khi reveal.**
 *    `sealedResult()` cố ý KHÔNG nhận giá trị đã decrypt. Nó chỉ nhận handle,
 *    và contract ghi handle cho *mọi* participant được quét
 *    (`_scanParticipant` cộng `FHE.select(hit, prize, 0)` cho tất cả), nên sự
 *    tồn tại của handle không nói lên điều gì. Muốn giữ tính chất đó thì hàm
 *    này không được phép nhìn thấy con số.
 *
 * 3. **Không suy ra gì từ thời gian.** Mọi mốc đều là `phase` + cursor đọc từ
 *    chain; `now` chỉ dùng cho đúng một việc là đếm ngược lúc round còn mở.
 */

/* ------------------------------------------------------------------ *
 * Timeline
 * ------------------------------------------------------------------ */

export type DrawStageId = "open" | "snapshot" | "random" | "select" | "settled";
export type StageStatus = "done" | "active" | "upcoming";

export interface DrawStage {
  id: DrawStageId;
  label: string;
  /** Một câu ở thì hiện tại, mô tả CÁI GÌ đang xảy ra — không phải hướng dẫn. */
  detail: string;
  status: StageStatus;
  /** Chỉ có ở stage chạy theo cursor. Số onchain, không phải phần trăm ước lượng. */
  progress: { done: number; total: number } | null;
}

const STAGE_LABEL: Record<DrawStageId, string> = {
  open: "Round open",
  snapshot: "Weights frozen",
  random: "Seed drawn",
  select: "Pool scanned",
  settled: "Result sealed",
};

/**
 * Năm mốc công khai của một vòng, đúng theo cursor onchain.
 *
 * `now === null` (chưa mount, xem §use-now) không làm hàm này trả rỗng — nó chỉ
 * làm mốc `open` giữ nguyên trạng thái "đang chạy" thay vì đoán rằng giờ đã hết.
 * Đoán sai chiều nào cũng tệ: hoặc nói round đã đóng khi nó chưa, hoặc ngược lại.
 */
/**
 * Cửa nạp tiền đã đóng chưa — đúng theo guard của contract, không phải theo phase.
 *
 * `PayDayPot.sol:260` đòi CẢ HAI: `phase == Open` **và** `block.timestamp <
 * ep.end`. Hai điều kiện đó tách rời nhau được: hết giờ rồi mà chưa ai gọi
 * `beginSnapshot()` thì phase vẫn còn là Open trong khi deposit đã revert từ
 * lâu. Màn hình nào chỉ nhìn phase sẽ nói round còn mở suốt quãng đó.
 *
 * `now === null` (chưa mount) KHÔNG đoán là đã đóng — xem §drawTimeline.
 */
export function depositsClosed(view: EpochView, now: bigint | null): boolean {
  return view.phase !== "Open" || (now !== null && now >= view.end);
}

/**
 * Nhãn giai đoạn dùng chung cho dashboard và draw room. Một bản, không hai:
 * hai chỗ từng nói hai câu khác nhau cho cùng một `phase` onchain.
 *
 * Không export: `phase` một mình không đủ để đặt tên giai đoạn (xem
 * `depositsClosed`). Mọi chỗ hiển thị đi qua `phaseLabel(view, now)`.
 */
const PHASE_LABEL: Record<EpochView["phase"], string> = {
  Open: "Open — deposits still count",
  Snapshotting: "Closing — weights freezing",
  Drawing: "Drawing — scanning the pool",
  Settled: "Settled — result sealed",
};

/** Hết giờ, phase onchain vẫn Open vì chưa ai gọi `beginSnapshot()`. */
const PHASE_LABEL_CLOSED_WAITING = "Closed — waiting to freeze weights";

/**
 * Câu subtitle của một vòng, khớp với `drawTimeline` từng chữ.
 *
 * Header từng in `PHASE_LABEL[phase]` thẳng, nên khoảng giữa lúc hết giờ và
 * lúc keeper gọi `beginSnapshot()` nó nói "deposits still count" trong khi
 * timeline ngay dưới nói "Deposits are closed." Cùng một màn hình, hai câu
 * trái nhau — và deposit lúc đó revert thật (PayDayPot.sol:260). Cả hai giờ
 * đọc cùng một `depositsClosed`, nên không thể lệch nhau nữa.
 */
export function phaseLabel(view: EpochView, now: bigint | null): string {
  if (view.phase === "Open" && depositsClosed(view, now)) return PHASE_LABEL_CLOSED_WAITING;
  return PHASE_LABEL[view.phase];
}

export function drawTimeline(view: EpochView, now: bigint | null): DrawStage[] {
  const closed = depositsClosed(view, now);
  const snapshotProgress = { done: view.snapshot.cursor, total: view.snapshot.total };
  const selectProgress = { done: view.draw.cursor, total: view.draw.total };

  // Pool rỗng: `beginSnapshot` settle thẳng trong cùng tx, không đi qua
  // Snapshotting/Drawing. Timeline vẫn phải đọc được — nói "không có ai" chứ
  // không vẽ ba mốc xong xuôi cho một việc chưa từng chạy.
  const emptyPool = view.phase === "Settled" && view.draw.total === 0;

  const stages: DrawStage[] = [
    {
      id: "open",
      label: STAGE_LABEL.open,
      detail: closed ? "Deposits are closed." : "Deposits still count toward this round.",
      status: closed ? "done" : "active",
      progress: null,
    },
    {
      id: "snapshot",
      label: STAGE_LABEL.snapshot,
      detail: emptyPool ? "Nobody was saving when the round closed." : "Every saver's weight is frozen, in batches.",
      status: stageStatus(view, "snapshot", closed),
      progress: emptyPool ? null : snapshotProgress,
    },
    {
      id: "random",
      label: STAGE_LABEL.random,
      detail: emptyPool
        ? "No seed was needed."
        : view.draw.drawn
          ? "Drawn and locked. It cannot be redrawn."
          : "One random seed, once.",
      status: stageStatus(view, "random", closed),
      progress: null,
    },
    {
      id: "select",
      label: STAGE_LABEL.select,
      detail: emptyPool ? "There was nobody to scan." : "Every saver checked against the seed, the same work each.",
      status: stageStatus(view, "select", closed),
      progress: emptyPool ? null : selectProgress,
    },
    {
      id: "settled",
      label: STAGE_LABEL.settled,
      detail:
        view.phase === "Settled"
          ? emptyPool
            ? "The prize rolled over to the next round."
            : "On chain, encrypted. Only its owner can read it."
          : "Sealed when the scan finishes.",
      status: view.phase === "Settled" ? "done" : "upcoming",
      progress: null,
    },
  ];

  return stages;
}

function stageStatus(view: EpochView, id: "snapshot" | "random" | "select", closed: boolean): StageStatus {
  switch (view.phase) {
    case "Open":
      // Hết giờ mà chưa ai gọi `beginSnapshot`: mốc snapshot là việc đang chờ,
      // không phải việc tương lai. Đây chính là chỗ nút Trigger xuất hiện.
      return id === "snapshot" && closed ? "active" : "upcoming";
    case "Snapshotting":
      return id === "snapshot" ? "active" : "upcoming";
    case "Drawing":
      if (id === "snapshot") return "done";
      if (id === "random") return view.draw.drawn ? "done" : "active";
      return view.draw.drawn ? "active" : "upcoming";
    case "Settled":
      return "done";
  }
}

/* ------------------------------------------------------------------ *
 * Keeper
 * ------------------------------------------------------------------ */

export type KeeperState =
  /** Round còn mở — không có việc gì, và nói rõ là không có. */
  | { kind: "counting-down"; endsAt: bigint }
  /** Có việc, ai bấm cũng được. */
  | { kind: "ready"; step: DrawStep; label: string; detail: string; progress: { done: number; total: number } | null }
  /** Việc duy nhất bị pause chặn. Không render nút sẽ revert. */
  | { kind: "blocked-paused"; label: string; detail: string }
  /** Không có việc, và cũng không đếm ngược (ví dụ đã quét xong nhưng chưa Settled). */
  | { kind: "idle"; detail: string };

const STEP_LABEL: Record<DrawStep["action"], string> = {
  "begin-snapshot": "Close the round",
  snapshot: "Freeze the next batch",
  "request-random": "Draw the seed",
  select: "Scan the next batch",
  "start-new-epoch": "Open the next round",
};

const STEP_DETAIL: Record<DrawStep["action"], string> = {
  "begin-snapshot": "The clock ran out. Closing freezes who is in the round.",
  snapshot: "Batches keep a full pool inside the gas limit.",
  "request-random": "One seed, once. It cannot be drawn again.",
  select: "Whoever sends the next batch continues from the cursor on chain.",
  "start-new-epoch": "The next round starts empty, with the prize carried over.",
};

/**
 * Việc gì đang chờ, và ai cũng bấm được — kể cả bạn.
 *
 * `state.paused` chỉ chặn ĐÚNG MỘT bước: `requestRandom` là hàm draw duy nhất
 * có `whenNotPaused` (PayDayPot.sol:610). Bốn bước còn lại chạy bình thường
 * trong lúc pause, đúng như thiết kế — pause để chặn tiền mới vào, không phải
 * để giam một vòng đang chạy dở. Vẽ một cái nút biết trước là sẽ revert thì tệ
 * hơn hẳn việc nói ra tại sao nó không có ở đây.
 */
export function keeperState(state: PotState, now: bigint | null): KeeperState {
  if (now === null) return { kind: "counting-down", endsAt: state.end };

  const work = pendingWork(state, now);
  const step = drawStepFor(work);

  if (step === null) {
    if (state.phase === "Open") return { kind: "counting-down", endsAt: state.end };
    return { kind: "idle", detail: "Nothing is waiting on chain for this round right now." };
  }

  if (step.action === "request-random" && state.paused) {
    return {
      kind: "blocked-paused",
      label: STEP_LABEL["request-random"],
      detail: "New rounds are paused, so the seed waits. Withdrawing and claiming are unaffected.",
    };
  }

  const progress =
    work.kind === "snapshot" || work.kind === "select" ? { done: work.done, total: work.total } : null;

  return { kind: "ready", step, label: STEP_LABEL[step.action], detail: STEP_DETAIL[step.action], progress };
}

/* ------------------------------------------------------------------ *
 * Kết quả niêm phong
 * ------------------------------------------------------------------ */

/**
 * Cái người dùng thấy ở ô kết quả TRƯỚC khi reveal.
 *
 * Không nhánh nào ở đây phụ thuộc vào việc ví này có thắng hay không, và không
 * thể phụ thuộc: hàm chỉ nhận `registered` + `handle` + `phase`, ba thứ mà
 * người thắng và người thua có giá trị giống hệt nhau sau khi quét xong.
 */
export type SealedResult =
  /** Không có vị thế trong pot. */
  | { kind: "no-position" }
  /** Có vị thế, vòng chưa quét xong. */
  | { kind: "pending" }
  /** Vào sau khi snapshot đã đóng băng — không nằm trong vòng này. */
  | { kind: "not-in-round" }
  /** Đã niêm phong. Giống hệt nhau cho người thắng và người thua. */
  | { kind: "sealed"; handle: EncryptedHandle };

export function sealedResult(args: {
  phase: EpochView["phase"];
  registered: boolean;
  pendingPrize: EncryptedHandle;
}): SealedResult {
  if (!args.registered) return { kind: "no-position" };
  if (args.phase !== "Settled") return { kind: "pending" };
  if (args.pendingPrize === HIDDEN_HANDLE) return { kind: "not-in-round" };
  return { kind: "sealed", handle: args.pendingPrize };
}

/* ------------------------------------------------------------------ *
 * Cổng claim
 * ------------------------------------------------------------------ */

/**
 * Claim mở khi và chỉ khi: vòng đã settle, VÀ chính người dùng đã tự mở khoá
 * con số của mình và nó dương.
 *
 * Vế thứ hai không phải là kiểm tra bảo mật — contract mới là chỗ quyết định, và
 * `claim()` cố ý không có phase gate để không ai bị kẹt tiền. Nó là để không ai
 * ký một tx mà họ chưa biết nó làm gì. `NothingToClaim` sau khi trả phí gas là
 * một câu trả lời tồi cho câu hỏi "tôi có thắng không".
 *
 * Chú ý: `pendingPrize` cộng dồn qua các vòng (contract không reset nó ở
 * `startNewEpoch`), nên copy ở tầng trên phải nói "unclaimed winnings" chứ không
 * phải "you won this round".
 */
export type ClaimGate =
  | { kind: "locked-draw"; reason: string }
  | { kind: "locked-hidden"; reason: string }
  | { kind: "nothing"; reason: string }
  | { kind: "open" };

export function claimGate(result: SealedResult, view: ConfidentialView): ClaimGate {
  switch (result.kind) {
    case "no-position":
      return { kind: "locked-draw", reason: "You have no position in this pool." };
    case "pending":
      return { kind: "locked-draw", reason: "This round has not finished settling yet." };
    case "not-in-round":
      return { kind: "nothing", reason: "You joined after this round's weights were frozen." };
    case "sealed":
      break;
  }

  switch (view.kind) {
    case "unavailable":
      // Handle tồn tại (đã qua `sealed`) nhưng tầng reveal nói không có gì —
      // hai nguồn không khớp. Nói ra là không đọc được, KHÔNG nói là 0 (#8).
      return { kind: "locked-hidden", reason: "This result could not be read. Try unlocking it again." };
    case "hidden":
      return { kind: "locked-hidden", reason: "Unlock your result first, so you know what you are signing." };
    case "revealed":
      return view.value > 0n
        ? { kind: "open" }
        : { kind: "nothing", reason: "There is nothing to claim right now." };
  }
}
