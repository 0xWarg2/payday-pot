# Day 6 Kickoff — 26/08/2026 (label plan: 24/08 · freeze 04/09 18:00 ICT)

Day 5 đóng contract. Day 6 mở web. File này là **cầu nối**: nó ghi lại phần
chuẩn bị đã làm xong *trước khi* ngày bắt đầu, để Day 6 là ngày dựng màn hình
chứ không phải ngày dựng tooling — và ghi rõ **hai việc chỉ anh làm được**,
đang chặn phần live.

> Đọc kèm: `DAY_05_HANDOFF.md` §"Việc đầu tiên Day 6" (6 ràng buộc từ contract,
> vẫn còn nguyên hiệu lực) · `docs/ERROR_RECOVERY_MATRIX.md` (R1–R15 là hợp
> đồng UX) · `docs/PRIVACY.md` (cái gì được hiện, cái gì không).

---

## 0. CẦN ANH LÀM — 2 việc, phần còn lại đã sẵn sàng

Không tự chạy được vì cần ví/tiền của anh.

**(1) Dev deploy lên Sepolia.** Script đã un-gate, đã tự validate registry +
wrapper trước khi tiêu gas, tự ghi manifest và tự regenerate module TS. Một lệnh:

```bash
pnpm --filter @payday-pot/contracts deploy:sepolia:dev
```

Deployer `0x83b2…6877` đang có **0.0493 ETH**, deploy tốn ~3.27M gas — đủ.
Script tự chặn nếu < 0.02 ETH. Sau khi chạy, `deployments/sepolia.json` có
entry `PayDayPot` `kind: "dev"` kèm `commit`, `abiHash`, `token`, `tokenImpl`,
và `packages/shared/src/deployments/sepolia.ts` được sinh lại trong cùng lượt —
không cần chạy `manifest:sync` tay.

**Vì sao Day 6 cần chain thật, không dùng local được:** relayer/KMS của Zama
(`@zama-fhe/relayer-sdk` 0.4.1) **chỉ chạy trên Sepolia**. `userDecrypt` +
EIP-712 trong browser — tức toàn bộ tính năng reveal của dashboard, exit gate
của ngày — không có đường nào test trên hardhat node. Không deploy thì Day 6
dừng ở mock.

**(2) Nạp ETH cho ví employer `0x1cE8D5ff6E57a64E23cb28334315232A2e732D57`.**
Đang **0.0 ETH**. Đây là blocker của **Day 7** (`fundPrize`), không phải Day 6 —
nhưng nói sớm để anh nạp một thể, khỏi kẹt giữa ngày. ~0.05 ETH là dư.

Riêng USDC thì **không cần lo**: `USDCMock.mint(address,uint256)` là faucet mở,
ai gọi cũng được (§4 dưới) — cả deployer lẫn employer đang 0 USDC và đều tự mint
được bằng một tx trong app.

---

## 1. Trạng thái — cái gì xanh, cái gì chưa

| Hạng mục | Trạng thái |
|---|---|
| Contract | ✅ đóng băng từ Day 5 — 150 test, ABI hash `1043e9dc…2732b` |
| Shared: ABI + manifest typed | ✅ `bd0791a` |
| Deploy script Sepolia (dev) | ✅ `5d1d865` — **chờ anh chạy** |
| SDK: error taxonomy + read model | ✅ `966b148` |
| Web tooling: Tailwind v4 + Vitest + Playwright | ✅ `c365055` — 70 unit + 1 e2e xanh |
| Design tokens §14.2 | ✅ có trang tham chiếu `/tokens` |
| Probe live cUSDC | ✅ đóng blocker Day 9, phát hiện 4 quirk mới (§4) |
| **Màn hình sản phẩm** | ☐ **chưa có gì — đây là việc của Day 6** |
| Pot trên Sepolia | ☐ chờ (1) |

