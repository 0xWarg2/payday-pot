# KNOWN LIMITATIONS — PayDay Pot

Giới hạn **đã biết, có chủ đích hoặc ngoài tầm kiểm soát** của contract/app.
Đây KHÔNG phải bug list — mỗi mục có lý do và (nếu có) hướng xử lý tương lai.
Cập nhật: Day 6 (26/08/2026) — §1 và §9 đổi từ giả thuyết sang **đã probe live**;
thêm §10 (wrapper upgradeable) và §11 (unwrap làm amount public).

## 1. Token-layer: deny-list + maxTotalSupply nằm ngoài pot (R3)

Wrapper cUSDC live trên Sepolia **có thật** `isBlocked`/`blockUser`/`unblockUser`
(deny-list) và `maxTotalSupply` — probe bytecode 26/08, không còn là "có thể có".
`maxTotalSupply()` hiện = 2^64−1 (trần kiểu, không phải trần chính sách), owner
deny-list là `0x08e8a84c3c8c7cba165B1adcf67Ae4639eF84f52`. Pot **không kiểm soát
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
random sẽ được nâng cấp. Draw của pot (ship Day 4, `requestRandom`) dùng đúng
API này:

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

## 6. Deposit-dead-window sau `epochEnd` (Day 5 thu hẹp, không xoá)

Deposit callback gate `phase != Open || block.timestamp >= epoch.end →
WrongPhase` — cửa deposit đóng **đúng tại `epochEnd`**, kể cả khi phase còn
`Open` vì chưa ai gọi `beginSnapshot`. Có chủ đích: đóng khe hở giữa lúc epoch
hết hạn và lúc snapshot bắt đầu, để participant list/order/count bất biến từ
`end` (freeze behavioral — DRAW_PROTOCOL §1) và không deposit nào lọt vào sau
giờ chốt weight.

**Hệ quả sau Day 5**: từ `epochEnd` cho tới khi ai đó gọi `startNewEpoch()`,
mọi deposit bị từ chối — pool "đóng cửa nhận tiền" trong suốt
snapshot/draw/settle. Withdraw không bị ảnh hưởng (chạy ở mọi phase — R10).
Window giờ đúng bằng thời gian resolve epoch và **permissionless để đóng lại**:
`startNewEpoch()` ai gọi cũng được, pool rỗng còn ngắn hơn nữa (`beginSnapshot`
settle thẳng, bỏ hẳn draw). Nhưng nó **không biến mất**: không ai ép được
keeper — hay bất kỳ ai — phải gọi, nên độ dài window là *social*, không phải
*protocol*. UI Day 7 phải hiển thị "entries closed — next round opens soon"
thay vì lỗi trần (`epochInfo` public, phân biệt được với các WrongPhase khác),
và nên gắn nút "start next round" cho chính user tự đóng window khi phase đã
`Settled`.

Thêm một khe nhỏ có chủ đích: epoch mới lấy `start = block.timestamp` chứ
không backfill `prev.end`. Khoảng `[prev.end, newStart]` vì thế **không tính
TWAB cho ai cả** — tiền vẫn nằm trong pot, principal vẫn nguyên, chỉ là thời
gian đó không sinh weight. Đổi lấy điều này để tránh thứ tệ hơn: backfill
khiến keeper trễ 8 ngày mở ra một epoch 7 ngày *đã hết hạn ngay khi sinh*.

## 7. Pause vô hạn trước khi random được request = epoch treo (D2, có chủ đích)

`requestRandom` là chỗ **duy nhất** ngoài deposit gắn `whenNotPaused`
(DRAW_PROTOCOL §1, §6.1). Nếu owner pause **và không bao giờ unpause** đúng
lúc epoch đang ở `Drawing && !drawn`, epoch đó treo vĩnh viễn ở trạng thái
chờ random — không winner, không settle. Đây là **owner-liveness dependency
duy nhất** của protocol và là trade-off có chủ đích: pause phải chặn được
"new draw" (nuốt randomness mới là hành vi cần phanh khẩn cấp), nhưng một khi
random đã chốt (`drawn == true`) thì scan (`selectBatch`) và mọi withdraw
**không thể bị chặn** bởi bất kỳ ai. Tiền của user an toàn 100% trong mọi
kịch bản treo: `withdrawAll` không có gate (non-negotiable #1, test pin
withdraw khi paused giữa scan).

