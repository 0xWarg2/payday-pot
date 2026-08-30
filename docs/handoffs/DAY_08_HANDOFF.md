# Day 8 Handoff — 29/08/2026 (label plan: 26/08, trễ 3 ngày — buffer còn 6 ngày trước freeze 04/09 18:00 ICT)

**Draw Room xong, và thứ chứng minh nó không gian lận không nằm ở lời hứa nào
trên màn hình — nằm ở chỗ xoá sạch `localStorage` + `sessionStorage`, reload,
rồi so từng ký tự thấy đúng con số cũ.** Trang này không nhớ gì về vòng quay;
cursor sống trên chain. Đó là câu trả lời cho "kill keeper giữa chừng thì sao",
và nó là một assert `toBe()` chứ không phải một câu quảng cáo.

Phần còn lại của ngày là **trả nợ ma trận lỗi**: 5 dòng nợ từ Day 7 (R1 R4 R5
R9 R12) cộng 5 dòng chưa có bằng chứng đủ 3 điều kiện (R6 R7 R8 R11 R13).
Hết ngày: **14/15 dòng đóng**. Dòng còn lại là R1, và nó không thiếu code.

## Trạng thái gate (từ EXECUTION_PLAN Day 8)

| Gate | Trạng thái |
|---|---|
| Browser E2E xanh | ✅ **70** xanh / 6 skipped — `draw` 16 · `privacy` 11 · `savings` 9 · `recovery` 7 · `shell` 5 · `smoke` 1 |
| Draw resume sau khi kill keeper | ✅ `draw.spec.ts:93` — wipe storage → reload → fingerprint (stage status + cursor + keeper state) **giống hệt** |
| Claim đòi positive reveal + finalized | ✅ `claim-open-review` disabled + `claim-gate` nói lý do; contract Day 5 đã chặn thật (`claim()` uniform 748,032 HCU) |
| Withdrawal reachable từ Draw Room | ✅ `draw-withdraw-link` → `/app/savings`, có test + có trong demo |
| Mọi dòng ngày-6/7/8 trong ma trận đã tick (UI + action + test) | ◐ **14/15** — còn **R1**, xem §R1 |
| Sealed result: winner ≡ loser trước reveal | ✅ so DOM hai profile ký tự-đối-ký tự (`draw.spec.ts:151`) |
| Fairness Receipt là tab trong Draw Room | ✅ `draw-tab-receipt` — facts · log · **absences** |
| Reload tại approval / deposit pending / draw cursor / claim pending | ✅ `recovery.spec.ts` (R11, R13) + `draw.spec.ts` (cursor) |
| QA mobile / keyboard / reduced motion / privacy | ✅ project `mobile-320` quét 6 route (có `/app/draws/current`) · arrow-key tab nav · `prefers-reduced-motion` · `privacy.spec.ts` 11 test |

**Gate Day 8: 4/5 dòng đạt.** Dòng thứ 5 ("mọi dòng ma trận đã tick") còn hở
1/15 → theo luật của chính EXECUTION_PLAN, Day 8 là ◐ chứ không phải ✅.

**Hai dòng ⛔ của Day 7 vẫn ⛔** (deposit/withdraw thật + employer fund thật).
Vẫn là việc của người, không phải thiếu code — xem §CẦN ANH LÀM. `dev` **chưa
merge `main`**.

## Demo

```bash
cd apps/web && pnpm demo:day8        # chạy + dựng MP4
cd apps/web && pnpm demo:day8:run    # chỉ chạy Playwright
```

14 beat / 5 clip / **4m08s**, `demo-results/payday-pot-day8.mp4` (1280×720,
3.20 MB — đo bằng `ffprobe`, không ước lượng). Phụ đề tiếng Anh burn trong
pixel, cùng cơ chế `demo/narrate.ts` của Day 7 (vẽ vào DOM lúc quay, mỗi dòng
giữ đúng thời gian đọc).

Chạy **có màn hình** (mặc định) một lần bị đứt giữa chừng ở clip 3: cửa sổ
Chrome chết, Playwright báo `page.waitForTimeout: Target page, context or
browser has been closed` tại `narrate.ts:69` — dòng thuyết minh ĐẦU TIÊN của
clip đó, tức trang đã chết trước khi có assert nào chạy. Không assert nào fail;
`mode: "serial"` nên 2 clip sau không chạy. Chạy lại **`DEMO_HEADLESS=1
pnpm demo:day8`** thì 5/5 xanh trong 4.1 phút. Kết luận: hỏng ở cửa sổ trình
duyệt, không phải ở sản phẩm — nhưng đừng lấy lần chạy có màn hình làm bằng
chứng gate, **quay reel nộp thì luôn `DEMO_HEADLESS=1`**.

