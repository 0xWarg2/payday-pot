# THREAT_MODEL — PayDay Pot

Ai có thể hại gì, mất bao nhiêu, và cái gì còn rò sau khi đã mitigate. Viết từ
code đã ship (Day 5 — 25/08/2026), không phải từ spec.

Bảng phân loại state (cái gì encrypted, ai decrypt được) nằm ở `PRIVACY.md`.
File này trả lời câu khác: **kẻ tấn công làm gì với những thứ đó.**

> Nguyên tắc khi đọc: PayDay Pot đặt cược vào một thứ duy nhất — **không có
> nhánh nào rẽ theo dữ liệu mã hoá**. Mọi lập luận dưới đây quy về đó. Chỗ nào
> lập luận không quy về được thì đó là residual risk, và nó phải nằm trong bảng
> §11 chứ không được im lặng.

## 0. Danh sách đối thủ

| Ai | Có gì trong tay | Không có gì |
|---|---|---|
| **Observer** (ai cũng được) | toàn bộ chain: address, timing, gas, event, mọi view public | không ACL nào |
| **Participant khác** | như observer + ACL trên dữ liệu *của chính họ* | ACL của người khác |
| **Employer** | `fundPrize`/`defundPrize` | **không ACL nào** trên principal/twabArea/pendingPrize của user |
| **Keeper** | gọi được mọi hàm lifecycle — nhưng chúng đều permissionless, ai cũng gọi được | không ACL, không input nào vào draw |
| **Owner** | `pause`/`unpause` | không sweep, không upgrade, không ACL |
| **Coprocessor operator** (Zama infra) | tầng dưới của FHE — về mặt hạ tầng thấy được nhiều nhất | (xem T7) |

Chú ý dòng **Keeper**: trong protocol này keeper *không phải một vai được cấp
quyền*. `beginSnapshot`, `snapshotBatch`, `requestRandom`, `selectBatch`,
`startNewEpoch` đều permissionless. "Keeper" chỉ là tên gọi cái bot tiện tay
gọi trước — không có `onlyKeeper` ở đâu cả.

## T1. Winner lộ qua timing của claim — residual lớn nhất, không đóng được hết

**Threat.** Chỉ người thắng mới có động cơ gọi `claim()`. Observer nhìn thấy
`PrizeClaimed(user, epochId)` và suy ra người đó thắng.

**Mitigation đã ship — uniform claim.** `claim()` **không phân biệt winner và
non-winner ở bất kỳ trục quan sát được nào**:

- Cùng một code path duy nhất. Non-winner claim **thành công**, chuyển enc(0).
  Không revert — vì nếu revert thì revert-hay-không chính là oracle công khai.
- Cùng event: `PrizeClaimed` + `ConfidentialTransfer` của token, không amount.
- Cùng số đo **tuyệt đối**: **748,032 HCU / 369,000 depth / 396,250 gas** cho
  cả hai, đo độc lập ở `PayDayPot.prize.ts` và `PayDayPot.hcu.ts`. Bằng nhau
  chính xác, không phải "xấp xỉ trong sai số warm/cold storage".

Nghĩa là: **một cú claim không chứng minh được gì.** Observer thấy Warg claim
thì Warg có thể vừa nhận 800 hoặc vừa nhận 0.

**Residual — nói thẳng.** Uniform claim đóng được *tx*, không đóng được *hành
vi*. Ai **không bao giờ** claim thì gần như chắc chắn không thắng; nếu 3/4
participant claim và 1 người không, tập nghi vấn thu về 3. Đây là leak hành vi,
không phải leak mật mã, và contract không sửa được — nó phụ thuộc người dùng có
bấm nút hay không.

Plan gốc dự tính đóng bằng `claimFor` (ai cũng claim hộ được ⇒ claim không còn
là tín hiệu về động cơ). **`claimFor` đã bị scope-cut khỏi Season 4**, nên
mitigation đó không tồn tại trong bản này. Ba chỗ trong
`PAYDAY_POT_IMPLEMENTATION_PLAN.md` (:987, :1269, :1663) vẫn viện dẫn nó — coi
là **stale**, file này là nguồn đúng.

