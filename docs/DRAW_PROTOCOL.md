# DRAW_PROTOCOL — PayDay Pot

Giao thức draw end-to-end: TWAB accrual → freeze → random → weighted selection
→ prize. File này là **exit gate Day 3** (TWAB/snapshot + HCU đo thật) và
**exit gate Day 4** (random + selection — §6 đã ship, HCU đo thật §4).
Cập nhật: Day 4 (24/08/2026).

## 1. Phase machine — 4 phase, không phải 5

```
Open ──beginSnapshot()──▶ Snapshotting ──batch cuối──▶ Drawing ──Day 5──▶ Settled
  │        (now ≥ end)          │  (cursor == count)      │
  │                             │                         ├─ sub-state qua `drawn`:
  │  deposit đóng tại `end`     │  withdraw VẪN chạy      │  false = chờ random
  │  (kể cả khi phase còn Open) │  (mọi phase, mọi lúc)   │  true  = đang select (cursor)
```

Plan cũ (PAYDAY_POT_10_DAY_BUILD_PLAN, EXECUTION_PLAN Day 4 bullet 1) nói 5
phase `Open → Snapshotting → RandomReady → Selecting → Finalized`. Enum thật
**giữ 4 phase** `{Open, Snapshotting, Drawing, Settled}` — RandomReady và
Selecting là **sub-state của Drawing**, phân biệt bằng `epoch.drawn` (bool) +
cursor: `drawn == false` ⇔ RandomReady (chờ request random), `drawn == true &&
cursor < count` ⇔ Selecting. Lý do: 2 field đó tồn tại sẵn cho resume logic
(R4/R5), thêm 2 enum value chỉ tạo chỗ cho state desync mà không thêm thông tin.

Quy tắc chuyển phase đã ship (Day 3):

| Transition | Điều kiện | Ai gọi | Event |
|---|---|---|---|
| Open → Snapshotting | `beginSnapshot()`: `phase == Open && now ≥ end` | **bất kỳ ai** | `SnapshotStarted(epochId, participantCount)` |
| Snapshotting → Drawing | `snapshotBatch(n)` xử lý participant cuối (`cursor == count`) | **bất kỳ ai** | `SnapshotProgress` + `SnapshotCompleted` |
| Open → Drawing (tắt) | `beginSnapshot()` khi `participantCount == 0` — hoàn tất trong cùng tx | bất kỳ ai | `SnapshotStarted(_, 0)` + `SnapshotCompleted` |

- **Deposit đóng tại `end` chứ không phải tại `beginSnapshot`**: callback gate
  `phase != Open || now >= end → WrongPhase`. Không có khe hở giữa lúc epoch
  hết hạn và lúc ai đó bấm nút snapshot — participant list/order/count bất biến
  từ `end` (freeze là **behavioral**: list append-only, registration chỉ xảy ra
  trong deposit callback, callback bị time-gate — không cần copy state).
  Hệ quả: có deposit-dead-window sau `end` cho tới khi Day 5 mở epoch mới
  (KNOWN_LIMITATIONS §6).
- **Pause không đụng snapshot**: `beginSnapshot`/`snapshotBatch` là bookkeeping
  của epoch đã kết thúc, pause nó chỉ tạo owner-liveness dependency cho việc
  resolve epoch (vi phạm tinh thần R4). Cái mà pause PHẢI chặn là "new draw" =
  **random request một-lần của Day 4** — `whenNotPaused` đặt ở đó, không ở đây.
