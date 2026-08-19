# Web3 từ số 0 — học bằng chính PayDay Pot

Dành cho dev web2 (đã biết TS/React/backend). Mỗi phần: khái niệm → nó nằm ở đâu
trong repo này → bài tập tự kiểm chứng. Học theo thứ tự, mỗi level ~1-2 buổi.

---

## Level 0 — Mô hình tư duy (30 phút, không code)

Blockchain = **database công cộng ghi-một-lần**:
- Ai cũng đọc được mọi dòng. Không ai sửa/xóa được dòng đã ghi.
- Ghi phải trả phí (gas) và chờ (~15s). Đọc miễn phí, tức thì.
- Không có admin. "Đúng" = đa số node đồng thuận cùng một kết quả.

Map khái niệm (thuộc lòng bảng này):

| Web2 | Web3 |
|---|---|
| Database | Blockchain (Sepolia) |
| Backend service | Smart contract |
| URL của service | Địa chỉ contract (`0x...`, 20 bytes) |
| OpenAPI/proto spec | ABI |
| Connection string tới DB | RPC URL (Infura/publicnode/MetaMask) |
| Account + password + JWT | Ví: private key → chữ ký |
| `POST` (ghi) | Transaction — ký + trả gas + chờ mine |
| `GET` (đọc) | `view` call qua `eth_call` — free, không cần ký |
| Service account deploy CI/CD | Ví deployer (mnemonic trong hardhat vars) |

Ba thứ **độc lập hoàn toàn**, đừng trộn: RPC (vào bằng cửa nào) — Ví (ai ký, ai
trả phí) — Địa chỉ contract (gọi đích nào).

**Bài tập**: mở https://sepolia.etherscan.io/address/0xceEee18891D4d53699E2Ab28C402fA0C5D721603
— đọc tab Transactions: tìm tx deploy, tx `setValue` bạn đã gửi. Xem field
`Input Data` của tx setValue: chỉ thấy bytes, không thấy số 1000 → đó là ciphertext.

---

## Level 1 — Ví & chữ ký (1 buổi)

Khái niệm:
- Private key (32 bytes random) → public key → address (20 bytes). Một chiều,
  không đảo ngược được.
- Mnemonic (12 từ) = seed sinh ra **nhiều** private key theo path chuẩn
  (`m/44'/60'/0'/0/0`, `/1`, `/2`...). Đó là lý do `npx hardhat accounts` in ra
  10 địa chỉ từ 1 mnemonic.
- Chữ ký = chứng minh "tôi giữ private key của address này" mà không lộ key.
- Nonce = số thứ tự tx của ví, chống replay.

Trong repo:
- `packages/contracts/hardhat.config.ts` — mnemonic → `accounts` của network.
- Trang `/spike` nút Connect: `eth_requestAccounts` chỉ xin **address**, không
  bao giờ thấy key.

Bài tập:
1. Chạy `cd packages/contracts && npx hardhat accounts` — thấy 10 địa chỉ từ 1 mnemonic.
2. Giải thích được: vì sao lộ mnemonic = mất hết ví con? Vì sao không có "quên mật khẩu"?

---

## Level 2 — Transaction & gas (1 buổi)

Khái niệm:
- Tx = `{from, to, value, data, nonce, gasLimit, ...}` + chữ ký.
- `data` = function selector (4 bytes = hash chữ ký hàm) + tham số ABI-encoded.
- Gas = đơn vị đo công sức tính toán; phí = gasUsed × gasPrice. Ghi càng nhiều
  storage càng đắt.
- Deploy = tx đặc biệt `to: null`, `data: bytecode`. Địa chỉ contract sinh ra
  **tất định**: `keccak256(deployer, nonce)[12:]`.
- Revert = throw: tx vẫn bị tính phí phần đã chạy, nhưng mọi state đổi bị rollback
  (atomic như DB transaction).

