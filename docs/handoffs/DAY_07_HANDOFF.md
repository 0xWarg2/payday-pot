# Day 7 Handoff — 28/08/2026 (label plan: 25/08, trễ 3 ngày — buffer còn 4 ngày trước freeze 04/09 18:00 ICT)

**Tiền đã đi được cả hai chiều trong browser.** `/app/savings` (Deposit ·
Withdraw · History) và `/employer` chạy trên contract thật
`0xFF8c126d12715b4fe069728A3f8a24142726ec25`. Cái tốn thời gian nhất hôm nay
không phải luồng thành công — mà là **đường lỗi**: ba bug thật rơi ra từ việc
diễn lại từng nhánh hỏng trong browser, một trong đó là **crash trắng màn hình**
ở chính luồng withdraw. Day 8 sẽ đứng trên nền đó: Draw Room + E2E full cycle.

## Trạng thái gate (từ EXECUTION_PLAN Day 7)

| Gate | Trạng thái |
|---|---|
| Deposit/withdraw thật qua UI trên contract thật | ⛔ **CHƯA** — cần ví có tiền, xem §CẦN ANH LÀM |
| Employer fund prize thật qua UI | ⛔ **CHƯA** — ví employer 0 ETH |
| Mọi lỗi có đúng một recovery | ✅ R6 · R7 · R8 · R11 · revert onchain — diễn thật trong demo, có test |
| Giá trị mới masked đến khi reveal tươi | ✅ không chỗ nào echo lại số vừa gõ; sau submit là re-read handle |
| Amount chỉ sống trong memory | ✅ e2e dump localStorage: đúng 3 key, `pdp.tx.v1` đúng 5 field |
| Employer không đọc được gì của user | ✅ notice cạnh form + test contract Day 5 |

