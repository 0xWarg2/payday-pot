# Day 3 Handoff — 23/08/2026 (label plan: 21/08, trễ 2 ngày — vẫn trong buffer, freeze 04/09)

**Git flow MỚI từ hôm nay (rule trong CLAUDE.md, commit `a03844d`)**: mọi thay
đổi commit trên branch **`dev`**, chỉ merge `--no-ff` vào `main` khi exit gate
P0 của ngày đạt. Repo public: <https://github.com/0xWarg2/payday-pot>.

## Trạng thái gate (từ EXECUTION_PLAN Day 3)

| Gate item | Trạng thái |
|---|---|
| TWAB scenarios khớp **exact** (2:1, step≡flat, last-second, delayed snapshot, withdraw sau cutoff) | ✅ 26 tests mới, mọi tx pin `time.setNextBlockTimestamp`, assert bigint equality — không approximation |
| Snapshot dùng `epochEnd`, không phải thời điểm chạy | ✅ snapshot trễ 3 ngày → weight y hệt (test + clamp `min(now, end)` trong `_checkpoint`) |
| Withdraw sống trong snapshot | ✅ withdrawAll xanh trong Snapshotting, xanh cả khi **paused + Snapshotting đồng thời** (R10 contract-full) |
| Caps enforced + documented | ✅ boundary: constructor product `== 2^64` → `InvalidConfig`; max-accrual 99.85% của 2^64 decrypt đúng từng đơn vị — `euint64` đủ, không cần promote |
| Đo HCU thực tế → `DRAW_PROTOCOL.md` | ✅ bảng đo thật + marginal ≈689k/participant + **batch ceiling 21/tx** (sửa ước lượng ~29 của P-3) |
| Toàn bộ tests xanh local | ✅ **74 passing** (43 cũ nguyên vẹn + 26 TWAB + 5 HCU Day 3) |
| Demo 1 lệnh | ✅ `pnpm demo:day3` |

## Demo (chạy lại được ngay)

```bash
cd "packages/contracts" && pnpm demo:day3
```

Narration tiếng Anh. Expected flow: Jimmer deposit enc(6,000) tại giờ thứ 1 →
Warg deposit enc(6,000) đúng **midpoint** ("same money, HALF the time") → 1 ngày
sau payday deposit bị `WrongPhase` ("entries closed AT the bell") → keeper lạ
`beginSnapshot` (permissionless) → `snapshotBatch(1)` freeze Jimmer, cursor 1/2 →
**Jimmer `withdrawAll` GIỮA snapshot**, ví về đủ 10,000, frozen weight giữ nguyên
→ **employer** đẩy batch cuối ("anyone may turn the crank, nobody gets a peek") →
decrypt: Jimmer `3,607,200,000,000,000` = đúng **2×** Warg `1,803,600,000,000,000`
(hard assert) → employer decrypt weight bị DENIED → totalWeight khớp tổng
(debugger, label "[mock-only inspection]") → HCU recap. Kết thúc `1 passing`.

## HCU đo thật Day 3 (bảng đầy đủ + công thức: `docs/DRAW_PROTOCOL.md` §4)

| Tx | globalHCU (limit 20M) | maxHCUDepth (limit 5M) |
|---|---|---|
| Deposit lặp + **accrual** | 2,606,192 | 780,000 |
| withdrawAll + accrual | 1,437,064 | 527,000 |
| `beginSnapshot` | **32** (trivialEncrypt rẻ hơn dự đoán 18×) | 32 |
| `snapshotBatch(1)` | 689,000 | 689,000 |
| `snapshotBatch(7)` | 4,823,192 | 1,661,000 |

Marginal ≈**689k global / 162k depth** mỗi participant chưa frozen → ceiling
80% headroom = `min(23 global, 21 depth)` = **21/tx**, pool 32 người = 2 tx
batch 16+16. Default keeper/demo Day 4: `maxSteps = 8`. Test hcu.ts tự fail
nếu ceiling tụt dưới 8.

## Files chính hôm nay

- `PayDayPot.sol` (~467 dòng): `_checkpoint` body (clamp + scalar mul + ACL
  user-only), deposit time-gate tại `end`, `beginSnapshot()` +
  `snapshotBatch(uint32)` permissionless, views `twabAreaOf`/`totalWeightOf`/
  `snapshotProgress`/`lastCheckpointOf`, events counter-only.
- `test/PayDayPot.twab.ts` (mới, 26 tests) · `test/PayDayPot.hcu.ts` (thêm
  describe Day 3, fixture 8 người s[10..17]) · `demo/demo-day3.ts` + script.
- Docs: **`docs/DRAW_PROTOCOL.md` (MỚI — exit-gate artifact, spec ràng buộc
  Day 4)** · KNOWN_LIMITATIONS §6 (deposit-dead-window) · R10 contract-full
  trong ERROR_RECOVERY_MATRIX · EXECUTION_PLAN Day 3 ticks + scorecard.