**Cố ý chưa làm:** chưa deploy (cần ví anh), chưa viết màn hình nào, chưa đụng
contract. ABI freeze từ Day 5 — Day 6 không có lý do gì sửa Solidity, và nếu
phải sửa thì đó là tín hiệu đỏ chứ không phải việc thường.

---

## 2. `packages/sdk` — hợp đồng giữa web và chain

Hai file, cố tình nhỏ. Web **không** tự `new Contract()` và **không** tự đọc
địa chỉ ở đâu khác.

### 2.1 `errors.ts` — 31 code, mỗi code trỏ về một dòng của recovery matrix

```ts
import { classifyError } from "@payday-pot/sdk";

try { await pot.deposit(...) }
catch (e) {
  const err = classifyError(e);
  // { code, row: "R13" | null, title, detail, action, retryable }
  //   action: { kind: "approve" } → render đúng nút, không render "thử lại"
}
```

Ba tính chất được **test giữ**, không phải quy ước miệng:

1. **Không dead end.** `classifyError` luôn trả một `action` — kể cả với
   `null`, `undefined`, `0`, `""`, `{}`, `0xdeadbeef`. Test bắn đúng những
   input rác đó.
2. **Không có số trong copy.** Không title/detail nào khớp `/\d{2,}/` — kể cả
   số dư ERC-20 công khai. Một message có số là một message có thể vô tình mang
   số của người khác (rule #5).
3. **Exhaustive theo ABI.** `CONTRACT_ERRORS` khai báo
   `as const satisfies Record<PayDayPotErrorName, Spec>` — thêm một error vào
   `PayDayPot.sol` là **vỡ `pnpm -r build`** cho tới khi có người quyết định
   user nhìn thấy gì. Compile-time, không phải review-time.

**`FOREIGN_ERROR_ABI` (13 signature)** decode revert của *token*, không phải của
pot: 6 lỗi IERC6093 ERC-20 + 6 lỗi ERC-7984 + `InvalidUnwrapRequest(bytes32)`.
Cần thiết vì R12/R13/R14 — allowance/balance thiếu — revert từ ERC-20, decode
bằng ABI của pot sẽ ra `null` và rơi hết về "unknown".

### 2.2 `pot.ts` — read model **trả handle, không trả số**

Đây là quyết định thiết kế, không phải sự lười: SDK không có chỗ nào để cache
một giá trị đã decrypt, nên không có đường vi phạm rule #5 bằng cách vô ý.
Decrypt xảy ra ở tầng UI, sống trong memory tab, TTL 5 phút.

```ts
export const HIDDEN_HANDLE = "0x00…00";   // ≠ enc(0). Rule #8.
export const MAX_BATCH_STEPS = 16;        // trần đo được 21/22, đừng gửi 32
export function pendingWork(state, now): PendingWork
//   "none" | "begin-snapshot" | "snapshot"{done,total,steps}
// | "request-random" | "select"{done,total,steps} | "start-new-epoch"
```

`pendingWork()` là thứ Draw Room và mọi banner "cần ai đó bấm" nên đọc — nó đã
gói sẵn luật phase + cursor + trần batch, để UI không phải tự suy luận lại và
tự suy sai.

`getPot()` gọi `assertDeploymentMatchesAbi` mỗi lần dựng contract: web build từ
commit cũ mà manifest đã đổi thì **nổ ở boot** với thông điệp đọc được, chứ
không nổ trong ví người dùng bằng một revert vô nghĩa.

---

## 3. `apps/web` — tooling đã dựng

```bash
pnpm --filter @payday-pot/web dev          # dev server
pnpm --filter @payday-pot/web test         # 70 unit (Vitest + RTL, jsdom)
pnpm --filter @payday-pot/web test:e2e     # Playwright — chạy trên PRODUCTION build
```

- **Tailwind v4, CSS-first.** Toàn bộ token §14.2 nằm trong `@theme` của
  `app/globals.css` — không có `tailwind.config.js`. `/tokens` là trang tham
  chiếu dev-only, mục đích thật của nó là để **nhìn thấy** cyan privacy
  (`--color-privacy`) khác lime action (`--color-action`) — hai màu này đứng
  cạnh nhau trong dashboard và không được lẫn.
- **Playwright chạy `next build && next start`** trên port riêng (`E2E_PORT`,
  mặc định 3100), không phải `next dev`. Dev server không phải thứ đi nộp.
- **e2e pin COOP/COEP.** `cross-origin-opener-policy: same-origin` +
  `cross-origin-embedder-policy: require-corp` + `crossOriginIsolated === true`.
  Đây là oxy của relayer SDK và nó biến mất **im lặng** mỗi khi ai đó sửa
  `next.config.ts`. Giờ sửa là đỏ ngay.
- **Test copy có luật:** trang chủ không được khớp `/anonymous|anonymity/i`.
  Framing bắt buộc, giờ là assertion.

---

## 4. Probe live cUSDC 26/08 — tin tốt và tin xấu

Chạy thật trên Sepolia. Chi tiết đầy đủ: `COMPATIBILITY_NOTES.md` §8 quirk
#20–#23.

**Tin tốt 1 — blocker Day 9 đóng.** `underlying()` = `0x9b5Cd13b…dFfF`,
`rate()` = 1, `decimals()` = 6, `maxTotalSupply()` = 2^64−1, `isBlocked` = false.
Constructor của pot đọc được đủ hai immutable nó cần. Deploy Sepolia không còn
là canh bạc.

**Tin tốt 2 — R14 nâng cấp từ "link" thành "nút".** `USDCMock.mint` là faucet
mở, underlying **không có `owner()`**, không role gate. Onboarding lấy test
asset bằng **một tx trong app** — không rời trang, không captcha, không phụ
thuộc rate-limit của bên thứ ba. Đây là khác biệt UX thật so với spec ban đầu.

**Tin tốt 3 — R1 có đường recovery thật.** `unwrapRequester(bytes32)` và
`unwrapAmount(bytes32)` là **view mở** ⇒ phát hiện unwrap treo bằng **một view
call**, không cần index event, không cần backend. `finalizeUnwrap` thì
**permissionless** ⇒ banner nói được "ví nào cũng bấm được". Idempotent kiểu
*revert-not-corrupt*: bấm lần hai thì requester đã về 0 → revert sạch, UI bắt
lấy và đổi banner thành "đã hoàn tất" thay vì hiện lỗi đỏ.

**Tin xấu 1 — wrapper là proxy UUPS và ĐÃ bị upgrade giữa Day 1 và Day 6.**
Impl đổi `0x390aa02f…d0ee` → `0xAe37b998…3af04`. Không thông báo; mình phát hiện
bằng cách đọc lại ERC-1967 slot. Hệ quả: pot non-upgradeable đọc
`underlying()`/`rate()` **một lần trong constructor** — wrapper đổi `rate` sau
đó thì pot vẫn dùng số cũ. Đây là rủi ro **runtime**, không chỉ rủi ro lúc
deploy. Deploy script giờ ghi `tokenImpl` vào manifest, và `manifest:check`
**từ chối một entry `rc` không có `tokenImpl`** — Day 9 buộc phải re-probe.
Đã ghi thành `KNOWN_LIMITATIONS.md` §10.

**Tin xấu 2 — unwrap làm số tiền công khai tuyệt đối.** `_unwrap` gọi
`FHE.makePubliclyDecryptable`, và `unwrapRequestId` *chính là* handle của số đó.
Không phải suy đoán từ timing như wrap — là một con số đọc thẳng được. Pot
không vi phạm #6 (grep trong `PayDayPot.sol` vẫn = 0, luật đó nói về state của
pot) nhưng **người dùng không quan tâm ranh giới contract**. UI phải cảnh báo
**trước khi ký unwrap**, không phải sau. `PRIVACY.md` §2 mục 3 +
`KNOWN_LIMITATIONS.md` §11.

