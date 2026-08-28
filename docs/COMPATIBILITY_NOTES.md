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
