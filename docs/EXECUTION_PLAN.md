# PayDay Pot — Execution Plan (9-Day Sprint, FINAL)

> **Trạng thái:** ACTIVE — đây là plan thực thi chính thức, override lịch trong `PAYDAY_POT_10_DAY_BUILD_PLAN.md`
> **Sprint:** 19/08/2026 → 27/08/2026 (9 ngày)
> **Buffer:** 28/08 → 04/09 (hardening, docs, video, submission)
> **Internal freeze:** 04/09/2026 18:00 ICT
> **Season 4 deadline:** 05/09/2026 23:59 AOE
> **Network:** Ethereum Sepolia (testnet — đã verify nguyên văn "Deployments should target Sepolia")
> **Team:** 1 lead dev + Claude Code, 8–10h/ngày

Spec chi tiết (screens, contract math, privacy, test matrix) vẫn nằm ở
[PAYDAY_POT_IMPLEMENTATION_PLAN.md](./PAYDAY_POT_IMPLEMENTATION_PLAN.md).
File này chỉ quyết định **làm gì, ngày nào, gate nào**.

---

## 0. Các quyết định kỹ thuật đã chốt (khác plan gốc)

Bốn patch bắt buộc, đã phân tích với số liệu HCU từ docs Zama chính thức:

### P-1. TWAB không chia cho epochDuration onchain

`weight_i = area_i / epochDuration` bị **bỏ**. Draw dùng trực tiếp `area_i` vì:
- Multiply-high ticket `floor(R × T / 2^64)` là scale-invariant — chia mọi weight
  cho cùng hằng số không đổi xác suất.
- Tiết kiệm 1.225.000 HCU/participant (~54% chi phí snapshot).
- Giá trị "average balance" để hiển thị: tính client-side sau user-decrypt
  (`epochDuration` là public).

### P-2. `FHE.shr(product, 64)` thay cho `FHE.div(product, 2^64)`

Dịch phải 64 bit ≡ `floor(x / 2^64)`. 37.000 HCU thay vì 1.225.000 (rẻ hơn 33×).

### P-3. Overflow budget mới (vì T = Σ area, không còn chia)

- `epochDuration ≤ 30 ngày ≈ 2^21.3` giây; participant cap 32 = 2^5.
- Cần `Σ area < 2^64` → per-user principal cap `< 2^37.7 ≈ 220.000 USDC`
  (6 decimals). Demo dùng cap thấp hơn nhiều (vd 10.000 cUSDC/user).
- Với cap này `twabArea` giữ được `euint64` → scalar mul 365k thay vì 696k HCU
  → snapshot ~29 participant/tx thay vì ~8. Cả pool 32 người xong trong 2 tx.
- Ticket vẫn promote lên `euint128` cho phép nhân R × T.

### P-4. Lazy registration + prize backing public

- **Không có hàm register rời.** User trở thành participant khi deposit đầu tiên
  có `actualTransferred > 0` (chặn DoS 32 ví rỗng chiếm slot trong tuần chấm).
- **Decision D4 chốt:** allocated prize là **public uint64** (khớp §15.1 —
  "Published prize allocation = Public/Intentional disclosure"). Backing check
  bằng plaintext `require`, không cần decrypt ciphertext. Unallocated reserve
  của employer không track onchain.

### Scope cắt sẵn (không chờ "if behind")

- Route: 6 thay vì 11 — `/`, `/onboarding` (chứa faucet+learn), `/app`,
  `/app/savings`, `/app/draws/[id]` (chứa proof tab), `/employer` (overview+funding).
- `claimFor`, indexer, invite/allowlist, multi-prize: KHÔNG làm trong sprint.
- Framing bắt buộc trong README/video: prize reserve = **sponsored yield**,
  `SponsoredPrize` là adapter interface thay được bằng real yield source mà
  không đụng vault accounting. Nói trước, không để judge tự phát hiện.
- `KNOWN_LIMITATIONS.md` phải ghi: FHE randomness inherit security model của
  FHEVM version đã pin (roadmap Zama ghi RNG hiện là PRNG mockup) — verify lại
  note này ở Day 1.

---

## 1. Lịch 9 ngày