## Quyết định đã chốt hôm nay

1. **Giữ enum 4 phase** `{Open, Snapshotting, Drawing, Settled}` — RandomReady/
   Selecting của plan cũ là sub-state của Drawing qua `drawn` + cursor
   (DRAW_PROTOCOL §1). Không thêm enum value để tránh state desync.
2. **Deposit đóng tại `epochEnd` chứ không phải tại `beginSnapshot`** — freeze
   participant list là behavioral (append-only + callback time-gated), không
   copy state. Trade-off: deposit-dead-window tới Day 5 (KNOWN_LIMITATIONS §6).
3. **Snapshot KHÔNG pausable** (có chủ đích): pause snapshot chỉ tạo
   owner-liveness dependency cho việc resolve epoch đã kết thúc. `whenNotPaused`
   sẽ đặt ở random request Day 4 — chỗ duy nhất ngoài deposit.
4. **Short-circuit plaintext trong `_checkpoint`** (`last == 0 || elapsed == 0`)
   hợp lệ — điều kiện đọc từ timestamp + `lastCheckpointOf` đều public sẵn,
   không đụng bit encrypted nào; tiết kiệm ~530k HCU mỗi no-op, làm re-run
   batch rẻ. Rule "same logical work" chỉ áp cho branch trên **encrypted**.
5. **`euint64` đủ cho twabArea** — constructor guard P-3 + test max-accrual
   99.85% của 2^64 exact. Spec cũ §17.3 (promote euint128 cho accrual) bị
   override; promote chỉ còn ở ticket math Day 4.
6. **Ordering proof withdraw-sau-cutoff** (kịch bản winner S3 bị chất vấn):
   `_debitAndTransfer` checkpoint **trước** debit → withdraw sau `end` accrue
   nốt tới `end` rồi mới trừ tiền; batch slot tới sau hit `elapsed == 0` →
   handle twabArea không đổi (test pin handle equality). Rút tiền sau payday
   không đổi một đơn vị weight nào.

## Kỹ thuật test đáng giữ (dùng lại Day 4)

- `time.setNextBlockTimestamp` (hardhat-network-helpers v1 classic — chạy tốt
  với FHEVM plugin) trước **mọi** mutating tx → exact equality. Encrypt input
  **trước** khi pin (encrypt không tạo block, nhưng giữ thói quen này để
  timestamp không bị block lạ nuốt). Tx revert **vẫn nuốt** timestamp đã pin.
- Hai deposit cùng timestamp là bất khả thi (block sau phải tăng strict) —
  test step≡flat dùng arithmetic identity trên 1 user thay vì 2 user cùng lúc.
- ACL negative tests cần **lịch sử phân kỳ** (khác amount VÀ khác thời điểm)
  vì handle aliasing (quirk #10).
- `revertedWithCustomError(factory, "InvalidConfig")` hoạt động với
  ContractFactory (có `.interface`) — dùng cho constructor revert.

## Đang dở / chờ

- **Refund-on-ebool-false chỉ verify local (OZ 0.5.3)** — recheck Day 9
  (mang từ Day 2, không đổi).
- UI-half của R2/R10/R15 + banner "entries closed" (KNOWN_LIMITATIONS §6) chờ Day 7.
- Side task EXECUTION_PLAN dòng ~312 (mở form Zama S4 tới bước 3, ghi field
  thật): best-effort cuối session — nếu chưa làm thì Day 4 làm.
- Cursor reuse cho select phase (DRAW_PROTOCOL §6.5): quyết lúc viết Day 4.

## Việc đầu tiên Day 4

Đọc `docs/DRAW_PROTOCOL.md` §6 (ràng buộc viết sẵn cho Day 4) rồi implement
**random request một-lần**: require `phase == Drawing && !drawn`,
`FHE.randEuint64()` trong state-changing tx, set `drawn = true` cùng tx, gắn
`whenNotPaused` (chỗ duy nhất ngoài deposit), reroll → revert (R5). Keeper
trigger-only. Sau đó ticket math P-2: promote `euint128`,
`FHE.mul(random, totalWeight)`, **`FHE.shr(product, 64)`** — tuyệt đối không
`FHE.div`. Batch scan dùng lại pattern cursor của snapshot.

## Số liệu

- Test suite: **74 passing** (43 Day 1–2 nguyên vẹn + 26 TWAB + 5 HCU Day 3), demo:day3 `1 passing (~189ms)`.
- Batch ceiling đo thật: **21 participants/tx** (depth-bound) — pool 32 = 2 tx.
- Branch `dev` trước merge: 7 commits ahead `main` (social leftovers, CLAUDE.md
  git-flow, `_checkpoint`, phase machine, 26 tests, HCU+demo, docs Day 3).
- Không pin dependency mới hôm nay.