Ghi chú phụ: bản live **không** phải OZ `ERC7984ERC20Wrapper` chuẩn — thiếu
overload `unwrap(address,address,uint64)`, có thêm `unblockUser`. Đường unwrap
duy nhất là `bytes32`-based, 2 tx.

---

## 5. Ràng buộc Day 6 — vi phạm là làm lại

Sáu điều từ `DAY_05_HANDOFF.md` vẫn nguyên hiệu lực (không hiện `0` cho giá trị
ẩn · nút claim luôn enabled cho mọi người · employer "step 1/2" · dead window
sau `epochEnd` · decrypted value chỉ trong memory · đọc `drawProgress` cho
"x/32"). Day 6 thêm ba:

7. **Ba trạng thái, không phải hai.** *unavailable* (handle = `HIDDEN_HANDLE`,
   chưa từng init) ≠ *hidden* (có handle, chưa decrypt) ≠ *đã decrypt ra 0*.
   Component số confidential phải nhận đủ ba, không được có nhánh mặc định rơi
   về `0`.
8. **Cảnh báo unwrap đặt trước nút ký**, không phải trong toast sau đó (§4 tin
   xấu 2).
9. **Mọi `catch` đi qua `classifyError`.** Không `alert(e.message)`, không
   `String(e)` ra UI. Nếu một lỗi rơi về `unknown` thì đó là bug của taxonomy —
   sửa `errors.ts`, đừng vá ở component.

