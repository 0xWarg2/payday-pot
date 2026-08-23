# KNOWN LIMITATIONS — PayDay Pot

Giới hạn **đã biết, có chủ đích hoặc ngoài tầm kiểm soát** của contract/app.
Đây KHÔNG phải bug list — mỗi mục có lý do và (nếu có) hướng xử lý tương lai.
Cập nhật: Day 3 (23/08/2026).

## 1. Token-layer: deny-list + maxTotalSupply nằm ngoài pot (R3)

Wrapper cUSDC live trên Sepolia (ConfidentialWrapperV3) có thể có
`isBlocked`/`blockUser` (deny-list) và `maxTotalSupply`. Pot **không kiểm soát
và không thấy trước** các gate này:

- User bị token block → deposit/withdraw fail **ở tầng token**, không phải lỗi pot.
- `maxTotalSupply` chạm trần → wrap fail trước khi tiền tới pot.

**Hệ quả thiết kế**: pot không bao giờ assume transfer thành công — deposit
credit theo **actual encrypted amount** trong callback; withdraw dựa vào
invariant `potBalance ≥ totalPrincipal ≥ principal ≥ actual` (property test
là bằng chứng). UI Day 7 phải map lỗi token-layer sang thông báo riêng
(xem ERROR_RECOVERY_MATRIX R3), không đổ lỗi cho pot.

## 2. Registration trên deposit bị refund vẫn chiếm slot

Registration là **plaintext-gated** (P-4 revised, user đã duyệt 20/08):
caller đúng token + pool chưa full + chưa pause ⇒ đăng ký, **trước khi** biết
encrypted amount có được credit hay không. Ví deposit bị refund toàn bộ
(vượt cap) hoặc bị token clamp về 0 (ví không đủ tiền) **vẫn chiếm 1 slot**
trong `participantCap` (32).

**Tại sao không sửa được sạch**: gate "chỉ đăng ký khi actualCredited > 0"
đòi hỏi branch trên `ebool` — mọi cách decrypt/reveal đều leak ≥1 bit về
amount. Chọn chiếm-slot thay vì leak.

**Tấn công/griefing**: kẻ xấu có thể đốt slot bằng 32 ví deposit-0. Chấp nhận
được ở scope demo (permissionless pool nhỏ, không mất tiền ai). Ý tưởng P2
(không làm trong scope Season 4): *slot recycling* — cho phép bất kỳ ai evict
participant có `principal == 0` sau N epoch, check bằng
`FHE.eq(principal, 0)` decrypt qua public decryption oracle ở cuối epoch
(lúc đó bit "có tiền hay không" đã không còn nhạy cảm với participant rời pool).

## 3. Cap refund là all-or-nothing, không partial fill

Deposit làm principal vượt `PER_USER_CAP` → **toàn bộ** amount bị refund
(token tự hoàn khi callback trả `ebool false`), không credit phần còn trong
headroom. Ví dụ: principal 5,000, cap 10,000, deposit 6,000 → refund cả 6,000
chứ không credit 5,000.

**Tại sao**: partial fill = `credited = min(amount, headroom)` thì pot giữ
`credited` và phải **refund phần thừa bằng một transfer ngược** — thêm 1
encrypted transfer mỗi deposit (HCU + phức tạp), và UX "tôi gửi 6k mà chỉ vào
5k" tệ hơn "gửi lại đúng số". UI Day 7 hiển thị headroom (user tự decrypt
principal của mình) để user không bao giờ phải đoán (R2).

## 4. RNG hiện tại là PRNG mockup theo roadmap Zama

`FHE.randEuint64()` trên FHEVM hiện tại (kể cả Sepolia thật) là **PRNG phía
coprocessor**, chưa phải threshold-VRF production-grade — Zama roadmap ghi rõ
random sẽ được nâng cấp. Draw của pot (Day 5) dùng đúng API này:

- Đảm bảo hiện có: keeper/employer/admin **không thể biết trước hay chọn**
  random (không ai đưa seed — non-negotiable #7); random chỉ sinh trong
  state-changing tx; đúng 1 lần/epoch, không reroll.
- KHÔNG đảm bảo: unpredictability ở mức cryptographic chống lại chính
  coprocessor operator. Với prize = sponsored yield testnet, rủi ro chấp nhận
  được và **phải nói thẳng trong README/video** (framing rule), không để judge
  tự phát hiện.

## 5. Metadata công khai: address + timing (không phải bug, nhắc lại framing)

Sản phẩm bảo mật **amount/balance/TWAB/winnings**. Địa chỉ ví, thời điểm tx,
số lần deposit/withdraw, và **wrap amount** (bước ERC20→ERC7984 là plaintext
cuối cùng) vẫn public trên chain. Không được mô tả sản phẩm là "anonymous".

## 6. Deposit-dead-window sau `epochEnd` (Day 3 → hết khi Day 5 ship)

Deposit callback gate `phase != Open || block.timestamp >= epoch.end →
WrongPhase` — cửa deposit đóng **đúng tại `epochEnd`**, kể cả khi phase còn
`Open` vì chưa ai gọi `beginSnapshot`. Có chủ đích: đóng khe hở giữa lúc epoch
hết hạn và lúc snapshot bắt đầu, để participant list/order/count bất biến từ
`end` (freeze behavioral — DRAW_PROTOCOL §1) và không deposit nào lọt vào sau
giờ chốt weight.

**Hệ quả tạm thời**: từ `epochEnd` cho tới khi `startNewEpoch` (Day 5) mở
epoch kế tiếp, mọi deposit bị từ chối — pool "đóng cửa nhận tiền" trong suốt
snapshot/draw/settle. Withdraw không bị ảnh hưởng (chạy ở mọi phase — R10).
Day 5 thu hẹp window này về đúng thời gian resolve epoch; UI Day 7 phải hiển
thị "entries closed — next round opens soon" thay vì lỗi trần (`epochInfo`
public, phân biệt được với các WrongPhase khác).
