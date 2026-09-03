# Day 6 Handoff — 27/08/2026 (label plan: 24/08, trễ 3 ngày — buffer còn 5 ngày trước freeze 04/09 18:00 ICT)

**Sản phẩm trở nên nhìn thấy được.** Shell + Landing + Onboarding 8 bước +
Dashboard, tất cả **masked by default**, chạy trên contract thật
`0xFF8c126d12715b4fe069728A3f8a24142726ec25` trên Sepolia. Cái khó nhất của
ngày không phải layout mà là **privacy boundary**: ba trạng thái
*unavailable ≠ hidden ≠ decrypted-to-0*, cộng một trạng thái thứ tư mà bản
thiết kế ban đầu không có tên cho nó (§"Bug thật" bên dưới). Contract-side
đã đóng từ Day 5; từ Day 7 trở đi vẫn là web, nhưng là **web có ghi**.

## Trạng thái gate (từ EXECUTION_PLAN Day 6)

| Gate | Trạng thái |
|---|---|
| Incognito user đi hết onboarding → dashboard masked | ✅ demo beat 3–4, ví `preauthorized: false` nên bước Connect chạy thật |
| Reveal/hide chính position của mình | ✅ 1 chữ ký EIP-712 mở cả `principal` + `twabArea`, qua relayer thật |
| Wrong-network recover được | ✅ banner + đọc public vẫn chạy; về đúng mạng banner tự tắt |
| Rejected signature recover được | ✅ "Nothing was revealed or sent", không ngõ cụt |
| Reveal cache clear khi TTL/reload/account/chain change | ✅ unit + e2e; thêm `visibilitychange` |
| Không plaintext trong SSR/storage/DOM khi masked | ✅ đọc thẳng response SSR (câu hỏi là server **gửi đi** gì, không phải DOM có gì) |
| 320px + desktop + keyboard | ✅ project `mobile-320` |

## Demo

```bash
pnpm demo:day6
```

Chạy được từ **root**, `packages/contracts`, hay `apps/web` — shim hai chiều,
không phải nhớ ngày nào ở package nào. Script root tự nạp `MNEMONIC` từ hardhat
keystore vào env tiến trình (không ghi ra đĩa, không vào git); thiếu nó thì
persona reveal tự skip kèm lời giải thích thay vì giả lập một reveal vô nghĩa.

10 beat có lời dẫn · **~2 phút** headed (mặc định, `slowMo 350`) / ~56s với
`DEMO_HEADLESS=1`. Video tự quay vào `apps/web/demo-results/` — thư mục này
**bị xoá sạch đầu mỗi lần chạy**, clip nào định nộp thì copy ra trước.

Bản mp4 của lần chạy 27/08 đã lưu ngoài repo:
`~/Downloads/payday-pot-day6-1-masked-dashboard.mp4` (12s) và
`~/Downloads/payday-pot-day6-2-reveal-and-close.mp4` (38s).

## Files chính hôm nay

| | |
|---|---|
| Routes | `app/(shell)/layout.tsx` · `/app` · `/app/savings` (stub) · `/employer` (placeholder) · `/onboarding` · `/docs/known-limitations` |
| Components | 42 file — `shell/` 5 · `onboarding/` 11 · `dashboard/` 7 · `privacy/` 3 · `tx/` 3 · `guards/` 3 · `landing/` 5 · `ui/` 5. **Không cắt gì so với plan** |
| Privacy core | `lib/reveal/{store,reveal,guards,use-reveal}.ts` · `lib/fhevm/instance.ts` |
| Write seam | `lib/tx/{send,store,watch,pending-unwrap}.ts` |
| Read model | `lib/pot/{reads,classify-read-error,twab}.ts` |
| Test | `demo/demo-day6.spec.ts` + `playwright.demo.config.ts` (config RIÊNG, `outputDir` riêng) |

## Quyết định đã chốt hôm nay

1. **Trạng thái thứ TƯ có tên riêng.** `unavailable` (chưa có gì) ≠ `hidden`
   (có, đang khoá) ≠ `0` (thật sự bằng không) ≠ **chưa đọc xong**. Cái thứ tư
   không được mượn UI của ba cái kia. `PrivatePositionCard` có nhánh riêng cho
   `account === null`, và `reads.error` hiện ra kèm `Try again` thay vì spinner
   vĩnh viễn.
2. **Reveal gộp `principalOf` + `twabAreaOf` vào một chữ ký** — vì chúng luôn
   được xem cùng nhau. Nhưng phải **lọc handle chưa init trước khi gửi**:
   relayer từ chối cả batch chỉ vì một `HIDDEN_HANDLE`.