Trong repo:
- Tx deploy CompatSpike: block 11522269, 613k gas — xem trên Etherscan.
- `deployments/sepolia.json` — manifest lưu địa chỉ + block + tx hash.

Bài tập:
1. Trên Etherscan, mở tx `setValue` → `Input Data` → bấm "Decode" — thấy selector
   và 2 tham số khớp ABI.
2. Trả lời: nếu gửi cùng tx 2 lần thì sao? (gợi ý: nonce)

---

## Level 3 — Solidity & contract đầu tiên (2-3 buổi)

Khái niệm qua `packages/contracts/contracts/CompatSpike.sol`:
- `contract` ≈ class có state sống vĩnh viễn trong storage.
- `mapping(address => T)` ≈ bảng key-value, key là ví.
- `msg.sender` = ví đã ký tx đang gọi — đây là "auth" của web3, không giả được.
- `view` = chỉ đọc (free) vs hàm thường = ghi (tốn gas).
- `external/public/internal/private` — visibility.
- Event = log ghi vào receipt, FE/indexer đọc được, contract không đọc lại được.

Toolchain (Hardhat):
```bash
cd packages/contracts
npx hardhat compile   # .sol → bytecode + ABI (artifacts/)
npx hardhat test      # chạy test trên chain giả trong RAM (tiền giả, mine tức thì)
npx hardhat deploy --network sepolia
```

Bài tập (làm thật):
1. Đọc hiểu từng dòng `CompatSpike.sol` — file < 50 dòng.
2. Đọc `test/CompatSpike.ts` — hiểu fixture, `connect(jimmer)`, expect revert.
3. Tự viết contract `Counter.sol` (không FHE): `increment()`, `get()`, event
   `Incremented` — compile + viết 2 test + chạy xanh. Đây là "hello world" của bạn.

---

## Level 4 — FE nói chuyện với contract (2 buổi)

Khái niệm qua `apps/web/app/spike/page.tsx`:
- ethers.js: `BrowserProvider` (bọc MetaMask làm cửa RPC) → `getSigner()` (bút ký).
- `new Contract(address, ABI, providerHoặcSigner)`:
  - provider → chỉ đọc (`eth_call`, không popup)
  - signer → ghi được (MetaMask popup ký, gửi tx)
- ABI là codec: `contract.setValue(x, y)` → encode thành `data` bytes — EVM không
  biết tên hàm, chỉ biết selector.
- `wallet_switchEthereumChain`, `eth_chainId` — quản lý đúng mạng.
- Address checksum (EIP-55): SDK/lib có thể đòi đúng dạng checksum — `getAddress()`.

Bài tập:
1. Trace code `/spike`: tìm đúng dòng nào đọc (không popup) vs dòng nào ghi (popup).
2. Tự làm trang FE tối giản cho `Counter.sol` của Level 3 (chạy trên hardhat
   node local: `npx hardhat node` + deploy localhost + MetaMask add network
   localhost:8545).

---

## Level 5 — Token chuẩn ERC (1-2 buổi)

Khái niệm:
- ERC = chuẩn interface để mọi token "nói cùng ngôn ngữ". ERC-20 = token thường:
  `balanceOf`, `transfer`, `approve/transferFrom` (operator pattern).
- Vì sao cần `approve` trước `transferFrom`: contract không tự thò tay vào ví
  bạn được — bạn cấp quota trước, contract rút trong quota.
- ERC-7984 (dùng trong dự án này) = token **confidential**: balance/amount là
  ciphertext; có `confidentialTransfer`, `confidentialTransferAndCall` (chuyển
  + gọi callback người nhận trong 1 tx).

Trong repo:
- `packages/contracts/scripts/validate-registry.ts` — đọc contract cUSDC thật
  trên Sepolia qua ABI: chạy `pnpm validate:registry` và đọc output 16 checks.
- `docs/COMPATIBILITY_NOTES.md` §2 — Decision D2: vì sao deposit chọn
  `confidentialTransferAndCall` (1 tx, callback, auto-refund) thay vì operator-pull.

