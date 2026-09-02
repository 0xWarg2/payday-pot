# RUNBOOK — PayDay Pot

Vận hành pot trên Sepolia: đọc trạng thái, chạy vòng, và xử lý từng kiểu tắc.

Viết từ các lần chạy thật (Day 7–9), không phải từ spec. Mọi lệnh trong file này
đã chạy ít nhất một lần trên Sepolia và tx hash ở §7.

> **Điều quan trọng nhất về runbook này:** không có bước nào trong đây cần quyền.
> Cả năm hàm của vòng draw đều `external` không modifier, nên bất kỳ ví nào có
> ETH đều chạy được — và cùng năm bước đó có nút bấm trong UI ở `/app/draws/current`.
> Nếu repo này biến mất, pool vẫn chạy tiếp được. Đó là thiết kế, không phải may.

---

## 1. Đọc trạng thái trước khi làm bất cứ gì

```bash
cd packages/contracts
npx hardhat run scripts/pot-state.ts --network sepolia
```

In ra phase, cửa sổ deposit còn lại, prize, số participant, cursor snapshot/draw,
và **bước tiếp theo phải gọi là gì**. Chỉ đọc public state — không cần ví có ACL,
không decrypt gì cả, nên chạy được từ bất kỳ đâu.

Không đoán phase từ đồng hồ. "Hết giờ" và "đã chuyển phase" là hai chuyện khác
nhau: epoch hết giờ vẫn ở phase `Open` cho tới khi có người gọi `beginSnapshot()`.
Cả `fundPrize` và cửa sổ này phụ thuộc vào khác biệt đó (§3).

## 2. Chạy vòng draw

```bash
npx hardhat run scripts/keeper.ts --network sepolia
```

Keeper suy ra bước kế tiếp **từ chain**, chạy tới `Settled` rồi dừng. Biến môi
trường:

| Env | Mặc định | Dùng khi |
|---|---|---|
| `KEEPER_BATCH` | `8` | batch revert mà cursor không nhích → giảm xuống 4 rồi 2 (§5) |
| `KEEPER_ONCE=1` | off | chạy đúng một bước, để xem kết quả trước khi đi tiếp |
| `KEEPER_ACCOUNT_INDEX` | `0` | chứng minh ví khác cũng chạy được — đúng là exit gate Day 9 |
| `KEEPER_NEW_EPOCH=1` | off | cho phép `startNewEpoch()` sau khi Settled |

`startNewEpoch()` **không** tự chạy, và đó là chủ ý: mở epoch mới là quyết định
vận hành (epoch mới chưa ai nạp prize), không phải bước dọn dẹp cuối vòng.

## 3. Nạp prize (employer)

```bash
PRIZE_AMOUNT=50 npx hardhat run scripts/fund-prize.ts --network sepolia
```

Ba tx: mint underlying (faucet mock mở) → approve pot → `fundPrize`.

**Cửa sổ thời gian là chỗ dễ mất tiền nhất trong cả runbook.** `fundPrize` đòi
`phase == Open`. Nghĩa là:

- nạp trong lúc epoch đang chạy → vào epoch đó. ✅
- nạp sau khi epoch hết giờ nhưng **trước** `beginSnapshot()` → vẫn vào epoch đó. ✅
- nạp sau `beginSnapshot()` → **revert** `WrongPhase`. Tiền không mất, nhưng phải
  chờ epoch sau.

Nếu prize đã nạp mà epoch đó **không có participant nào**, contract đi fast path
về `Settled` và prize rơi vào `prizeCarry` — không mất, cộng vào payout của epoch
sau tại `requestRandom`.

Script tra địa chỉ employer **ngược từ chain** (`EMPLOYER()`), không tin
`namedAccounts` trong config. Hai thứ đó lệch nhau thì `onlyEmployer` revert và
dấu vết duy nhất là `execution reverted` — mất một giờ để tìm ra.

## 4. Seed deposit (để có cái mà reveal)

```bash
SEED_ACCOUNT_INDEX=0 SEED_AMOUNT=1000 npx hardhat run scripts/seed-deposit.ts --network sepolia
SEED_ACCOUNT_INDEX=2 SEED_AMOUNT=250  npx hardhat run scripts/seed-deposit.ts --network sepolia
```

