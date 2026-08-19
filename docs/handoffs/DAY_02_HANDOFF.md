# Day 2 Handoff — 20/08/2026

## Trạng thái gate (từ EXECUTION_PLAN Day 2)

| Gate item | Trạng thái |
|---|---|
| Deposit qua callback, credit **actual** encrypted amount | ✅ headroom check + `FHE.select`, all-or-nothing |
| Partial withdraw + `withdrawAll` (mọi phase, xuyên pause) | ✅ `FHE.min` clamp, không revert/leak; idempotent |
| No-loss invariant: Σ principals == totalPrincipal == pot balance | ✅ deterministic test + property test 30 ops (seed `0xda72`) |
| Toàn bộ tests xanh local | ✅ **43 passing** (`npx hardhat test`) |
| Events/errors không plaintext amount | ✅ grep sạch — events chỉ user/epochId, data `"0x"` |
| Không tồn tại hàm sweep principal | ✅ grep sạch — chỉ deposit/withdraw đụng principal |
| Demo 1 lệnh | ✅ `pnpm demo:day2` |
| Workspace xanh | ✅ `pnpm -r build && pnpm -r test` + lint + typecheck |
| Local deploy wiring | ✅ `npx hardhat deploy` (1,582,528 gas); Sepolia throw "Day 9" |

**Gate Day 1 cũng đã đóng full**: user xác nhận "Decrypt my value" trên `/spike`
ra đúng **1000** (20/08) → B7 ✅, scorecard Day 1 = Full.

## Demo (chạy lại được ngay)

```bash
cd "packages/contracts" && pnpm demo:day2
```

Expected narration: deploy stack → Jimmer wrap 15,000 (public cuối cùng) →
deposit enc(6,000), event data `"0x"` → tự decrypt ✅ 6,000 → Warg 🔒 / employer 🔒
DENIED → partial withdraw 1,500 → deposit 8,000 vượt headroom 5,500 → **refund
im lặng, tx vẫn success** → pause: deposit chặn (EnforcedPause), `withdrawAll()`
**chạy xuyên pause**, ví phục hồi 15,000 → conservation total=0, potBalance=0 +
HCU in ra. Kết thúc `1 passing`.

## HCU đo thật (fhevm.computeTransactionHCU, mock)

| Tx | globalHCU (limit 20M) | maxHCUDepth (limit 5M) |
|---|---|---|
| Deposit lần đầu (kèm register) | 2,079,224 | 780,000 |
| Deposit lặp lại | 2,079,160 | 780,000 |
| Partial withdraw | 1,129,032 | 588,000 |
| withdrawAll | 910,032 | 369,000 |

→ còn ~90% headroom global cho TWAB accrual Day 3 và snapshot/draw batch Day 4–5.

## Files chính

- `packages/contracts/contracts/PayDayPot.sol` — ~320 dòng, non-upgradeable,
  `IERC7984Receiver + ZamaEthereumConfig + Ownable2Step + Pausable + ReentrancyGuard`
