# Day 5 Handoff — 25/08/2026 (label plan: 23/08, trễ 2 ngày — vẫn trong buffer, freeze 04/09)

**Protocol Complete.** Vòng đời khép kín: employer fund → deposit → snapshot →
draw → settle → claim → epoch mới. Suite **150 tests xanh** (103 cũ + 38 prize/
claim/lifecycle + 5 HCU Day 5 + solvency property viết lại + 4 test Day 4 sửa
theo hành vi mới; 3 test cuối là regression cho red-team pass bên dưới).
Contract-side của protocol **xong** — từ Day 6 là web.

## Trạng thái gate (từ EXECUTION_PLAN Day 5)

| Gate | Trạng thái |
|---|---|
| Full local flow từ fresh state | ✅ `pnpm demo:day5`, 12 beat, không sentinel |
| Đúng 1 user decrypt prize dương, còn lại zero | ✅ mỗi saver tự EIP-712 decrypt `pendingPrizeOf`; đúng 1 số dương == prize |
| Claim chuyển đúng 1 lần | ✅ claim lần 2 chuyển 0, không revert (R9) |
| Prize không đổi principal liability | ✅ `principalBefore == principalAfter` qua toàn bộ prize flow; `totalPrincipal` bất biến |
| Mọi người rút đủ principal | ✅ cả 3 `withdrawAll` về đúng 10,000; pot balance về **đúng 0** |

## Demo (chạy lại được ngay)

```bash
cd packages/contracts && pnpm demo:day5
```

Beats: deploy + wrap → **employer thiếu tiền ⇒ revert plaintext** (R12) →
fund 1,000 → 3 saver deposit lệch giờ → defund 200 (prize còn 800) → payday +
snapshot → **fund bị từ chối** (`WrongPhase`) → `requestRandom` → **defund bị
từ chối** (B2) → ví lạ `selectBatch(32)` phát `EpochSettled` → mỗi saver tự
decrypt prize của mình, **đúng 1 người dương** → employer/keeper/owner đều
DENIED → owner pause, **winner vẫn claim được** (+800) → claim lần 2 chuyển 0 →
non-winner claim chuyển 0 với **gas bằng đúng winner** → principal không đổi →
cả 3 `withdrawAll` đủ 10,000 → pot balance = 0 → `startNewEpoch` → deposit mở lại.

## HCU đo thật Day 5 (bảng đầy đủ: `docs/DRAW_PROTOCOL.md` §4)

| Tx | globalHCU | maxHCUDepth | gas |
|---|---:|---:|---:|
| `fundPrize` (ERC-20 pull + `wrap` by contract) | 586,064 | 531,032 | 322,665 |
| `defundPrize` | 586,096 | 369,032 | 386,651 |
| `claim()` — **winner** | 748,032 | 369,000 | 396,250 |
| `claim()` — **non-winner** | **748,032** | **369,000** | **396,250** |
| `startNewEpoch()` — reset pool đầy 32 | 64 | 32 | 850,516 |
| `requestRandom` (sau khi thêm carry-add) | 1,909,224 | 1,747,064 | 399,595 |
| `selectBatch(1)` | 574,034 | 550,032 | 338,712 |

Hai dòng `claim` **bằng nhau tuyệt đối trên cả ba trục** — không phải xấp xỉ.
Đây là bằng chứng đo được cho uniform-claim (THREAT_MODEL T1), đo độc lập ở
`PayDayPot.prize.ts` **và** `PayDayPot.hcu.ts`.

**Ceiling scan giữ nguyên 22/tx** — loop 7-op không bị đụng một chữ nào, đúng
ràng buộc #3 của Day 4. Day 5 chỉ đổi *nguồn* `prizeEnc` (trivial-encrypt →
`ep.prizeCipher`), và chỗ đổi nằm **ngoài** loop.

`startNewEpoch` là ca **gas mới là ràng buộc, không phải HCU**: 64 HCU (2 shared
handle dùng lại) nhưng 850,516 gas ở cap 32 — 26,579 gas/participant, 1 tx
không chia nhỏ được. Test assert `< 10M`.

## Files chính hôm nay

- `contracts/PayDayPot.sol` — `fundPrize` / `defundPrize` / `claim` /
  `startNewEpoch`; `euint64 prizeCipher` trong Epoch; `euint64 private
  _prizeCarry`; empty-pool fast path Open→Settled; settle branch trong
  `selectBatch`; view `prizeAmountOf` / `prizeCipherOf` / `prizeCarry`;
  immutable `UNDERLYING` / `RATE`.
