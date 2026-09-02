# COMPATIBILITY_NOTES — cập nhật Day 6 (26/08/2026)

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

Trạng thái verify Day 2: (b) ✅ **verified local** — token cần **dual grant** trên retval, xem quirk #11. (a) ◐ refund-khi-ebool-false **verified local** với OZ ERC7984 0.5.3 (test `refunds cap+1 in full`) — hành vi `ConfidentialWrapperV3` live trên Sepolia chưa probe (stretch P1 chưa chạy) → **recheck Day 9** trước khi deploy pot thật.

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
| Live Sepolia: EIP-712 user-decrypt trong browser | ✅ 20/08 — user xác nhận "Decrypt my value" trên /spike ra đúng **1000** |
| PayDayPot deposit/withdraw local (43 tests + property seed 0xda72 + HCU) | ✅ 20/08, `pnpm test` 43 passing |
| Demo local `pnpm demo:day2` (deposit→ACL→partial→cap refund→pause-proof exit) | ✅ 20/08 |
| TWAB + snapshot local (26 tests + HCU Day 3) | ✅ 23/08, suite 74 passing |
| Draw engine local (26 tests + 3 HCU Day 4 + Monte Carlo 64 epochs) | ✅ 24/08, suite 103 passing |
| Demo local `pnpm demo:day4` (pause-wait→random 1 lần→stranger resume→1 winner→ACL denied) | ✅ 24/08 |
| Prize/claim/lifecycle local (38 tests + 5 HCU Day 5 + solvency property) | ✅ 25/08, suite 150 passing |
| Demo local `pnpm demo:day5` (fund→draw→1 winner decrypt→claim uniform→withdrawAll→epoch mới) | ✅ 25/08 |
| `wrap` gọi bởi CONTRACT (spike C0 — nền của `fundPrize`) | ✅ 25/08 local (OZ `ERC7984ERC20Wrapper`) — xem quirk #19 |
| `underlying()` / `rate()` / `decimals()` / `maxTotalSupply()` / `isBlocked()` trên cUSDC LIVE | ✅ 26/08 — probe qua `eth_call` thật, xem quirk #20 |
| `wrap`-by-contract trên cUSDC LIVE (tx thật, không phải `eth_call`) | ☐ chưa chạy — sẽ tự chứng minh ở lần `fundPrize` đầu tiên trên dev deploy (Day 7) |
| Underlying `USDCMock.mint` là faucet mở | ✅ 26/08 — quirk #21 |
| Web tooling: Tailwind v4 + Vitest + Playwright, COOP/COEP pinned bằng e2e | ✅ 26/08 — 70 unit + 1 e2e xanh |
| Refund-on-ebool-false của wrapper LIVE Sepolia | ◐ local-verified only (OZ 0.5.3) — recheck Day 9 (xem §2) |

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

## 7. Quirks contract (Day 2 — FHE mock + OZ confidential 0.5.3)