3. **Read đi qua `JsonRpcProvider(Sepolia)` cố định, không qua ví.** Nhờ đó đổi
   sang mạng sai thì phiên đóng nhưng **trang vẫn đọc được** — chặn cả trang ở
   đó là ngõ cụt, thứ exit gate Day 6 cấm.
4. **Generation counter** cho reveal: đổi account giữa chừng thì kết quả đang
   bay về bị bỏ, không kịp vẽ lên màn hình ví mới.
5. **Demo là artefact xem được, không phải test.** Config riêng, headed +
   `slowMo` + video mặc định, nằm ngoài `e2e/` nên `pnpm test:e2e` không đụng.
6. **`preauthorized` trong wallet stub** (mặc định `true` để không đụng test cũ).
   Mặc định ấy chính là thứ đã che một lỗi suốt cả ngày — xem dưới.

## Bug thật Day 6 tìm ra

**1. Reveal sớm một nhịp thì bị bảo "Connect your wallet first"** — dù ví đã kết
nối. Nguyên nhân là trạng thái thứ tư (*chưa đọc xong*) bị gộp vào `hidden`, nên
nút Reveal sáng lên với `targets` rỗng. Sửa ở cấu trúc chứ không vá ở chỗ hiện
thông báo.

**2. Hai test xanh mà không kiểm gì cả** — phát hiện khi viết demo, không phải
khi chạy test:

- `e2e/privacy.spec.ts` khẳng định `not.toContainText("Visible in this tab only")`
  — mà strip viết `"Values are **v**isible in this tab only"`, chữ `v` thường.
  Chuỗi chữ hoa ấy **không bao giờ** có mặt, kể cả khi strip đang hiện. Xanh giả
  đúng ở chỗ nguy hiểm nhất: rò rỉ giữa hai ví trên cùng một máy. Sửa: bám
  `data-testid="reveal-session-strip"`, không bám câu chữ.
- Wallet stub trả `eth_accounts` vô điều kiện → app coi mọi trang là đã được
  cấp quyền → **bước "Connect wallet" chưa từng được test nào bấm vào**.

Bài học ghi lại: *một assertion theo copy vừa xanh giả vì lệch hoa/thường, vừa
đỏ giả khi sửa câu.*

## Quirks mới → `docs/COMPATIBILITY_NOTES.md` §9 (#24–29)

| # | Nội dung |
|---|---|
| 24 | `fhevm.initializeCLIApi()` bắt buộc dưới `hardhat run`, nhưng không cần dưới `hardhat test` |
| 25 | Input-proof phía Node đã proven trên relayer thật — **`encrypt()` 9752 ms**, `confidentialTransferAndCall` **1,318,372 gas** |
| 26 | `_checkpoint` lazy-init để `twabArea` chưa khởi tạo sau deposit đầu tiên → đó là lý do reveal phải lọc handle |
| 27 | Playwright `getByRole("alert")` đụng route announcer của Next |
| 28 | `code` của error **không sống sót** qua `page.exposeFunction` → reject phải ném trong page context |
| 29 | `data-state="hidden"` **không** phải bằng chứng "đã đọc xong"; sự tồn tại của nút Reveal mới là tín hiệu trung thực |

## Đang dở / chờ

- **4 file chưa commit**: `package.json` (root), `packages/contracts/package.json`,
  `apps/web/package.json`, `apps/web/demo/demo-day6.spec.ts` — toàn bộ là phần
  nối script demo cho chạy được từ mọi thư mục.
- `docs/social/day-03…05` vẫn nằm ngoài commit (từ trước Day 6, không liên quan).
- `/app/savings` là stub, `/employer` là placeholder — **đúng là scope Day 7**.

## CẦN ANH LÀM — 1 việc

**Ví employer `0x1cE8D5ff6E57a64E23cb28334315232A2e732D57` đang 0 ETH.** Không có
ETH thì Day 7 không fund prize thật được, và exit gate Day 7 có dòng
"employer fund prize thật qua UI".

Ví này là **account index 4 của chính MNEMONIC dự án** (`m/44'/60'/0'/0/4`,
chọn bởi `namedAccounts: { employer: 4 }`), tức anh đã cầm sẵn key — trong
MetaMask nó là **Account 5** sau khi bấm Add account 4 lần. Nguồn tốt nhất là
**Account 3** (`0xd83064F0…90829a`, đang có 0.058 ETH); gửi **0.03 ETH** là đủ,
để nguyên deployer (`0x83b2…6877`, 0.0439 ETH) cho gas keeper/draw.