- **Withdraw không có bất kỳ gate nào** (non-negotiable #1) — xem §3.

## 2. TWAB — weight = encrypted balance × public time, KHÔNG chia

Mỗi `Account` giữ `euint64 twabArea` (Σ principal·dt) + `uint64 lastCheckpoint`
(plaintext). Trước **mọi** principal mutation và trong batch slot của snapshot:

```
nowClamped = min(now, epochEnd)                       // plaintext
elapsed    = nowClamped − lastCheckpoint              // plaintext
twabArea  += FHE.mul(principal, elapsed)              // scalar mul — 344k HCU
```

**P-1 — không bao giờ chia onchain.** Weight của draw là **raw area**. Chia
mọi weight cho cùng hằng số `epochDuration` không đổi xác suất trúng của
multiply-high draw (Day 4): ticket `t ∈ [0, T)` với `T = Σ areaᵢ`; scale
`areaᵢ → areaᵢ/k` đồng nghĩa scale `T → T/k` — phân phối `P(win_i) = areaᵢ/T`
bất biến. "Average balance" chỉ là con số hiển thị: client tự chia
`area / EPOCH_DURATION` **sau khi decrypt**. `FHE.div` với divisor encrypted
không tồn tại trong FHEVM; với divisor plaintext thì tốn 37k HCU vô ích.

**P-3 — budget không-wrap.** FHE arithmetic **wrap chứ không revert**, nên biên
duy nhất là constructor: `participantCap × perUserCap × epochDuration < 2^64`
(revert `InvalidConfig` khi `≥ type(uint64).max`). Worst case tuyệt đối
(1 người, 30 ngày, cap 7,116,000 ctUSDC) đo thật trong test: accrual chạm
`18,419,054,400,000,000,000` ≈ 99.85% của 2^64, decrypt **đúng từng đơn vị** —
`euint64` đủ, không cần promote `euint128` cho accrual (spec cũ §17.3 đã bị
override; promote chỉ xảy ra ở ticket math Day 4).

**Short-circuit chỉ trên plaintext — không leak.** `_checkpoint` bỏ qua FHE ops
khi `last == 0` (chưa từng stamp — principal chắc chắn encrypted-zero vì
registration stamp trước credit đầu tiên) hoặc `elapsed == 0` (đã frozen /
cùng block). Cả hai điều kiện đọc từ `block.timestamp` và `lastCheckpointOf`
— **đều là public view sẵn có**, không phụ thuộc bất kỳ bit encrypted nào.
Rule "same logical work for every participant" chỉ áp cho branch trên
**encrypted** condition (cấm `if (ebool)`); branch trên plaintext công khai
tiết kiệm ~530k HCU mỗi no-op và làm re-run batch rẻ.

**Scope theo epoch.** `twabArea`/`lastCheckpoint` thuộc epoch hiện tại.
`startNewEpoch` (Day 5) **phải** reset `twabArea = enc(0)` + `lastCheckpoint =
newStart` cho mọi participant (≤32 người — rẻ). Chưa reset thì weight epoch cũ
rò sang epoch mới → sai xác suất. Đây là ràng buộc P0 của Day 5.

## 3. Freeze semantics — đóng băng tại payday, không phải lúc draw

Snapshot **không đọc thời điểm chạy snapshot**: mọi accrual clamp về
`epochEnd`. Test pin chứng minh snapshot trễ 3 ngày cho ra weight **y hệt**
snapshot đúng giờ.

**Ordering proof cho withdraw-sau-cutoff** (kịch bản winner S3 bị chất vấn):

1. `withdraw*` → `_debitAndTransfer` → `_checkpoint(user)` chạy **trước** khi
   debit principal. Withdraw tại `t > end` accrue nốt `principal × (end −
   last)` (clamp), stamp `lastCheckpoint = end`, **rồi mới** trừ tiền.
2. Batch slot của user tới sau đó: `elapsed = end − end = 0` → short-circuit,
   handle `twabArea` **không đổi** (test pin cả handle equality).
3. ⇒ Rút tiền sau payday — kể cả **giữa lúc snapshot đang chạy dở** — không
   đổi một đơn vị weight nào, không đổi `totalWeight`. Tiền về ví đủ 100%
   (no-loss), vé số của epoch đã chốt vẫn nguyên.

Điều ngược lại cũng đúng: withdraw **giữa epoch** thì weight dừng tích tại đó
(`area = amount × holding window`) — đúng ngữ nghĩa "gửi lâu hơn = vé to hơn".

## 4. HCU đo thật (Day 3, `fhevm.computeTransactionHCU`, mock == giá Sepolia)

Limit mỗi tx: **20M global / 5M sequential depth**.

| Tx | globalHCU | maxHCUDepth |
|---|---:|---:|
| Deposit lần đầu (register + credit, chưa accrual) | 2,079,256 | 780,000 |
| Deposit lặp + **TWAB accrual** | 2,606,192 | 780,000 |
| Partial withdraw + accrual | 1,656,032 | 588,000 |
| `withdrawAll` + accrual | 1,437,064 | 527,000 |
| `beginSnapshot` | **32** | 32 |
| `snapshotBatch(1)` — 1 participant chưa frozen | 689,000 | 689,000 |
| `snapshotBatch(7)` — 7 participants chưa frozen | 4,823,192 | 1,661,000 |

Marginal mỗi participant chưa frozen: **≈689k global / ≈162k depth**
(mul 344k + add area + add total; depth chỉ ăn chuỗi accumulator).

**Batch ceiling** (headroom 20% cả hai trục):

```
ceiling = min( ⌊0.8·20M / 689k⌋ , ⌊(0.8·5M − 689k) / 162k⌋ + 1 ) = min(23, 21) = 21
```

→ **21 participants/tx**. Sửa ước lượng cũ của P-3 ("~29/tx, pool 32 = 2 tx"):
đúng là 2 tx nhưng phải chia **16 + 16** (hoặc bất kỳ split nào ≤ 21), không
phải 29 + 3. Test tự động fail nếu ceiling tụt dưới 8. Default khuyến nghị cho
keeper/demo: `maxSteps = 8` (≈5.5M global, ~28% limit — chỗ cho gas spike);
UI hiển thị cursor `x/32` từ `snapshotProgress` + event (R4).

Ghi chú giá lẻ: `trivialEncrypt` đo thật chỉ **32 HCU** (bảng dự đoán cũ ghi
600 — rẻ hơn 18×); scalar `FHE.mul` 344k (dự đoán 356k); `FHE.add` 163k
(dự đoán 188k). Các con số dự đoán trong plan cũ đều hơi cao — không có
surprise theo chiều xấu.

**Day 4 — draw pipeline (đo thật 24/08, fixture 8 participants):**

| Tx | globalHCU | maxHCUDepth | gas |
|---|---:|---:|---:|
| `requestRandom` (rand + u128 mul + shr + casts) | 1,747,160 | 1,747,064 | 324,659 |
| `selectBatch(1)` — 1 participant | 574,066 | 550,032 | 341,968 |
| `selectBatch(7)` — 7 participants | 4,018,078 | 1,522,000 | 1,568,611 |

Marginal mỗi participant scan: **≈574k global / ≈162k depth** (7 FHE op đồng
nhất: add cumulative, lt, not, and, select prize, add pendingPrize, or latch —
depth chỉ ăn chuỗi cumulative/latch, y hệt snapshot). `requestRandom` mang op
đắt nhất toàn hệ thống (`FheMul` euint128 non-scalar = 1,686,000 HCU) nhưng chạy
**đúng 1 lần/epoch** — không nằm trong loop nào.

**Scan ceiling** (công thức y hệt snapshot, headroom 20% cả hai trục):

```
ceiling = min( ⌊0.8·20M / 574k⌋ , ⌊(0.8·5M − 550k) / 162k⌋ + 1 ) = min(27, 22) = 22
```

→ **22 participants/tx**, pool 32 = **2 tx** (16+16 hoặc bất kỳ split ≤ 22).
Test tự fail nếu ceiling tụt dưới 8. Default cho keeper/demo: `maxSteps = 8`.
Lưu ý: award line (`pendingPrize += select(hit, prize, 0)`) đã nằm **trong**
loop từ Day 4 — Day 5 không được thêm op nào vào loop nữa, số đo này là chốt.

## 5. ACL của weight — đúng policy của principal

| Handle | Ai decrypt được | Ghi chú |
|---|---|---|
| `twabAreaOf(user)` | **chỉ user** (+ contract) | employer/keeper/owner: DENIED — có negative test với lịch sử phân kỳ (quirk #10) |
| `totalWeightOf(epochId)` | **không ai** (contract-only) | Day 4 tiêu thụ bên trong FHE ops; test nhìn qua `fhevm.debugger` (mock-only, không phải product path) |
| `drawStateOf(epochId)` — random/ticket/cumulative/selectedAny | **không ai** (contract-only) | non-negotiable #6 — reveal random/ticket là reveal thông tin về weight |
| `wonOf(user)` | **không ai** (contract-only) | §15.1 "Winner flags → Contract only" — **kể cả chính user cũng DENIED** (có test); kênh reveal cho user là `pendingPrize` |
| `pendingPrizeOf(user)` | **chỉ user** (+ contract) | grant đồng loạt cho MỌI participant sau scan (uniform — không leak ai thắng); winner thấy prize, người khác thấy enc(0) |

Handle chưa init (chưa từng accrual / chưa `beginSnapshot` / chưa scan) =
`bytes32(0)` — UI **phải render "unavailable", không bao giờ render 0**
(non-negotiable #8, có test pin cho registrant bị refund và cho
`pendingPrizeOf` trước scan).

Events snapshot **và draw** chỉ mang **public counters** (`participantCount`,
`cursor`, `epochId`) — không amount, không weight, không winner address,
encrypted hay plaintext (test soi từng topic + data word của cả 3 draw tx).

## 6. Draw engine — SHIPPED Day 4 (24/08/2026)

1. **`requestRandom()` — một-lần, không tham số** (gate: `phase == Drawing`,
   `!drawn` — gọi lại revert `AlreadyDrawn`, R5): `FHE.randEuint64()` trong
   state-changing tx, **cùng tx** derive ticket, init cumulative/selectedAny,
   set `drawn = true`. Đây là chỗ **duy nhất** gắn `whenNotPaused` ngoài
   deposit — pause khi đang chờ random = epoch đứng yên ở `Drawing && !drawn`,
   unpause là chạy tiếp, không mất gì (R10; test pin). Hệ quả có chủ đích
   (D2): owner pause **vô hạn** thì epoch treo ở trạng thái này — đây là
   owner-liveness dependency duy nhất của protocol, withdraw vẫn chạy 100%
   (KNOWN_LIMITATIONS). Signature không có input nào — keeper không thể đưa
   seed/weight/winner ở mức ABI (non-negotiable #7; có test soi
   `interface.getFunction("requestRandom").inputs.length == 0`).
   Pool 0 participant: emit `DrawCompleted` ngay cùng tx.
2. **Ticket math (P-2)** — đúng như spec: promote `euint128`,
   `FHE.mul(random, totalWeight)`, **`FHE.shr(product, 64)`**, downcast
   `euint64`. Không `FHE.div`/`FHE.rem` ở bất kỳ đâu. Overflow structural:
   P-3 guard ⇒ `T < 2^64` ⇒ `R×T < 2^128` không wrap; quotient `< T < 2^64`
   nên downcast exact. Kết quả `ticket ∈ [0, T)` — test exact bigint
   `ticket == (R·T) >> 64` trên chính contract path [mock-only] + harness
   test-only `TicketMathHarness` cho biên max-R × max-T (R không inject được
   vào pot theo thiết kế — harness chạy Y HỆT chuỗi op với input tự cấp).
3. **Cumulative scan `selectBatch(maxSteps)`** — permissionless, KHÔNG
   pausable, batch theo cursor, mỗi participant đúng 7 FHE op đồng nhất:
   ```
   cumulative  += areaᵢ
   hit          = and(lt(ticket, cumulative), not(selectedAny))   // §6.3
   won[i]       = hit                                             // contract-only
   pendingPrize += select(hit, enc(prizeAmount), enc(0))          // award line
   selectedAny  = or(selectedAny, hit)
   ```
   Không `if (ebool)`, không encrypted index. **Đúng-một-winner là structural**:
   `not(selectedAny)` chặn hit thứ hai; `ticket < T` bảo đảm crossing đầu tiên
   tồn tại khi `T > 0`. **Bỏ term `hasWeight`** trong plan cũ (EXECUTION_PLAN
   Day 4 bullet) — chứng minh 2 dòng: participant weight 0 không tăng
   `cumulative`, nên điều kiện `ticket < cumulative` tại slot đó **y hệt** slot
   trước → nếu trước đó chưa cross thì giờ vẫn không cross, nếu đã cross thì
   `selectedAny` đã chặn. Zero-weight không bao giờ thắng và không phá
   exactly-one (test pin refunded-registrant giữa list).
   **Award line nằm trong loop từ Day 4** dù `prizeAmount` mặc định 0: batch
   ceiling là exit gate đo trên đúng hình dạng loop cuối cùng — Day 5 thêm op
   vào loop là số đo vô hiệu. **Ràng buộc B2: `prizeAmount` bất biến kể từ
   `drawn == true`** — funding setter (Day 5) phải revert khi `ep.drawn`
   (fund trước request vẫn an toàn: ticket không phụ thuộc prize).
4. **Zero-weight rollover (T = 0)**: `lt(ticket=0, cumulative=0)` = false ở
   mọi slot → scan hoàn tất, `selectedAny` = false, không ai được cộng prize,
   prize giữ nguyên cho epoch sau — **không decrypt total ở bất kỳ bước nào**
   (kết luận rút từ chính cấu trúc phép toán, test pin cả pool-toàn-refunded
   lẫn pool rỗng). Day 5 re-run kịch bản này với prize dương để chứng minh
   rollover thật (B4).
5. **Cursor: field MỚI `selectCursor`, không tái dùng `snapshotCursor`** —
   chốt phương án (a) của Day 3. Căn cứ: (i) `snapshotProgress` là view công
   khai UI R4 đang đọc, ngữ nghĩa "x/32 đã frozen" phải giữ nguyên sau khi
   snapshot xong — reset nó về 0 lúc `drawn = true` làm UI hiển thị sai trạng
   thái snapshot; (ii) conceptual struct §17.3 của implementation plan vốn có
   `selectionCursor` riêng. View mới `drawProgress(epochId) → (drawn, cursor,
   total)` phục vụ UI "scan x/32" (R4). `SelectProgress(epochId, cursor)` +
   `DrawCompleted(epochId)` mirror bộ event snapshot.

## 7. Test coverage của giao thức

**Day 3** — `test/PayDayPot.twab.ts`, 26 tests, mọi tx pin
`time.setNextBlockTimestamp`, mọi assertion là **exact bigint equality**:
tỷ lệ 2:1; step-deposit ≡ flat-75; last-second = amount×1s; snapshot trễ 3
ngày; withdraw giữa/sau epoch; partial withdraw giữa snapshot (handle
equality); refunded registrant; biên phase tại `end`; zero-participant;
cursor + permissionless continue; batch(0); Σ weights == totalWeight; R10
paused+Snapshotting; ACL 4 chiều; biên constructor 2^64; max-accrual 99.85%
2^64. Demo: `pnpm demo:day3`.

**Day 4** — `test/PayDayPot.draw.ts`, 26 tests: gates requestRandom
(WrongPhase ×2, AlreadyDrawn + handle equality, EnforcedPause → unpause,
permissionless, zero-input signature); ticket exact `== (R·T) >> 64` trên
contract path; harness biên (max-R × max-T không wrap — ticket đúng `T−1`;
sweep R ∈ {0, 1, 2^63, 2^64−1}); gates selectBatch (NotDrawn, InvalidConfig,
SelectionComplete, cursor monotonic, stranger resume); **winner
exact-replication** (decrypt R/T/areas [mock-only] → prefix-sum dự đoán →
đúng người, Σwon == 1); carry qua biên tx (batch(1)×3 ≡ 1 sweep, kiểm
intermediate state); zero-weight giữa list; T=0 rollover; withdrawAll giữa 2
selectBatch (handle equality + winner bất biến); pause giữa scan; ACL 5 lớp
(random/ticket/cumulative/selectedAny/won: KHÔNG AI kể cả user; pendingPrize:
chỉ user); event hygiene từng topic/word; **Monte Carlo 64 epoch tươi**
weight 1:3:6, band ±3.5σ, weight nhẹ nhất đứng đầu list (bắt cả
"first-always-wins" lẫn uniform-bug), log R/ticket/winner mỗi sample (mock
rand = crypto-random, không replay được). HCU: `test/PayDayPot.hcu.ts`
(bảng §4 tự in mỗi lần chạy). Demo: `pnpm demo:day4`.