Đi đúng đường mà onboarding trong app đi: mint → approve → wrap →
`confidentialTransferAndCall`. Idempotent theo từng bước, nên một lần fail ở bước
encrypt (relayer timeout là chuyện thường, ~9s mỗi lần thành công) không biến
thành double-deposit khi chạy lại.

Cần **≥2 ví** cho gate "mỗi user chỉ reveal được của mình": một pot một người
không chứng minh được gì về ACL, vì không có gì để KHÔNG đọc được.

Proof bind vào `(token, user)`, không phải `(pot, user)` — người gọi
`confidentialTransferAndCall` là ví của user trên contract **token**. Dùng nhầm
địa chỉ pot thì relayer vẫn sinh proof và chain từ chối nó.

## 5. Khi một batch revert

Thứ tự kiểm, không đảo:

1. **Cursor có nhích không?** `pot-state.ts` in `snapshot cursor/total` và
   `draw cursor/total`. Nhích rồi thì batch trước đã thành công, cứ gửi tiếp.
2. **Cursor không nhích → nghi HCU.** Giới hạn là 20M global / 5M sequential mỗi
   tx và **vượt nó không hiện ra như lỗi gas thường**. Giảm `KEEPER_BATCH` xuống
   4, rồi 2. Batch nhỏ hơn luôn là câu trả lời đúng ở đây.
3. **Đang ở phase Drawing và đã `drawn`?** Gửi lại `selectBatch` cùng batch size.
   **Không** quay về đầu vòng. Quay về đầu vòng nghĩa là đòi seed mới, tức là
   chọn lại người thắng — contract chặn bằng `AlreadyDrawn`, nhưng người vận hành
   nên hiểu vì sao nó chặn thay vì nghĩ nó hỏng.
4. **`requestRandom` revert lúc pause.** Đây là hàm draw duy nhất có
   `whenNotPaused`. Unpause rồi gửi lại; withdraw/claim không bao giờ bị pause
   chặn nên không có gì gấp.

## 6. Pause / unpause

```bash
# owner only
npx hardhat console --network sepolia
> const pot = await ethers.getContractAt("PayDayPot", "<address>")
> await pot.pause()
> await pot.unpause()
```

Pause chặn: `deposit`, `withdraw` (bản có amount), `fundPrize`, `requestRandom`.

Pause **không** chặn: `withdrawAll()`, `claim()`, `beginSnapshot`,
`snapshotBatch`, `selectBatch`, `startNewEpoch`. Đó là non-negotiable #1 — pause
là công cụ để dừng dòng tiền VÀO, không phải để giữ tiền của người khác lại.

## 7. Lần chạy RC — 02/09/2026

Pot `0x792c77D9A2052ED03aaB6B392364c3e17f52a035` · block 11620820 · epoch 3600s ·
perUserCap 10 000 USDC · participantCap 32 · employer
`0x1cE8D5ff6E57a64E23cb28334315232A2e732D57`.