**Đường giảm thiểu còn lại (Day 7 UI, không phải contract):** để nút claim
**luôn enabled cho mọi participant** ở cuối mỗi epoch, kèm chữ "claim your
round result" chứ không phải "claim your prize", và nhắc mọi người bấm dù kết
quả là 0. Càng nhiều người claim đều đặn thì tín hiệu càng nhiễu. Không đảm
bảo được, nhưng rẻ và đúng hướng.

## T2. Unshield correlation

**Threat.** Winner nhận prize dạng cUSDC (encrypted), rồi `unwrap` ra USDC công
khai. Bước unwrap là plaintext — observer thấy đúng số tiền, đúng ví, đúng lúc.

**Mitigation.** Không có ở tầng contract, và không nên giả vờ là có. Pot không
kiểm soát hành vi sau khi tiền rời pot.

**Residual — chấp nhận.** Giảm thiểu là kỷ luật người dùng: unwrap trễ, unwrap
số lẻ, hoặc giữ nguyên dạng confidential. Onboarding Day 6 phải nói câu này
thay vì để user tự phát hiện. Cùng loại với leak `wrap` ở chiều vào
(`PRIVACY.md` §2.2).

## T3. Employer rút prize sau khi đã hứa (defund griefing)

**Threat.** Employer fund 1,000 cho epoch, `prizeAmountOf` public nên UI hiện
"prize tuần này: 1,000". Sát giờ draw, employer gọi `defundPrize(1000)` và rút
sạch. User đã gửi tiền vì con số đó.

**Mitigation — cửa defund đóng cùng lúc với cửa deposit.**

```solidity
bool openWindow     = ep.phase == Open && block.timestamp < ep.end;   // saver còn rút được
bool stalledByPause = ep.phase == Drawing && !ep.drawn && paused();   // đường thoát D3 (T4)
```

Nguyên tắc: **employer đổi được prize đúng chừng nào saver còn đổi được
deposit**. Trước `ep.end` ai thấy prize bị cắt thì rút tiền ra, weight giảm
theo — quan hệ hai chiều, không ai bị kẹt. Sau `ep.end` thì weight đã đóng
băng: rút tiền lúc đó **không gỡ lại được weight**, nên rút prize đi là **rug
chứ không phải exit**.

Bản Day 5 đầu tiên viết gate là `!ep.drawn && phase != Settled` — đúng về
solvency (nó chặn chính xác lúc carry commit) nhưng bỏ ngỏ `Snapshotting` và
`Drawing-before-random` lúc **không** paused. Red-team dựng lại được nguyên
kịch bản trên với 5,000 USDC: saver giữ tiền cả epoch → `beginSnapshot` +
`snapshotBatch` → `defundPrize(5000)` **thành công** → mọi `pendingPrize`
decrypt ra 0. Đã siết, có test regression đi qua cả ba trạng thái
(`Open` sau `ep.end` · `Snapshotting` · `Drawing` unpaused) và kết bằng việc
winner nhận đúng 5,000.

Vế `stalledByPause` không mở lại lỗ đó: nó đòi **owner phải pause** — tức là
pot đã ở trạng thái khẩn cấp — và `Drawing && !drawn && paused()` là trạng thái
duy nhất treo được thật (mọi bước lifecycle khác đều permissionless *và* không
pausable). `!ep.drawn` giữ B2; `Drawing` không bao giờ là `Settled` nên bẫy
empty-fast-path (F1) vẫn kín.

Hai lớp bảo vệ cũ vẫn nguyên:

- Defund **không đụng được một xu principal nào** — nó chỉ trừ `ep.prizeAmount`
  và chuyển đúng phần đó. User không mất gì ngoài kỳ vọng.
