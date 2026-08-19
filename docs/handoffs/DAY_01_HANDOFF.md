# Day 1 Handoff — 19/08/2026

## Trạng thái gate (từ EXECUTION_PLAN Day 1)

| Gate item | Trạng thái |
|---|---|
| Clean clone → install → build/test xanh | ✅ (`pnpm install --frozen-lockfile && pnpm -r test`) |
| CompatSpike compile + tests mock xanh (gồm negative ACL) | ✅ 11 passing |
| Registry/cUSDC pair validated bằng script | ✅ PASS 16/16 |
| Decision D2 chốt + evidence | ✅ callback (`confidentialTransferAndCall`) |
| SDK chạy trong Next.js production build | ✅ crossOriginIsolated=true, instance created |
| Browser encrypt + EIP-712 decrypt live Sepolia | ⬜ **chờ ví** — việc duy nhất còn lại của Day 1 |

**Red rule đang treo:** "Day 1 chưa có live user-decrypt" → B7 là việc ĐẦU TIÊN của Day 2, trước mọi việc khác.

## Demo (chạy lại được ngay)

```bash
cd "packages/contracts" && pnpm demo
```
Expected: 5 dòng narration — deploy → Jimmer encrypt 1000 → decrypt 1000 → FHE.add ra 1500 → 🔒 Warg bị ACL chặn. Kết thúc `1 passing`.

Demo phụ: `pnpm validate:registry` (PASS 16/16 qua public RPC) · web: `cd apps/web && pnpm build && pnpm start` → `/spike` → bấm "Init SDK" → 2 dòng ✅.

## Đã làm (commits chính)

- `2ca45f5` workspace skeleton (pnpm monorepo, shared manifest, docs)
- `2756738` FHEVM hardhat template adapted, versions pinned, mock tests green
- `ed1c59d` CompatSpike + mock tests (2 negative ACL, proof binding, event-no-amount) + `pnpm demo`
- `c7c2001` validate-registry script — PASS 16/16, evidence cho D2
- `53a8099` apps/web /spike — relayer-sdk UMD + WASM init OK production build
- `463ff9d` COMPATIBILITY_NOTES — pins, D2, quirks

Files quan trọng: `packages/contracts/contracts/CompatSpike.sol`, `test/CompatSpike.ts`, `demo/demo-day1.ts`, `scripts/validate-registry.ts`, `apps/web/app/spike/page.tsx`, `apps/web/scripts/copy-relayer-sdk.mjs`, `docs/COMPATIBILITY_NOTES.md`.

## Quyết định đã chốt hôm nay

1. **D2 = callback deposit** (`confidentialTransferAndCall` → `onConfidentialTransferReceived` nhận actual euint64; ebool false → token tự refund). Withdraw = `confidentialTransfer` overload euint64 + `allowTransient`. Evidence trong COMPATIBILITY_NOTES §2.
2. **OZ confidential-contracts pin 0.5.3** (0.3.x peer-conflict với fhevm/solidity 0.11.1).
3. **relayer-sdk pin 0.4.1** (hardhat-plugin 0.4.2 yêu cầu đúng 0.4.1).
4. **Demo rule toàn dự án**: mỗi ngày kết thúc bằng 1 lệnh demo output sạch, ghi trong handoff (đã ghi vào EXECUTION_PLAN).
5. Đường web SDK: UMD + public root files (quirks #1–#5 trong COMPATIBILITY_NOTES §4 — đừng thử lại dynamic import `/bundle`).

## Đang dở / blockers

- **B7 live Sepolia spike** — blocked chờ user: MetaMask dev account + faucet ETH + Infura key + tự chạy `npx hardhat vars set MNEMONIC` / `INFURA_API_KEY` (checklist trong COMPATIBILITY_NOTES §6). Sau đó: `pnpm deploy:sepolia` → điền address vào `deployments/sepolia.json` → mở /spike → encrypt→tx→decrypt → chụp tx hash.
- ConfidentialWrapperV3 refund-behavior (ebool false) chưa verify trên live token → test Day 2.

## Số liệu đo được

- Mock test suite: 11 passing / 816ms (lần đầu), 277ms (cached). Demo: 1 passing / ~75ms.
- `/spike` First Load JS: 196 kB; WASM tfhe 4.7MB + kms 0.65MB serve từ public root.
- Chưa có số HCU/gas (Day 2 đo trên PayDayPot thật).

## Việc đầu tiên của ngày mai (Day 2 — 20/08)

1. **B7**: hỏi user đã set vars chưa → deploy CompatSpike Sepolia + verify → live browser decrypt → đóng gate Day 1, cập nhật scorecard.
2. Bắt đầu `PayDayPot.sol`: skeleton + deposit qua callback D2 + withdrawAll (rule #1) — local mock dùng OZ `ERC7984ERC20Wrapper` làm token test.
3. Reproduce trạng thái: `pnpm install && pnpm -r test` + đọc `CLAUDE.md`, `docs/COMPATIBILITY_NOTES.md`, file này.

## Tx hashes / addresses mới

- Chưa có tx Sepolia (B7 pending). Registry/cUSDC/USDC addresses trong `packages/shared/src/manifest.ts` — đã validate 19/08.
