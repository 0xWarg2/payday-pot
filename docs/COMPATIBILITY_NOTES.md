# COMPATIBILITY_NOTES — Day 1 (19/08/2026)

Nguồn sự thật về version pins, quirks, và Decision D2. Mọi ngày sau đọc file này trước khi cài thêm dependency.

## 1. Version pins (exact, đã verify hoạt động cùng nhau)

| Package | Version | Ghi chú |
|---|---|---|
| `@fhevm/solidity` | **0.11.1** | Từ template chính thức v0.4.1 |
| `@fhevm/hardhat-plugin` | **0.4.2** | Peer: relayer-sdk **=0.4.1** (0.4.4 bị conflict) |
| `@fhevm/mock-utils` | **0.4.2** | |
| `@zama-fhe/relayer-sdk` | **0.4.1** | Dùng chung cho contracts + web |
| `@openzeppelin/confidential-contracts` | **0.5.3** | ⚠️ 0.3.x peer với fhevm/solidity 0.9.1 — **0.5.3 mới peer đúng 0.11.1** |
| `@openzeppelin/contracts` | **5.6.1** | Peer của OZ confidential 0.5.3 |
| `encrypted-types` | **0.0.4** | |
| Solidity | **0.8.27**, optimizer 800, evmVersion **cancun** | |
| Node / pnpm | v24.5.0 / 11.22.0 (corepack) | pnpm 11: `onlyBuiltDependencies` phải nằm trong `pnpm-workspace.yaml` (keccak, secp256k1, sharp) |
| next / react / ethers | 15.5.6 / 19.2.4 / 6.15.0 | |

## 2. Decision D2 — Đường deposit/withdraw (CHỐT)

**Deposit: callback — `confidentialTransferAndCall`. Withdraw: `confidentialTransfer` (overload euint64, không proof).**

Bằng chứng (script `pnpm validate:registry`, PASS 16/16 qua public RPC, 19/08):

- Registry Sepolia `0x2f0750…128e` = `ConfidentialTokenWrappersRegistry` (ERC-1967/UUPS):
  - `getConfidentialTokenAddress(USDC)` → `(true, 0x7c5B…3639)` ✅ (2 chiều đều khớp)
  - `isConfidentialTokenValid(cUSDC)` → `true` ✅
- cUSDC `0x7c5B…3639` = **`ConfidentialWrapperV3`** (impl `0x390aa02f…d0ee`, verified Sourcify exact-match):
  - `name="Confidential USDC (Mock)"`, `symbol=cUSDCMock`, **decimals=6**, **rate=1** (underlying USDCMock cũng 6 decimals) → khớp giả định euint64/P-3
  - ERC-165 `supportsInterface(0x4958f2a4)` = IERC7984 đầy đủ ✅
  - Có đủ 2 đường: `confidentialTransferAndCall` (callback) và `setOperator`+`confidentialTransferFrom` (pull), kèm `wrap`/`unwrap`/`finalizeUnwrap`

Lý do chọn callback:
1. **1 tx mỗi deposit** (pull cần setOperator trước + lo expiry) — UX demo tốt hơn hẳn.
2. **Actual-transferred có sẵn**: `onConfidentialTransferReceived(operator, from, euint64 amount, data)` nhận đúng số đã chuyển → rule "actual-transfer accounting" được thỏa miễn phí.
3. **Cap enforcement không cần branch**: trả `ebool` từ callback; false → token tự refund (all-or-nothing). Không rò rỉ thông tin qua revert.
4. Lazy registration (P-4) làm ngay trong callback vì đã biết `from`.