Beat 4–5 là **beat của exit gate**: in fingerprint ra màn hình → xoá storage →
reload → in lại → giống hệt. Beat 11–13 là R1. Beat 14 là đường ra tiền.

⚠️ Hai cái bẫy quanh file MP4, đã dính cả hai hôm nay:
- `node demo/build-mp4.mjs` **không tham số** ghi ra `payday-pot-day7.mp4` —
  chạy nhầm sau khi quay Day 8 là đè mất reel Day 7. Script giờ nhận tham số
  ngày: `node demo/build-mp4.mjs day8` (COMPATIBILITY_NOTES #40).
- `demo-results/` bị **xoá sạch đầu mỗi lần chạy**, nên quay Day N là mất reel
  Day N−1 kể cả khi tên file đã đúng. Reel nào định nộp đã copy sang
  **`apps/web/demo-reels/`** (gitignored, không bị xoá). Hiện có
  `payday-pot-day7.mp4` (3.5 MB / 4m08s) và `payday-pot-day8.mp4` (3.20 MB /
  4m08s, quay lại 30/08 trên build có card dashboard mới).

## Files chính hôm nay

| | |
|---|---|
| Routes | `/app/draws/current` · `/app/draws/[drawId]` (id sai → 404 thật, không phải màn trắng) |
| Draw Room | `components/draw/` — `DrawRoom` · `DrawRoomHeader` · `DrawPhaseTimeline` · `KeeperPanel` · `SealedResultCard` · `ClaimReviewDialog` · `PrivateEntryCard` · `FairnessReceipt` · `EncryptedDrawOrb` · `DrawSurface` |
| Logic | `lib/draw/` — `room.ts` (phase → stage machine) · `actions.ts` (keeper tx) · `receipt.ts` (fairness facts + absences) · `use-epoch.ts` |
| Test browser | `e2e/draw.spec.ts` (16) · **`e2e/recovery.spec.ts` (7 — R1/R11/R13)** |
| Test unit | `test/draw-room.test.tsx` (28) · `test/classify-read-error.test.ts` (+2 pin selector R1) |
| Demo | `demo/demo-day8.spec.ts` · `demo/build-mp4.mjs` (thêm tham số ngày) |
| Docs | `docs/ERROR_RECOVERY_MATRIX.md` (viết lại toàn bộ cột bằng chứng) · `COMPATIBILITY_NOTES.md` §11 (#35–40) |

## Quyết định đã chốt hôm nay

1. **Onchain cursor là nguồn sự thật duy nhất của Draw Room.** Không cache,
   không optimistic step counter, không nhớ "đang ở bước mấy". Hệ quả: người lạ
   mở phòng trên máy khác thấy đúng bước tiếp theo, và `Continue` của họ hợp lệ.
2. **Fingerprint là cách duy nhất kiểm được điều trên.** So từng ký tự
   `{stage id, status, progress text, keeper state}` trước và sau khi xoá
   storage. Assert từng phần tử rời rạc thì bỏ lọt đúng cái mình sợ.
3. **`keeper-progress` và `claim-open-review` chỉ tồn tại ở đúng phase** — test
   và demo rẽ nhánh theo `count()`. Nhánh "không có" vẫn phải chứng minh chỗ đó
   **không để trống**: phải nói ra lý do (COMPATIBILITY_NOTES #39).
4. **Không ship nút dẫn vào ngõ cụt.** Lý do R1 vẫn ◐ chứ không phải ✅ — chi
   tiết ngay dưới.
5. **Stub RPC chỉ dàn dựng đúng 2 lời gọi**, phần còn lại đi ra Sepolia thật và
   ghép lại theo `id`. Stub nhiều hơn thì test quay ra kiểm chính cái stub.

## R1 — dòng duy nhất còn nợ, và nó thiếu tiền chứ không thiếu code

Hôm nay probe read-only (eth_call, **không khoá, không gas**) vào cUSDC live
`0x7c5BF43B…3639` và đóng được 2/3 ẩn số:

- `finalizeUnwrap(bytes32,uint64,bytes)` **tồn tại đúng như `CUSDC_ABI` đang
  pin**. Biến thể `bytes[]` kiểu FHEVM-oracle và biến thể `uint256` **không tồn
  tại** — đừng sửa ABI theo docs version khác.
- requestId lạ revert `0xd1630f8e` = `InvalidUnwrapRequest(bytes32)`. Đây là
  bản lề của R1: unwrap đã bị người khác finalize xong thì lần gọi sau **revert**,
  và taxonomy phải đọc nó thành *"cái này xong rồi"*. `errors.ts` đã map từ Day 6
  (`unwrap-request-gone`, `retryable: false`); giờ có test pin selector.

Ẩn số còn lại: **nội dung tham số `signatures`** — gần như chắc là
`decryptionProof` của `publicDecrypt()`, nhưng không xác minh được nếu không có
**một unwrap đang treo thật trên ví có tiền**. CLAUDE.md cấm dựng abstraction
FHE/ERC-7984 trước khi verify; ma trận cấm nút dẫn vào ngõ cụt. Nên nút
*Resume finalize* chưa ship.

Người dùng **không kẹt**: banner nói đủ sự thật (bước 1 xong, bước 2 chưa,
**không mất gì**) và đưa 3 đường đi thật — Etherscan · giới hạn đã biết · hỏi
lại chain (idempotent, có test). Chỉ thiếu cú one-click.

## Bug thật Day 8 tìm ra

1. **R5 có UI, không có test.** `seed-locked` được render từ Day 4 nhưng chưa ai
   kiểm nó nói đúng ba điều (không quay lại được · không bởi bất kỳ ai · gửi lại
   cùng cursor là an toàn) và nói **suốt** giai đoạn Drawing chứ không đợi tới
   lúc một batch fail. 3 test mới.
2. **R13 có UI + unit, không có browser test.** Một trong bốn dòng brief gọi tên.
   Giờ có test thật: gõ 5 → chỉ hiện `Approve — step 1 of 2`, câu "Two
   signatures" hiện cùng lúc, ô nhập **không bị xoá**, và `Shield — step 2 of 2`
   count = 0.
3. **`fetch` của Node trong route handler của Playwright treo 10s rồi
   `ConnectTimeoutError`** (ra IPv6 tới publicnode). Phải dùng `route.fetch()`.
   Và body JSON-RPC có thể là **mảng** (ethers batch 10) — không tách ra thì
   stub nuốt cả batch (COMPATIBILITY_NOTES #38).
4. **`node demo/build-mp4.mjs` đè reel Day 7.** Đã sửa bằng tham số ngày.
5. **`READ_TIMEOUT = 60s` của `draw.spec.ts` chưa bao giờ có tác dụng** — timeout
   mặc định của Playwright là 30s và nó đè lên. Xanh suốt vì route luôn compile
   sẵn; xoá `.next` chạy nguội là đỏ ngay **test đầu tiên**, trông hệt lỗi sản
   phẩm. Đã nới cả file lên 120s (COMPATIBILITY_NOTES #41).
6. **Một lần relayer sập đọc thành lỗi luồng tiền.** Test "bấm ký hai lần" đỏ vì
   màn review không dựng được, trong khi app đã đi đúng nhánh R7 (input còn
   nguyên, chưa gửi gì). Sửa bằng `test.skip()` **có lý do**, không nới
   assertion (COMPATIBILITY_NOTES #42).

## Ma trận lỗi — trạng thái cuối ngày

**14/15 đóng đủ 3 điều kiện (UI + action + test):**
R2 R3 R4 R5 R6 R7 R8 R9 R10 R11 R12 R13 R14 R15.
**Còn:** R1 (chỉ thiếu nút *Resume finalize*, chặn bởi ví có tiền).

Cột bằng chứng của từng dòng đã viết lại — mỗi ✅ chỉ tên file + tên test, không
còn dòng nào tick bằng trí nhớ.

## Bổ sung 30/08 — card "vòng này" giờ có cửa, và nó không mời khi cửa khoá

Dòng cuối cùng của mục *Đang dở* hôm 29/08: dashboard có card vòng đang chạy
nhưng không có đường sang Draw Room. Card đó tự nói ra một câu rất mạnh —
**"Anyone can run it — it is not gated on an operator"** — rồi để người đọc
đứng đó. Đúng hình dạng mà ma trận lỗi cấm (nút dẫn vào ngõ cụt), chỉ khác
chiều: một lời mời không có cửa.

Sửa bằng đúng một ràng buộc chứ không phải một component: card **gọi thẳng
`keeperState()`** — cùng hàm Draw Room dùng — thay vì giữ bản sao luật riêng.
Hệ quả kéo theo:

- Nhãn link lấy từ `keeper.label`, tức **đúng chữ trên nút trong phòng**:
  *Freeze the next batch in the draw room* → sang phòng thấy *Freeze the next
  batch*. Không phải đoán mình có tới đúng chỗ không.
- Round còn đếm ngược → nhãn trung tính *Open the draw room*, và câu "anyone
  can run it" **biến mất** vì lúc đó không có gì để chạy.
- `requestRandom` bị pause chặn → cửa vẫn mở (phòng vẫn xem được), nhưng
  **không giục ai bấm một tx sẽ revert**. Đây là chỗ bản sao luật cũ sai mà
  không ai thấy: `pendingWork()` không biết gì về `paused`, nên card cũ vẫn nói
  "ai chạy cũng được" trong lúc phòng nói *on hold*.
- `WORK_COPY` (bảng chữ thứ hai cho cùng 5 bước) **xoá**; còn một nguồn chữ.

Bằng chứng, không phải mô tả:

| | |
|---|---|
| `test/dashboard.test.tsx` (4) | nhãn link **so với `keeperState().label`** chứ không so chuỗi gõ tay — test chỉ có nghĩa khi nó đọc chung hàm với sản phẩm · pause → không có "Anyone can run it" · không có pool → không có link |
| `e2e/draw.spec.ts` (+2) | `data-keeper` của card **`toBe()`** `data-state` của `keeper-state` trong phòng, sau khi click sang thật · nhãn "…in the draw room" chỉ xuất hiện khi phòng có bước chạy được |

Và một dòng nợ nhỏ từ chính bẫy MP4 hôm qua: `demo:day7` trong `package.json`
vẫn gọi `build-mp4.mjs` **không tham số** (chạy được nhờ default `day7`). Đã
truyền tham số tường minh — luật "luôn truyền tham số ngày" mà script còn một
chỗ ngoại lệ thì đó không phải luật.

**Không đụng tới:** contract (150 test giữ nguyên, ABI không đổi), R1, và hai
dòng ⛔ của Day 7.

## Đang dở / chờ

- Nút *Resume finalize* của R1 (§R1).
- Hai dòng ⛔ của gate Day 7.

*(`docs/social/day-07-*` đã commit `a03e0d3`; `day-08-*` commit hôm nay. Card
"vòng đang chạy" đã nối sang Draw Room — xem §Bổ sung 30/08.)*

## CẦN ANH LÀM — vẫn đúng 1 việc, y như Day 7

**Nạp 0.03 ETH cho ví employer `0x1cE8D5ff6E57a64E23cb28334315232A2e732D57`**
từ **Account 3** `0xd83064F0…90829a` — KHÔNG lấy của deployer `0x83b2…6877`.

Sau khi nạp, ~10 phút bấm tay, và lần này nó đóng **ba** thứ chứ không phải hai:
1. `/app/savings` → deposit thật → giá trị mới **masked** → reveal tươi →
   `Withdraw everything`. *(gate Day 7 dòng 1)*
2. `/employer` → fund prize thật. *(gate Day 7 dòng 2)*
3. Lúc unwrap, **đóng tab giữa hai bước** → mở lại → có unwrap treo thật →
   đủ điều kiện verify `signatures` và ship nút *Resume finalize*. *(R1)*

## Việc đầu tiên Day 9 — RÀNG BUỘC TỪ DAY 8

1. **Day 9 là Sepolia RC, không phải ngày thêm tính năng.** Còn 6 ngày buffer;
   đừng tiêu vào feature mới khi 2 dòng gate Day 7 vẫn hở.
2. **Đừng thiết kế lại read model.** `packages/sdk/src/pot.ts` +
   `lib/draw/room.ts` đã đủ cho mọi màn hình còn lại. Nối `/app` sang Draw Room
   là đọc thẳng `PotState`, không thêm store.
3. **Số của demo là số đo thật, không copy.** Mọi con số trong reel (748,032 /
   396,250 HCU · batch 21/22 · `0xd1630f8e`) đều đến từ test hoặc probe đang
   sống trong repo. Nếu đổi contract thì đổi cả câu thoại.
4. **`node demo/build-mp4.mjs <day>` — luôn truyền tham số.**
5. **R1 chỉ được tick ✅ khi nút *Resume finalize* chạy thật trên một request
   treo thật.** Không tick bằng "đã hiểu cơ chế".

## Số liệu

| | |
|---|---|
| Contract tests | **150** xanh — 19s |
| Web unit (vitest) | **265** xanh / 12 file — 2.6s (261 + 4 của §Bổ sung) |
| Playwright e2e | **72** xanh, 6 skipped — 51.7s cold (70 + 2 của §Bổ sung) |
| Demo Day 8 | **5/5** — 4.1 phút headless, MP4 4m08s / 3.20 MB (quay lại 30/08; lần chạy có màn hình chết cửa sổ, xem §Demo) |
| `tsc --noEmit` | sạch |
| Ma trận lỗi | **14/15** đóng (UI + action + test) |
| Contract | `0xFF8c126d12715b4fe069728A3f8a24142726ec25` · deployBlock 11570655 · epoch 172800s · perUserCap 10000000000 · participantCap 32 |
| Token | cUSDCMock `0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639` |
| ABI hash | `1043e9dc…2732b` (freeze từ Day 5) |
| Git | `dev` — **chưa merge `main`**, gate P0 Day 7 còn 2 dòng |
