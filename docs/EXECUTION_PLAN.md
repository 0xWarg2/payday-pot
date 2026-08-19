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
- [ ] `PayDayPot.sol` non-upgradeable: immutable token/employer/epochDuration/caps
- [ ] Encrypted zero init tường minh (không dùng uninitialized handle như 0)
- [ ] Deposit theo đường đã chốt D2; credit **actualTransferred**, không credit request
- [ ] Lazy registration khi deposit đầu > 0 (P-4)
- [ ] `withdraw(externalEuint64, proof)` + `withdrawAll()` không cần reveal trước
- [ ] ReentrancyGuard, CEI; pause chỉ chặn deposit/new-draw, KHÔNG chặn withdraw/claim
- [ ] ACL refresh trên mọi handle mới; events chỉ chứa action/user/epoch

Tests:
- [ ] Deposit thường / requested > available / zero / invalid proof / wrong token
- [ ] Jimmer decrypt được principal của mình; Warg và employer bị từ chối
- [ ] Partial withdraw, withdrawAll idempotent, withdraw khi paused
- [ ] Property: chuỗi deposit/withdraw ngẫu nhiên bảo toàn principal
- [ ] Request > balance không burn claim, không leak qua error message

**Exit gate:** toàn bộ trên xanh local · không plaintext amount trong event/log ·
không admin sweep.

**Cut nếu trượt:** ship `withdrawAll` trước partial polish. KHÔNG defer invariants.

---

## Day 3 — 21/08 — Encrypted TWAB

**Mục tiêu:** weight = encrypted balance × time, đóng băng đúng tại `epochEnd`.

- [ ] Account: `euint64 principal`, `euint64 twabArea` (P-3), `uint64 lastCheckpoint`
- [ ] `_checkpoint(user, min(now, epochEnd))` trước mọi mutation
- [ ] `area += balance × publicElapsed`; KHÔNG chia epochDuration (P-1)
- [ ] Snapshot batch + cursor; freeze participant list/order/count
- [ ] Deposit disabled trong snapshot; withdraw vẫn chạy (checkpoint trước)
- [ ] Enforce caps P-3 tại deposit (per-user principal cap)

Tests: 100 full epoch vs 100 half epoch = 2:1 · 50 nửa đầu + 100 nửa sau = 75 tương đối ·
last-second deposit ≈ 0 · delayed draw không cộng thêm sau `epochEnd` ·
withdraw sau cutoff không đổi frozen weight · boundary tests tại mọi cap.

**Exit gate:** mọi scenario chuẩn khớp · snapshot dùng `epochEnd` không phải
thời điểm draw · withdraw sống trong snapshot · caps enforced + documented ·
đo HCU thực tế 1 participant, ghi vào `DRAW_PROTOCOL.md`.

---

## Day 4 — 22/08 — FHE random + weighted selection

**Mục tiêu:** một draw bất biến chọn đúng một encrypted winner.

- [ ] Phases: Open → Snapshotting → RandomReady → Selecting → Finalized
- [ ] `FHE.randEuint64()` đúng 1 lần sau khi total freeze; cấm reroll
- [ ] Ticket: promote `euint128`, `mul`, rồi **`FHE.shr(product, 64)`** (P-2)
- [ ] Cumulative scan: `hit = hasWeight && !selected && ticket < cumulative`;
      `FHE.select` award; không `if(ebool)`, không encrypted index
- [ ] Cursor monotonic; batch functions permissionless
- [ ] Zero-participant / zero-weight → prize rollover, không decrypt total

Tests: ticket ∈ [0,T) · đúng 1 winner khi T>0 · không winner không mất prize khi
T=0 · reroll/cursor regression bị reject · Monte Carlo phân phối 1:3:6 ·
overflow boundary max R × max T · HCU/participant → chốt batch size.

**Exit gate:** không tồn tại `% encryptedTotal` · random 1 lần/epoch · ví lạ
tiếp tục được draw từ cursor · keeper không cung cấp seed/weight/winner ·
full capped draw vừa trong bounded tx trên số HCU đã đo.

---

## Day 5 — 23/08 — Prize, claim, protocol vertical slice

**Mục tiêu:** local full cycle xanh; prize và principal bảo toàn độc lập.