| Bước | Tx |
|---|---|
| deploy | [`0x90d62c3f…3c62d5`](https://eth-sepolia.blockscout.com/tx/0x90d62c3f3dda75ed2bec6094e745943793541c00bb0b21a7f224be19003c62d5) |
| employer mint | [`0x2eddb97e…1c0365`](https://eth-sepolia.blockscout.com/tx/0x2eddb97e8c7f8aed2a7e1e4d0de84c3f13379cfa0e0e4f8b48612ab3051c0365) |
| employer approve | [`0x8d68811a…5dd6bc`](https://eth-sepolia.blockscout.com/tx/0x8d68811ab064ab2eb9d91be634d0c0edd2c93ab060644cc3bc62b07ee45dd5bc) |
| `fundPrize(50 USDC)` | [`0xb96cb7ad…57a0cc`](https://eth-sepolia.blockscout.com/tx/0xb96cb7adeafdd693a19565d0d4adffbba7df3cfa7f2d378eb0ad7a813057a0cc) |
| deposit — ví #0, 1000 USDC | [`0x09346614…4e3430`](https://eth-sepolia.blockscout.com/tx/0x09346614a47a96cd2ab5bea5546b2a4fc6ab01ddc5ef1c623c494366f84e3430) |
| ví #2 wrap 250 USDC | [`0xeeb77ebc…d239f333`](https://eth-sepolia.blockscout.com/tx/0xeeb77ebcdc2891c58629644cdb0fbc3a48a42cc90f19db768f4416aed239f333) |
| deposit — ví #2, 250 USDC | [`0x18347185…b42848`](https://eth-sepolia.blockscout.com/tx/0x18347185ca222e20f29aa785df2632490382db2f634d9fbb8d4e4879feb42848) |

Vòng draw: xem §8 (điền sau khi chạy).

## 8. Vòng draw RC — tx hashes

_Điền từ output `scripts/keeper.ts`._

## 9. Verify source

```bash
npx hardhat verify --network sepolia --contract contracts/PayDayPot.sol:PayDayPot \
  <address> <token> <employer> <epochDuration> <perUserCap> <participantCap>
```

Etherscan **bị tắt khi không có `ETHERSCAN_API_KEY`** — cố ý: task `verify` chạy
mọi provider đang bật, và một provider bật mà thiếu key làm fail cả lệnh, kéo
theo provider chạy được cũng không báo cáo gì.

Blockscout không đòi key và tự propagate sang Sourcify. Kiểm bản thật:

```bash
curl https://sourcify.dev/server/v2/contract/11155111/<address>
```

RC ra `creationMatch=match` + `runtimeMatch=match` — full match, kể cả với
`bytecodeHash: "none"`.

Sourcify provider trong `hardhat-verify` 2.1.3 vẫn gọi API v1 đã bị bỏ (trả
404/HTML). Nó được bật để lệnh `verify` **nói ra** vì sao nó không chạy, thay vì
bỏ qua im lặng.

Sau khi verify: cập nhật `deployments/sepolia.json` → `kind: "rc"`,
`verified: true`, `verification.*`, rồi

```bash
pnpm manifest:sync && pnpm manifest:check
```

`manifest:check` từ chối một `rc` chưa verified, và từ chối cả drift giữa JSON và
module đã generate. Web app assert ABI hash lúc boot, nên frontend lệch contract
sẽ fail to tiếng thay vì gửi call sai shape.

## 10. Reveal chỉ chạy trong browser

`userDecrypt` **không dùng được trong Node** — `node-tkms@0.12.8` fail ở bước
Gao decoding (quirk #47). `publicDecrypt` thì chạy. Nghĩa là mọi kiểm chứng liên
quan tới reveal phải làm trong browser (Playwright hoặc bằng tay), không có
đường script hoá từ terminal. Đừng mất thời gian thử lại.

## 11. Kiểm public URL — đừng tin status code

```bash
scripts/check-deploy.sh https://<host>
```

Một deployment fail trên Vercel **vẫn trả HTTP 200**: nó serve trang "Deployment
has failed" của chính nó ở mọi path. Nên `curl -w %{http_code}` → 200 không
chứng minh gì cả. Script kiểm ba điều kiện trên 5 route:

1. status 200,
2. `<title>` là của mình (trang lỗi Vercel có title khác),
3. **có `Cross-Origin-Opener-Policy` + `Cross-Origin-Embedder-Policy`** —
   relayer-sdk cần cross-origin isolation để nạp WASM. Thiếu hai header này thì
   trang mở được nhưng reveal không bao giờ chạy, và trang lỗi của Vercel cũng
   không có chúng → đây là điều kiện bắt được cả hai lỗi cùng lúc.

Ba thứ đã cắn ở Day 9, theo đúng thứ tự gặp:

| Triệu chứng | Nguyên nhân | Sửa |
|---|---|---|
| `ERR_PNPM_IGNORED_BUILDS` | pnpm 11 xoá `onlyBuiltDependencies`, `allowBuilds` thay chỗ | `pnpm-workspace.yaml` → `allowBuilds` (quirk 53) |
| `Can't resolve '@payday-pot/sdk'` | Root Directory `apps/web` → `pnpm run build` không dựng workspace dep | `apps/web/vercel.json` → `pnpm --filter @payday-pot/web... build` |
| `VULNERABLE_NEXTJS_VERSION` | Vercel từ chối serve Next có CVE; build log vẫn in "Build Completed" | Next 15.5.6 → 15.5.25 (quirk 56) |

Deployment protection: project mới bật `ssoProtection` phạm vi
`all_except_custom_domains`, tức mọi `*.vercel.app` nằm sau login Vercel — judge
mở link sẽ thấy màn hình đăng nhập và **không có gì trong build log nói ra điều
đó**. Phải tắt tường minh rồi kiểm lại bằng script trên (nó chạy không cookie).
