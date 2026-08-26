# DRAW_PROTOCOL — PayDay Pot

Giao thức draw end-to-end: TWAB accrual → freeze → random → weighted selection
→ prize → claim → epoch kế tiếp. File này là **exit gate Day 3** (TWAB/snapshot
+ HCU đo thật), **exit gate Day 4** (random + selection) và **exit gate Day 5**
(prize funding, settle, claim, lifecycle — §6.6 đã ship, HCU đo thật §4).
Cập nhật: Day 5 (25/08/2026).

## 1. Phase machine — 4 phase, không phải 5

```
Open ──beginSnapshot()──▶ Snapshotting ──batch cuối──▶ Drawing ──scan cuối──▶ Settled
  ▲        (now ≥ end)          │  (cursor == count)      │                      │
  │                             │                         ├─ sub-state qua       │
  │  deposit đóng tại `end`     │  withdraw VẪN chạy      │  `drawn`:            │
  │  (kể cả khi phase còn Open) │  (mọi phase, mọi lúc)   │  false = chờ random  │
  │                             │                         │  true  = đang select │
  └───────────────────── startNewEpoch() ─────────────────────────────────────────┘
            (epoch mới, currentEpochId += 1 — bất kỳ ai gọi)

  pool rỗng: Open ──beginSnapshot()──▶ Settled  (không draw, không đốt 1.75M HCU)
```

Plan cũ (PAYDAY_POT_10_DAY_BUILD_PLAN, EXECUTION_PLAN Day 4 bullet 1) nói 5
phase `Open → Snapshotting → RandomReady → Selecting → Finalized`. Enum thật
**giữ 4 phase** `{Open, Snapshotting, Drawing, Settled}` — RandomReady và
Selecting là **sub-state của Drawing**, phân biệt bằng `epoch.drawn` (bool) +
cursor: `drawn == false` ⇔ RandomReady (chờ request random), `drawn == true &&
cursor < count` ⇔ Selecting. Lý do: 2 field đó tồn tại sẵn cho resume logic
(R4/R5), thêm 2 enum value chỉ tạo chỗ cho state desync mà không thêm thông tin.

Quy tắc chuyển phase đã ship (Day 3 + Day 5):

| Transition | Điều kiện | Ai gọi | Event |
|---|---|---|---|
| Open → Snapshotting | `beginSnapshot()`: `phase == Open && now ≥ end` | **bất kỳ ai** | `SnapshotStarted(epochId, participantCount)` |
| Snapshotting → Drawing | `snapshotBatch(n)` xử lý participant cuối (`cursor == count`) | **bất kỳ ai** | `SnapshotProgress` + `SnapshotCompleted` |
| **Open → Settled (tắt)** | `beginSnapshot()` khi `participantCount == 0` — prize cộng thẳng vào carry, `drawn` giữ `false` | bất kỳ ai | `SnapshotStarted(_, 0)` + `SnapshotCompleted` + `EpochSettled` |
| **Drawing → Settled** | `selectBatch(n)` xử lý participant cuối (`cursor == count`) — carry update cùng tx | **bất kỳ ai** | `SelectProgress` + `DrawCompleted` + `EpochSettled` |
| **Settled → Open (epoch mới)** | `startNewEpoch()`: `phase == Settled` | **bất kỳ ai** | `EpochStarted(epochId+1, start, end)` |

**Không có bước finalize thủ công.** Settle xảy ra **trong chính tx đóng scan**
— không ai (kể cả owner) phải bấm nút để epoch kết thúc, và không có cửa sổ
"đã scan xong nhưng chưa chốt" để ai đó chen vào. Day 5 đổi empty-pool
fast-path từ `Open → Drawing` (Day 4) sang `Open → Settled`: pool 0 người
không có gì để bốc, chạy `requestRandom` chỉ để đốt 1.75M HCU rồi scan 0
participant là vô nghĩa (ràng buộc D9). Prize đã fund của epoch rỗng roll
thẳng sang epoch sau qua carry.

- **Deposit đóng tại `end` chứ không phải tại `beginSnapshot`**: callback gate
  `phase != Open || now >= end → WrongPhase`. Không có khe hở giữa lúc epoch
  hết hạn và lúc ai đó bấm nút snapshot — participant list/order/count bất biến
  từ `end` (freeze là **behavioral**: list append-only, registration chỉ xảy ra
  trong deposit callback, callback bị time-gate — không cần copy state).
  Hệ quả: có deposit-dead-window sau `end` cho tới khi `startNewEpoch()` mở
  epoch kế tiếp (KNOWN_LIMITATIONS §6 — Day 5 thu hẹp về đúng thời gian
  resolve, không xoá).
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

