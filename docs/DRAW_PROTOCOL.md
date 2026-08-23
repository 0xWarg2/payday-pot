# DRAW_PROTOCOL — PayDay Pot

Giao thức draw end-to-end: TWAB accrual → freeze → random → weighted selection
→ prize. File này là **exit gate Day 3** (phần TWAB/snapshot + HCU đo thật) và
là spec ràng buộc cho Day 4 (random + selection). Cập nhật: Day 3 (23/08/2026).

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

## 5. ACL của weight — đúng policy của principal

| Handle | Ai decrypt được | Ghi chú |
|---|---|---|
| `twabAreaOf(user)` | **chỉ user** (+ contract) | employer/keeper/owner: DENIED — có negative test với lịch sử phân kỳ (quirk #10) |
| `totalWeightOf(epochId)` | **không ai** (contract-only) | Day 4 tiêu thụ bên trong FHE ops; test nhìn qua `fhevm.debugger` (mock-only, không phải product path) |

Handle chưa init (chưa từng accrual / chưa `beginSnapshot`) = `bytes32(0)` —
UI **phải render "unavailable", không bao giờ render 0** (non-negotiable #8,
có test pin cho registrant bị refund).

Events snapshot chỉ mang **public counters** (`participantCount`, `cursor`) —
không amount, không weight, encrypted hay plaintext.

## 6. Day 4 sẽ thêm (ràng buộc từ hôm nay)

1. **Random request** (một-lần, sau khi `phase == Drawing && !drawn`):
   `FHE.randEuint64()` trong state-changing tx; set `drawn = true` **cùng tx**;
   không reroll (R5 — gọi lại revert). Đây là chỗ **duy nhất** gắn
   `whenNotPaused` ngoài deposit. Keeper chỉ trigger — không seed, không
   weight, không winner (non-negotiable #7).
2. **Ticket math (P-2)**: promote `euint128`, `FHE.mul(random, totalWeight)`,
   rồi **`FHE.shr(product, 64)`** — tuyệt đối không `FHE.div` (37k vs 1.2k HCU,
   và div encrypted-divisor không tồn tại). Kết quả `ticket ∈ [0, totalWeight)`.
3. **Cumulative scan** (batch theo cursor như snapshot, permissionless):
   `hit = FHE.and(FHE.lt(ticket, cumulative + areaᵢ), FHE.not(selectedAny))` →
   `FHE.select` để award — không `if (ebool)`, không encrypted index, mọi
   participant cùng khối lượng op. Budget: scan 1 participant ≈ 1 mul-free
   chain add/lt/select — đo lại trước khi chốt batch size Day 4, ceiling từ §4
   là trần trên (scan rẻ hơn snapshot vì không có scalar mul).
4. **Zero-weight rollover**: `totalWeight == 0` (pool rỗng hoặc toàn
   refunded-registrant) → không decrypt total, không winner, prize giữ cho
   epoch sau. Phát hiện qua plaintext `participantCount == 0` hoặc qua kết quả
   select toàn-zero — không bao giờ reveal total.
5. **Cursor reuse**: `snapshotCursor` kết thúc Day 3 ở giá trị `== count`;
   Day 4 quyết định tái dùng field này cho select cursor (reset về 0 khi
   `drawn = true`) hay thêm field mới — chọn lúc viết, ghi lại vào file này.

## 7. Test coverage của giao thức (Day 3)

`test/PayDayPot.twab.ts` — 26 tests, mọi tx pin `time.setNextBlockTimestamp`,
mọi assertion là **exact bigint equality**: tỷ lệ 2:1; step-deposit ≡ flat-75;
last-second = amount×1s; snapshot trễ 3 ngày; withdraw giữa/sau epoch; partial
withdraw giữa snapshot (handle equality); refunded registrant; biên phase tại
`end` (deposit E−1 ok / E fail; begin E−1 fail / E ok); zero-participant;
cursor + permissionless continue; batch(0); Σ weights == totalWeight; R10
paused+Snapshotting; ACL 4 chiều; biên constructor 2^64; max-accrual 99.85%
2^64. HCU: `test/PayDayPot.hcu.ts` (bảng §4 tự in mỗi lần chạy).
Demo: `pnpm demo:day3`.