**D3 đã đóng (Day 5)**: prize của epoch treo có đường về. `defundPrize` cố
tình **không** gắn `whenNotPaused`, và cửa thoát của nó được viết đúng bằng
trạng thái kẹt đó — `phase == Drawing && !drawn && paused()` — nên employer
rút được 100% prize ra, có test pin nguyên kịch bản (pause → defund →
unpause). Tiền user rút bằng `withdrawAll`, tiền employer rút bằng
`defundPrize`: epoch treo không giam tiền của ai.

Cửa đó **hẹp đúng bằng chỗ kẹt**, và đây là điểm red-team sửa trong Day 5:
gate đầu tiên (`!drawn && phase != Settled`) mở luôn cả `Snapshotting` và
`Drawing` lúc **không** paused — tức toàn bộ khoảng sau khi deposit đã đóng và
weight đã freeze. Ở đó saver không rút mình ra khỏi kết quả được nữa, nên rút
prize đi là **rug chứ không phải exit**. Ngoài trạng thái paused-before-random,
không có phase nào kẹt được: `beginSnapshot`, `snapshotBatch`, `selectBatch`,
`startNewEpoch` đều permissionless *và* không pausable. Chi tiết ở
DRAW_PROTOCOL §6 mục 6.

**Thu hẹp thêm (Day 5)**: `renounceOwnership()` được override thêm
`whenNotPaused`. Trước đó owner có thể pause rồi renounce trong 2 tx và biến
pause thành vĩnh viễn — không ai unpause được nữa, epoch treo mãi ở
`Drawing && !drawn`, và `_prizeCarry` khoá theo. Giờ phải unpause trước rồi mới
renounce: cùng một kết cục "pot không còn owner", trừ cái bẫy. Không xoá được
limitation gốc (owner vẫn pause-và-biến-mất được, chỉ là không renounce chính
thức), nhưng bỏ đi đường một-tx tới trạng thái chết.

## 8. Carry roll vô hạn nếu pool chết hẳn (đánh đổi lấy zero-leak)

Epoch không có winner (tổng weight = 0) thì prize không mất mà **roll sang
epoch sau** qua `_prizeCarry`, encrypted. Không có hàm nào cho employer rút
carry về.