**Scope theo epoch — đã ship Day 5.** `twabArea`/`lastCheckpoint` thuộc epoch
hiện tại. `startNewEpoch()` reset `twabArea = enc(0)`, `won = enc(false)`,
`lastCheckpoint = newStart` cho **mọi** participant trong 1 tx (≤32 người —
đo thật 850,516 gas cho pool đầy, §4). Chưa reset thì weight epoch cũ rò sang
epoch mới → sai xác suất. **KHÔNG đụng `principal`, KHÔNG BAO GIỜ đụng
`pendingPrize`** (ràng buộc B3): tiền tiết kiệm và tiền thắng chưa claim đều
sống xuyên epoch. `start` của epoch mới là `block.timestamp` chứ không backfill
`prev.end` — nếu không ai gọi `startNewEpoch` trong nhiều ngày, backfill sẽ tạo
epoch degenerate đã hết hạn ngay khi mở. Đổi lại, khoảng `[prev.end, newStart]`
không thuộc epoch nào và không tích weight (KNOWN_LIMITATIONS §6).

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

**Day 4 + Day 5 — draw pipeline (đo lại 25/08 sau khi carry vào code, fixture
8 participants):**

| Tx | globalHCU | maxHCUDepth | gas |
|---|---:|---:|---:|
| `requestRandom` (rand + u128 mul + shr + casts + **carry fold**) | 1,909,224 | 1,747,064 | 399,595 |
| `selectBatch(1)` — 1 participant | 574,034 | 550,032 | 338,712 |
| `selectBatch(7)` — 7 participants, **tx đóng scan** | 4,073,046 | 1,522,000 | 1,632,545 |

Day 5 thêm `+162,064` global vào `requestRandom` (1 trivial encrypt + 1 add để
gộp carry vào `prizeCipher`) — **depth không đổi**, vì chuỗi sâu nhất vẫn là
`euint128` mul. `selectBatch` gần như đứng yên: line hoist đổi từ trivial
encrypt sang SLOAD (rẻ hơn 32 HCU), còn `FHE.select` cập nhật carry chỉ chạy ở
**tx cuối**, nằm ngoài loop.

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
Ceiling **giữ nguyên 22 sau Day 5** — loop 7 op không bị đụng, đúng như ràng
buộc chốt ở Day 4. Con số marginal còn hơi bi quan: nó chia đều cả
`FHE.select` carry (chỉ chạy 1 lần ở tx cuối) cho 7 participant, nên ceiling
thật cao hơn 22 một chút. Sai số theo chiều an toàn.

Ceiling này **ràng buộc cả fixture test**: `snapshotBatch(32)` trong 1 tx trên
pool đầy revert `HCUTransactionDepthLimitExceeded` — đúng như tính toán
(ceiling snapshot = 21). Fixture 32 người trong `PayDayPot.hcu.ts` phải chạy
16+16, y hệt keeper thật.

**Day 5 — prize, claim, lifecycle (đo thật 25/08):**

| Tx | globalHCU | maxHCUDepth | gas |
|---|---:|---:|---:|
| `fundPrize` (ERC-20 pull + `wrap` by contract) | 586,064 | 531,032 | 322,665 |
| `defundPrize` (trivial encrypt + transfer out) | 586,096 | 369,032 | 386,651 |
| `claim()` — **winner** | 748,032 | 369,000 | 396,250 |
| `claim()` — **non-winner** | **748,032** | **369,000** | **396,250** |
| `startNewEpoch()` — reset pool đầy 32 người | 64 | 32 | 850,516 |

Hai dòng `claim` bằng nhau **tuyệt đối trên cả ba trục** — không phải "xấp xỉ",
không phải sai số warm/cold storage. Đó là bằng chứng đo được cho lập luận
uniform-claim của THREAT_MODEL §1: `claim()` chỉ có một code path độc lập dữ
liệu, nên observer nhìn gas/HCU không tách được payout khỏi no-op.

`startNewEpoch` là trường hợp **gas mới là ràng buộc, không phải HCU**: nó gần
như không chạy FHE (2 shared handle dùng lại cho mọi participant → 64 HCU) mà
đụng storage + ACL cho từng người, trong **1 tx không chia nhỏ được**. Pool
không mở được epoch mới = pool chết, nên phải đo ở cap 32 chứ không phải 8:
26,579 gas/participant → block 30M gánh được ~900 người. Test assert `< 10M`
(≈3.6× headroom so với limit 36M của Sepolia).

## 5. ACL của weight — đúng policy của principal