---

## 6. Thứ tự làm Day 6

Theo `EXECUTION_PLAN` Day 6, đã sắp lại theo phụ thuộc thật:

1. **Shell + guards** — wallet/network/role, transaction center, FHE provider
   client-only, reveal store (TTL 5 phút, clear khi hide/reload/đổi
   account/đổi chain). Không có cái này thì mọi màn hình sau đều phải tự lo.
2. **Landing** — hero, how-it-works, privacy comparison, no-loss promise. Copy
   theo bảng corrections §2 spec: không "Payroll connected", không "TWAB score
   87", không "anonymous".
3. **Onboarding** — role → connect → switch Sepolia → **get test USDC (faucet
   in-app, §4)** → shield warning → enroll.
4. **Dashboard** — masked principal/TWAB, reveal/hide EIP-712 + TTL, next draw
   public + employer boost, quick actions.

**Exit gate:** incognito user đi hết onboarding → dashboard masked →
reveal/hide vị trí của chính mình → recover được khi sai network và khi từ chối
chữ ký. Cần (1) ở §0 mới tick được — reveal không chạy trên local.

**Cut nếu hụt giờ:** bỏ section trang trí + orb animation. **Giữ** privacy
boundary + reveal — đó là sản phẩm.

---

## 7. Lệnh hay dùng

```bash
pnpm install --frozen-lockfile
pnpm -r build && pnpm -r test
pnpm --filter @payday-pot/contracts manifest:check
pnpm --filter @payday-pot/web dev
```

---

## 8. Số liệu

- Test: contracts **150** · web **70 unit + 1 e2e** · tổng **221**.
- Commit prep trên `dev`: `bd0791a` (shared) → `5d1d865` (deploy) → `966b148`
  (sdk) → `c365055` (web tooling) → docs (commit này).
- ABI hash `1043e9dc3870da6762b138f093bcb0857e1e59be3a821eaf6ebd3ed7d4f2732b` —
  đóng băng từ Day 5, web assert lúc boot.
- Error taxonomy: **31 code**, **15 row** R1–R15, **13 foreign signature**.
- Ví: deployer `0x83b2…6877` 0.0493 ETH / 0 USDC · employer `0x1cE8…2D57`
  **0.0 ETH** / 0 USDC.
- Còn **9 ngày** tới freeze 04/09 18:00 ICT.