10. **Deterministic handle aliasing**: handle = `keccak(op, lhs, rhs, scalar, aclAddr, chainId)` — **không có counter** (xem `FhevmHandleCoder.js` trong mock-utils; executor thật cùng công thức). Hai op giống hệt inputs → CÙNG handle → **ACL đi theo handle, không theo biến**. Hệ quả thực tế: pot có 1 depositor thì `_totalPrincipal` (= `add(zero, credited)`) alias đúng handle principal của depositor → user "decrypt được total". Vô hại về thông tin (alias đòi hỏi lịch sử op giống hệt ⇒ giá trị vốn tự biết), nhưng: (a) test ACL contract-only phải cho lịch sử phân kỳ trước (2+ depositor) rồi mới assert rejected; (b) đừng bao giờ dựa vào "handle khác nhau" như một cơ chế bảo mật.
11. **Dual ACL grant trên callback retval**: token check `FHE.isAllowed(retval, receiver)` **và** tự chạy `FHE.select(retval,…)` → pot phải grant CẢ HAI: `FHE.allowThis(ok)` + `FHE.allowTransient(ok, msg.sender)`. Thiếu 1 trong 2 → revert `ERC7984UtilsUnauthorizedUseOfEncryptedAmount` hoặc ACL error.
12. **Custom errors bubble qua token**: `ERC7984Utils.checkOnTransferReceived` catch rồi re-revert đúng reason bytes (`revert(add(32, reason), mload(reason))`) → selector `NotToken`/`PoolFull`/`EnforcedPause` sống sót qua `confidentialTransferAndCall` → test assert được bằng `revertedWithCustomError(pot, …)`.
13. **FHE ops trong constructor revert dưới `hardhat deploy`** (hệ quả quirk #6 — mock coprocessor chỉ init trong test runner; Sepolia thật không bị). Pattern: constructor FHE-free, lazy-init `FHE.isInitialized(x) ? x : FHE.asEuint64(0)` tại mutation đầu tiên.
14. **Plugin 0.4.2 có sẵn đồ đo**: `fhevm.computeTransactionHCU(receipt)` → `{globalHCU, maxHCUDepth}` (sync) và `fhevm.debugger.decryptEuint(FhevmType, handle)` (mock-only, bypass ACL — chỉ dùng inspect invariant trong test, không bao giờ là product path). HCU đo thật Day 2: deposit ~2.08M/20M global, depth 780k/5M.
15. **OZ confidential-contracts KHÔNG ship mocks** (`files` trong package.json loại `/mocks/`) → tự viết `TestUSDC` + `TestConfidentialUSDC is ERC7984ERC20Wrapper, ZamaEthereumConfig` (OZ ERC7984 không tự set coprocessor). Funding path test mirror live: mint → approve → wrap.
16. **`@types/chai-as-promised` phải cài riêng** (pin 7.1.8 khớp @types/chai v4) — runtime `.to.be.rejected` hoạt động từ Day 1 (plugin tự `chai.use`) nhưng `pnpm typecheck` fail nếu thiếu types.
17. **Mock `FheRand` = `ethers.randomBytes` — crypto-random, KHÔNG seed được** (đọc source `@fhevm/mock-utils` 0.4.2, handler FheRand thay bytes random vào handle, `replace: true`). Hệ quả cho test: (a) Monte Carlo/draw test **không replay được** — phải log R/ticket/winner từng sample để hậu kiểm khi flaky; (b) không có cách pin "random = X" qua pot: test biên max-R × max-T phải đi qua harness test-only (`contracts/mocks/TicketMathHarness.sol`) nhận input tự cấp, chạy y hệt chuỗi op P-2. (c) `fhevm.debugger.decryptEbool(handle)` có sẵn cạnh `decryptEuint` (mock-only) — dùng đọc won/selectedAny flags trong test.
18. **Giá HCU đo thật các op draw (mock == Sepolia)**: `FheMul` euint128 non-scalar **1,686,000** (op đắt nhất hệ thống — requestRandom tổng 1,747,160); chuỗi scan 7-op/participant (add+lt+not+and+select+add+or, euint64) marginal **≈574k global / ≈162k depth**; `FheRand` + casts + shr chiếm phần còn lại (~61k) của requestRandom. Bảng đầy đủ: DRAW_PROTOCOL §4.
19. **`wrap` GỌI BỞI CONTRACT hoạt động đúng — spike trước khi viết `fundPrize`** (Day 5, `CompatSpike.ts` §"wrap BY CONTRACT"). Mọi `wrap` trước đó trong repo là EOA wrap cho chính nó; pot tự wrap là hình dạng mới, nên phải chứng minh trước khi xây. Kết quả: (a) contract gọi `wrap(address(this), amount)` thì **confidential balance rơi vào CONTRACT**, không phải caller (`confidentialBalanceOf(caller) == ZeroHash`) — 217,128 HCU / 316,789 gas; (b) sponsor thiếu tiền ⇒ **revert `ERC20InsufficientBalance`** — đây chính là plaintext backing check mà clamp all-or-nothing của ERC-7984 không thể cho (confidential transfer sẽ chuyển enc(0) âm thầm, R12); (b') thiếu approval cũng revert (R13 — employer fund là **2 tx**: `approve` rồi `fundPrize`); (c) wrap nhiều lần cộng dồn, `forceApprove` không để sót allowance, và contract chuyển ra được cái nó đã wrap (đường `defundPrize`). **Chưa probe trên live**: cUSDC Sepolia là `ConfidentialWrapperV3` (bản khác OZ `ERC7984ERC20Wrapper` dùng ở local), có deny-list + `maxTotalSupply` riêng. Day 9 checklist: probe `underlying()`, `rate()`, và một `wrap` thật **từ contract** trước khi deploy — constructor của pot đọc 2 selector đó và giữ làm immutable, nên pot chỉ deploy được lên wrapper, không phải ERC-7984 thuần.

## 8. Quirks live Sepolia (Day 6 — probe 26/08/2026)

20. **cUSDC là proxy UPGRADEABLE và ĐÃ BỊ UPGRADE giữa Day 1 và Day 6.** Slot
    ERC-1967 impl của `0x7c5B…3639` đọc ra `0xAe37b998d453E1FaBE85DD46cf04295ca4A3af04`
    (22,183 bytes) — **không phải** `0x390aa02f…d0ee` mà §2 ghi hôm 19/08 (Sourcify
    exact-match `ConfidentialWrapperV3`). Admin slot = 0, có `upgradeToAndCall` +
    `owner()` ⇒ UUPS + Ownable, owner `0x08e8a84c3c8c7cba165B1adcf67Ae4639eF84f52`.

    Hệ quả thật, không phải lý thuyết:
    - Kết quả probe của Day 1 **là dữ liệu hết hạn**. Bất kỳ khẳng định nào về
      cUSDC phải kèm ngày probe.
    - Pot đọc `underlying()`/`rate()` **một lần trong constructor** rồi giữ làm
      immutable. Nếu Zama upgrade và đổi `rate()`, pot giữ số cũ và `fundPrize`
      sẽ wrap sai lượng. Đây là **rủi ro sống chứ không phải rủi ro deploy** —
      Day 9 phải re-probe ngay trước RC deploy, và KNOWN_LIMITATIONS phải nói
      thẳng là pot phụ thuộc vào một contract mà bên khác upgrade được.
    - `blockUser`/`unblockUser` tồn tại và owner gọi được ⇒ R3 (deny list) là
      đường thật, không phải giả định.

    Giá trị đọc được ngày 26/08 (`eth_call` qua public RPC):

    | Selector | Giá trị |
    |---|---|
    | `name()` / `symbol()` | `Confidential USDC (Mock)` / `cUSDCMock` |
    | `decimals()` | `6` — khớp underlying, khớp giả định euint64 (P-3) |
    | `underlying()` | `0x9b5Cd13b8eFbB58Dc25A05CF411D8056058aDFfF` |
    | `rate()` | `1` ⇒ 1 underlying = 1 confidential unit |
    | `maxTotalSupply()` | `18446744073709551615` = `2^64 − 1` — trần bằng chính trần của euint64, nên `ERC7984TotalSupplyOverflow` là case lý thuyết, không phải case demo |
    | `isBlocked(deployer)` | `false` |

21. **`USDCMock.mint(address,uint256)` là FAUCET MỞ — không owner, không role.**
    `eth_call` từ một địa chỉ tuỳ ý (`0x…dEaD`) thành công; underlying **không có
    selector `owner()`** nào cả. Nghĩa là onboarding Day 6 tự cấp được test asset
    bằng **một tx trong app**, không cần faucet ngoài, không cần user rời trang.
    Đây là khác biệt UX lớn cho R14 (insufficient balance): "Get test USDC" là một
    nút, không phải một link ra ngoài.

22. **Overload `unwrap` PLAINTEXT KHÔNG TỒN TẠI trên bản live.** Có
    `unwrap(address,address,bytes32)` (euint64 handle) và
    `unwrap(address,address,bytes32,bytes)` (externalEuint64 + proof);
    **`unwrap(address,address,uint64)` thì KHÔNG** — nên bản live *không phải*
    OZ `ERC7984ERC20Wrapper` thuần (nó cũng có thêm `unblockUser` mà OZ không có).
    Đừng suy ra hành vi live từ source OZ đã pin; local test dùng OZ, live dùng
    bản của Zama, và hai bản đã lệch nhau ở mặt API.

    Đường unwrap live, đã xác nhận có đủ selector:
    `unwrap(...)` → burn + `UnwrapRequested(address indexed receiver, bytes32 indexed unwrapRequestId, euint64 amount)`
    → oracle callback → `finalizeUnwrap(bytes32,uint64,bytes)`.
    `unwrapRequester(bytes32)` và `unwrapAmount(bytes32)` là view đọc được ⇒ R1
    detect được pending state **mà không cần index event**, chỉ cần một view call.

23. **`unwrapRequestId` CHÍNH LÀ ciphertext handle của số đã burn**, và `_unwrap`
    gọi `FHE.makePubliclyDecryptable(unwrapAmount_)` trên nó. Tức là **unwrap công
    khai số tiền** — đây là biên privacy cuối cùng, và nó nằm ở tầng token chứ
    không phải pot (non-negotiable #6 nói về state của *pot*, không bị vi phạm).
    PRIVACY §2 phải nói thẳng điều này thay vì chỉ nói về wrap.

## 9. Quirks deploy + web E2E (Day 6 — 26/08/2026)

24. **`fhevm.initializeCLIApi()` là bắt buộc dưới `hardhat run`, nhưng KHÔNG dưới
    `hardhat test`.** Test runner tự init plugin; script chạy bằng `hardhat run`
    thì không, và triệu chứng là một lỗi rất xa nguyên nhân (`createInstance`
    không tìm thấy config). Mọi script deploy/seed đụng FHE phải gọi nó ở dòng
    đầu tiên.

25. **Sinh input proof từ Node (không qua trình duyệt) chạy được trên relayer
    thật** — đây là đường Day 6 stage 8 chưa proven và đã proven xong bằng
    `packages/contracts/scripts/seed-deposit.ts`. Số đo thật trên Sepolia:
    `encrypt()` **9752 ms**, `confidentialTransferAndCall` **1,318,372 gas**.
    Nghĩa là seed state cho demo không cần drive MetaMask bằng tay; nhưng ~10s
    cho một lần encrypt là con số phải nhớ khi thiết kế UI deposit (Day 7) —
    nó dài hơn ngưỡng người dùng cho là "treo".

26. **`_checkpoint` lazy-init để `twabArea` chưa khởi tạo sau deposit ĐẦU TIÊN.**
    Deposit đầu chỉ set `lastCheckpoint`; `twabArea` chỉ sinh handle ở mutation
    kế tiếp (hoặc khi thời gian trôi qua rồi checkpoint lại). Nên một ví vừa
    deposit xong đọc ra `principal` = handle thật nhưng `twabArea` =
    `HIDDEN_HANDLE`. Đây chính là lý do reveal phải **lọc handle rồi mới gửi**
    ("up to 2 pairs", không phải luôn 2) — gửi `HIDDEN_HANDLE` kèm theo thì
    relayer từ chối **cả batch**, và triệu chứng trông như "reveal hỏng".

27. **Playwright `getByRole("alert")` bắt trúng route announcer của Next.**
    Next render sẵn một `<div id="__next-route-announcer__" role="alert">` rỗng
    trong mọi trang, nên locator theo role trả về 2 phần tử và strict mode nổ —
    hoặc tệ hơn, `toContainText` fail trên phần tử rỗng và trông như UI không
    hiện lỗi. `ErrorPanel` giữ `role="alert"` (đúng về accessibility) nhưng test
    định vị bằng `data-testid="error-panel"`.

28. **Property `code` của lỗi KHÔNG sống sót qua `page.exposeFunction`.** Chỉ
    `message` đi qua được cầu Node↔page. Mà `code === 4001` lại là thứ **duy
    nhất** phân biệt "người dùng bấm Cancel" (R6) với "ví hỏng" (lỗi chung) trong
    `classifyError`. Hệ quả: ví stub muốn diễn user-rejected thì phải ném **trong
    page context**, không phải trong Node — ném ở Node thì test vẫn xanh nhưng
    đang kiểm nhánh lỗi sai.

29. **`data-state="hidden"` không phải bằng chứng "đã đọc xong".** `hidden` cũng
    là mặc định của lúc chưa biết gì, nên assert nó ở frame đầu tiên luôn xanh và
    không chứng minh điều gì; rồi cú click ngay sau đó rơi vào khoảng trống giữa
    "trang đã mount" và "read đã về". Tín hiệu readiness trung thực duy nhất là
    **nút Reveal có tồn tại hay không** — nó chỉ được render khi đã có handle
    thật. Cùng một nhầm lẫn ở tầng sản phẩm là bug đã sửa ở Day 6 (xem
    EXECUTION_PLAN Day 6): *chưa đọc* là trạng thái thứ tư, không được mượn UI
    của ba trạng thái kia.

## 10. Quirks luồng tiền trong browser (Day 7 — 27/08/2026)

30. **ethers BỌC mã lỗi của ví lại.** Một `4001` (user bấm Cancel/Reject) đi ra
    ngoài dưới lớp `code: "UNKNOWN_ERROR"` với bản gốc nằm ở `error` hoặc
    `info.error`. `classifyError` cũ chỉ đọc mã ngoài cùng ⇒ **mọi** lần user từ
    chối đều rơi vào nhánh `unknown` và app nói "Something went wrong" cho một
    việc người dùng vừa cố ý làm. Fix: `errorCodesOf` đi đệ quy qua
    `info`/`error`/`cause`/`data` và khớp theo tập mã, không theo mã ngoài cùng.

31. **Ví stub trong e2e phải chuyển cả `error.data`, không chỉ `message`.** Đó là
    revert data, và là thứ duy nhất cho phép gọi tên custom error của contract.
    Bỏ nó đi thì mọi lỗi onchain đều thành "Something went wrong" và test lỗi
    onchain kiểm sai nhánh — nhìn xanh mà không chứng minh gì.

32. **Cast `e as PotError` ở tầng component = màn hình trắng.** Cái ném ra trong
    một handler không nhất thiết là lỗi của chain: một `TypeError` do state chưa
    nạp xong ném ra ở đúng chỗ đó, và `ErrorPanel` đọc `error.action.kind` —
    `Error` không có `action`. Đường duy nhất được phép đi vào UI là
    `toPotError()`: PotError thật thì giữ nguyên, còn lại qua `classifyError`.

33. **Ví CI (không có vị thế) revert ngay ở `eth_estimateGas`, trước khi ví mở
    ra.** Nghĩa là không diễn được "user bấm Reject" bằng deposit/withdraw trong
    CI — tx chết trước bước ký. Đường duy nhất còn đúng nghĩa là faucet (mint
    token mock, không phụ thuộc số dư). Ghi lại để đừng "sửa" test bằng cách nới
    assertion.

34. **Địa chỉ pot cho proof lấy từ manifest, không từ `reads.config`.**
    `reads.config` là kết quả của một lần đọc RPC có thể chưa xong hoặc đã hỏng;
    một luồng rút tiền không được phụ thuộc vào cái poll đó (`reads.config!` là
    nguồn của crash 'kind' nói ở #32).

## 11. Quirks Draw Room + probe cUSDC live (Day 8 — 29/08/2026)

35. **`finalizeUnwrap` trên cUSDC live chỉ có ĐÚNG MỘT chữ ký:
    `finalizeUnwrap(bytes32,uint64,bytes)`.** Probe read-only (eth_call, không
    khoá, không gas) vào `0x7c5BF43B…3639` ngày 29/08: biến thể
    `finalizeUnwrap(bytes32,uint64,bytes[])` kiểu FHEVM-oracle **không tồn tại**,
    biến thể `uint256` cũng không. Chữ ký đang pin trong `CUSDC_ABI` là đúng —
    đừng "sửa" nó theo docs của một version khác.

36. **requestId lạ revert bằng custom error `0xd1630f8e` =
    `InvalidUnwrapRequest(bytes32)`.** Đây là bản lề của R1: một unwrap đã được
    người khác finalize xong thì lần gọi thứ hai không im lặng thành công, nó
    revert — và taxonomy phải đọc revert đó thành *"cái này xong rồi"* chứ không
    phải *"thất bại"*. `packages/sdk/src/errors.ts` đã map sẵn
    (`code: "unwrap-request-gone"`, `retryable: false`), giờ có test pin selector.

37. **Còn đúng một ẩn số của R1: nội dung tham số `signatures`.** Gần như chắc là
    `decryptionProof` từ `publicDecrypt()`, nhưng không xác minh được nếu không
    có một unwrap ĐANG TREO trên ví có tiền. Vì vậy nút *Resume finalize* chưa
    ship — CLAUDE.md cấm dựng abstraction FHE/ERC-7984 trước khi verify, và
    ERROR_RECOVERY_MATRIX cấm nút dẫn vào ngõ cụt. Banner hiện tại đưa 3 đường
    đi thật (Etherscan · giới hạn đã biết · hỏi lại chain) nên không ai kẹt.

38. **Stub RPC trong Playwright phải dùng `route.fetch()`, không dùng `fetch()`
    của Node.** `fetch` global trong route handler chạy ở tầng Node, đi ra IPv6
    và treo 10s rồi `ConnectTimeoutError` khi tới publicnode. `route.fetch({
    postData })` đi bằng network stack của browser nên vào thẳng. Và body
    JSON-RPC có thể là **mảng** (ethers batch `batchMaxCount: 10`) — phải tách
    ra, chỉ dàn dựng đúng lời gọi mình quan tâm, phần còn lại forward lên rồi
    ghép lại theo `id`. Match URL bằng regex, không bằng chuỗi (URL thật có thể
    mang thêm `/`).

39. **`keeper-progress` / `claim-open-review` chỉ tồn tại ở đúng phase.** Vòng
    đang Open thì không có cursor để khoe, chưa settle thì không có nút claim.
    Test và demo phải rẽ nhánh theo `count()` — assert cứng thì đỏ tuỳ giờ chạy,
    còn nới assertion thì mất luôn ý nghĩa. Nhánh "không có" vẫn phải chứng minh
    một điều: chỗ đó **không được để trống**, phải nói ra lý do.

40. **`node demo/build-mp4.mjs` mặc định ghi `payday-pot-day7.mp4`.** Chạy
    không tham số sau khi quay Day 8 sẽ ĐÈ file reel Day 7 bằng nội dung Day 8
    (thư mục `demo-results/` gitignored nên git không cứu). Script giờ nhận
    tham số ngày: `node demo/build-mp4.mjs day8`. Và kể cả khi tên file đúng,
    `demo-results/` vẫn bị **xoá sạch đầu mỗi lần chạy** — hai reel không sống
    cùng nhau ở đó được. Reel định nộp copy sang `apps/web/demo-reels/`
    (gitignored, nằm ngoài đường xoá).

41. **`timeout` mặc định của Playwright là 30s và nó ĐÈ mọi `READ_TIMEOUT` dài
    hơn trong file.** `draw.spec.ts` chờ `draw-timeline` với 60s, nhưng test
    chết ở giây thứ 30 nên con số 60s chưa bao giờ có tác dụng. Nó xanh suốt vì
    route đã compile sẵn từ lần chạy trước; chỉ lần chạy nguội (xoá `.next` →
    Next compile `/app/draws/current` + một vòng đọc Sepolia thật) mới lòi ra, và
    lòi ở **test đầu tiên** nên trông y như lỗi sản phẩm. Đã
    `test.describe.configure({ timeout: 120_000 })` cho cả file. Quy tắc: hằng
    số `*_TIMEOUT` trong file phải nhỏ hơn timeout của test, nếu không nó là số
    trang trí.

42. **Relayer sập giữa suite đọc thành "lỗi luồng tiền".** Màn review của
    withdraw chỉ dựng được sau khi relayer mã hoá xong; relayer chết thì app đi
    đúng nhánh **R7** (input còn nguyên, chưa gửi gì) — hành vi ĐÚNG, có test
    riêng. Nhưng test "bấm ký hai lần" thì đỏ vì lý do chẳng liên quan đến nó.
    Cách xử lý: chờ `dialog.or(relayerDown)` rồi `test.skip()` **có lý do**, chứ
    không nới assertion. Xanh giả tệ hơn đỏ.

43. **Chạy demo CÓ MÀN HÌNH chết cửa sổ giữa chừng — quay reel thì luôn
    `DEMO_HEADLESS=1`.** `pnpm demo:day8` mặc định headed (config chỉ headless
    khi `DEMO_HEADLESS=1`). Một lần chạy 30/08 đứt ở clip 3:
    `page.waitForTimeout: Target page, context or browser has been closed` tại
    `narrate.ts:69` — đúng dòng thuyết minh ĐẦU TIÊN của clip, tức trang đã chết
    trước khi có assert nào chạy. Không assert nào fail; `mode: "serial"` nên 2
    clip sau "did not run". Chạy lại headless: **5/5 xanh, 4.1 phút**. Cách đọc
    lỗi này: `waitForTimeout` ném "target closed" là **cửa sổ chết**, không phải
    sản phẩm sai — `page.evaluate` ngay trên nó có `.catch(() => {})` nên nuốt
    mất nguyên nhân thật. Và vì run fail thì `build-mp4.mjs` không chạy, trong
    khi `demo-results/` đã bị xoá sạch từ đầu run → **mất luôn reel cũ ở đó**.
    Reel nộp nằm ở `apps/web/demo-reels/` chính vì vậy (xem #40).

## 12. Quirks đóng R1 + relayer ngoài browser (Day 9 — 02/09/2026)

44. **Tham số thứ ba của `finalizeUnwrap` là `decryptionProof` của
    `publicDecrypt()` — hết ẩn số (#37 đóng).** Xác nhận hai đường độc lập.
    (a) Source OZ `@openzeppelin/confidential-contracts@0.5.3`
    `token/ERC7984/extensions/ERC7984ERC20Wrapper.sol`: tham số tên đúng là
    `decryptionProof`, và contract **tự** dựng `cleartexts = abi.encode(uint64)`
    rồi `FHE.checkSignatures(handles, cleartexts, decryptionProof)` — nên chỉ
    truyền **số** cho tham số `uint64`, không truyền `abiEncodedClearValues`.
    (b) Chạy thật trên Sepolia 02/09: `unwrap` → `publicDecrypt([requestId])` →
    `finalizeUnwrap(requestId, clearValue, decryptionProof)` mined thành công.
    Đối chiếu thêm: `abi.encode(["uint64"], [clearValue])` **khớp từng byte** với
    `abiEncodedClearValues` mà relayer trả về.

45. **`unwrap` KHÔNG cần ACL để decrypt — wrapper tự
    `FHE.makePubliclyDecryptable` lên handle số đã burn.** Đó là lý do bước hai
    permissionless được (ví nào cũng finalize hộ được) và lý do không cần chữ ký
    EIP-712 thứ hai. Hệ quả cho privacy: **exit là chỗ duy nhất một số tiền
    thôi confidential** — nói thẳng trong UI, đừng để judge tự phát hiện.
    Và `requestId` **chính là** handle đó (#23) nên nó vẫn không có việc gì phải
    nằm trong localStorage/URL/analytics.

46. **`unwrap` vượt số dư KHÔNG revert — nó clamp về encrypted zero rồi
    `finalizeUnwrap` chuyển 0.** Gặp thật lúc probe: unwrap 1 USDC từ ví có 0
    cUSDC tạo request bình thường, finalize thành công, chuyển 0. Cùng ngữ nghĩa
    clamp với deposit (non-negotiable #2) nhưng ở biên unwrap. Hệ quả UI: nút
    hoàn tất **phải báo số thật**, kể cả 0 — một dấu tích xanh không kèm số ở đây
    là app nói dối về một giao dịch thành công.

47. **`userDecrypt` của relayer-sdk KHÔNG chạy được ngoài browser
    (`node-tkms@0.12.8`).** Mọi lời gọi từ Node chết trong WASM:
    `core/service/src/client/user_decryption_wasm.rs:412:44 … Gao decoding
    failure … n=13, deg=4, #shares=9`. Đã loại trừ mọi giả thuyết phía server:
    handle mới tinh và handle 6 ngày tuổi, một handle và nhiều handle, một
    contract và nhiều contract — đều chết như nhau; **`publicDecrypt` trên cùng
    relayer đó thành công** và proof của nó được contract nhận (#44), nên KMS
    khoẻ. Kết luận: lỗi ở binding Node của tkms. Hệ quả: **mọi verify liên quan
    tới reveal phải chạy trong browser** (Playwright), không có đường script hoá.
    `publicDecrypt` thì chạy tốt ở Node — đủ cho script vận hành R1.

48. **`eth_getLogs` ở publicnode chặn đúng 50.000 block; Infura chặn thấp hơn.**
    Đo thật 02/09: 100k → `exceed maximum block range: 50000`, 50k → OK. ≈6,9
    ngày Sepolia trong một request. Vì vậy `UNWRAP_LOOKBACK_BLOCKS = 50_000` là
    con số đo được chứ không phải chọn cho tròn, và giới hạn "unwrap treo cũ hơn
    ~7 ngày thì banner không thấy" phải ghi ở KNOWN_LIMITATIONS thay vì phân
    trang ngược vô hạn lúc mount.

---

## 13. Quirks RC lên Sepolia (Day 9 — 02/09/2026)

49. **`@nomicfoundation/hardhat-verify@2.1.3` dùng shape config v2, KHÔNG phải
    của Hardhat 3.** Context7 trả docs Hardhat 3 (`defineConfig`, khối
    `verify: { etherscan: … }`) cho một repo Hardhat 2.29.0 — sai hoàn toàn và
    trông rất giống đúng. Nguồn thật là `types.d.ts` +
    `internal/type-extensions.d.ts` của chính bản đã cài: ba key **top-level**
    `etherscan`, `blockscout`, `sourcify`. Bài học chung: version pin nào mà
    Context7 không phân biệt được major thì đọc `.d.ts` trong `node_modules`,
    nó không bao giờ nói về một version khác.

50. **Blockscout Sepolia không cần API key, và nó tự propagate sang Sourcify.**
    `internal/blockscout.chain-config.js` đã có sẵn `eth-sepolia`
    (`https://eth-sepolia.blockscout.com/api`). Đây là đường verify duy nhất
    không đòi tạo account. Kết quả đo trên RC: Sourcify v2 trả
    `creationMatch=match` + `runtimeMatch=match` — **full match, kể cả với
    `bytecodeHash: "none"`** (dự đoán ban đầu của tôi là partial; sai). Kiểm:
    `curl https://sourcify.dev/server/v2/contract/11155111/<address>`

51. **Provider Sourcify của plugin là DEAD CODE — nó vẫn gọi API v1.** Client
    trong 2.1.3 gọi `${apiUrl}/check-all-by-addresses`, endpoint Sourcify đã bỏ;
    giờ trả HTML 404 nên lỗi hiện ra là `Unexpected token '<', "<!DOCTYPE "…`,
    tức là trông như lỗi mạng chứ không như "endpoint không còn tồn tại". Vẫn để
    `enabled: true` có chủ ý: thà lệnh verify nói nó không chạy được, hơn là im
    lặng bỏ qua một provider mà mình tưởng đang chạy.

52. **Task `verify` chạy MỌI provider đang bật, và một provider bật mà thiếu key
    sẽ fail CẢ lệnh** — kéo theo hai provider đang chạy được cũng không báo cáo
    gì. Vì vậy `etherscan.enabled: ETHERSCAN_API_KEY !== ""` là bắt buộc chứ
    không phải cho gọn. Kèm theo: **không gọi được subtask từ CLI** —
    `npx hardhat verify:blockscout` chết bằng `HHE3`/`HH312`; chỉ chạy task cha
    `verify`, còn chọn provider thì bằng `enabled`.

53. **pnpm 11 XOÁ `onlyBuiltDependencies`, thay bằng `allowBuilds` (map → bool).**
    Cùng lúc xoá `neverBuiltDependencies`, `ignoredBuiltDependencies`,
    `onlyBuiltDependenciesFile`, `ignoreDepScripts`. Nguy hiểm ở chỗ **im lặng
    trên máy dev**: `pnpm install` gặp `node_modules` dựng sẵn thì in "Already up
    to date" và không đánh giá build script lần nào, nên một `allowBuilds` sai
    kiểu (giá trị là chuỗi thay vì boolean) sống được 8 ngày. Cold install đầu
    tiên — trên Vercel — fail cả lệnh bằng `ERR_PNPM_IGNORED_BUILDS`.
    Cách reproduce cold install trong 5 giây, không phá `node_modules` đang chạy:
    copy đúng 6 file manifest (root `package.json`, `pnpm-workspace.yaml`,
    `pnpm-lock.yaml`, và `package.json` của 4 workspace) sang thư mục trống rồi
    `pnpm install --frozen-lockfile`.

54. **Relayer không phục vụ hai `userDecrypt` song song của CÙNG một ví.** Với
    `--workers=2`, hai test reveal cạnh nhau treo ở `data-state="hidden"` tới hết
    120s trong khi ba test reveal chạy lẻ đều xanh trong 11–27s. Triệu chứng
    trùng khít với một reveal hỏng thật, nên nó đọc như bug sản phẩm. Fix ở tầng
    test: `test.describe.configure({ mode: "default" })` cho khối reveal (tuần
    tự trong một worker, ghi đè `fullyParallel`). **Không** dùng `serial` — nó
    biến một test đỏ thành ba test skip.

55. **Vercel bật `ssoProtection` cho project mới, phạm vi `all_except_custom_domains`.**
    Nghĩa là mọi URL `*.vercel.app` — kể cả production alias — nằm sau màn hình
    đăng nhập Vercel. Judge mở link sẽ thấy login, không thấy sản phẩm, và không
    có gì trong build log nói ra điều đó. Phải tắt tường minh và kiểm bằng một
    request không cookie (`curl -I` → 200, không phải 401/307 sang
    `vercel.com/sso`).