- `test/PayDayPot.prize.ts` — **mới, 35 tests**.
- `test/PayDayPot.property.ts` — **viết lại**: fuzz có fund/defund/claim,
  invariant solvency đọc hoàn toàn từ chain state.
- `test/PayDayPot.hcu.ts` — thêm block Day 5 + fixture 32 người.
- `test/CompatSpike.ts` + `contracts/CompatSpike.sol` — spike wrap-by-contract (C0).
- `demo/demo-day5.ts` + script `demo:day5`.
- Docs: `PRIVACY.md` (mới), `THREAT_MODEL.md` (mới), `DRAW_PROTOCOL.md` §1/§2/
  §4/§5/§6/§7, `KNOWN_LIMITATIONS.md` §6/§7 + §8/§9 mới,
  `ERROR_RECOVERY_MATRIX.md` R9/R12, `COMPATIBILITY_NOTES.md` quirk #19.

## Quyết định đã chốt hôm nay

1. **Employer fund bằng underlying USDC công khai, pot tự `wrap` đồng bộ.**
   Không nhận confidential transfer: clamp ERC-7984 là **all-or-nothing**, ví
   thiếu tiền sẽ chuyển enc(0) *âm thầm* trong khi `prizeAmount` vẫn cộng đủ ⇒
   pot hứa nhiều hơn số có ⇒ winner ăn vào principal người khác. Pull ERC-20
   thì **revert plaintext** — đó chính là R12, và nó làm allocation ≡ funding ≡
   transfer thật. Giá phải trả: employer fund là **2 tx**.
2. **Gate carry-commit, không phải gate `drawn`.** Bất biến thật là "carry đã
   commit chưa", và nó commit iff `drawn == true` **hoặc** `phase == Settled`.
   `fundPrize` yêu cầu `phase == Open`; `defundPrize` yêu cầu `!drawn && phase
   != Settled`. Nếu chỉ check `!drawn` thì empty-pool settle (để `drawn` ở
   `false`) cho employer rút mất đúng phần vừa cam kết vào carry.
3. **Rollover bằng carry mã hoá**, không bằng nhánh plaintext:
   `_prizeCarry = FHE.select(selectedAny, 0, prizeCipher)` ở tx chốt scan.
   Không ai — kể cả employer — đọc được carry, vì nó mang đúng bit "epoch trước
   có winner không".
4. **`claim()` không phase gate, không pause gate, và non-winner claim
   THÀNH CÔNG.** Một require phân biệt winner/non-winner sẽ biến
   revert-hay-không thành oracle công khai chỉ ra ai thắng.
5. **Settle tự động trong `selectBatch` cuối**, không có hàm `settle()` rời —
   permissionless, không thêm bước cho keeper.
6. **(D9) Pool rỗng: `beginSnapshot` settle thẳng Open→Settled**, prize cộng
   vào carry. Bắt keeper đốt 1.75M HCU để "draw" pool rỗng là vô nghĩa.
7. **Epoch mới lấy `start = block.timestamp`**, không backfill `prev.end` —
   backfill làm keeper trễ 8 ngày sinh ra epoch 7 ngày *đã hết hạn khi vừa mở*.

## Kỹ thuật test đáng giữ

- **Solvency invariant quan sát được, không dùng model.** Mọi số hạng phía
  prize đọc từ chain (`phase`, `drawProgress`, `selectedAny`, `prizeCipherOf`,
  `prizeCarry`, `prizeAmountOf`), nên nó không thể "đồng ý" với bug bằng cách
  dùng chung giả định với contract. Ba chế độ: chưa drawn / đang Drawing (carry
  **không** được cộng — nó đã nằm trong prizeCipher, đây đúng là bug
  double-count) / Settled.
- **Counter ép mọi nhánh phải chạy thật.** Vòng fuzz đầu tiên pass trong 2.3s —
  và pass *rỗng*: 100% lệnh defund rơi vào nhánh revert, carry chưa bao giờ
  khác 0. Thêm counter (`funded`, `defunded`, `walletClamps`, `capRefunds`,
  `paidClaims`, `winnerEpochs`, `winnerlessEpochs`) rồi assert từng cái `> 0`
  mới lòi ra. **Test xanh không có nghĩa là test có chạy.**
