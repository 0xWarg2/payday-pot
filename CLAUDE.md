# CLAUDE.md — PayDay Pot

Confidential prize-savings pool (PoolTogether-style) trên Zama FHEVM.
Zama Developer Program **Season 4** submission — deadline 05/09/2026 23:59 AOE,
internal freeze 04/09 18:00 ICT. Network: **Ethereum Sepolia** (testnet).

## Đọc trước khi code

| File | Khi nào |
|---|---|
| `docs/EXECUTION_PLAN.md` | **Luôn luôn** — plan thực thi chính thức, ngày nào việc nấy, exit gates |
| `docs/PAYDAY_POT_IMPLEMENTATION_PLAN.md` | Spec chi tiết: screens (§7–11), contract math (§17–18), privacy (§15), tests (§22) |
| `docs/PAYDAY_POT_VISUAL_STYLE.md` | Chỉ khi tạo ảnh build-in-public |
| `COMPATIBILITY_NOTES.md` (tạo ở Day 1) | Trước khi đụng bất kỳ FHE/ERC-7984 API nào |

Plan 10 ngày cũ (`PAYDAY_POT_10_DAY_BUILD_PLAN.md`) đã bị **override về lịch**
bởi `EXECUTION_PLAN.md`; nội dung task/gate của nó vẫn tham khảo được.

## Cấu trúc repo (pnpm workspace)

```
apps/web                # Next.js App Router, TS strict
packages/contracts      # Hardhat + @fhevm/solidity — PayDayPot.sol
packages/sdk            # Typed actions/queries, error taxonomy
packages/shared         # deployments manifest, ABI, types dùng chung
deployments/sepolia.json  # Single source of truth: address, block, commit, ABI hash
```

## Commands

```bash
pnpm install --frozen-lockfile   # luôn frozen; version pin là hard rule
pnpm -r build && pnpm -r test    # toàn workspace
cd packages/contracts && npx hardhat test          # contract tests (local FHE mock)
cd packages/contracts && npx hardhat deploy --network sepolia
cd apps/web && pnpm dev
```

## NON-NEGOTIABLES — vi phạm là bug P0, không thương lượng

1. `withdrawAll()` khả dụng ở **mọi** phase; pause không bao giờ chặn withdraw/claim.
2. Deposit accounting dùng **actual encrypted amount transferred**, không bao giờ
   dùng requested amount (ERC-7984 clamp về encrypted zero thay vì revert).
3. Employer/keeper/admin **không có ACL** đọc principal/TWAB/winnings của user.
4. Không admin sweep principal. Contract non-upgradeable.
5. Không plaintext amount hoặc winner address trong events, logs, URL, analytics,
   persistence. Decrypted values chỉ sống trong browser memory (TTL 5 phút,
   clear khi hide/reload/account/chain change).
6. Không `makePubliclyDecryptable` trên state nhạy cảm
   (principal/TWAB/random/ticket/winner flags/pendingPrize).
7. Draw: random đúng 1 lần/epoch, không reroll; keeper chỉ trigger, không đưa
   seed/weight/winner; batch continuation permissionless.
8. UI không hiển thị `0` khi confidential value chỉ đang hidden/unavailable.

## FHE rules — sai là revert hoặc sai toán

- **CẤM** `FHE.div`/`FHE.rem` với divisor encrypted — chỉ plaintext RHS được hỗ trợ.
  Ticket dùng multiply-high: promote `euint128` → `FHE.mul` → **`FHE.shr(product, 64)`**
  (không dùng `div` cho 2^64 — 37k vs 1.225k HCU).
- **TWAB không chia onchain**: draw dùng thẳng `twabArea` (scale-invariant);
  average hiển thị tính client-side sau decrypt.
- Types: `principal` = `euint64`, `twabArea` = `euint64` (đủ vì per-user cap
  ~2^37 với epoch ≤30 ngày, cap 32 người), ticket math promote `euint128`.
- FHE arithmetic **wrap chứ không revert** khi overflow → mọi cap phải enforce
  ở deposit và có boundary test.
- Không `if (ebool)`, không encrypted array index — dùng `FHE.select`,
  làm cùng khối lượng logic cho mọi participant.
- Sau **mọi** mutation tạo handle mới: `FHE.allowThis(v)` + `FHE.allow(v, owner)`.
  Handle không init ≠ encrypted zero — phải init tường minh.
- HCU limit: 20M global / 5M sequential mỗi tx. Snapshot/select phải batch theo
  cursor; đo HCU thật trước khi chốt batch size (start 4–8).
- `FHE.randEuint64()` chỉ chạy trong state-changing tx.

## Sepolia addresses (validate qua registry lúc runtime, không tin số cứng)

- Wrapper registry: `0x2f0750Bbb0A246059d80e94c454586a7F27a128e`
- `cUSDCMock`: `0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639`
- Underlying mock USDC: `0x9b5Cd13b8eFbB58Dc25A05CF411D8056058aDFfF`

## Framing bắt buộc (README/UI/video)

- Prize = **employer-funded sponsored yield** (Season 4 brief nói "generated
  yield" — phải nói thẳng đây là simulator + adapter interface cho real yield,
  không để judge tự phát hiện).
- Không nói "anonymous" — sản phẩm bảo mật amount/balance/TWAB/winnings;
  address và timing vẫn public.
- Không nói "Payroll connected" / auto-payroll khi chưa tồn tại.
- Tên project không chứa "Zama"; wordmark Zama chỉ là "built with" signature.

## Workflow rules

- Trước khi dùng external lib API → Context7 lấy docs đúng version đã pin.
- FHE/ERC-7984 API chưa chắc chắn → spike/compile/test trước, không xây abstraction trước.
- Không qua ngày mới khi exit gate P0 của ngày hiện tại chưa đạt (xem EXECUTION_PLAN).
- EOD mỗi ngày: tests xanh + demo <5 phút + cập nhật scorecard + commit.
- Secrets: private key/RPC key chỉ trong `.env` (gitignored), không bao giờ
  `NEXT_PUBLIC_*`, không hardcode, không vào git history.