Bài tập: giải thích lại D2 bằng lời của bạn — nếu hiểu được trade-off này là
đã hiểu operator pattern + callback pattern.

---

## Level 6 — FHEVM: điều dự án này thêm vào web3 (2-3 buổi)

Vấn đề: blockchain minh bạch tuyệt đối → số dư ai cũng thấy. FHE cho phép
**tính toán trên dữ liệu đã mã hóa** — node cộng/so sánh ciphertext mà không
bao giờ thấy plaintext.

Khái niệm cốt lõi (đều đã dùng ở Day 1):
- `euint64` = handle (32 bytes) trỏ tới ciphertext, không phải giá trị.
- Input flow: client encrypt (WASM trong browser) → `externalEuint64 + proof`
  → contract `FHE.fromExternal` verify. Input bind vào (contract, user) — chống replay.
- **ACL**: sau mỗi phép tính tạo handle mới phải `FHE.allowThis(v)` +
  `FHE.allow(v, user)` — quên là handle chết. Đây là "row-level security" của FHEVM.
- User-decrypt: FE ký EIP-712 (typed-data signature, như JWT tự ký có hạn dùng)
  → relayer + KMS check ACL on-chain → re-encrypt về cho đúng người → giải mã
  trong browser. Plaintext không bao giờ chạm chain.
- Không có `if (ebool)` — mọi nhánh phải `FHE.select` (chạy cả 2 nhánh, chọn kết
  quả) để không lộ thông tin qua control flow.
- FHE arithmetic wrap khi overflow (không revert) → cap phải enforce ở input.
- HCU = "gas riêng cho phép toán FHE": 20M/tx global, 5M sequential.

Trong repo:
- `CompatSpike.sol` + `test/CompatSpike.ts` — 4 primitive + negative ACL test
  (Warg không đọc được của Jimmer = test quan trọng nhất).
- `apps/web/app/spike/page.tsx` — encrypt + userDecrypt flow đầy đủ.
- `docs/COMPATIBILITY_NOTES.md` §4 — 9 quirks thực chiến (WASM, COOP/COEP,
  checksum, UintNumber...).
- `CLAUDE.md` mục "FHE rules" — các quy tắc sống còn.

Bài tập:
1. Chạy `pnpm demo` trong `packages/contracts` — đọc narration từng bước.
2. Thêm vào CompatSpike một hàm `subValue` (FHE.sub) + test + ACL đúng — rồi
   trả lời: vì sao vẫn phải allow lại sau khi sub?

---

## Level 7 — Đọc kiến trúc sản phẩm thật (theo tiến độ dự án)

Khi PayDayPot.sol hình thành (Day 2+), đọc theo thứ tự:
1. Deposit flow: callback `onConfidentialTransferReceived` — actual-transferred
   accounting (NON-NEGOTIABLE #2).
2. TWAB (time-weighted average balance) — vì sao dùng `twabArea` không chia onchain.
3. Draw: multiply-high thay vì div (FHE.shr), random 1 lần/epoch, batch theo HCU.
4. `docs/PAYDAY_POT_IMPLEMENTATION_PLAN.md` §15 (privacy) + §17-18 (math).

---

## Nguồn ngoài repo (khi cần đào sâu)

- Solidity chính chủ: docs.soliditylang.org (đọc "Solidity by Example")
- Ethereum concepts: ethereum.org/developers/docs
- FHEVM: docs.zama.ai/fhevm
- Thực hành gamified: speedrunethereum.com, cryptozombies.io
- Repo `~/Dev/web3-learning` — curriculum 7 phase có sẵn của bạn

## Cách học hiệu quả với repo này

Mỗi ngày build (Day 2-9) đều sinh code mới → cứ cuối ngày đọc handoff
(`docs/handoffs/`) + diff commit, hỏi "vì sao làm vậy" trên từng quyết định.
Học bằng dự án thật đang chạy > mọi tutorial.