**Tại sao không thêm `reclaimCarry()`**: carry đang giữ đúng một bit cực nhạy
— "epoch trước có winner hay không". Bit đó suy ngược ra "có participant nào
weight dương không", và trong pool nhỏ thì gần như là suy ra được ai còn tiền.
Mọi hàm cho phép employer rút carry theo *điều kiện* đều phải so sánh carry với
cái gì đó, và kết quả revert-hay-không của tx đó chính là bit ấy, công khai
trên chain. Chọn giam tiền hơn là leak (non-negotiable #6).

**Hệ quả**: nếu pool chết vĩnh viễn (mọi người rút sạch, không ai vào lại),
carry roll mãi — không mất, không ai rút được, không ai trao được. Ý tưởng P2
ngoài scope Season 4: `reclaimCarry()` chỉ mở khi `participantCount == 0`
(pool **chưa từng** có ai — registration vĩnh viễn nên điều kiện này không suy
ra được gì về ai cả). Không mở cho pool non-empty.

## 9. Employer fund là 2 tx, và `wrap` khoá pot vào wrapper token

`fundPrize` pull **underlying USDC công khai** rồi tự `wrap` (lý do đầy đủ ở
DRAW_PROTOCOL §6.6: clamp ERC-7984 là all-or-nothing nên nhận confidential
transfer sẽ phá solvency âm thầm). Hai hệ quả:

- Employer phải làm **2 tx**: `USDC.approve(pot, amount)` rồi `fundPrize`.
  Không gộp được — panel Day 7 phải hiện "step 1/2", và ERROR_RECOVERY_MATRIX
  R13 áp dụng cho khe giữa hai tx.
- Constructor đọc `underlying()` + `rate()` của token và giữ làm immutable, tức
  pot **chỉ deploy được lên một ERC-7984 wrapper**, không phải ERC-7984 thuần
  (deploy lên token thuần sẽ revert ngay). Có chủ đích, nhưng phải kiểm hai
  selector đó trên `ConfidentialWrapperV3` live trước khi deploy Sepolia.

**Trạng thái probe (26/08).** Đã xác nhận live: `underlying()` =
`0x9b5Cd13b…dFfF`, `rate()` = 1, `decimals()` = 6, `maxTotalSupply()` = 2^64−1,
`isBlocked(addr)` = false, và selector `wrap` tồn tại. Nghĩa là **constructor
của pot đọc được đủ hai immutable nó cần** — rủi ro deploy Day 9 đã đóng.

**Còn lại một giả định chưa chứng minh**: `wrap` **do một contract gọi** (pot,
không phải EOA) chưa từng chạy trên Sepolia. Không probe bằng `eth_call` được
vì cần state thật; nó sẽ tự chứng minh ở **`fundPrize` đầu tiên trên Sepolia
(Day 7)**. Nếu wrapper chặn contract caller thì `fundPrize` revert ở tầng token
— prize không vào được pot, nhưng deposit/withdraw/claim của user **không ảnh
hưởng**, và fallback (employer wrap trước rồi pot pull) đã có sẵn trong
DAY_05 plan.

## 10. Pot phụ thuộc vào một contract mà bên thứ ba upgrade được

Đây là mục quan trọng nhất được thêm ở Day 6, vì nó phủ bóng lên **mọi** dòng
"đã probe" trong repo này.

cUSDC `0x7c5BF43B…3639` là **proxy UUPS**, owner
`0x08e8a84c3c8c7cba165B1adcf67Ae4639eF84f52` (Zama), và nó **đã bị upgrade giữa
Day 1 và Day 6**: implementation đổi từ `0x390aa02f…d0ee` sang
`0xAe37b998d453E1FaBE85DD46cf04295ca4A3af04`. Không có thông báo, mình phát
hiện bằng cách đọc lại ERC-1967 slot.

Hệ quả cụ thể, không phải lo xa:

- `PayDayPot` **non-upgradeable** và đọc `underlying()`/`rate()` **một lần trong
  constructor** rồi giữ làm immutable. Nếu wrapper đổi `rate` sau khi pot deploy,
  pot vẫn dùng số cũ → `fundPrize` tính sai lượng underlying phải pull. Đây là
  rủi ro **runtime**, không chỉ rủi ro lúc deploy.
- Deny-list nằm trong tay owner đó: `blockUser` một địa chỉ là chặn được
  deposit/withdraw của địa chỉ đó ở tầng token, pot không làm gì được.
- Mọi kết luận kiểu "wrapper hành xử thế này" trong COMPATIBILITY_NOTES đều có
  **hạn sử dụng**. Cụ thể: bản live hôm nay **không** phải OZ
  `ERC7984ERC20Wrapper` chuẩn — nó thiếu overload `unwrap(address,address,uint64)`
  và có thêm `unblockUser` (quirk #22).

**Xử lý:** không thể fix trong scope này (upgrade quyền của Zama, và mock token
là thứ duy nhất có trên testnet). Ràng buộc cứng: **Day 9 phải re-probe ngay
trước RC deploy** — impl address, `rate`, `underlying`, `isBlocked` — và ghi
lại impl address vào `deployments/sepolia.json` để về sau còn biết pot được
deploy chống lại bản nào. Trên mainnet, đối tác cUSDC phải là một token
non-upgradeable hoặc có timelock.

## 11. Rút khỏi vùng mã hoá thì số tiền là công khai

`unwrap` của wrapper gọi `FHE.makePubliclyDecryptable` trên số sắp rút, và
`unwrapRequestId` chính là handle của số đó — nên **ai cũng decrypt được số
user rút**. Không phải suy đoán từ timing như wrap, mà là một con số đọc thẳng.

Pot không vi phạm non-negotiable #6 (grep `makePubliclyDecryptable` trong
`PayDayPot.sol` = 0, và luật đó nói về state của pot), nhưng người dùng không
quan tâm ranh giới contract. Ghi ở đây để không ai đọc README rồi tưởng "tiền
ra khỏi pot vẫn kín".

Đổi lại, chính tính public đó là thứ làm **R1 recovery** khả thi:
`unwrapAmount(id)` đọc được nên bất kỳ ví nào cũng finalize hộ được một unwrap
treo, không cần chữ ký của chủ. Một trade-off, không phải thuần mất mát.

Chi tiết và mitigation: `PRIVACY.md` §2 mục 3.