| Day | Date | Outcome | Milestone |
|---:|---|---|---|
| 1 | 19/08 | Toolchain + FHE/ERC-7984 compatibility proven | Foundation |
| 2 | 20/08 | Deposit + partial/full withdraw + no-loss invariants (ngày dài 10–12h) | Money in/out |
| 3 | 21/08 | Encrypted TWAB checkpoint/snapshot (theo P-1/P-3) | Fair weight |
| 4 | 22/08 | FHE random + multiply-high (P-2) + batch selection | Fair draw |
| 5 | 23/08 | Sponsor prize + claim + local full cycle | Protocol complete |
| 6 | 24/08 | App shell + Landing/Onboarding + Dashboard | Product entry |
| 7 | 25/08 | My Savings + Employer funding UX | Money UX complete |
| 8 | 26/08 | Dark Draw Room + full browser E2E | Product complete |
| 9 | 27/08 | Sepolia RC deploy + smoke + runbook | Release candidate |

Hard rules giữ nguyên từ plan gốc: không qua ngày khi P0 gate chưa đạt; không
polish khi vertical slice chưa xong; mỗi ngày kết thúc bằng demo <5 phút,
tests xanh, docs cập nhật, commit/tag.

**Demo rule (chốt 19/08):** mỗi ngày/phase kết thúc bằng MỘT lệnh demo duy nhất,
output sạch có narration (kiểu `pnpm demo` Day 1) — không phải "chạy tests rồi
tự suy ra". Lệnh demo + expected output ghi vào mục **Demo** của handoff ngày đó
để ngày sau (và video submission) reproduce được ngay.

---

## Day 1 — 19/08 — Foundation & compatibility spike

**Mục tiêu:** không còn phỏng đoán nào về versions, SDK/WASM, wrapper, ERC-7984 API.

Sáng:
- [x] `git init` + pnpm workspace: `apps/web`, `packages/contracts`, `packages/sdk`, `packages/shared`
- [x] Start từ official FHEVM Hardhat template; pin exact versions
      (`@fhevm/solidity`, Hardhat FHE plugin, OZ Confidential, Zama relayer SDK, wagmi/viem)
- [x] `deployments/sepolia.json` schema — single source of truth cho address/ABI

Chiều:
- [x] Validate registry `0x2f0750...128e` ↔ `cUSDCMock 0x7c5B...3639` ↔ underlying `0x9b5C...DFfF` bằng script runtime
- [x] Minimal contract: encrypted input verify + `FHE.add` + `allowThis/allow` + getter
- [◐] Minimal page: init SDK/WASM ✅ (production build, crossOriginIsolated) → connect/tx/decrypt chờ ví (B7)
- [x] Verify COOP/COEP headers trong production build không phá wallet
- [x] Chốt D2: ERC-7984 transfer-and-call callback vs approved pull — đường nào trả actual ciphertext thì chọn, chỉ ship 1 đường
- [x] `COMPATIBILITY_NOTES.md`: versions, API path, RNG security note

**Exit gate:** clean clone install xanh · minimal contract deploy local+Sepolia ·
browser encrypt + EIP-712 decrypt thành công 1 giá trị thật · wrapper pair
validated · actual-transfer path đã chốt · SDK chạy trong production build.

**Cut nếu trượt:** bỏ Turborepo/UI lib, giữ pnpm workspace trần. KHÔNG đẩy API
uncertainty sang Day 2.

---

## Day 2 — 20/08 — Deposit + Withdraw + no-loss (ngày dài)

**Mục tiêu:** tiền vào và ra vault confidentially, principal conservation có property test.