- [ ] Employer funding; allocated prize là **public uint64** (P-4); không allocate quá backing
- [ ] Credit encrypted `pendingPrize` trong winner scan + ACL cho từng user
- [ ] `claim()` idempotent; giảm liability bằng actual transfer; KHÔNG làm `claimFor`
- [ ] Finalize/reset epoch không đụng principal
- [ ] Script integration Jimmer/Warg/Carol: weights khác nhau → fund → draw →
      từng người decrypt kết quả riêng → winner claim → tất cả withdrawAll
- [ ] Negative ACL: employer/keeper/user khác đều bị từ chối
- [ ] Draft `PRIVACY.md`, `THREAT_MODEL.md`, `KNOWN_LIMITATIONS.md` từ behavior thật
- [ ] Freeze ABI (chỉ sửa khi blocker)

**Exit gate (Protocol Complete):** full local flow từ fresh state · đúng 1 user
decrypt prize dương, còn lại zero · claim chuyển đúng 1 lần · prize không đổi
principal liability · mọi người rút đủ principal.

---

## Day 6 — 24/08 — Shell + Landing/Onboarding + Dashboard

- [ ] Design tokens, responsive shell, light theme + dark Draw Room boundary
- [ ] Wallet/network/role guards; transaction center; client-only FHE provider;
      reveal store in-memory TTL 5 phút
- [ ] Landing: hero, how-it-works, privacy comparison, no-loss promise
      (+ section faucet/learn — không route riêng)
- [ ] Onboarding: role → connect → switch Sepolia → test assets/shield warning → enroll
- [ ] Dashboard: masked principal/TWAB card, EIP-712 reveal/hide/TTL, public next
      draw + employer boost, quick actions
- [ ] Copy đúng bảng corrections §2 spec (không "Payroll connected", không "TWAB score 87")

Tests: reveal cache clear khi TTL/reload/account/chain change · không plaintext
trong SSR/storage/DOM khi masked · 320px + desktop + keyboard.

**Exit gate:** incognito user đi hết onboarding → masked dashboard → reveal/hide
own position · wrong-network/rejected recover được.

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
keeper · claim đòi positive reveal + finalized · withdrawal reachable từ Draw Room.

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
| 28–30/08 | Hardening: relayer latency, stale handles, HCU benchmark tại cap thật, lặp live smoke ≥2 lần |
| 31/08–01/09 | README + `ARCHITECTURE/DRAW_PROTOCOL/PRIVACY/THREAT_MODEL/RUNBOOK/KNOWN_LIMITATIONS` final; polish microcopy; architecture visual; rehearse video <2:50 |
| 02–04/09 | Tag `v1.0.0-season4`; quay video real-person; X thread; **mở form đọc toàn bộ trước** (one-shot!); verify mọi link signed-out; submit trước freeze 04/09 18:00 ICT |

**Lưu ý form:** rule "video ≤3 phút" và "tên không chứa Zama" chưa verify được
trên trang công bố — phải đọc trực tiếp trong form NGAY khi mở, không đợi 04/09.

---

## Scorecard (cập nhật EOD mỗi ngày)

| Day | Date | Gate | Tests | Demo | Docs | Status |
|---:|---|---|---|---|---|---|
| 1 | 19/08 | Compatibility proven | ✅ 11 pass | ✅ `pnpm demo` | ✅ | Local ✅ — live Sepolia chờ ví |
| 2 | 20/08 | Money in/out + invariants | ☐ | ☐ | ☐ | — |
| 3 | 21/08 | TWAB correct | ☐ | ☐ | ☐ | — |
| 4 | 22/08 | Encrypted draw correct | ☐ | ☐ | ☐ | — |
| 5 | 23/08 | Protocol full cycle | ☐ | ☐ | ☐ | — |
| 6 | 24/08 | Entry/dashboard | ☐ | ☐ | ☐ | — |
| 7 | 25/08 | Money UX | ☐ | ☐ | ☐ | — |
| 8 | 26/08 | Browser E2E | ☐ | ☐ | ☐ | — |
| 9 | 27/08 | Sepolia RC live | ☐ | ☐ | ☐ | — |

**Red rule:** Day 1 chưa có live user-decrypt / Day 2 chưa có withdrawAll
invariant / Day 4 draw cần plaintext total / Day 5 chưa full cycle / Day 8 chưa
E2E / Day 9 chưa public smoke → dừng mọi polish, quay lại critical path, áp cut
rule của ngày.
