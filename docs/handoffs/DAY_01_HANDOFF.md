# Day 1 Handoff — 19/08/2026

## Trạng thái gate (từ EXECUTION_PLAN Day 1)

| Gate item | Trạng thái |
|---|---|
| Clean clone → install → build/test xanh | ✅ (`pnpm install --frozen-lockfile && pnpm -r test`) |
| CompatSpike compile + tests mock xanh (gồm negative ACL) | ✅ 11 passing |
| Registry/cUSDC pair validated bằng script | ✅ PASS 16/16 |
| Decision D2 chốt + evidence | ✅ callback (`confidentialTransferAndCall`) |
| SDK chạy trong Next.js production build | ✅ crossOriginIsolated=true, instance created |
| Browser encrypt + EIP-712 decrypt live Sepolia | 🟡 **encrypt + tx ĐÃ XONG live** — chỉ còn user bấm "Decrypt my value" |

**Live Sepolia đã đạt (cập nhật cuối 19/08):**
- CompatSpike deployed: `0xceEee18891D4d53699E2Ab28C402fA0C5D721603` (block 11522269, deploy tx `0x57de1950...c3cbc`, 613k gas, deployer = ví index 0 từ mnemonic user).
- User đã gửi 4 tx `setValue` thành công từ MetaMask (ví index 2 `0xd830...829a`), vd tx `0x2ab7a4b7...737ab` — encrypt client-side + proof + tx mined ✅.
- **Còn lại duy nhất**: user bấm "Decrypt my value" trên `/spike` ra đúng 1000 → đóng gate. Mọi lỗi decrypt đã fix (xem quirks 7–9), chưa có xác nhận cuối từ user.

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
- `d620086` public RPC mặc định cho Sepolia (Infura optional — user đã set INFURA_API_KEY nên đang dùng Infura)
- `3ea646b` **deploy CompatSpike lên Sepolia** + address vào deployments/sepolia.json + prefill /spike
- `57368a3`+`4a65d53`+`56ec247` 3 fix live-browser: SDK network = RPC cố định; checksum address; start/days = number (quirks 7–9, f742433)
- `bcee676` spike page logs sang tiếng Anh · `0d3cdc5` docs/WEB3_LEARNING_PATH.md (user đang học web3 qua dự án)

Files quan trọng: `packages/contracts/contracts/CompatSpike.sol`, `test/CompatSpike.ts`, `demo/demo-day1.ts`, `scripts/validate-registry.ts`, `apps/web/app/spike/page.tsx`, `apps/web/scripts/copy-relayer-sdk.mjs`, `docs/COMPATIBILITY_NOTES.md`.

## Quyết định đã chốt hôm nay

1. **D2 = callback deposit** (`confidentialTransferAndCall` → `onConfidentialTransferReceived` nhận actual euint64; ebool false → token tự refund). Withdraw = `confidentialTransfer` overload euint64 + `allowTransient`. Evidence trong COMPATIBILITY_NOTES §2.
2. **OZ confidential-contracts pin 0.5.3** (0.3.x peer-conflict với fhevm/solidity 0.11.1).
3. **relayer-sdk pin 0.4.1** (hardhat-plugin 0.4.2 yêu cầu đúng 0.4.1).
4. **Demo rule toàn dự án**: mỗi ngày kết thúc bằng 1 lệnh demo output sạch, ghi trong handoff (đã ghi vào EXECUTION_PLAN).
5. Đường web SDK: UMD + public root files (quirks #1–#5 trong COMPATIBILITY_NOTES §4 — đừng thử lại dynamic import `/bundle`).

## Đang dở / blockers

- **B7 chỉ còn 1 click**: user chưa xác nhận "Decrypt my value" ra 1000 trên `/spike` (mọi bug đã fix, encrypt+tx live đã pass). Hỏi user đầu Day 2; user tự chạy web bằng `cd apps/web && pnpm dev -p 4100`.
- ConfidentialWrapperV3 refund-behavior (ebool false) chưa verify trên live token → test Day 2.
- Uncommitted trên working tree (từ session khác, không đụng): `CLAUDE.md`, `docs/EXECUTION_PLAN.md` (modified), `.claude/skills/`, `docs/ERROR_RECOVERY_MATRIX.md`, `docs/social/` (untracked).

## Số liệu đo được

- Mock test suite: 11 passing / 816ms (lần đầu), 277ms (cached). Demo: 1 passing / ~75ms.
- `/spike` First Load JS: 196 kB; WASM tfhe 4.7MB + kms 0.65MB serve từ public root.
- Chưa có số HCU/gas (Day 2 đo trên PayDayPot thật).

## Việc đầu tiên của ngày mai (Day 2 — 20/08)

1. **Đóng B7**: hỏi user đã bấm "Decrypt my value" ra 1000 chưa (user tự chạy `pnpm dev -p 4100` trong apps/web). Xong → tick gate cuối, cập nhật scorecard Day 1 = full ✅.
2. Bắt đầu `PayDayPot.sol`: skeleton + deposit qua callback D2 + withdrawAll (rule #1) — local mock dùng OZ `ERC7984ERC20Wrapper` làm token test. Xóa FHECounter template files khi PayDayPot lands.
3. Reproduce trạng thái: `pnpm install && pnpm -r test` + đọc `CLAUDE.md`, `docs/COMPATIBILITY_NOTES.md`, file này.
4. Context user: đang học web3 từ đầu qua dự án (docs/WEB3_LEARNING_PATH.md) — giải thích khái niệm mới bằng analogy web2 khi làm việc.

## Tx hashes / addresses mới

- **CompatSpike (Sepolia)**: `0xceEee18891D4d53699E2Ab28C402fA0C5D721603` — deploy tx `0x57de19501d680781c7791f0008e6035231cd0ed5791dea253739d93c434c3cbc`, block 11522269. Manifest: `deployments/sepolia.json`.
- setValue live tx (ví dụ): `0x2ab7a4b7e1eabfc72fd0d19640a94ddece6f8e232210f453d1ef0110b0d737ab`.
- Registry/cUSDC/USDC addresses trong `packages/shared/src/manifest.ts` — đã validate 19/08.
- Secrets: user đã set `MNEMONIC` + `INFURA_API_KEY` trong hardhat vars (local machine).