Contract:
- [x] `PayDayPot.sol` non-upgradeable: immutable token/employer/epochDuration/caps
- [x] Encrypted zero init tường minh (không dùng uninitialized handle như 0; lazy-init vì quirk #6 chặn FHE trong constructor dưới `hardhat deploy`)
- [x] Deposit theo đường đã chốt D2; credit **actualTransferred**, không credit request
- [x] Registration **plaintext-gated** khi deposit đầu (P-4 REVISED — gate ">0" bất khả thi không leak; xem KNOWN_LIMITATIONS)
- [x] `withdraw(externalEuint64, proof)` + `withdrawAll()` không cần reveal trước
- [x] ReentrancyGuard, CEI; pause chỉ chặn deposit/new-draw, KHÔNG chặn withdraw/claim
- [x] ACL refresh trên mọi handle mới; events chỉ chứa action/user/epoch

Tests:
- [x] Deposit thường / requested > available / zero / invalid proof / wrong token / fake caller / cap boundaries / pool full
- [x] Jimmer decrypt được principal của mình; Warg và employer bị từ chối
- [x] Partial withdraw, withdrawAll idempotent, withdraw khi paused
- [x] Property: chuỗi deposit/withdraw ngẫu nhiên bảo toàn principal (30 ops, seed 0xda72)
- [x] Request > balance không burn claim, không leak qua error message (FHE.min clamp)

**Exit gate:** toàn bộ trên xanh local · không plaintext amount trong event/log ·
không admin sweep.

**Cut nếu trượt:** ship `withdrawAll` trước partial polish. KHÔNG defer invariants.

---

## Day 3 — 21/08 — Encrypted TWAB

**Mục tiêu:** weight = encrypted balance × time, đóng băng đúng tại `epochEnd`.

- [x] Account: `euint64 principal`, `euint64 twabArea` (P-3), `uint64 lastCheckpoint`
- [x] `_checkpoint(user, min(now, epochEnd))` trước mọi mutation
- [x] `area += balance × publicElapsed`; KHÔNG chia epochDuration (P-1)
- [x] Snapshot batch + cursor; freeze participant list/order/count
- [x] Deposit disabled trong snapshot; withdraw vẫn chạy (checkpoint trước) — gate tại `epochEnd`, chặt hơn plan (KNOWN_LIMITATIONS §6)
- [x] Enforce caps P-3 tại deposit (per-user principal cap) — guard Day 2 giữ nguyên + boundary tests 2^64 (constructor revert, max-accrual 99.85% không wrap)

Tests: 100 full epoch vs 100 half epoch = 2:1 · 50 nửa đầu + 100 nửa sau = 75 tương đối ·
last-second deposit ≈ 0 · delayed draw không cộng thêm sau `epochEnd` ·
withdraw sau cutoff không đổi frozen weight · boundary tests tại mọi cap.

**Exit gate:** mọi scenario chuẩn khớp · snapshot dùng `epochEnd` không phải
thời điểm draw · withdraw sống trong snapshot · caps enforced + documented ·
đo HCU thực tế 1 participant, ghi vào `DRAW_PROTOCOL.md`.

---

## Day 4 — 22/08 — FHE random + weighted selection ✅ (làm 24/08)

**Mục tiêu:** một draw bất biến chọn đúng một encrypted winner.

- [x] ~~Phases: Open → Snapshotting → RandomReady → Selecting → Finalized~~
      **OVERRIDE (Day 3 đã chốt 4-phase)**: enum giữ `{Open, Snapshotting,
      Drawing, Settled}` — RandomReady ⇔ `Drawing && !drawn`, Selecting ⇔
      `Drawing && drawn && selectCursor < count` (DRAW_PROTOCOL §1, §6.5)
- [x] `FHE.randEuint64()` đúng 1 lần sau khi total freeze; cấm reroll
      (`requestRandom()` không tham số, `AlreadyDrawn` + handle equality test)
- [x] Ticket: promote `euint128`, `mul`, rồi **`FHE.shr(product, 64)`** (P-2)
      — exact test trên contract path + harness biên max-R × max-T
- [x] Cumulative scan: `hit = !selected && ticket < cumulative`; `FHE.select`
      award; không `if(ebool)`, không encrypted index — term `hasWeight` bị
      loại có chứng minh (zero-weight không tạo crossing mới — DRAW_PROTOCOL §6.3)
- [x] Cursor monotonic (`selectCursor` mới, không đụng `snapshotCursor`);
      batch functions permissionless
- [x] Zero-participant / zero-weight → prize rollover, không decrypt total

Tests: ticket ∈ [0,T) ✅ · đúng 1 winner khi T>0 ✅ (exact-replication + carry
qua biên tx) · không winner không mất prize khi T=0 ✅ · reroll/cursor
regression bị reject ✅ · Monte Carlo phân phối 1:3:6 ✅ (64 epoch, ±3.5σ) ·
overflow boundary max R × max T ✅ (harness) · HCU/participant → chốt batch
size ✅ (marginal 574k/162k → ceiling 22/tx, default 8).

**Exit gate:** không tồn tại `% encryptedTotal` ✅ (grep sạch) · random 1
lần/epoch ✅ · ví lạ tiếp tục được draw từ cursor ✅ · keeper không cung cấp
seed/weight/winner ✅ (zero-input signature test) · full capped draw vừa trong
bounded tx trên số HCU đã đo ✅ (pool 32 = 2 tx, test tự fail nếu ceiling < 8).

---

## Day 5 — 23/08 — Prize, claim, protocol vertical slice

**Mục tiêu:** local full cycle xanh; prize và principal bảo toàn độc lập.

- [x] Employer funding; allocated prize là **public uint64** (P-4); không allocate quá backing — `fundPrize` pull ERC-20 rồi tự `wrap`, nên allocation ≡ transfer thật; thiếu tiền ⇒ revert plaintext (R12)
- [x] Credit encrypted `pendingPrize` trong winner scan + ACL cho từng user — grant **đồng loạt mọi participant** (winner thấy số dương, người khác thấy enc(0))
- [x] `claim()` idempotent; giảm liability bằng actual transfer; KHÔNG làm `claimFor` — claim lần 2 chuyển 0 không revert; non-winner claim **thành công** chuyển 0 (chống leak)
- [x] Finalize/reset epoch không đụng principal — `startNewEpoch` chỉ reset twabArea/won/lastCheckpoint; **không bao giờ** đụng pendingPrize (B3, test cross-epoch)
- [x] Script integration Jimmer/Warg/Carol: weights khác nhau → fund → draw →
      từng người decrypt kết quả riêng → winner claim → tất cả withdrawAll — `demo/demo-day5.ts`, 12 beat, sentinel `BUG:`/`PRIVACY BREACH:`
- [x] Negative ACL: employer/keeper/user khác đều bị từ chối — thêm `prizeCipherOf`/`prizeCarry` contract-only; grep `makePubliclyDecryptable` = 0
- [x] Draft `PRIVACY.md`, `THREAT_MODEL.md`, `KNOWN_LIMITATIONS.md` từ behavior thật — viết từ code đã ship (số dòng ACL thật), không phải từ spec
- [x] Freeze ABI (chỉ sửa khi blocker) — ghi trong `docs/handoffs/DAY_05_HANDOFF.md`

**Exit gate (Protocol Complete):** full local flow từ fresh state · đúng 1 user
decrypt prize dương, còn lại zero · claim chuyển đúng 1 lần · prize không đổi
principal liability · mọi người rút đủ principal.

---

## Day 6 — 24/08 — Shell + Landing/Onboarding + Dashboard

> **Prep đã xong trước khi mở ngày (26/08)** — chi tiết đầy đủ ở
> `docs/handoffs/DAY_06_KICKOFF.md`. Mục đích: Day 6 là ngày dựng màn hình, không
> phải ngày dựng tooling.
>
> - [x] ABI + manifest plumbing: `packages/shared` xuất `PAYDAY_POT_ABI`,
>       `PAYDAY_POT_ERRORS`, ABI hash; `pnpm manifest:sync` (`bd0791a`)
> - [x] Deploy script un-gate + registry probe (`5d1d865`) — **deploy Sepolia là
>       việc của người, xem "Cần anh làm" trong kickoff**
> - [x] SDK: error taxonomy 31 code ánh xạ thẳng vào R1–R15 + read model
>       trả handle (không trả số) (`966b148`)
> - [x] Web tooling: Tailwind v4 + design tokens §14.2, Vitest+RTL (70 test),
>       Playwright pin COOP/COEP trên **production build** (`c365055`)
> - [x] Probe live cUSDC: đóng blocker Day 9, phát hiện wrapper đã bị upgrade
>       (KNOWN_LIMITATIONS §10) và faucet mở (R14 thành nút in-app)
>
> Ba việc **chưa** làm và cố ý chưa làm: chưa deploy Sepolia (cần ví của anh),
> chưa viết màn hình sản phẩm nào, chưa đụng contract (ABI freeze từ Day 5).

- [x] Design tokens, responsive shell, light theme + dark Draw Room boundary —
      shell ở route group `app/(shell)`, landing **nằm ngoài** nên nó vẫn là
      server tree thuần (SSR privacy test không phải chứng minh gì cả)
- [x] Wallet/network/role guards; transaction center; client-only FHE provider;
      reveal store in-memory TTL 5 phút — `createExternalStore` +
      `useSyncExternalStore`, mỗi store có `SERVER_SNAPSHOT` masked cứng; FHE là
      module singleton `ensureFheInstance()`, không phải React provider
- [x] Landing: hero, how-it-works, privacy comparison, no-loss promise
      (+ section faucet/learn — không route riêng)
- [x] Onboarding: role → connect → switch Sepolia → test assets/shield warning → enroll
      — 8 bước, step hiện tại **dẫn xuất** từ reducer chứ không persist; R14 là
      nút in-app `USDCMock.mint` (faucet mở, quirk #21), R13 approve gắn nhãn
      "step 1/2"; `ShieldWarning` đứng **trước** nút ký
- [x] Dashboard: masked principal/TWAB card, EIP-712 reveal/hide/TTL, public next
      draw + employer boost, quick actions — principal + TWAB gộp vào **một** chữ
      ký, lọc `HIDDEN_HANDLE` trước khi gửi (relayer từ chối cả batch vì nó)
- [x] Copy đúng bảng corrections §2 spec (không "Payroll connected", không "TWAB score 87")
      — mọi câu lỗi lấy thẳng từ taxonomy; `revealHandles` không còn tự viết copy
      riêng cho nhánh user-rejected (bản đó **không bao giờ được render**, tức là
      nó sẽ lệch khỏi ERROR_RECOVERY_MATRIX mà không test nào đỏ)
- [x] Live drill 2 persona trên contract thật `0xFF8c…ec25` — ví stub EIP-1193
      ký **thật** bằng `ethers.Wallet` trong tiến trình Node (`window.__pdpSign`
      qua `exposeFunction`), nên `userDecrypt` đi qua relayer thật; private key
      không bao giờ vào page context, trace hay screenshot
- [x] **Bug thật do drill tìm ra:** ví đã kết nối bấm Reveal sớm một nhịp thì bị
      bảo "Connect your wallet first". Nguyên nhân là trạng thái **thứ tư** —
      *chưa đọc xong* — bị gộp vào `hidden`, nên nút Reveal sáng với `targets`
      rỗng. Sửa ở cấu trúc: `PrivatePositionCard` có nhánh riêng cho
      `account === null`, và `reads.error` giờ hiện ra kèm `Try again` thay vì
      spinner vĩnh viễn (chính cái ngõ cụt exit gate cấm)

- [x] **Demo EOD** `pnpm demo:day6` (trong `apps/web`) — 10 beat có lời dẫn,
      **~55s** headless / ~2 phút headed, tự quay video vào `demo-results/`.
      Nằm ngoài `e2e/` nên không chạy cùng suite, cùng quy ước với
      `packages/contracts/demo/`

Tests: reveal cache clear khi TTL/reload/account/chain change ✅ · không plaintext
trong SSR/storage/DOM khi masked ✅ (đọc thẳng response SSR, không đọc DOM: câu
hỏi là server **gửi đi** cái gì) · 320px + desktop + keyboard ✅ (project
`mobile-320`).
**150 contract · 204 web unit (9 file) · 36 Playwright** — `tsc --noEmit` sạch.

**Exit gate ✅:** incognito user đi hết onboarding → masked dashboard → reveal/hide
own position · wrong-network/rejected recover được. Cả hai persona chạy trên
Sepolia thật, tự động, không có bước tay: ví trắng → `unavailable` + "Nothing is
stored for this wallet yet" (không phải `0`, không phải spinner); ví đã seed →
reveal → Hide → đổi account → đổi chain → reload, mỗi lần đều quay về masked;
huỷ chữ ký → panel R6 "Nothing was sent and nothing changed" + nút quay lại còn
bấm được.

**Cut:** bỏ section trang trí + orb animation; giữ privacy boundary + reveal.

---

## Day 7 — 25/08 — My Savings + Employer UX

- [ ] Savings: tabs Deposit/Withdraw/History; amount chỉ ở memory;
      state machine Approve → Encrypt → Review → Submit → Confirm → Sync
- [ ] `Withdraw all` không cần reveal; review dialog tách private vs public/linkable
- [ ] Stale-handle recovery; tx hash resume sau reload; faucet/shield helper
      + warning wrap amount là public
- [ ] Employer page (1 trang): overview + fund form + public allocated prize +
      notice "employer không xem được giá trị nhân viên, không chọn winner"

Tests: rejected approval/tx, wrong chain, relayer timeout, duplicate-submit,
draft không vào persistence/telemetry, employer negative-permission.

**Exit gate:** Jimmer deposit/withdraw qua UI trên contract thật · employer fund
prize thật qua UI · mọi error chỉ đúng recovery · giá trị mới masked đến khi
reveal tươi.

**Cut:** 1 sponsor wallet, 1 form; bỏ charts/exports/invite.

---

## Day 8 — 26/08 — Dark Draw Room + browser E2E

- [ ] Draw Room: phase timeline public, Trigger/Continue permissionless,
      orb tĩnh là đủ, onchain cursor là source of truth
- [ ] Sealed result → EIP-712 reveal (winner và loser UI giống hệt trước reveal)
- [ ] Claim review + linkage warning; Fairness Receipt là tab trong Draw Room
- [ ] E2E 2–3 browser profiles: fresh assets → deposit lệch thời gian →
      fund → snapshot/random/select → reveals → claim → withdrawAll
- [ ] Reload tại: approval, deposit pending, draw cursor, claim pending
- [ ] QA: mobile 5 màn, keyboard path, reduced motion, privacy regression
      (DOM/storage/network/telemetry)

**Exit gate (Product Complete):** browser E2E xanh · draw resume sau khi kill
keeper · claim đòi positive reveal + finalized · withdrawal reachable từ Draw Room ·
**mọi dòng ngày-6/7/8 trong `ERROR_RECOVERY_MATRIX.md` đã tick (UI + action + test)**.

---

## Day 9 — 27/08 — Sepolia Release Candidate

Sáng:
- [ ] Freeze contract; revalidate registry/token; deploy epoch ngắn cho demo
- [ ] Verify source trên explorer; `deployments/sepolia.json` (block, commit, ABI hash)
- [ ] Build web đúng manifest; keeper permissionless hoặc manual fallback documented

Chiều:
- [ ] Full Sepolia flow ≥2 wallets, lặp từ incognito
- [ ] RPC/relayer failure drill + manual Trigger/Continue
- [ ] CI + security/privacy/a11y suites; cập nhật toàn bộ docs + tx hashes
- [ ] Tag `rc-1`

**Exit gate (RC):** full cycle từ public URL · source verified khớp manifest ·
2 user chỉ reveal được của mình · conservation tests xanh · ví khác tiếp tục
được draw · site sống signed-out/mobile · không secret trong repo.

---

## Buffer 28/08 → 04/09

| Ngày | Việc |
|---|---|
| 28–30/08 | Hardening: relayer latency, stale handles, HCU benchmark tại cap thật, lặp live smoke ≥2 lần. **Đóng hết dòng còn ☐ trong `ERROR_RECOVERY_MATRIX.md`** |
| 31/08–01/09 | README + `ARCHITECTURE/DRAW_PROTOCOL/PRIVACY/THREAT_MODEL/RUNBOOK/KNOWN_LIMITATIONS` final; polish microcopy; architecture visual; rehearse video <2:50 |
| 02–04/09 | Tag `v1.0.0-season4`; quay video real-person; X intro thread; verify mọi link signed-out; submit trước freeze 04/09 18:00 ICT |

### Submission prep — checklist bắt buộc

**Đường nộp bài (đã mở trực tiếp và xác nhận 20/08):**
`forms.zama.org/developer-program-mainnet-season4-bounty-track` → redirect về
`forms.zama.org`, và **đây là trang nhiều bước, không phải form hiện field ngay**:

1. Bước 1 — trang giới thiệu challenge (requirements, rewards, deadline, resources).
   Nút cuối trang: **"See the challenge"**.
2. Bước 2 — brief đầy đủ: objective, why this matters, requirements, topics to cover,
   submission requirements, judging criteria. Nút cuối trang: **"Submit my project"**.
3. Bước 3 — wizard nộp bài thật. **Đã mở đọc toàn bộ field 23/08** (chỉ đọc, chưa điền
   gì) — cấu trúc: Submission guidelines → Step1. Register → Step2. Submit → Thank you.

→ **Post X KHÔNG phải kênh nộp bài.** X thread chỉ là 1 trong 4 deliverable. Kênh nộp
duy nhất là form ở bước 3. Không có bước đăng ký/wallet-connect nào chắn trước
(guild.xyz **đã ngừng dùng**, community chuyển sang `community.zama.org`).

**Field thật của wizard (đọc từ schema nhúng trong trang, 23/08):**

*Submission guidelines (interstitial — 3 cảnh báo quyết định chiến lược):*

- ⚠️ **Mỗi email chỉ submit được MỘT lần, và response KHÔNG sửa được sau khi submit**
  → single-shot; freeze 04/09 18:00 ICT là chốt thật, mọi link phải final trước khi bấm.
- Email phải đúng — **sai email ảnh hưởng eligibility nhận rewards**.
- Project name chứa "Zama" → **không đủ điều kiện** (giờ là rule chính thức của form,
  không chỉ là guideline của mình).

*Step1. Register:* Email\* · GitHub profile\* (url) · X profile\* (url) · LinkedIn
(url, optional) · "Add team members" (textarea optional — mỗi dòng: name, email,
wallet, GitHub profile, role).

*Step2. Submit:*

| Field | Kiểu | Ghi chú |
|---|---|---|
| Project name | text\* | không chứa "Zama" |
| Description | text\*, **max 140 ký tự** | phải draft + đếm trước, không viết tại chỗ |
| Link to smart contract code base | url\* | trỏ tag `v1.0.0-season4` |
| Link to frontend code base | url\* | monorepo → dán cùng link với contract |
| Demo website | url\* | live site, chạy được incognito |
| Video pitch | url\* | ≤3 phút, người thật, không AI voice/video, không tua nhanh. **Chỉ nhận host X / YouTube / Loom** — "posting your video on X and sharing the X link is preferred" |
| Link to X post | url\* | "tagging **@zama** and using the hashtag #ZamaDeveloperProgram"; chấp nhận single post / thread / article / chính pitch video |
| Leaderboard nếu thắng? | dropdown\* | "Yes, with my GitHub and X profile" / "No, I prefer to be anonymous" — quyết trước 04/09 |
| Feedback on the Bounty Track | text, optional | "What were the biggest friction points?" |
| Nhận email dev updates từ Zama | checkbox, optional | |
| CAPTCHA | bắt buộc | user tự thao tác toàn bộ bước submit |

⚠️ **Handle X của Zama đã đổi: `@zama` (không còn `@zama_fhe`)** — verify 23/08:
form ghi "tagging @zama", thank-you page link `x.com/zama`, và profile `x.com/zama`
là account thật (266K followers, bio Zama Protocol, domain mới zama.org). Mọi post
từ Day 3 trở đi tag `@zama`; skill x-post đã sửa theo.

Deliverable (theo trang submission + traceability §4 của IMPLEMENTATION_PLAN):

- [ ] **dApp hoạt động** — contract + frontend, public HTTPS URL, chạy được từ incognito
- [ ] **Live demo site** deploy sẵn, không cần setup riêng ngoài hướng dẫn
- [ ] **Video ≤3 phút**, **người thật pitch**, tốc độ bình thường, **không AI-generated**.
      Chứa: full cycle + user-decrypt + **~30s recovery** (xem ERROR_RECOVERY_MATRIX)
      + nói thẳng prize = employer-funded sponsored yield + RNG là PRNG mockup
- [ ] **Intro thread hoặc article trên X** — đây là deliverable, không phải optional.
      Tag `@zama` (handle mới — xem cảnh báo trên) + `#ZamaDeveloperProgram`. Build log
      hằng ngày ở `docs/social/day-NN-x-posts.md`, thread tổng hợp viết ở 02–04/09
- [ ] **Description ≤140 ký tự** draft sẵn + đếm bằng script (field bắt buộc của form,
      không viết tại chỗ lúc submit)
- [ ] **Public GitHub** — signed-out xem được; link trong form trỏ **release tag
      `v1.0.0-season4`**, KHÔNG trỏ `main` (main còn commit tiếp sau submit)
- [ ] `deployments/sepolia.json` khớp source đã verify trên explorer (address, block,
      commit, ABI hash)
- [ ] Tên project không chứa "Zama"; framing sponsored-yield có trong README + video
- [ ] `KNOWN_LIMITATIONS.md`: RNG mockup, wrapper deny list + maxTotalSupply, sponsored
      yield thay vì real yield

Ghi chú từ forum (staff Zama trả lời trực tiếp, S3): **commit tiếp sau khi submit là
được**, nên làm trên branch mới. → sau khi submit thì polish trên branch khác, tag đã
submit giữ nguyên.

### Judging criteria — nguyên văn từ trang challenge (20/08)

| Tiêu chí | Nguyên văn | Ta trả bằng gì |
|---|---|---|
| Correctness | "Do deposit, draw, claim, and withdraw produce the expected results onchain? Are EIP-712 flows implemented correctly?" | Invariant tests + full-cycle Sepolia smoke (Day 9) |
| Confidentiality design | "What stays encrypted? Is winner selection provably fair and deposit-weighted? Is any leakage minimal and documented?" | PRIVACY.md + TWAB/multiply-high doc + negative ACL tests |
| UX | "Is the app pleasant to use? **Does it handle approvals and errors gracefully?**" | `ERROR_RECOVERY_MATRIX.md` (R13/R14/R8/R15 bắt buộc) |
| Code quality | "clean, readable, well-typed, and well-documented" | TS strict monorepo, version pins, NatSpec |
| Production-readiness | "Is the live deployment stable on Sepolia? Could a real user trust it today?" | RC Day 9 + runbook + failure drill |

**Ba yêu cầu brief nói rõ mà plan phải khớp:**

1. *"Automate draws, or provide a documented keeper/admin flow to trigger them"* →
   keeper permissionless + manual fallback documented (đã có Day 9).
2. *"Provide a faucet or clear instructions so judges can obtain the test token"* →
   faucet nằm trong `/onboarding` (đã có trong scope cắt).
3. *"A mock yield source on Sepolia is acceptable (e.g., an admin-funded prize reserve),
   as long as the README documents how it works and how a real yield source would plug
   in"* → **framing sponsored-yield của mình được brief cho phép tường minh**. Chỉ cần
   README có mục "how a real yield source plugs in". Không phải điểm yếu nữa.

**Video — shot list brief yêu cầu, đúng thứ tự:** depositing → decrypting your pool
balance → a draw being triggered → claiming a prize → withdrawing principal, + giải
thích ngắn winner selection vẫn fair và confidential. Ràng buộc: ≤3 phút, **người thật**,
**tốc độ bình thường — không tăng tốc video**, không AI voice.

### Kênh visibility phụ (không bắt buộc, rẻ)

- `community.zama.org` category **Bounty Track**: post build thread + demo walkthrough
  như submission S3 đã làm; staff trả lời thread kỹ thuật trong ngày.
- Thread khiếu nại kết quả chấm thì không có ai xử lý → không xây chiến lược dựa vào
  fairness của judging, xây dựa vào "khó chê".

## Scorecard (cập nhật EOD mỗi ngày)

| Day | Date | Gate | Tests | Demo | Docs | Status |
|---:|---|---|---|---|---|---|
| 1 | 19/08 | Compatibility proven | ✅ 11 pass | ✅ `pnpm demo` | ✅ | ✅ Full — user xác nhận live user-decrypt trên /spike ra đúng 1000 (20/08) |
| 2 | 20/08 | Money in/out + invariants | ✅ 43 pass (+property+HCU) | ✅ `pnpm demo:day2` | ✅ | ✅ Local full — deposit callback, withdraw/withdrawAll, conservation, pause-proof exit |
| 3 | 21/08 | TWAB correct | ✅ 74 pass (26 TWAB exact-equality + 5 HCU đo thật) | ✅ `pnpm demo:day3` | ✅ | ✅ Local full 23/08 — 2:1 exact, freeze tại `epochEnd`, snapshot batch permissionless, DRAW_PROTOCOL.md + batch ceiling 21/tx |
| 4 | 22/08 | Encrypted draw correct | ✅ 103 pass (26 draw + 3 HCU Day 4 + Monte Carlo 64 epoch) | ✅ `pnpm demo:day4` | ✅ | ✅ Local full 24/08 — random 1 lần (AlreadyDrawn + handle equality), ticket P-2 exact `== (R·T)>>64`, đúng-1-winner structural (exact-replication + 1:3:6 ±3.5σ), stranger resume (R4), scan ceiling 22/tx, ACL 5 lớp (won contract-only §15.1) |
| 5 | 23/08 | Protocol full cycle | ✅ 150 pass (38 prize/claim/lifecycle + 5 HCU Day 5 + solvency property mở rộng) | ✅ `pnpm demo:day5` | ✅ | ✅ Local full 25/08 — employer fund bằng USDC công khai + pot tự `wrap` (R12 revert plaintext thật), carry roll encrypted (B4: 1,000 → winner epoch sau nhận 1,500), settle tự động trong `selectBatch` cuối + empty-pool Open→Settled (D9), `claim()` uniform **bằng nhau tuyệt đối** winner/non-winner (748,032 HCU / 396,250 gas — R9), `startNewEpoch` permissionless không đụng principal/pendingPrize (B3), ceiling scan giữ 22/tx, PRIVACY.md + THREAT_MODEL.md. **Red-team pass trên code đã ship: 0 P0**, siết 3 chỗ (rug window `defundPrize` sau khi weight freeze · `snapshotProgress`/`drawProgress` trả `total` của list hiện tại thay vì của chính epoch · `renounceOwnership` khi paused = pause vĩnh viễn) — ABI **không đổi**, chi tiết `docs/handoffs/DAY_05_HANDOFF.md` |
| 6 | 24/08 | Entry/dashboard | ◐ 70 web unit + 1 e2e (COOP/COEP) | ☐ | ◐ | ◐ **Prep xong 26/08** — shared ABI/manifest, SDK error taxonomy (31 code → R1–R15) + read model handle-only, Tailwind v4 tokens §14.2, Vitest+RTL+Playwright xanh, probe live cUSDC (đóng blocker Day 9; phát hiện wrapper **upgradeable và đã upgrade** → KNOWN_LIMITATIONS §10, faucet mở → R14 in-app, unwrap public amount → PRIVACY §2.3, R1 detect bằng 1 view call). **Chặn:** dev deploy Sepolia cần ví của anh |
| 7 | 25/08 | Money UX | ☐ | ☐ | ☐ | — |
| 8 | 26/08 | Browser E2E | ☐ | ☐ | ☐ | — |
| 9 | 27/08 | Sepolia RC live | ☐ | ☐ | ☐ | — |

**Red rule:** Day 1 chưa có live user-decrypt / Day 2 chưa có withdrawAll
invariant / Day 4 draw cần plaintext total / Day 5 chưa full cycle / Day 8 chưa
E2E / Day 9 chưa public smoke → dừng mọi polish, quay lại critical path, áp cut
rule của ngày.
