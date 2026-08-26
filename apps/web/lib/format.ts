import { formatUnits, getAddress } from "ethers";

import { UNDERLYING_DECIMALS } from "./chain/tokens";

/**
 * Ba trạng thái của một giá trị mã hoá — non-negotiable #8 và kickoff §5 #7.
 *
 *  - `unavailable` : handle chưa từng khởi tạo onchain (`HIDDEN_HANDLE`).
 *                    Nghĩa là "chưa có gì ở đây", KHÔNG phải enc(0).
 *  - `hidden`      : có handle thật, chỉ là chưa decrypt trong tab này.
 *  - `revealed`    : đã decrypt, đang sống trong bộ nhớ tab, có TTL.
 *
 * Ba cái này phải hiện ra khác nhau. Gộp bất kỳ hai cái nào lại là nói dối
 * người dùng về tiền của họ.
 */
export type ConfidentialView =
  | { kind: "unavailable" }
  | { kind: "hidden" }
  | { kind: "revealed"; value: bigint };

export interface ConfidentialDisplay {
  /** Cái mắt nhìn thấy. */
  text: string;
  /** Cái screen reader đọc — không bao giờ để nó đọc ra dãy chấm. */
  announce: string;
  /** Có phải một con số thật không (bật `.tabular`, đổi màu). */
  isPlain: boolean;
}

export const MASK_GLYPH = "••••••";

/**
 * Điểm nghẽn duy nhất giữa "giá trị mã hoá" và "chuỗi trên màn hình".
 *
 * Hàm này total trên union và CỐ Ý không có tham số `fallback`: không tồn tại
 * đường nào để `undefined`/`null` đi vào đây rồi đi ra thành `"0"`. Muốn hiện
 * một số thì phải cầm được `bigint` đã decrypt.
 */
export function formatConfidential(view: ConfidentialView, label: string): ConfidentialDisplay {
  switch (view.kind) {
    case "unavailable":
      return {
        text: "Not available yet",
        announce: `${label} not available yet`,
        isPlain: false,
      };
    case "hidden":
      return { text: MASK_GLYPH, announce: `${label} hidden`, isPlain: false };
    case "revealed": {
      const text = formatAmount(view.value);
      return { text, announce: `${label} ${text}`, isPlain: true };
    }
  }
}

/** uint64 base-unit → chuỗi người đọc được. 6 decimals, live-probed. */
export function formatAmount(value: bigint, decimals: number = UNDERLYING_DECIMALS): string {
  const raw = formatUnits(value, decimals);
  const [whole = "0", frac = ""] = raw.split(".");
  const grouped = BigInt(whole).toLocaleString("en-US");
  const trimmed = frac.replace(/0+$/, "").slice(0, 2);
  return trimmed ? `${grouped}.${trimmed}` : grouped;
}

/** Chuỗi người nhập → base unit. Ném lỗi thay vì trả 0 khi không parse được. */
export function parseAmount(input: string, decimals: number = UNDERLYING_DECIMALS): bigint {
  const cleaned = input.trim().replace(/,/g, "");
  if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === "" || cleaned === ".") {
    throw new RangeError("Enter a number");
  }
  const [whole = "0", frac = ""] = cleaned.split(".");
  if (frac.length > decimals) throw new RangeError(`At most ${decimals} decimal places`);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt((frac + "0".repeat(decimals)).slice(0, decimals));
}

/**
 * TWAB trung bình — tính CLIENT-SIDE sau khi decrypt.
 *
 * Onchain không bao giờ chia (FHE.div với divisor mã hoá không tồn tại), draw
 * dùng thẳng `twabArea` vì nó scale-invariant. Phép chia duy nhất trong hệ
 * thống nằm ở đây, trên plaintext, trong bộ nhớ tab của chính chủ.
 */
export function twabAverage(area: bigint, elapsedSeconds: bigint): bigint | null {
  if (elapsedSeconds <= 0n) return null;
  return area / elapsedSeconds;
}

export function shortAddress(address: string): string {
  const a = getAddress(address);
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function shortHash(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

/** Đếm ngược thành "2d 04h 11m" / "04:11:09". Luôn kèm giờ tuyệt đối ở UI. */
export function formatCountdown(secondsLeft: number): string {
  if (secondsLeft <= 0) return "0m";
  const d = Math.floor(secondsLeft / 86_400);
  const h = Math.floor((secondsLeft % 86_400) / 3_600);
  const m = Math.floor((secondsLeft % 3_600) / 60);
  const s = secondsLeft % 60;
  if (d > 0) return `${d}d ${pad(h)}h ${pad(m)}m`;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** "just now" / "4m ago" / "2d ago". Chỉ dùng cho timestamp công khai (tx). */
export function formatRelativeTime(msSince: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - msSince) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Giờ tuyệt đối kèm timezone — đếm ngược một mình thì không kiểm chứng được. */
export function formatAbsolute(unixSeconds: bigint | number): string {
  const date = new Date(Number(unixSeconds) * 1000);
  // KHÔNG dùng `dateStyle`/`timeStyle`: Intl cấm ghép chúng với bất kỳ option
  // thành phần nào, và `timeZoneName` là một option thành phần. Ghép vào không
  // ra cảnh báo mà ra `TypeError` lúc chạy — đúng lúc card đầu tiên có dữ liệu
  // thật, tức là ở đúng chỗ khó nhìn thấy nhất trong lúc dựng.
  //
  // Múi giờ thì không bỏ được: đếm ngược chỉ đáng tin khi đối chiếu được với
  // một mốc tuyệt đối, mà mốc tuyệt đối không có múi giờ thì không đối chiếu
  // được với cái gì cả.
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