`POT_EMPLOYER` chỉ có tác dụng lúc deploy; contract đã deploy và
non-upgradeable nên đổi employer đồng nghĩa deploy lại pot.

## Việc đầu tiên Day 7 — RÀNG BUỘC TỪ DAY 6 (đọc trước khi viết Savings)

**1. `packages/sdk` chưa có một write action nào.** `src/` chỉ có `errors.ts` +
`pot.ts` (read model, trả handle chứ không trả số). Day 7 cần `actions.ts`.
ABI freeze **không cấm** việc này — freeze là ABI của contract, không phải bề
mặt của SDK.

**2. `createEncryptedInput` trong browser mới chỉ chạy ở `app/spike/page.tsx`**
(spike Day 1), chưa có lib production nào. Đây là rủi ro kỹ thuật lớn nhất của
Day 7 — spike/compile/test trước, đừng xây abstraction trước.

**3. Encrypt mất ~10 GIÂY.** Node đo được 9752 ms cho một `add64().encrypt()`.
Đây là fact quyết định cả state machine Approve → Encrypt → Review → Submit →
Confirm → Sync: bước **Encrypt không được là spinner trần**. Phải nói đang làm
gì, và nói rõ huỷ giữa chừng thì mất gì (chưa mất tiền — chưa có tx nào).

**4. Non-negotiable #2 dịch sang ngôn ngữ UI:** sau deposit **không bao giờ**
echo lại số vừa nhập như số dư mới. ERC-7984 **clamp về encrypted zero thay vì
revert**, nên một deposit "thành công" có thể đã chuyển đúng 0 và không có gì
trên chain nói ra điều đó. Bắt buộc re-read handle rồi reveal tươi — đây chính
là dòng exit gate Day 7 *"giá trị mới masked đến khi reveal tươi"*.

**5. Pre-flight bằng plaintext trước mọi deposit**, vì clamp im lặng. Recipe đã
proven trong `packages/contracts/scripts/seed-deposit.ts`: `isBlocked` ·
`allowance` · `balanceOf` · `participantCount` vs `PARTICIPANT_CAP` · `paused` ·
`epochInfo().phase`. Rồi mới mint → approve → wrap → `confidentialTransferAndCall`.

**6. Mọi write đi qua `lib/tx/send.ts`** — không gọi contract trực tiếp ở
component. Nó làm đúng 3 việc theo thứ tự: chặn trước khi mở ví nếu sai mạng ·
ghi tx center **ngay khi có hash, trước `wait()`** (đóng tab giữa chừng vẫn
resume được) · mọi lỗi qua `classifyError`, không có `catch` tự chế thông điệp.

**7. `withdrawAll` không cần reveal** (non-negotiable #1) — và đó là điểm bán
hàng, không phải chi tiết kỹ thuật: rút tiền không phải mở khoá gì cả. Pause
cũng không bao giờ chặn withdraw/claim.

**8. Employer page phải có notice negative-permission** (non-negotiable #3):
employer **không** đọc được giá trị nhân viên, **không** chọn winner. Viết ra
thành chữ, đừng để judge tự suy.

**9. Persistence giữ allowlist hiện tại.** Đúng 3 key: `pdp.role.v1` ·
`pdp.consent.v1` · `pdp.tx.v1`. `TxRecord` = `{chainId, action, txHash,
epochId?, createdAt}` — **không bao giờ** amount, **không bao giờ**
`unwrapRequestId` (nó *là* ciphertext handle, quirk #23). Draft amount chỉ sống
trong memory.

**10. Gas.** `confidentialTransferAndCall` tốn **1,318,372 gas**. Ví người dùng
phải có ETH, và "không đủ gas" cần một recovery action rõ ràng chứ không rơi
vào "Something went wrong".

## Số liệu

| | |
|---|---|
| Contract tests | **150** xanh |
| Web unit (vitest) | **204** xanh / 9 file — 2.56s |
| Playwright e2e | **36** xanh — 58.7s |
| Demo Day 6 | **2/2** — 56.2s headless, ~2 phút headed |
| `tsc --noEmit` | sạch |
| Contract | `0xFF8c126d12715b4fe069728A3f8a24142726ec25` · deployBlock 11570655 · epoch 172800s · perUserCap 10000000000 · participantCap 32 |
| Token | cUSDCMock `0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639` |
| ABI hash | `1043e9dc…2732b` (freeze từ Day 5) |
| Git | `dev` `3201eb8` · `main` `a8ee3e2` (merge của chính nó) · cả hai đã push · + 4 file chưa commit |
