# Day 4 Handoff — 24/08/2026 (label plan: 22/08, trễ 2 ngày — vẫn trong buffer, freeze 04/09)

Draw engine ship xong: random đúng-1-lần, ticket P-2 multiply-high, cumulative
scan chọn đúng-1-encrypted-winner, award line đã nằm trong loop. Suite
**103 tests xanh** (74 cũ + 26 draw + 3 HCU Day 4). Merge `dev` → `main` khi
gate đạt.

## Trạng thái gate (từ EXECUTION_PLAN Day 4)

| Gate | Trạng thái |
|---|---|
| Không tồn tại `% encryptedTotal` / `FHE.div` / `FHE.rem` | ✅ grep sạch (chỉ match comment) |
| Random đúng 1 lần/epoch, không reroll | ✅ `AlreadyDrawn` + random/ticket handle equality |
| Ví lạ tiếp tục draw từ cursor (R4) | ✅ stranger `selectBatch(32)` hoàn tất scan, winner bất biến |
| Keeper không cung cấp seed/weight/winner | ✅ `requestRandom()` zero-input ở mức ABI (có test soi signature) |
| Full capped draw vừa bounded tx trên HCU đo thật | ✅ marginal 574k/162k → ceiling 22/tx → pool 32 = 2 tx; test fail nếu ceiling < 8 |

## Demo (chạy lại được ngay)

```bash
cd packages/contracts && pnpm demo:day4
```

Beats: 3 savers staggered deposit → payday snapshot → **pause chặn
requestRandom rồi unpause chạy tiếp** (R10) → keeper trigger KHÔNG tham số →
reroll bị `AlreadyDrawn` (R5) → **ví lạ hoàn tất scan** (R4) → [mock-only]
đúng 1 won flag, ticket khớp `⌊R·T/2^64⌋` → employer/keeper bị từ chối decrypt
random, **winner bị từ chối decrypt chính won flag của mình** (§15.1) →
pendingPrize decrypt = 0 (funding Day 5).

## HCU đo thật Day 4 (bảng đầy đủ: `docs/DRAW_PROTOCOL.md` §4)

| Tx | globalHCU | maxHCUDepth | gas |
|---|---:|---:|---:|
| `requestRandom` | 1,747,160 | 1,747,064 | 324,659 |
| `selectBatch(1)` | 574,066 | 550,032 | 341,968 |
| `selectBatch(7)` | 4,018,078 | 1,522,000 | 1,568,611 |

Marginal scan ≈574k global / ≈162k depth → **ceiling 22 participants/tx**
(headroom 20%), default keeper `maxSteps = 8`. `FheMul` euint128 non-scalar =
1,686,000 HCU — op đắt nhất hệ thống, chạy đúng 1 lần/epoch trong requestRandom.

## Files chính hôm nay

- `packages/contracts/contracts/PayDayPot.sol` — `requestRandom()` +
  `selectBatch(maxSteps)` + `_scanParticipant` (7 FHE op đồng nhất); struct
  `Epoch` += `ticket/cumulative/selectedAny/selectCursor/prizeAmount`,
  `Account` += `won`; errors `AlreadyDrawn/NotDrawn/SelectionComplete`; events
  `RandomRequested/SelectProgress/DrawCompleted`; views `drawProgress/wonOf/
  pendingPrizeOf/drawStateOf/prizeAmountOf`.