- Sau `requestRandom`, defund **revert** (B2). Prize của epoch đã bốc thăm là
  bất biến — mạnh hơn cả require: pool đã đông cứng vào handle `ep.prizeCipher`.

**Residual — nhỏ, kèm nghĩa vụ UI.** Employer vẫn cắt prize được trong lúc
epoch đang mở, và người gửi tiền từ đầu tuần chịu rủi ro đó. Đây là quyền hợp
lý của người bỏ tiền — miễn là saver còn rút ra được, mà trong cửa sổ đó thì
còn. UI Day 7 **không được** hiện prize như một cam kết: dùng chữ "current
prize · can change until entries close", và chuyển sang "locked" ngay tại
`ep.end` chứ không đợi `drawn == true`.

## T4. Owner pause vĩnh viễn

**Threat.** Owner gọi `pause()` rồi biến mất (hoặc renounce ownership khi đang
paused). Protocol treo.

**Nửa `renounce` đã đóng (Day 5, red-team).** `renounceOwnership()` được
override thêm `whenNotPaused`. Trước đó pause + renounce là **2 tx** biến pause
thành vĩnh viễn — không còn ai unpause được, `requestRandom` revert mãi mãi, và
`_prizeCarry` khoá theo. Giờ phải unpause trước rồi mới renounce: cùng kết cục
"pot không còn owner", trừ cái bẫy. Owner-biến-mất-mà-không-renounce thì không
chặn được bằng code — đó là phần residual dưới đây.

**Bề mặt thật của pause — chỉ 2 chỗ:** deposit callback và `requestRandom`.
Không hơn.

**Cái KHÔNG bị chặn khi paused** (test pin từng cái):
`withdraw` · `withdrawAll` · `claim` · `defundPrize` · `snapshotBatch` ·
`selectBatch` · `startNewEpoch`. Chiều ngược lại, `renounceOwnership` **bị**
chặn khi paused — thêm vào Day 5, xem trên.

**Hệ quả xấu nhất.** Pause đúng lúc epoch ở `Drawing && !drawn` ⇒ epoch treo
vĩnh viễn ở đó: không winner, không settle, không epoch mới. Đây là
**owner-liveness dependency duy nhất** của protocol.