- **`soleWinnerSetup` — winner tất định không cần điều khiển RNG.** Một người
  deposit bình thường (weight dương), người kia deposit `PER_USER_CAP + 1` để
  bị refund toàn phần ⇒ đăng ký với weight 0. Vì `ticket = ⌊R·T/2^64⌋ < T`,
  participant weight-dương đầu tiên **luôn** cross. Dùng được ở mọi test cần
  "winner là người này" mà không đụng tới random (quirk #17: rand không seed được).
- **Anti-leak đo bằng số, không bằng lời.** So `globalHCU`/`maxHCUDepth`/
  `gasUsed` của winner vs non-winner bằng `.to.eq()` — bằng nhau **tuyệt đối**,
  không phải band dung sai.

## Red-team pass trên code đã ship (25/08, sau C6)

Chạy adversarial review trên toàn bộ contract sau khi C0–C6 xong. **Không có
P0.** Xác nhận SOLID: không reentrancy trên `claim` (đọc source
`@openzeppelin/confidential-contracts@0.5.3` — `_update` không gọi ra ngoài,
`checkOnTransferReceived` chỉ chạy từ `_transferAndCall`, `TestConfidentialUSDC`
không hook); sub-by-actual hợp lệ nhờ `FHE.allow(transferred, from)` persistent;
clamp all-or-nothing nên claim bị clamp vẫn giữ nguyên `pending` để claim lại;
gate carry-commit đúng; shared-handle reset an toàn; `prizeCipher` không wrap
được (chặn bởi `_checkConfidentialTotalSupply < 2^64`); không double-award qua
biên batch; 0 `makePubliclyDecryptable`; 8/8 `FHE.allow` grant đúng chủ dữ liệu;
không event nào mang amount/winner.

**3 finding đã sửa trong ngày** (test regression đi kèm từng cái, ABI **không**
đổi — hash bên dưới giữ nguyên):

| # | Finding | Sửa |
|---|---|---|
| P1 | **Rug window của `defundPrize`.** Gate `!drawn && phase != Settled` mở cả `Snapshotting` lẫn `Drawing`-unpaused — tức sau khi deposit đóng và weight đã freeze. Red-team dựng lại: fund 5,000 → saver giữ tiền cả epoch → `beginSnapshot` + `snapshotBatch` → `defundPrize(5000)` **thành công** → mọi `pendingPrize` = 0. Saver không gỡ được weight để thoát ⇒ rug, không phải exit | Gate viết lại thành `openWindow = Open && block.timestamp < ep.end` **hoặc** `stalledByPause = Drawing && !drawn && paused()`. Nguyên tắc: employer đổi prize được đúng chừng nào saver đổi deposit được. `Snapshotting` không cần cửa (permissionless *và* không pausable ⇒ không kẹt được) |
| P1 | **`snapshotProgress`/`drawProgress` trả sai `total` cho epoch cũ.** Cả hai đọc `_participants.length` *hiện tại*, mà list không bao giờ reset ⇒ `drawProgress(1)` trả `(true, 1, 3)` — "1/3 đã quét" cho epoch đã settle. Đúng tín hiệu R4/R5 bảo UI vẽ "resumable" | Thêm `Epoch.frozenCount` chốt tại `beginSnapshot`; view trả `frozenCount` cho epoch đã snapshot, list hiện tại cho epoch còn `Open` |
| P2 | **`renounceOwnership` không override.** Pause + renounce = 2 tx biến pause thành vĩnh viễn: `requestRandom` revert mãi, `_prizeCarry` khoá theo | Override thêm `whenNotPaused`. Unpause trước rồi renounce — cùng kết cục, bỏ cái bẫy |

**2 finding trả lời bằng doc, không đổi hành vi:**

- **`prizeAmount` không bị zero khi settle.** Tiền an toàn (không chỗ nào đọc
  lại; payout sống trong `prizeCipher`), và số đó là *lịch sử công khai* của
  sponsor — panel employer Day 7 cần. Đã ghi NatSpec tại `prizeAmountOf`:
  đừng đọc nó thành "prize còn giữ".
- **`selectBatch(32)`/`snapshotBatch(32)` revert trên pool đầy 32.** Trần đo
  được là 21 (snapshot) / 22 (scan). Không phải bug — nhưng
  ERROR_RECOVERY_MATRIX R4 trước đó không nêu số, nên UI dễ gửi 32 rồi ăn
  revert. Đã ghi số vào R4 kèm chỉ dẫn: nút "Continue" gửi `maxSteps` ≤ 16.

**Finding thứ 6 xác nhận thứ đã ship:** claim CTA lộ hành vi — đúng T1 của
`THREAT_MODEL.md` và ràng buộc Day 6 #2 dưới đây.

## ABI freeze (Day 5, trước Sepolia Day 9)

```
sha256(JSON.stringify(abi)) = 1043e9dc3870da6762b138f093bcb0857e1e59be3a821eaf6ebd3ed7d4f2732b
84 ABI entries · 45 functions
```

Field mới `prizeCipher` nằm **trong** struct `Epoch` nhưng **không** phải ABI
break: không view nào trả nguyên struct (`epochInfo` chỉ trả
`start`/`end`/`phase`, `drawStateOf` trả 4 handle rời). `frozenCount` (fix
red-team) cũng vậy — hash trên đo **sau** khi cả 3 fix đã vào, và nó y hệt hash
đo trước đó: không fix nào chạm ABI (`renounceOwnership` vốn đã có sẵn từ
`Ownable`, override không đổi signature).

**Từ đây ABI đóng băng** — sửa chỉ khi có blocker thật, và phải cập nhật hash
này + `deployments/sepolia.json` cùng lúc. Web Day 6/7 code theo ABI này.

## Đang dở / chờ

- **Sepolia deploy vẫn CHẶN tới Day 9.**
- **Blocker Day 9 (quirk #19)**: `ConfidentialWrapperV3` live chưa probe —
  `underlying()`, `rate()`, và một `wrap` **gọi bởi contract**. Constructor pot
  đọc 2 selector đó và giữ làm immutable ⇒ pot chỉ deploy được lên wrapper.
  Thêm vào `pnpm validate:registry` hoặc Day 9 checklist.
- `PAYDAY_POT_IMPLEMENTATION_PLAN.md` :987, :1269, :1663 vẫn viện dẫn
  `claimFor` (đã scope-cut) — **stale**; `THREAT_MODEL.md` T1 là nguồn đúng.
- `reclaimCarry()` (P2, chưa làm): chỉ mở khi `participantCount == 0`. Nếu pool
  chết vĩnh viễn thì carry roll mãi — không mất, không rút được
  (`KNOWN_LIMITATIONS.md` §8).
- 3 file social day-03 + 3 file day-04 vẫn dirty/untracked — **KHÔNG add**.

## Việc đầu tiên Day 6 — RÀNG BUỘC TỪ DAY 5 (đọc trước khi viết web)

1. **UI không bao giờ render `0` cho giá trị confidential đang ẩn** (rule #8).
   Handle chưa init = `bytes32(0)` ≠ enc(0). Ba trạng thái phân biệt được:
   *unavailable* (chưa init) / *hidden* (chưa decrypt) / *0 thật* (đã decrypt
   ra 0). `pendingPrizeOf` trước scan là `ZeroHash` — đúng ca này.
2. **Nút claim luôn enabled cho MỌI participant**, chữ là "claim your round
   result" chứ không phải "claim your prize" (THREAT_MODEL T1: càng nhiều
   người claim đều thì tín hiệu timing càng nhiễu). Non-winner claim không
   revert — đừng disable nút để "tiết kiệm gas cho user".
3. **Employer panel phải hiện "step 1/2"** (`USDC.approve` → `fundPrize`) —
   R13. Và **không** hiện prize như cam kết: "current prize · can change until
   the draw", chuyển "locked" khi `drawn == true` (THREAT_MODEL T3).
4. **Dead window sau `epochEnd`**: deposit revert `WrongPhase` từ `ep.end` tới
   `startNewEpoch`. UI phải hiện "entries closed — next round opens soon" (đọc
   `epochInfo` để phân biệt với WrongPhase khác), và nên có nút "start next
   round" cho chính user khi `phase == Settled`.
5. **Decrypted value chỉ sống trong memory tab**: TTL 5 phút, clear khi hide/
   reload/đổi account/đổi chain. Không localStorage, không URL, không analytics
   (rule #5 — pin bằng E2E Day 8).
6. **Đọc `drawProgress(epochId)`** cho "scan x/32" (R4) và `snapshotProgress`
   cho "frozen x/32". Cả hai public, không cần decrypt.

## Số liệu

- Tests: **150 passing** (11 → 43 → 74 → 103 → 147 → 150 sau red-team).
- Commit Day 5 trên `dev`: `0549d95` (spike) → `c53ea75` (funding) → `f083cf7`
  (carry+settle) → `e6ba5ed` (claim+lifecycle) → `414c0d5` (tests) → `5db7310`
  (HCU) → `31eeced` (demo) → docs.
- HCU: claim 748k (uniform), fundPrize 586k, startNewEpoch 850k **gas** ở cap 32,
  requestRandom 1.909M, scan marginal 574k → ceiling **22/tx** (không đổi).
- `FHE.makePubliclyDecryptable` trong toàn contract: **0**. `FHE.allow(h, addr)`:
  **8**, cả 8 grant cho đúng chủ dữ liệu.