Withdraw: pot giữ quỹ → `FHE.allowTransient(amount, token)` rồi `confidentialTransfer(user, amount)`; `withdrawAll` không bao giờ bị chặn (rule #1).

⚠️ Việc Day 2 phải verify: (a) hành vi refund-khi-ebool-false của `ConfidentialWrapperV3` trên Sepolia có giống OZ ERC7984 0.5.3 không (local test dùng OZ mock, live test dùng token thật); (b) token contract được cấp ACL đọc ebool trả về (`FHE.allowTransient(success, token)`).

Quirk phát hiện: **ConfidentialWrapperV3 có deny list** (`isBlocked`/`blockUser`) và `maxTotalSupply` — user bị block sẽ fail deposit/withdraw ở tầng token; không phải bug của pot. Ghi vào KNOWN_LIMITATIONS.

## 3. RNG note

FHEVM RNG (`FHE.randEuint64`) hiện là **PRNG mockup** theo roadmap Zama tại thời điểm pin version — đủ cho hackathon, PHẢI ghi rõ trong KNOWN_LIMITATIONS.md + video. Chỉ gọi trong state-changing tx, 1 lần mỗi epoch, không reroll (rule #7).

## 4. Quirks web (Next.js 15 + relayer-sdk 0.4.1) — đã fix, đừng lặp lại

1. **`@zama-fhe/relayer-sdk/bundle` KHÔNG tự chạy**: entry chỉ re-export từ `window.relayerSDK` → phải load UMD `bundle/relayer-sdk-js.umd.cjs` qua `<Script strategy="beforeInteractive">` trước.
2. **Worker fetch từ origin ROOT**: worker threads xin `/workerHelpers.js` (không theo thư mục script) → toàn bộ bundle files (umd, workerHelpers.js, tfhe_bg.wasm, kms_lib_bg.wasm) phải nằm ở `public/` root. Script `apps/web/scripts/copy-relayer-sdk.mjs` chạy tự động ở predev/prebuild; files trong .gitignore.
3. **`initSDK` cần path wasm tường minh**: `initSDK({ tfheParams: "/tfhe_bg.wasm", kmsParams: "/kms_lib_bg.wasm" })` — default fetch bị 404.
4. **COOP/COEP bắt buộc** (next.config headers) → đã verify `crossOriginIsolated: true` trong production build.
5. Đổi tên `.umd.cjs` → `.umd.js` khi copy (tránh MIME sai).
6. `hardhat run` KHÔNG init được fhevm mock (plugin chỉ init qua `hardhat test` hoặc `--network localhost|sepolia`) → demo/scripts cần mock phải chạy qua test runner (xem `packages/contracts/demo/`).
7. **SDK network KHÔNG dùng `window.ethereum`**: nếu MetaMask đang đứng mạng khác lúc `createInstance` → `eip712Domain()` gọi nhầm mạng → CALL_EXCEPTION. Luôn truyền RPC Sepolia cố định; wallet chỉ để ký tx/EIP-712.
8. **Address phải checksummed**: SDK validate `getChecksumAddress(a) === a` — MetaMask trả lowercase → `getAddress()` trước khi đưa vào `createEncryptedInput`/`userDecrypt`.
9. **`createEIP712`/`userDecrypt` nhận `startTimestamp`/`durationDays` là `number`** (UintNumber check `typeof === "number"`), KHÔNG nhận string như docs cũ.

## 5. Trạng thái verify

| Hạng mục | Trạng thái |
|---|---|
| Mock tests CompatSpike (8 tests, gồm 2 negative ACL + proof binding) | ✅ 19/08, `pnpm test` 11 passing |
| Demo local `pnpm demo` (encrypt→add→decrypt→ACL denied) | ✅ 19/08 |
| Registry validation `pnpm validate:registry` | ✅ PASS 16/16 |
| SDK init trong Next.js **production build** | ✅ crossOriginIsolated=true, instance created |
| Live Sepolia: deploy + browser encrypt→tx | ✅ 19/08 — CompatSpike `0xceEe…1603`, setValue tx `0x2ab7a4b7…737ab` mined |
| Live Sepolia: EIP-712 user-decrypt trong browser | 🟡 code đã fix (quirks 7–9) — chờ user bấm "Decrypt my value" xác nhận ra 1000 |

## 6. Checklist chuẩn bị ví (user tự làm, ~10 phút)

1. MetaMask → tạo **account mới chỉ để dev** (không dùng ví chính).
2. Xin Sepolia ETH miễn phí: Google "Alchemy Sepolia faucet" / Infura faucet / pk910 PoW faucet (~0.5 ETH là dư).
3. Tự chạy trong `packages/contracts/` (không đưa seed phrase cho ai):
   ```bash
   npx hardhat vars set MNEMONIC
   ```

> RPC: mặc định dùng public RPC `ethereum-sepolia-rpc.publicnode.com` — **không cần
> đăng ký Infura**. Nếu public RPC rate-limit khi deploy, fallback:
> `npx hardhat vars set INFURA_API_KEY` (config tự ưu tiên Infura khi key tồn tại).