| Handle | Ai decrypt được | Ghi chú |
|---|---|---|
| `twabAreaOf(user)` | **chỉ user** (+ contract) | employer/keeper/owner: DENIED — có negative test với lịch sử phân kỳ (quirk #10) |
| `totalWeightOf(epochId)` | **không ai** (contract-only) | Day 4 tiêu thụ bên trong FHE ops; test nhìn qua `fhevm.debugger` (mock-only, không phải product path) |
| `drawStateOf(epochId)` — random/ticket/cumulative/selectedAny | **không ai** (contract-only) | non-negotiable #6 — reveal random/ticket là reveal thông tin về weight |
| `wonOf(user)` | **không ai** (contract-only) | §15.1 "Winner flags → Contract only" — **kể cả chính user cũng DENIED** (có test); kênh reveal cho user là `pendingPrize` |
| `pendingPrizeOf(user)` | **chỉ user** (+ contract) | grant đồng loạt cho MỌI participant sau scan (uniform — không leak ai thắng); winner thấy prize, người khác thấy enc(0) |
| `prizeCipherOf(epochId)` — prize pool đã commit (funded + carry) | **không ai** (contract-only) | tổng payout thật của epoch; lộ nó ⇒ lộ carry ⇒ lộ "epoch trước có winner không" |
| `prizeCarry()` — carry chưa trao | **không ai** (contract-only) | cùng lý do; test đọc qua `fhevm.debugger` [mock-only] |
| `prizeAmountOf(epochId)` | **công khai, plaintext `uint64`** | có chủ đích (P-4): prize là sponsored yield của employer, không phải tiền của user. Đây **không** phải payout của epoch — payout = prizeAmount + carry, và tổng đó thì encrypted |

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
   **Cùng tx chốt luôn prize pool** (Day 5): `prizeCipher = enc(prizeAmount) +
   carry`. Từ đây `prizeAmount` bất biến (B2) và carry đã commit — cả
   `fundPrize` lẫn `defundPrize` đều revert. Pool 0 participant không bao giờ
   tới được đây: `beginSnapshot` đã settle thẳng (§1).
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
   vào loop là số đo vô hiệu. Cược đó **đã trả**: Day 5 chỉ đổi *nguồn* của
   `prizeEnc` (từ trivial-encrypt sang `ep.prizeCipher`, hoist ngoài loop ở
   `selectBatch`), 7 op giữ nguyên từng chữ, ceiling vẫn 22.
   **Ràng buộc B2: `prizeAmount` bất biến kể từ `drawn == true`** — SHIPPED và
   giờ mạnh hơn require: `requestRandom` đông cứng pool vào handle
   `ep.prizeCipher`, nên kể cả nếu gate `fundPrize`/`defundPrize` có thủng thì
   payout của epoch đang chạy cũng không đổi. Require vẫn giữ (defense in
   depth + để tiền không lạc chỗ), có test pin cả hai chiều.
4. **Zero-weight rollover (T = 0)**: `lt(ticket=0, cumulative=0)` = false ở
   mọi slot → scan hoàn tất, `selectedAny` = false, không ai được cộng prize,
   prize giữ nguyên cho epoch sau — **không decrypt total ở bất kỳ bước nào**
   (kết luận rút từ chính cấu trúc phép toán, test pin cả pool-toàn-refunded
   lẫn pool rỗng). **B4 đã chứng minh với tiền thật (Day 5)**: fund 1,000 vào
   một epoch T = 0 → mọi `pendingPrize` decrypt ra 0, `prizeCarry` [mock-only]
   = 1,000; epoch sau fund thêm 500 và có weight dương → winner nhận đúng
   **1,500**. Roll-forward là `FHE.select(selectedAny, 0, prizeCipher)` ở tx
   chốt scan (§6.6) — không nhánh plaintext, không ai biết epoch có winner hay
   không.
5. **Cursor: field MỚI `selectCursor`, không tái dùng `snapshotCursor`** —
   chốt phương án (a) của Day 3. Căn cứ: (i) `snapshotProgress` là view công
   khai UI R4 đang đọc, ngữ nghĩa "x/32 đã frozen" phải giữ nguyên sau khi
   snapshot xong — reset nó về 0 lúc `drawn = true` làm UI hiển thị sai trạng
   thái snapshot; (ii) conceptual struct §17.3 của implementation plan vốn có
   `selectionCursor` riêng. View mới `drawProgress(epochId) → (drawn, cursor,
   total)` phục vụ UI "scan x/32" (R4). `SelectProgress(epochId, cursor)` +
   `DrawCompleted(epochId)` mirror bộ event snapshot.

   **Mẫu số phải là của chính epoch đó — `frozenCount` (sửa Day 5, red-team).**
   Cả hai view ban đầu trả `total = _participants.length` *hiện tại*. Nhưng
   `_participants` không bao giờ reset (registration là vĩnh viễn), nên một ví
   vào ở epoch 2 làm epoch 1 đọc lại thành `drawProgress(1) = (true, 1, 3)` —
   "mới quét 1/3" cho một epoch **đã settle xong**. Đúng cái tín hiệu R4/R5 bảo
   UI vẽ "resumable, ai cũng continue được", trong khi không còn gì để
   continue. Fix: `Epoch.frozenCount` chốt tại `beginSnapshot` (list đã bất
   biến từ `ep.end` nên đó là mốc đúng); view trả `frozenCount` cho mọi epoch
   đã bắt đầu snapshot, trả list hiện tại cho epoch còn `Open` (kể cả epochId
   tương lai — đó chính là số mà snapshot của nó sắp đóng băng).
6. **Prize · claim · lifecycle — SHIPPED Day 5 (25/08/2026).** Bốn hàm khép
   kín vòng đời, chi tiết bốn quyết định thiết kế:

   **`fundPrize(uint64)`** — `onlyEmployer`, `whenNotPaused` (money-in, cùng
   policy deposit), `nonReentrant`, gate `phase == Open`. Employer nạp bằng
   **underlying USDC công khai**, pot tự `wrap` đồng bộ trong cùng tx:
   `safeTransferFrom(EMPLOYER, pot, amount·RATE)` → `forceApprove` →
   `TOKEN.wrap(pot, amount·RATE)` → `ep.prizeAmount += amount` (checked).
   Lý do không nhận confidential transfer: clamp ERC-7984 là **all-or-nothing**
   (`transferred = select(bal ≥ amt, amt, 0)`), nên employer thiếu tiền sẽ
   chuyển enc(0) *âm thầm* trong khi `prizeAmount` vẫn cộng đủ → pot hứa nhiều
   hơn số có → winner ăn vào principal người khác (vỡ non-negotiable #1). Pull
   ERC-20 thì **revert plaintext** — đó chính là R12, và nó làm allocation ≡
   funding ≡ transfer thật, solvency đúng by construction. Đổi lại: employer
   fund là **2 tx** (`USDC.approve` → `fundPrize`), UI Day 7 phải hiện
   "step 1/2".

   **`defundPrize(uint64)`** — `onlyEmployer`, `nonReentrant`, **KHÔNG
   `whenNotPaused`**. Gate hai vế:

   ```solidity
   bool openWindow    = ep.phase == Open && block.timestamp < ep.end;
   bool stalledByPause = ep.phase == Drawing && !ep.drawn && paused();
   ```

   Vế đầu là quy tắc: **employer đổi được prize đúng chừng nào saver còn đổi
   được deposit**. Cửa deposit đóng tại `ep.end` (§1), nên cửa rút prize cũng
   đóng ở đó. Vế sau là đường thoát D3 và nó **hẹp lại chỉ còn đúng chỗ kẹt
   thật**: `requestRandom` là bước lifecycle duy nhất có `whenNotPaused`, nên
   `Drawing && !drawn && paused()` là trạng thái duy nhất owner treo được vĩnh
   viễn (KNOWN_LIMITATIONS §7). `Snapshotting` **không** cần cửa: `beginSnapshot`
   và `snapshotBatch` đều permissionless *và* không pausable — không có gì để
   kẹt ở đó.

   **Vì sao không dùng `!ep.drawn && phase != Settled` (bản Day 5 đầu tiên,
   red-team bắt được):** gate đó đúng về *solvency* — nó chặn chính xác lúc
   carry đã commit, kể cả cái bẫy empty-fast-path settle-mà-`drawn == false`.
   Nhưng nó bỏ ngỏ `Snapshotting` và `Drawing-before-random` **lúc không
   paused**, tức là toàn bộ khoảng sau khi deposit đã đóng và weight đã đóng
   băng. Kịch bản: fund 5,000 công khai → saver giữ tiền cả epoch để ăn prize →
   `beginSnapshot` → employer `defundPrize(5000)` → mọi `pendingPrize` decrypt
   ra 0. Không ai mất principal, nhưng saver bị dụ bằng một con số rồi bị rút
   mất, và **không còn đường thoát vì rút tiền ra lúc đó cũng không gỡ lại
   weight đã freeze**. Đó là rug, không phải exit. Gate mới hàm ý luôn bất biến
   cũ (`Drawing && !drawn` không bao giờ là `Settled`), nên F1/B2 vẫn kín.

   **`claim()`** — `nonReentrant`, **không phase gate, không pause gate**
   (rule #1: claim sống ở mọi phase), chỉ require registered và pendingPrize đã
   init (chưa từng scan ⇒ `NothingToClaim`, đây là public fact). Luôn transfer
   handle pendingPrize rồi trừ **đúng số actually transferred** — winner nhận
   prize, người khác chuyển enc(0), **cùng một code path duy nhất**. Đây là
   thiết kế chống leak: một require phân biệt winner/non-winner sẽ biến
   revert-vs-success thành oracle công khai. Bằng chứng đo được ở §4 — winner
   và non-winner trùng nhau tuyệt đối cả HCU, depth lẫn gas. Claim lần hai
   chuyển 0, không revert (R9). Hàm này **lệch CEI có chủ đích** (transfer
   trước khi trừ) vì sub-by-actual cần handle trả về; an toàn nhờ
   `confidentialTransfer` không callback ngược + `nonReentrant`, có comment tại
   chỗ để reviewer không tưởng là sót.

   **`startNewEpoch()`** — permissionless (rule #7 tinh thần: không ai độc
   quyền liveness), require `phase == Settled`. Reset ≤32 participant trong 1
   tx: `twabArea = enc(0)`, `won = enc(false)`, `lastCheckpoint = start mới`.
   **KHÔNG đụng `principal`, KHÔNG BAO GIỜ đụng `pendingPrize`** (B3) — winner
   không claim ở epoch N vẫn nhận đủ ở epoch N+3, có test cross-epoch pin.
   Epoch mới `start = block.timestamp` chứ không backfill `prev.end`: backfill
   sinh epoch degenerate (thậm chí đã hết hạn ngay khi mở) nếu keeper trễ; đổi
   lại khoảng `[prev.end, newStart]` không tính twab cho ai — ghi ở
   KNOWN_LIMITATIONS §6. Race 2 tx cùng lúc: 1 pass, 1 revert `WrongPhase`.

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

**Day 5** — `test/PayDayPot.prize.ts`, 35 tests: funding (fund tăng
`prizeAmountOf` + balance pot; non-employer ×3 vai revert; amount 0 revert;
**R12** fund quá backing → revert ERC-20, state không đổi; fund khi paused
revert; defund happy path; **defund khi paused OK** — D3; defund quá
`prizeAmount` revert); **gate carry-commit** (fund/defund sau `requestRandom`
revert — B2; fund *và* defund trên empty-pool Settled đều revert, rồi epoch sau
chứng minh winner nhận đủ và mọi principal rút đủ; fund/defund ở
`Drawing && !drawn` **thành công** — chứng minh gate không giết đường D3);
claim (**R9** winner đúng một lần, lần hai chuyển 0 không revert, non-winner
chuyển 0 không revert, chưa scan → `NothingToClaim`, chưa register →
`NotRegistered`, **claim khi paused vẫn chạy**); bảo toàn (claim không đổi
`principalOf` của bất kỳ ai, `totalPrincipal` bất biến qua fund/draw/claim);
**B4** rollover với prize dương (1,000 roll → winner epoch sau nhận 1,500) và
carry tích luỹ 2 epoch liên tiếp; **D9** pool rỗng (`beginSnapshot` đi thẳng
Settled, `requestRandom` revert `WrongPhase`, prize roll sang epoch sau);
lifecycle (`startNewEpoch` trước Settled revert; sau reset thì `twabAreaOf` =
enc(0) user decrypt được, `lastCheckpointOf` == start mới, `principalOf` và
`pendingPrizeOf` KHÔNG đổi; deposit mở lại; race 2 tx); cross-epoch claim; ACL
âm cho `prizeCipherOf`/`prizeCarry` + event hygiene cho 4 event mới.
`test/PayDayPot.property.ts` mở rộng: random-op fuzz giờ có fund/defund/claim
xen kẽ, và invariant solvency đọc **hoàn toàn từ chain state** (`phase`,
`drawProgress`, `selectedAny`, `prizeCipherOf`, `prizeCarry`, `prizeAmountOf`)
nên không thể "đồng ý" với bug bằng cách dùng chung giả định với contract; có
counter ép mọi nhánh phải chạy thật (fund/defund thành công, clamp ví, refund
cap, epoch có winner **và** epoch không winner) — vòng fuzz đầu tiên pass rỗng
đúng vì lý do đó. HCU Day 5: bảng §4. Demo: `pnpm demo:day5` (12 beat, sentinel
`BUG:` / `PRIVACY BREACH:`).