**Nhưng không ai mất tiền:**
- User rút 100% principal bằng `withdrawAll` — không gate, mọi phase (rule #1).
- Employer rút 100% prize bằng `defundPrize` — cố tình **không** gắn
  `whenNotPaused`, và vế `stalledByPause` của gate được viết đúng bằng trạng
  thái treo này (T3). Có test pin nguyên kịch bản pause → defund → unpause.
- Owner **không có** hàm nào chạm principal. Không sweep, không upgrade, không
  ACL (rule #3, #4).

**Residual — chấp nhận, đã document** (`KNOWN_LIMITATIONS.md` §7). Đánh đổi:
pause phải phanh được "draw mới" (nuốt randomness là hành vi cần phanh khẩn
cấp); đổi lại là khả năng treo. Tiền thì không bao giờ treo.

## T5. Keeper griefing — bề mặt gần như bằng không

**Threat giả định.** Keeper chọn thời điểm draw có lợi, hoặc bỏ chạy làm epoch
kẹt.

**Vì sao gần như vô hại:**
- **Không cấp quyền.** Mọi hàm lifecycle permissionless — keeper bỏ chạy thì
  ví bất kỳ gọi tiếp từ đúng cursor (R4, có test: keeper dừng giữa chừng, ví lạ
  hoàn tất, winner **y hệt** dự đoán).
- **Không đưa được input.** `requestRandom()` có **zero tham số** — test soi
  `interface.getFunction("requestRandom").inputs.length == 0`. Keeper không đưa
  seed, không đưa weight, không đưa winner (rule #7).
- **Không nhìn được gì.** Keeper không có ACL nào. Chọn timing mà không thấy
  weight thì không chọn được gì có lợi.
- **Không reroll.** Gọi lần hai ⇒ `AlreadyDrawn`, handle random/ticket không
  đổi (equality pin).

**Residual.** Keeper trì hoãn `requestRandom` ⇒ epoch kéo dài. Bất kỳ ai cũng
gọi thay được, nên đây là bất tiện chứ không phải tấn công.

## T6. `prizeCarry` như một kênh phụ

**Threat.** `_prizeCarry` mang đúng một bit cực nhạy: *"epoch trước có winner
không"*. Bit đó suy ngược ra "có participant nào weight dương không" — trong
pool 32 người thì gần như là suy ra ai còn tiền.

**Mitigation.** Carry là `euint64` **contract-only tuyệt đối**: không ACL cho
ai, không `makePubliclyDecryptable` (grep = 0 trong toàn contract). Roll-forward
là `FHE.select(selectedAny, 0, prizeCipher)` — **không nhánh plaintext**, tx
chốt scan trông y hệt nhau dù epoch có winner hay không. Test đọc carry qua
`fhevm.debugger`, và chỗ nào dùng đều ghi rõ `[mock-only inspection]` để không
ai tưởng đó là product path.

**Đây là lý do không có `reclaimCarry()`.** Mọi hàm cho employer rút carry theo
*điều kiện* đều phải so sánh carry với cái gì đó, và revert-hay-không của tx đó
**chính là bit ấy**, công khai vĩnh viễn trên chain. Chọn giam tiền hơn là leak.

**Residual — chấp nhận.** Pool chết vĩnh viễn ⇒ carry roll mãi: không mất,
không ai rút được (`KNOWN_LIMITATIONS.md` §8).

## T7. RNG — tin tưởng coprocessor

**Threat.** `FHE.randEuint64()` hiện là **PRNG phía coprocessor**, chưa phải
threshold-VRF production-grade (Zama roadmap ghi rõ sẽ nâng cấp). Ai kiểm soát
coprocessor về lý thuyết có thể dự đoán hoặc thiên lệch random.

**Cái vẫn đảm bảo được:** không ai *trong protocol* đưa seed; random chỉ sinh
trong state-changing tx; đúng 1 lần/epoch; không reroll.

**Cái KHÔNG đảm bảo:** unpredictability ở mức mật mã **chống lại chính
coprocessor operator**.

**Residual — chấp nhận, và phải nói thẳng.** Prize là sponsored yield trên
testnet nên thiệt hại tối đa là tiền demo. Nhưng câu này **phải xuất hiện trong
README và video**, không để judge tự phát hiện (`KNOWN_LIMITATIONS.md` §4).

Ghi chú kỹ thuật: mock rand trong test là `ethers.randomBytes`, **không replay
được giữa các lần chạy** (quirk #17). Vì thế test winner phải là
*exact-replication* — decrypt R/T/areas rồi tự tính prefix-sum và đối chiếu —
chứ không được hardcode winner.

## T8. Đốt slot participant (griefing)

**Threat.** Registration là plaintext-gated và **vĩnh viễn**. 32 ví deposit
enc(0) ⇒ pool full, người thật không vào được.

**Vì sao không chặn sạch được.** Gate "chỉ đăng ký khi thực sự credited > 0"
đòi hỏi rẽ nhánh trên `ebool`; mọi cách reveal bit đó đều leak ≥1 bit về
amount. Chọn chiếm-slot thay vì leak (`KNOWN_LIMITATIONS.md` §2).

**Thiệt hại.** Không ai mất tiền — chỉ mất chỗ. Zero-weight participant **không
bao giờ thắng và không phá exactly-one-winner** (chứng minh ở
`DRAW_PROTOCOL.md` §6.3, test pin refunded-registrant nằm giữa list).

**Residual — chấp nhận ở scope demo.** Ý tưởng P2 ngoài scope: slot recycling.

## T9. Reentrancy trên chỗ `claim()` cố tình lệch CEI

**Threat.** `claim()` **transfer trước, trừ sau** — ngược pattern
`_debitAndTransfer`. Nếu recipient chiếm được luồng điều khiển giữa hai bước,
số bị trừ có thể sai.

**Vì sao phải viết như vậy.** Sub-by-actual (rule #2): pot phải trừ đúng số
token **thật sự chuyển đi**, mà số đó chỉ biết được **sau** khi gọi transfer —
nó là handle trả về. Muốn đúng invariant #2 thì buộc phải lệch CEI.

**Mitigation.** `nonReentrant` trên `claim()`, cộng với việc `confidentialTransfer`
của token không mở đường callback ngược vào pot. Có comment giải thích ngay tại
chỗ (`PayDayPot.sol:790`) để reviewer không tưởng là sót.

**Ghi chú ACL làm cho việc này khả thi:** OZ `ERC7984._update` cấp
`FHE.allow(transferred, from)` **persistent** — pot (là `from` khi claim) được
phép dùng handle `actual` cho `FHE.sub` trong cùng tx. Không có grant đó thì
sub-by-actual không compile được về mặt ACL.

## T10. Anonymity set nhỏ

**Threat.** `PARTICIPANT_CAP = 32`, và danh sách participant là **public**. Với
2 người trong pool thì "một trong hai" đã là thông tin đáng kể; mọi lập luận
privacy ở trên đều yếu đi theo kích thước pool.

**Mitigation.** Không có ở tầng mật mã — đây là tính chất của tập, không phải
của thuật toán.

**Residual — chấp nhận, phải nói trong onboarding.** Privacy tỉ lệ thuận với số
người tham gia. Cap 32 là giới hạn của scope demo (HCU + gas), không phải một
tuyên bố rằng 32 là đủ để ẩn.

## 11. Bảng residual risk — thứ mình biết là còn rò

| # | Residual | Ai khai thác được | Thiệt hại tối đa | Vì sao chấp nhận |
|---|---|---|---|---|
| T1 | Ai **không bao giờ** claim thì gần như chắc không thắng | observer | thu hẹp tập nghi vấn về winner | `claimFor` scope-cut; uniform claim đã đóng phần tx; phần còn lại là hành vi |
| T2 | Unwrap ra USDC lộ số tiền | observer | lộ đúng số winner nhận | ngoài biên contract; kỷ luật user |
| T3 | Employer defund **trong lúc epoch còn mở** | employer | user mất kỳ vọng, **không mất tiền** | cửa defund đóng đúng lúc cửa deposit đóng — còn rút prize được thì saver còn rút deposit được; principal bất khả xâm phạm |
| T4 | Pause vĩnh viễn ⇒ epoch treo | owner | không winner, không epoch mới | tiền của **cả** user lẫn employer vẫn rút được |
| T6 | Carry giam vĩnh viễn nếu pool chết | — | tiền employer kẹt | đổi lấy zero-leak về winner-existence |
| T7 | RNG là PRNG coprocessor | coprocessor operator | thiên lệch kết quả draw | testnet + sponsored yield; nói thẳng trong README/video |
| T8 | Đốt 32 slot bằng ví rỗng | ai cũng được | pool đầy, không ai mất tiền | chặn sạch = leak 1 bit amount |
| T10 | Pool nhỏ ⇒ anonymity set nhỏ | observer | privacy yếu đi tuyến tính | giới hạn HCU/gas của scope demo |

**Không có mục nào trong bảng này đụng tới principal của user.** Đó là ranh
giới cứng: mọi residual ở trên đều là *thông tin* hoặc *kỳ vọng*, không phải
*tiền gửi*.

## 12. Nguồn

`contracts/PayDayPot.sol` · `PRIVACY.md` · `KNOWN_LIMITATIONS.md` ·
`DRAW_PROTOCOL.md` §5–§6 · `ERROR_RECOVERY_MATRIX.md` R9/R12 ·
`PAYDAY_POT_IMPLEMENTATION_PLAN.md` §15 (lưu ý: §1663 nói về `claimFor` là
**stale** — xem T1).