- `packages/contracts/contracts/mocks/TicketMathHarness.sol` — test-only,
  biên max-R × max-T (R không inject được vào pot theo thiết kế #7).
- `packages/contracts/test/PayDayPot.draw.ts` — 26 tests (chi tiết:
  DRAW_PROTOCOL §7).
- `packages/contracts/test/PayDayPot.hcu.ts` — describe "Day 4: draw".
- `packages/contracts/demo/demo-day4.ts` + script `demo:day4`.
- Docs: DRAW_PROTOCOL (§4/§5/§6/§7), ERROR_RECOVERY_MATRIX (R4/R5 ◐ contract
  ✅), KNOWN_LIMITATIONS (§7 pause-treo D2), COMPATIBILITY_NOTES (quirk #17
  mock rand, #18 giá HCU draw), EXECUTION_PLAN (Day 4 ✅ + scorecard).

## Quyết định đã chốt hôm nay

1. **4-phase giữ nguyên** — RandomReady/Selecting là sub-state của `Drawing`
   qua `drawn` + `selectCursor` (EXECUTION_PLAN Day 4 bullet 1 bị override
   tường minh trong plan, đã annotate).
2. **`selectCursor` là field MỚI** — không tái dùng `snapshotCursor` (giữ ngữ
   nghĩa view `snapshotProgress` "x/32 frozen" cho UI R4; §17.3 vốn có
   selectionCursor riêng). View mới `drawProgress(epochId)`.
3. **Award line trong loop từ Day 4** với `prizeAmount` public uint64 mặc
   định 0 — batch ceiling là exit gate đo trên đúng hình dạng loop cuối cùng,
   Day 5 KHÔNG được thêm op vào loop.
4. **`Account.won` contract-only ACL** (`allowThis`, KHÔNG `allow(user)`) —
   khớp §15.1 "Winner flags → Contract only"; kênh reveal cho user là
   `pendingPrize` (user-ACL, grant đồng loạt mọi participant sau scan —
   uniform, không leak ai thắng).
5. **Bỏ term `hasWeight`** khỏi công thức hit — chứng minh 2 dòng trong
   DRAW_PROTOCOL §6.3 (zero-weight không tăng cumulative → không tạo crossing
   mới; latch chặn double-hit). Test pin refunded-registrant giữa list.
6. **Event hygiene test soi log theo address**: receipt mock chứa cả log của
   FHEVM coprocessor/ACL — filter `log.address == potAddress` trước khi
   assert (luật #5 áp cho event CỦA POT).

## Kỹ thuật test đáng giữ (dùng lại Day 5)

- `fhevm.debugger.decryptEbool(handle)` — đọc won/selectedAny mock-only,
  label "[mock-only inspection]".
- **Exact-replication pattern**: decrypt R/T/areas qua debugger → prefix-sum
  plain bigint → dự đoán winner → so từng flag. Mọi assertion exact.
- **Cross-tx carry**: `selectBatch(1)` rồi assert intermediate
  (`cumulative == area[0]`, `selectedAny == (ticket < area[0])`) trước khi
  chạy tiếp — chứng minh state carry đúng qua biên tx mà không cần điều khiển
  random.
- **Monte Carlo không replay được** (quirk #17: mock FheRand =
  `ethers.randomBytes`, crypto-random) → log R/ticket/winner mỗi sample;
  band ±3.5σ; **weight nhẹ nhất đứng ĐẦU list** để band chặt nhất (p=0.1)
  nằm đúng chỗ bug "first-always-wins" xuất hiện.
- Harness pattern cho op chain không inject được input qua product path.

## Đang dở / chờ

- `prizeAmount` đang mặc định 0 mọi epoch — funding setter là việc Day 5.
- Phase ở lại `Drawing` sau `DrawCompleted` — chuyển `Settled` là claim-side
  Day 5.
- Sepolia deploy CHẶN tới Day 9 (freeze ABI Day 5 trước).
- 3 file social day-03 vẫn dirty trên working tree — KHÔNG add vào commit
  (chờ user đăng).

## Việc đầu tiên Day 5 — RÀNG BUỘC TỪ DAY 4 (đọc trước khi viết dòng code nào)

1. **(B2) Funding setter phải revert khi `ep.drawn`** — `prizeAmount` bất
   biến kể từ lúc random chốt. Scan đọc `prizeAmount` qua
   `FHE.asEuint64(ep.prizeAmount)` MỖI tx selectBatch: đổi prize giữa 2 batch
   = 2 winner tiềm năng thấy 2 số khác nhau → double-liability. Fund trước
   `requestRandom` vẫn an toàn (ticket không phụ thuộc prize).
2. **(B3) `startNewEpoch` require `drawn && selectCursor == count`** (hoặc
   rollover tường minh) — mở epoch mới khi epoch cũ chưa scan xong = orphan
   epoch ở Drawing, mất prize + `won`/`pendingPrize` dở dang.
3. **(B3) Reset khi mở epoch mới**: `won` (flag thuộc epoch), `twabArea`,
   `lastCheckpoint = newStart` — nhưng **KHÔNG BAO GIỜ reset `pendingPrize`**
   (liability chưa claim, cộng dồn qua epoch).
4. **(D3) Prize recovery cho epoch không bao giờ drawn** — nếu owner pause
   vĩnh viễn trước requestRandom (KNOWN_LIMITATIONS §7), prize đã fund phải
   có đường về (employer reclaim khi epoch bị bỏ, hoặc rollover sang epoch
   mới) — không được kẹt vĩnh viễn.
5. **(B4) Re-run T=0 rollover với prize DƯƠNG** — test Day 4 chứng minh
   "không ai được cộng prize" nhưng prize = 0; Day 5 fund thật rồi chạy lại
   để chứng minh rollover giữ nguyên số tiền.
6. **(D9) Câu hỏi mở**: settle epoch rỗng (0 participant) có require `drawn`
   không? `requestRandom` trên pool rỗng vẫn chạy được (emit DrawCompleted
   cùng tx) nhưng bắt keeper đốt 1.75M HCU để "draw" pool rỗng là vô nghĩa —
   cân nhắc cho settle thẳng khi `participantCount == 0`.

Ngoài ra theo EXECUTION_PLAN Day 5: employer funding (public uint64, không
allocate quá backing — R12), `claim()` idempotent không `claimFor` (R9),
finalize/reset không đụng principal, integration script 3 người full cycle,
PRIVACY.md + THREAT_MODEL.md draft.

## Số liệu

- Tests: **103 passing** (Day 1: 11 → Day 2: 43 → Day 3: 74 → Day 4: 103).
- Monte Carlo mẫu chạy thật: wins [6, 26, 32]/64 @ 1:3:6 (expect 6.4/19.2/38.4,
  band ±3.5σ) — trong band, không đụng biên.
- HCU: requestRandom 1.747M / scan marginal 574k / ceiling 22/tx / pool 32 = 2 tx.
- Toàn suite chạy ~13s local (Monte Carlo ~5s trong đó).
