/**
 * TWAB → số người đọc được. Toàn bộ phép tính ở đây là PLAINTEXT và
 * CLIENT-SIDE, chạy sau khi chủ sở hữu đã tự decrypt giá trị của mình.
 *
 * Vì sao nó không thể nằm onchain: `FHE.div` với divisor mã hoá không tồn tại,
 * và draw cũng không cần chia — `twabArea` là scale-invariant nên nó CHÍNH LÀ
 * trọng số. Phép chia duy nhất trong cả hệ thống nằm ở file này.
 *
 * Contract (`PayDayPot._checkpoint`) cộng dồn `principal × dt` mỗi lần principal
 * đổi, nên `twabArea` đã lưu chỉ tính tới `lastCheckpoint` — KHÔNG phải tới bây
 * giờ. Một người gửi tiền tuần trước rồi không đụng gì nữa sẽ có area đứng yên
 * suốt tuần, và hiện đúng con số đó ra màn hình sẽ đọc như "trọng số của tôi
 * ngừng tăng". Nên ta kéo dài nó tới hiện tại đúng bằng công thức contract sẽ
 * dùng ở lần checkpoint kế tiếp — cần principal, và ta có principal, vì cả hai
 * được mở trong cùng một chữ ký.
 */

import type { ConfidentialView } from "../format";

/**
 * Trạng thái hiển thị của `twabArea` — suy ra từ CẶP (handle, lastCheckpoint),
 * không bao giờ từ riêng handle.
 *
 * Lý do là một chi tiết của contract, không phải chuyện trang trí. `_checkpoint`
 * bỏ qua phép nhân khi `lastCheckpoint == 0` (~544k HCU tiết kiệm được), nên lần
 * gửi ĐẦU TIÊN chỉ đóng dấu mốc thời gian và để `twabArea` **chưa init**. Với
 * người gửi một lần rồi để yên — đường đi phổ biến nhất, không phải case hiếm —
 * handle đó là zero-handle trong suốt cả epoch đầu.
 *
 * Đọc riêng handle thì trạng thái đó không phân biệt được với "chưa từng tham
 * gia", và thẻ TWAB sẽ nói "Not available yet" cho một người đang có trọng số
 * tăng từng giây. `lastCheckpoint > 0` chính là bằng chứng công khai (plaintext
 * view) tách hai trường hợp đó ra.
 *
 * Chỗ tinh tế — và là chỗ #8 sống hay chết: khi area chưa init mà principal
 * CHƯA mở, kết quả phải là `hidden`, **không** phải `revealed: 0n`. Area lúc đó
 * đúng là 0 tại mốc checkpoint, nhưng giá trị người dùng thật sự muốn thấy là
 * area đã nội suy tới hiện tại, và nó cần principal. Trả 0n ở đó sẽ hiện "0
 * USDC" cho một người có tiền thật trong pot — đúng cái #8 cấm.
 */
export function twabAreaView(area: ConfidentialView, principal: ConfidentialView, lastCheckpoint: bigint): ConfidentialView {
  if (area.kind === "revealed") return area;
  // Chưa từng đóng dấu ⇒ chưa từng đăng ký. Không có gì để mở, và đó là sự thật.
  if (lastCheckpoint <= 0n) return area;
  if (area.kind === "unavailable") {
    // Contract tự định nghĩa nhánh này bằng 0 (`FHE.isInitialized` false ⇒
    // `FHE.asEuint64(0)`), nên đây không phải phỏng đoán về dữ liệu bị giấu.
    return principal.kind === "revealed" ? { kind: "revealed", value: 0n } : { kind: "hidden" };
  }
  return area;
}

export interface TwabInputs {
  /** `twabArea` đã decrypt — đơn vị là base-unit × giây. */
  area: bigint;
  /** `principal` đã decrypt. `null` khi chưa mở — khi đó không nội suy được. */
  principal: bigint | null;
  /** Mốc cộng dồn cuối cùng của contract. */
  lastCheckpoint: bigint;
  epochStart: bigint;
  epochEnd: bigint;
  /** Giây Unix hiện tại. */
  nowSeconds: bigint;
}

/** Thời điểm cộng dồn dừng lại: bây giờ, nhưng không quá hạn epoch. */
function accrualNow(i: TwabInputs): bigint {
  return i.nowSeconds < i.epochEnd ? i.nowSeconds : i.epochEnd;
}

/**
 * Area tính tới hiện tại — bằng đúng giá trị `_checkpoint` sẽ ghi nếu được gọi
 * ngay bây giờ. Không có principal thì trả về area đã lưu, không đoán.
 */
export function liveArea(i: TwabInputs): bigint {
  if (i.principal === null) return i.area;
  const to = accrualNow(i);
  // `lastCheckpoint` của epoch trước không bao giờ nhỏ hơn `epochStart` sau khi
  // `startNewEpoch` reset, nhưng kẹp lại vẫn rẻ hơn một số âm chạy vào phép nhân.
  const from = i.lastCheckpoint > i.epochStart ? i.lastCheckpoint : i.epochStart;
  if (to <= from) return i.area;
  return i.area + i.principal * (to - from);
}

/**
 * Cửa sổ dùng để chia: TOÀN BỘ phần epoch đã trôi qua, không phải khoảng thời
 * gian người dùng có mặt.
 *
 * Đây là lựa chọn có chủ đích. Người vào giữa chừng thật sự *có* trọng số thấp
 * hơn người ở từ đầu — đó là cơ chế của giải, không phải thiệt thòi cần che đi.
 * Chia cho khoảng thời gian họ có mặt sẽ cho ra "số dư trung bình của tôi" đẹp
 * hơn nhưng không còn so sánh được với bất kỳ ai khác, và làm cho "gửi sớm ăn
 * nhiều hơn" trở nên vô hình.
 */
export function twabWindowSeconds(i: TwabInputs): bigint {
  const elapsed = accrualNow(i) - i.epochStart;
  return elapsed > 0n ? elapsed : 0n;
}

/**
 * Số dư trung bình trong vòng này tính tới lúc này, theo base-unit.
 * `null` khi epoch vừa mở và chưa có giây nào trôi qua — chia cho 0 giây không
 * ra "0 USDC", nó không ra gì cả.
 */
export function averageBalance(i: TwabInputs): bigint | null {
  const window = twabWindowSeconds(i);
  if (window === 0n) return null;
  return liveArea(i) / window;
}