**Hai dòng ⛔ là exit gate P0 → `dev` CHƯA merge vào `main`.** Không phải thiếu
code: ví CI không có vị thế nên mọi tx đụng tiền revert ngay ở
`eth_estimateGas`, đường thành công **không diễn được trong CI**
(COMPATIBILITY_NOTES #33). Đây là việc của người, 10 phút, làm tay.

## Demo

```bash
cd apps/web && pnpm demo:day7        # chạy + dựng MP4
cd apps/web && pnpm demo:day7:run    # chỉ chạy Playwright
```

12 beat / 5 clip / **4m09s**, `demo-results/payday-pot-day7.mp4` (1280×720,
3.5 MB). **Phụ đề tiếng Anh nằm trong pixel** — dùng được thẳng cho bài nộp.

Phụ đề KHÔNG burn bằng ffmpeg: bản ffmpeg 9.0.1 ở máy này build thiếu
libass/freetype (`No such filter: 'subtitles'`, cũng không có `drawtext`).
Thay vào đó `demo/narrate.ts` vẽ thanh phụ đề thẳng vào trang lúc quay, và
mỗi dòng **giữ màn hình đúng thời gian đọc nó** (1.2s + 52ms/ký tự, kẹp
1.9–6s) → phụ đề khớp video tuyệt đối, không có bước align hậu kỳ. `.srt` vẫn
xuất kèm trong `demo-results/reel/` để dịch hoặc dựng lại.

`demo-results/` bị **xoá sạch đầu mỗi lần chạy** — clip nào định nộp thì copy ra.

## Files chính hôm nay

| | |
|---|---|
| Routes | `/app/savings` (thật, 3 tab + `#assets`) · `/employer` (thật) |
| Savings | `components/savings/` — `SavingsTabs` · `TransferFlow` · `EncryptProgress` · `ReviewDialog` · `WithdrawAllPanel` · `ClaimPanel` · `HistoryPanel` · `AssetsHelper` |
| Employer | `components/employer/` — `SponsorOverview` · `FundPrizePanel` · `NegativePermissionNotice` |
| SDK writes | `packages/sdk/src/actions.ts` — `sendDeposit/Withdraw/WithdrawAll/Claim/FundPrize/DefundPrize` + `preflightDeposit` · `preflightFundPrize` · `capHeadroom` |
| Taxonomy | `packages/sdk/src/errors.ts` — `errorCodesOf` (đệ quy) + **`toPotError`** |
| Demo | `demo/demo-day7.spec.ts` · `demo/narrate.ts` · `demo/build-mp4.mjs` |
| Test | `e2e/savings.spec.ts` (9 test) · `test/classify-read-error.test.ts` (+3) |

## Quyết định đã chốt hôm nay

1. **`toPotError()` là cửa DUY NHẤT vào `ErrorPanel`.** `e as PotError` là một
   lời nói dối của TypeScript và nó đã trả giá bằng màn hình trắng. Bảy
   component đã đổi; đừng thêm cái thứ tám bằng cast.
2. **Địa chỉ pot lấy từ deployments manifest, không từ `reads.config`.** `reads`
   là kết quả poll — đọc `.address` trước khi poll xong là `undefined`, và đó
   chính là crash. Manifest luôn có sẵn ở compile time.
3. **Input proof bind theo (contract, user)** → deposit encrypt cho **token
   cUSDC**, withdraw encrypt cho **pot**. Sai địa chỉ ở đây thì proof hợp lệ
   nhưng contract từ chối — không có thông báo nào nói ra điều đó.
4. **History không lưu status.** `pdp.tx.v1` chỉ giữ 5 field; status dựng lại
   từ chain mỗi lần load (`lib/tx/watch.ts` → `reconcileTxStatuses()`).
   `Pending` = chưa có block, `Unknown` = không với tới được Sepolia.
5. **Double-submit chặn ở máy trạng thái**, không chặn bằng `disabled`:
   `SUBMIT` chỉ nhận từ state `review`.
6. **Demo tách theo persona, mỗi persona một `page`** — `installWallet` dùng
   `exposeFunction`, hàm đó chỉ đăng ký được MỘT lần cho mỗi page.

## Bug thật Day 7 tìm ra

**1. Màn hình TRẮNG ở `/app/savings#withdraw`** — `Cannot read properties of
undefined (reading 'kind')`. Một `TypeError` thô bị `dispatch` thẳng vào state
lỗi rồi `ErrorPanel` đọc `error.action.kind`. Truy ra bằng cách in
`pageerror.stack` rồi giải offset trong chunk đã minify. Sửa ở lớp: `toPotError`
+ đọc địa chỉ pot từ manifest.

**2. "Something went wrong" cho MỌI reject của ví.** ethers bọc lại mã `4001`
xuống dưới `code: "UNKNOWN_ERROR"`, `classifyError` chỉ nhìn `e.code` tầng
ngoài. Sửa bằng `errorCodesOf` đệ quy (đi qua `info`/`error`/`cause`/`data`).

**3. "Something went wrong" cho MỌI revert onchain.** Wallet stub trong e2e
nuốt mất `json.error.data`, nên revert reason không bao giờ tới taxonomy. Sửa
stub → panel nói đúng `Not in this pool yet`.

Cả ba đều **chỉ lộ ra khi diễn thật trong browser**, không có cái nào bị bắt bởi
unit test. Bài học ghi lại: *đường lỗi phải được đi bộ, không được đọc.*

## Quirks mới → `docs/COMPATIBILITY_NOTES.md` §10 (#30–34)

| # | Nội dung |
|---|---|
| 30 | ethers bọc mã ví (`4001`, `4902`) xuống các tầng `info`/`error`/`cause` |
| 31 | Wallet stub phải forward `error.data`, nếu không mọi revert thành lỗi chung chung |
| 32 | `e as PotError` = màn hình trắng; mọi lối vào `ErrorPanel` phải qua `toPotError` |
| 33 | Ví CI không có vị thế → tx đụng tiền revert ở `eth_estimateGas`, **đường thành công không test được trong CI** |
| 34 | Địa chỉ pot lấy từ manifest, không từ `reads.config` (poll chưa xong = `undefined`) |

## Đang dở / chờ

- `docs/social/day-07-*` chưa commit (ảnh + bài X), như các ngày trước.
- `/app` dashboard vẫn là bản Day 6 — chưa nối card "vòng đang chạy" sang Draw
  Room (chưa có Draw Room).
- Chưa có UI nào cho draw/keeper. `packages/sdk/src/pot.ts` **đã có sẵn**
  `PotState.snapshot.cursor/total`, `draw.drawn/cursor/total`, `pendingWork()`,
  `MAX_BATCH_STEPS = 16` — Day 8 đọc thẳng, không phải thiết kế lại read model.

## CẦN ANH LÀM — 1 việc, đúng cái của Day 6 chưa làm

**Nạp 0.03 ETH cho ví employer `0x1cE8D5ff6E57a64E23cb28334315232A2e732D57`**
(đang 0 ETH) từ **Account 3** `0xd83064F0…90829a` — KHÔNG lấy của deployer
`0x83b2…6877` (giữ cho gas keeper/draw của Day 8).

Ví employer là account index 4 của chính MNEMONIC dự án (`m/44'/60'/0'/0/4`),
trong MetaMask là **Account 5**. `POT_EMPLOYER` chỉ có tác dụng lúc deploy;
contract non-upgradeable nên đổi employer = deploy lại pot.

Sau khi nạp, hai việc 10 phút để đóng gate Day 7:
1. Ví có tiền → `/app/savings` → deposit thật → xem giá trị mới **masked** →
   reveal tươi → `Withdraw everything`.
2. Ví employer → `/employer` → fund prize thật.

## Việc đầu tiên Day 8 — RÀNG BUỘC TỪ DAY 7

**1. Draw Room đọc cursor từ chain, không giữ state riêng.** `readPotState()`
đã trả `snapshot.{cursor,total}` và `draw.{drawn,cursor,total}`. Nguồn sự thật
là onchain cursor — UI chỉ vẽ lại nó. Kill keeper giữa chừng rồi reload phải ra
đúng con số cũ (exit gate).

**2. `Trigger`/`Continue` là permissionless và phải nói ra điều đó.** Keeper chỉ
trigger; không đưa seed/weight/winner. Random đúng **1 lần/epoch, không reroll**
(non-negotiable #7) → R5 cần một trạng thái riêng "seed đã chốt cho epoch này".

**3. Claim đã có sẵn `ClaimPanel`** với ba câu cho ba tình huống (R9) và cố ý
**không** có dòng chúc mừng. Day 8 chỉ thêm review + linkage warning, đừng viết
lại panel — và đừng thêm bất kỳ tín hiệu nào phân biệt winner/non-winner
(contract cố ý cho hai bên cùng gas: 748,032 / 369,000 / 396,250).

**4. Winner UI và loser UI phải giống hệt nhau TRƯỚC reveal.** Đây là dòng exit
gate dễ trượt nhất: chỉ cần một skeleton khác kích thước là lộ.

**5. E2E full cycle cần 2–3 profile browser.** `e2e/fixtures/wallet.ts` hiện
mỗi page một ví; deposit lệch thời gian giữa hai profile là chỗ TWAB được kiểm
thật sự. Nhớ #33: profile nào phải **thật sự có tiền trên Sepolia** thì mới đi
được đường thành công — cân nhắc seed bằng `scripts/seed-deposit.ts` trước khi
chạy E2E thay vì kỳ vọng CI tự lo.

**6. Reload tại mọi pending state** dùng lại đúng cơ chế R11 đã chạy: ghi tx
center **ngay khi có hash, trước `wait()`**, status dựng lại từ chain.

**7. `ERROR_RECOVERY_MATRIX.md` có 15 dòng, exit gate Day 8 đòi tick hết các
dòng ngày 6/7/8** (UI + action + test). Đã có: R2 R3 R6 R7 R8 R10 R11 R13 R14.
Day 8 nợ: **R1 (unwrap pending)** · **R4 (draw batch dừng giữa cursor)** ·
**R5 (random đã sinh, select fail)** · **R9 (claim 3 case)** · **R12 (employer
solvency)**. R15 nằm ngoài luồng chính, giữ ở mức copy.

**8. Demo Day 8 dùng lại `demo/narrate.ts`** — `clip(page, testInfo, order,
slug)`, thuyết minh viết bằng **tiếng Anh** vì nó là phụ đề. Đừng dùng
`page.video().path()` để lấy đường dẫn (nó trả artifact tạm); dùng
`testInfo.outputDir`.

## Số liệu

| | |
|---|---|
| Contract tests | **150** xanh — 25s |
| Web unit (vitest) | **231** xanh / 10 file — 2.4s |
| Playwright e2e | **40** xanh, 5 skipped — 35.3s |
| Demo Day 7 | **5/5** — 4.2 phút headless, MP4 4m09s |
| `tsc --noEmit` | sạch |
| Contract | `0xFF8c126d12715b4fe069728A3f8a24142726ec25` · deployBlock 11570655 · epoch 172800s · perUserCap 10000000000 · participantCap 32 |
| Token | cUSDCMock `0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639` |
| ABI hash | `1043e9dc…2732b` (freeze từ Day 5) |
| Git | `dev` `30cf54c` · `main` `a8ee3e2` (Day 6) — **chưa merge, gate P0 chưa đạt** |