- `contracts/mocks/TestUSDC.sol` + `TestConfidentialUSDC.sol` (OZ không ship mock — quirk #15)
- `test/PayDayPot.ts` (30 tests) · `test/PayDayPot.property.ts` (seed 0xda72) · `test/PayDayPot.hcu.ts`
- `demo/demo-day2.ts` · `deploy/02-payday-pot.ts` · `.solhint.json` (mới)
- Docs mới/sửa: `docs/KNOWN_LIMITATIONS.md` (mới), `COMPATIBILITY_NOTES.md` §7
  quirks 10–16, `ERROR_RECOVERY_MATRIX.md` R2/R10/R15 nửa contract ✅

## Quyết định đã chốt hôm nay

1. **P-4 REVISED (user duyệt)**: registration **plaintext-gated** (đúng token +
   chưa full + chưa pause). Gate theo "actualCredited > 0" bất khả thi vì mọi
   cách branch/decrypt trên ebool đều leak ≥1 bit amount. Trade-off: ví bị
   refund/clamp-0 vẫn chiếm slot → KNOWN_LIMITATIONS §2 (+ ý tưởng slot-recycling P2).
2. **Cap check bằng headroom, không tryAdd**: `headroom = cap − principal` (không
   underflow vì invariant principal ≤ cap), `ok = amount ≤ headroom`,
   `credited = select(ok, amount, 0)` — all-or-nothing (R2), wrap-safe.
3. **Constructor FHE-free + lazy-init `_totalPrincipal`** (`FHE.isInitialized`
   guard trong deposit callback) — FHE ops trong constructor revert dưới
   `hardhat deploy` vì mock coprocessor chỉ init trong test runner (quirk #13).
   Hệ quả view `totalPrincipal()`: trả zero-handle trước deposit đầu tiên —
   UI phải render "unavailable", KHÔNG phải 0 (non-negotiable #8).
4. **Dual ACL grant trên retval**: `allowThis(ok)` + `allowTransient(ok, token)` —
   thiếu 1 trong 2 là revert (quirk #11).
5. Custom errors testable xuyên token nhờ ERC7984Utils re-revert đúng reason
   bytes (quirk #12) → assert chính xác `NotToken`/`PoolFull`/`EnforcedPause`.

## Vì sao KHÔNG có reentrancy test

External call duy nhất của pot là `TOKEN.confidentialTransfer(to, euint64)` tới
token **immutable trusted**, path đó không có callback hook (không phải
`AndCall` variant) → không có bề mặt reentry thực để test. `nonReentrant` vẫn
gắn trên deposit/withdraw như defense-in-depth. Đường vào duy nhất có callback
là token → pot (deposit), và CEI + clamp đã cover.

## Quirks phát hiện hôm nay (chi tiết: COMPATIBILITY_NOTES §7)

- **#10 handle aliasing**: handle = keccak(op, inputs) không counter → 1 depositor
  thì `_totalPrincipal` alias handle principal → test ACL contract-only phải
  diverge lịch sử (2+ depositor) trước khi assert rejected. Có test pin alias này.
- #11 dual grant retval · #12 error bubbling · #13 FHE-in-constructor ·
  #14 `computeTransactionHCU`/`debugger.decryptEuint` · #15 OZ no mocks ·
  #16 `@types/chai-as-promised@7.1.8` (pin exact, thiếu là typecheck fail).

## Đang dở / chờ

- **Refund-on-ebool-false chỉ verify local (OZ 0.5.3)** — live ConfidentialWrapperV3
  chưa probe. Đánh dấu recheck Day 9 (COMPATIBILITY_NOTES §2, §5). Stretch nếu
  rảnh: `RefundProbe.sol` throwaway lên Sepolia, cần user có cUSDC.
- UI-half của R2/R10/R15 chờ Day 7.

## Việc đầu tiên Day 3

Fill body `_checkpoint(user)` trong `PayDayPot.sol`: cộng TWAB accrual
`twabArea += principal × (nowCapped − lastCheckpoint)` bằng FHE mul với
**plaintext elapsed** (không chia onchain — rule TWAB), promote nếu cần theo
budget P-3 (đã validate tích `cap × perUserCap × epochDuration < 2^64` trong
constructor nên `euint64` đủ). **Không đổi signature/call-site** — mọi chỗ gọi
`_checkpoint` đã đặt sẵn đúng vị trí (trước mọi principal mutation). Sau đó
`startNewEpoch`/phase transition + snapshot cursor theo EXECUTION_PLAN Day 3.

## Số liệu

- Test suite: 43 passing (~8s full, property 576ms). Demo: 1 passing.
- Local deploy PayDayPot: 1,582,528 gas.
- Pins mới: `@types/chai-as-promised@7.1.8` (devDep, exact).
