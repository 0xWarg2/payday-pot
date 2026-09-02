# ERROR_RECOVERY_MATRIX — PayDay Pot

> **Tại sao file này tồn tại.** Judging criteria của bounty track có mục
> *"does your app handle errors gracefully?"*, và đây đúng là chỗ winner Season 3 bị
> chất vấn công khai trên forum: cả 3 winner của S3 bounty track **không có đường
> recovery khi `finalizeUnwrap` bị treo** — user đã sign unwrap, token đã burn onchain,
> signature finalize bị cancel → tiền kẹt trong contract, không có cách lấy lại.
>
> PayDay Pot đi qua đúng cái wrapper đó, nên failure mode này nằm sẵn trên đường của
> mình. Xử lý được nó là điểm tách khỏi submission trước.
>
> **Probe live 26/08 (COMPATIBILITY_NOTES quirk #22) làm R1 từ "lo ngại" thành "thiết kế
> được":** cUSDC live có `unwrapRequester(bytes32)` và `unwrapAmount(bytes32)` là **view
> mở** — nghĩa là UI phát hiện unwrap treo bằng **một view call**, không cần index event,
> không cần backend. Và `finalizeUnwrap(bytes32,uint64,bytes)` **permissionless** — ví
> nào bấm cũng được, không nhất thiết ví đã ký unwrap. Đó là hai fact biến R1 từ
> "banner xin lỗi" thành nút bấm thật.
>
> Rule: mỗi dòng trong bảng phải có **3 thứ** mới được tick — (1) user thấy gì trong UI,
> (2) hành động recovery bấm được, (3) test cover. Chỉ có test mà UI không nói gì =
> chưa xong. Chỉ có UI mà không có test = chưa xong.

## Trạng thái 02/09 (Day 9)

**15/15 dòng đóng đủ ba điều kiện (UI + action + test).**

| | |
|---|---|
| Đóng đủ 3 điều kiện (UI + action + test) | R1 R2 R3 R4 R5 R6 R7 R8 R9 R10 R11 R12 R13 R14 R15 |
| Còn nợ | — |

R1 là dòng đóng cuối cùng và nó đóng bằng ba thứ, không phải bằng một lời giải
thích: (1) phát hiện đọc **log trên chain** thay vì localStorage — bản cũ lọc
`txStore` theo kind `"unwrap"` mà **không chỗ nào trong app ghi kind đó**, nên
banner chưa từng có khả năng hiện ra dù cả UI, copy và E2E của nó đều xanh;
(2) nút **Finish it now** gọi `finalizeUnwrap(id, amount, decryptionProof)` —
đã chạy thật trên Sepolia 02/09, không phải nút chưa từng gửi lần nào;
(3) nó **báo số thật, kể cả 0** — vì unwrap vượt số dư clamp về 0 chứ không
revert (COMPATIBILITY_NOTES #46).

Đọc kèm: `docs/handoffs/DAY_08_HANDOFF.md`, `docs/handoffs/DAY_09_HANDOFF.md`.

## Bảng failure mode

| # | Failure mode | User thấy gì | Recovery action | Test | Ngày | ☐ |
|---|---|---|---|---|---|---|
| R1 | **Unwrap pending / `finalizeUnwrap` chưa chạy** (user cancel signature, tab đóng, RPC lỗi) | Banner bền vững "bạn có 1 unwrap chưa hoàn tất", nói rõ tiền đang nằm ở token contract, KHÔNG hiện balance = 0 | Nút **Finish it now**, idempotent, gọi lại được nhiều lần | E2E: request treo → banner → hoàn tất; unit: proof đi đúng chỗ, số 0 nói là 0 | 6 (onboarding) + 8 (E2E) + 9 (finalize) | ✅ **ĐÓNG 02/09**. Phát hiện: `getLogs` topic `UnwrapRequested(receiver = ví)` trong cửa sổ **50.000 block** (trần đo thật của publicnode — COMPATIBILITY_NOTES #48) rồi lọc bằng `unwrapRequester(id) != address(0)`. Một `getLogs` + n view call, **không backend, không cần tab này từng gửi tx đó** — và đó là điểm mấu chốt vì một unwrap treo hầu như luôn được tạo ở NGOÀI app. **Bản cũ đọc localStorage nên nó chết**: filter `txStore` theo kind `"unwrap"` trong khi app không có action unwrap → không record nào tồn tại → banner không bao giờ render; kind đó nay đã bị xoá khỏi `TxAction` (một kind không ai ghi là một nhánh UI không ai chạy). Recovery: `finalizeUnwrap(id, clearAmount, decryptionProof)` với proof lấy từ `publicDecrypt([requestId])` — **permissionless**, wrapper tự `makePubliclyDecryptable` lên handle nên không cần chữ ký user thứ hai (#45). Chạy thật trên Sepolia 02/09 (#44). Idempotent: request đã xong thì `unwrapRequester → 0` và banner **biến mất chứ không đỏ**; bấm lại một id đã tiêu → `InvalidUnwrapRequest` `0xd1630f8e`, taxonomy đọc thành "xong rồi" (#36). **Báo số thật kể cả 0**: unwrap vượt số dư clamp về encrypted zero rồi chuyển 0 (#46), nên UI có nhánh riêng `data-amount-zero="true"` nói thẳng "settled, but it moved 0 USDC" + cách sửa. Nút bị khoá thì khoá kèm lý do đọc được (R8), và phát hiện vẫn chạy khi ví ở mạng khác — phải BIẾT có tiền treo trước khi biết cần đổi mạng. Test: `test/pending-unwrap.test.tsx` 11 unit (nguồn là chain · cửa sổ đúng 50k · log của request đã finalize **không** tính là còn treo · RPC lỗi trả rỗng chứ không ném · proof đi đúng tham số thứ ba · requestId không xuống đĩa · 0 nói là 0) · `e2e/recovery.spec.ts` 8 test xanh (banner sống qua reload, re-check idempotent, settled → biến mất, không ô confidential nào hiện chữ số, nút hoàn tất nói lý do khi bị khoá). **Giới hạn còn lại, đã ghi ở KNOWN_LIMITATIONS**: unwrap treo cũ hơn ~7 ngày nằm ngoài cửa sổ 50k block; và app không có tính năng unwrap của riêng nó (non-goal) |
| R2 | **Deposit bị token từ chối** (cap vượt → ebool false → refund all-or-nothing) | "Không có gì bị trừ khỏi ví bạn" + lý do ở mức cap (không leak amount) | Sửa số rồi thử lại; state không dính | Contract: deposit > cap → principal không đổi, không revert-leak. UI: hiện đúng thông điệp | 2 (contract) + 7 (UI) | ✅ contract ✅ 20/08 (tests: exact cap, cap+1 refund, 5k→6k crossing refund — all-or-nothing, tx success, principal không đổi). UI Day 7 · **UI Day 7 ✅**: `preflightDeposit` chặn TRƯỚC khi ký (`test/savings.test.tsx` — over-cap → row R2, và cap thắng khi nhiều điều kiện cùng sai), thông điệp ở mức cap không mang số của user |
| R3 | **User nằm trong deny list của wrapper** (`isBlocked`) hoặc chạm `maxTotalSupply` | Báo đúng nguyên nhân "token contract từ chối địa chỉ này", KHÔNG hiện "transaction failed" | Link tới KNOWN_LIMITATIONS; không có retry vô nghĩa | Mock blocked user → deposit fail đúng thông điệp | 2 + 7 | ✅ **xác nhận live 26/08** — không còn là giả thuyết: cUSDC có `isBlocked(address)` (view, precheck được **trước khi ký**), `blockUser`/`unblockUser` do owner `0x08e8…4f52` gọi. `maxTotalSupply()` = 2^64−1 nên nhánh supply thực tế không chạm được trên testnet — vẫn giữ dòng vì đó là điều kiện của wrapper chứ không phải của pot. Code taxonomy `not-token`/`blocked` Day 7 · **UI Day 7 ✅**: `preflightDeposit({blocked:true}) → R3` (`test/savings.test.tsx`), taxonomy `blocked` có link KNOWN_LIMITATIONS, không có nút retry vô nghĩa |
| R4 | **Draw batch dừng giữa cursor** (keeper chết/hết gas) | Draw Room hiện cursor đang ở đâu (`x/32 processed`), trạng thái "resumable", ai cũng làm được | Nút **Continue draw** permissionless từ bất kỳ ví | Kill keeper giữa batch → ví khác continue → kết quả không đổi | 4 (contract) + 8 (E2E) | ✅ contract ✅ 24/08, siết 25/08 (tests: keeper dừng sau `selectBatch(1)` → ví lạ `selectBatch(32)` hoàn tất, winner y hệt dự đoán; cursor monotonic qua `SelectProgress`; view `drawProgress(epochId)` cấp `(drawn, cursor, total)` cho UI "x/32"; demo:day4 diễn live stranger-resume). **UI phải tự chia batch**: trần đo được là **21 participant/tx cho `snapshotBatch`, 22 cho `selectBatch`** (HCU 20M global / 5M sequential) — `snapshotBatch(32)`/`selectBatch(32)` trên pool đầy 32 người **revert**, nên pool đầy = 2 tx mỗi stage. Nút "Continue" gửi `maxSteps` an toàn (≤16) chứ không gửi 32. **`total` là `frozenCount` của chính epoch đó** (sửa 25/08) — trước đó view trả độ dài list hiện tại, nên một ví vào epoch sau làm epoch cũ hiện "1/3 resumable" dù đã settle xong; test pin epoch 1 giữ `total = 2` sau khi pool lên 3. UI Day 7/8 · **UI Day 8 ✅**: Draw Room + `KeeperPanel` đọc `snapshot.cursor/total` và `draw.cursor/total` thẳng từ chain, **không có state cục bộ nào** để mất; nút Continue gửi `min(16, còn lại)`. Unit `test/draw-room.test.tsx`: giết keeper ở cursor 8/32 → `{action:'select', steps:16}` và `keeperState` cho **hai thời điểm khác nhau deep-equal nhau** (view model không có bộ nhớ); batch cuối 18/21 → xin đúng 3. E2E `e2e/draw.spec.ts`: **xoá sạch localStorage + sessionStorage, reload → fingerprint tiến độ giống hệt từng ký tự**; và không một chữ nào về round được ghi xuống storage |
| R5 | **Random đã sinh nhưng tx select fail** | Trạng thái "seed đã chốt cho epoch này", nói rõ không reroll | Continue, không có nút re-draw | Contract: gọi lại draw trigger trong cùng epoch → revert; seed không đổi | 4 | ✅ contract ✅ 24/08 (tests: `requestRandom` lần 2 → `AlreadyDrawn`, handle random/ticket **không đổi** — equality pin; pause chặn requestRandom rồi unpause chạy tiếp — epoch không mất gì; scan tiếp tục bằng `selectBatch` từ đúng cursor). UI message "seed đã chốt, không reroll" Day 7/8 · **UI Day 8 ✅**: `seed-locked` notice hiện SUỐT giai đoạn Drawing (không đợi tới lúc batch fail — hiện lúc lỗi thì đọc như chống chế), copy nói "drawn once and cannot be drawn again — not by us, not by anyone" + đường đi tiếp "send it again; it picks up at the same cursor". Unit `test/draw-room.test.tsx` pin cả ba: hiện khi `drawn && !Settled`, không hiện trước khi rút seed, không hiện sau khi settle. Panel không render nút cho bước đang bị pause chặn (`requestRandom` là hàm draw duy nhất có `whenNotPaused`) |
| R6 | **EIP-712 decrypt bị reject / hết hạn / sai chain** | "Chưa mở khoá" — **không bao giờ hiện `0`** (non-negotiable #8) | Nút reveal lại; nếu sai chain thì nút switch network | Unit: reject signature → state hidden, không phải zero. Sai chain → prompt switch | 6 + 7 | ✅ **Day 6 + 7**. UI: bốn pha reveal tách riêng, và `hidden`/`unavailable` là hai state RIÊNG — không bao giờ `0`. Action: reveal lại (`retry`), sai chain → nút switch. Test: `test/classify-read-error.test.ts` (4001 → R6, action `retry`, detail chứa "nothing was sent") · `e2e/privacy.spec.ts` (copy đến từ taxonomy, panel mang đúng row) · `e2e/savings.spec.ts` (chữ ký bị từ chối là recovery, không phải dead end) · `test/draw-room.test.tsx` (đọc lỗi → "không đọc được", và lý do **không được khớp** `/\b0\b|zero|nothing/i`) |
| R7 | **Relayer/RPC timeout khi encrypt hoặc userDecrypt** | Spinner có timeout + "relayer đang chậm", giữ nguyên input đã nhập | Retry không mất form state | Drill: chặn relayer domain → UI degrade đúng | 7 + 9 (drill) | ✅ **Day 7**. UI: `error-panel` là điểm đến khi encrypt/decrypt không về, không phải spinner vô hạn; input đã gõ giữ nguyên. Action: retry không mất form state. Test: `e2e/savings.spec.ts` **cắt thật domain relayer** (`**/*.zama.cloud/**`) → panel phục hồi trong 90s, luôn có ít nhất một nút/link, và không có số tiền trong thông điệp · `test/classify-read-error.test.ts` — `NETWORK_ERROR` trên đường **read** map sang R7 chứ không sang R8 (bảo "đổi mạng đi" khi RPC sập là dead end hoàn hảo). Drill Day 9 là diễn tập trên mạng thật, không phải test còn thiếu |
| R8 | **Wallet sai network / SDK khởi tạo trước khi có ví** | Trạng thái rõ ràng, không CALL_EXCEPTION lộ ra UI (quirk #7 COMPATIBILITY_NOTES) | Switch network 1 nút; SDK luôn dùng RPC Sepolia cố định | Đổi network giữa flow → không crash | 6 | ✅ **Day 6 + 7**. UI: mọi nút tiền bị khoá kèm LÝ DO đọc được (`useWriteGate` → 4 block state có câu riêng); read vẫn chạy vì luôn đi qua RPC Sepolia cố định (quirk #7). Action: switch network 1 nút. Test: `e2e/savings.spec.ts` (ví ở chain khác → không nút tiền nào sống) · `e2e/privacy.spec.ts` · `test/error-copy.test.ts` (4902 → R8) · `test/classify-read-error.test.ts` (R7-vs-R8 tách đúng đường) |
| R9 | **Claim khi chưa finalized / đã claim rồi / không phải winner** | Thông điệp phân biệt 3 case, không leak ai là winner | Không có action mù; chỉ enable khi hợp lệ | Contract: double-claim idempotent, non-winner claim = no-op | 5 | ✅ contract ✅ 25/08 (tests: winner claim đúng 1 lần — balance tăng đúng prize, `pendingPrize` về enc(0); claim lần 2 chuyển **0**, không revert; non-winner claim thành công chuyển **0**; chưa từng scan → `NothingToClaim` (public fact, phân biệt được case "chưa finalized"); chưa register → `NotRegistered`; **claim khi paused vẫn chạy** — rule #1. Chống leak: winner và non-winner cùng một code path, **HCU/depth/gas bằng nhau tuyệt đối** 748,032 / 369,000 / 396,250 — đo độc lập ở `PayDayPot.prize.ts` và `PayDayPot.hcu.ts`; demo:day5 diễn live cả 3 case). UI Day 7 phân biệt 3 message · **UI Day 7 + 8 ✅**: `ClaimPanel` ba câu cho ba tình huống và **không có câu chúc mừng** nào; Draw Room thêm `claim-gate` — nút review chỉ mở khi **đã reveal VÀ số dương VÀ vòng đã settle**. Unit `test/draw-room.test.tsx`: `locked-draw` / `locked-hidden` / mở; và `claimGate(sealed, hidden).reason` **không được khớp** `/\b0\b|zero|nothing/i` — "bạn không có gì" và "chưa mở khoá" là hai câu khác nhau. E2E `e2e/draw.spec.ts` (claim đóng tới khi tự mở khoá) + `e2e/savings.spec.ts` (vòng chưa settle nói thẳng, không gợi ý ai thắng) |
| R10 | **Withdraw khi đang paused / đang snapshot** | Withdraw **luôn** khả dụng (rule #1), UI nói rõ deposit đang tạm dừng nhưng rút thì không | `withdrawAll` chạy được ở mọi phase | Contract: paused + snapshot phase → withdrawAll xanh | 2 + 3 | ✅ contract ✅ full 23/08 — paused half 20/08 (deposit EnforcedPause, withdraw + withdrawAll xanh); snapshot half 23/08 (withdrawAll xanh trong Snapshotting, xanh cả khi **paused + Snapshotting đồng thời**; partial withdraw giữa snapshot không đổi frozen weight — handle equality; demo:day3 diễn live withdrawAll giữa snapshot). UI banner Day 7 · **UI Day 7 ✅**: banner pause nói CẢ HAI nửa trong một câu (deposit dừng · rút và claim thì không), `preflightDeposit` trả R10 cho paused / hết giờ / Snapshotting (`test/savings.test.tsx`); Draw Room: `blocked-paused` detail nhắc withdraw vẫn chạy, và `draw-withdraw-link` đưa thẳng ra `/app/savings` (E2E) |
| R11 | **Reload giữa mọi pending state** (approval, deposit, draw cursor, claim) | Khôi phục đúng trạng thái, không mất tiền, không double-submit | Resume đúng chỗ | E2E reload tại 4 điểm (đã có trong Day 8) | 8 | ✅ **Day 8**. Cơ chế: `sendTx` ghi record **ngay khi có hash, trước `wait()`** — tab chết giữa chừng vẫn để lại đúng một dấu vết, và trạng thái dựng lại từ chain chứ không từ đĩa. Bốn điểm đủ: **approval** + **claim** (`e2e/recovery.spec.ts`) · **deposit** (`e2e/savings.spec.ts`) · **draw cursor** (`e2e/draw.spec.ts`, xoá storage + reload → cùng con số). Không double-submit: `e2e/savings.spec.ts` bấm ký hai lần vẫn ra một tx. Và hợp đồng persist là **đúng 4 trường** (`chainId, action, txHash, createdAt`) — test pin danh sách khoá, vì một trường thứ năm là cách một số tiền rời khỏi bộ nhớ tab mà không ai nhận ra |
| R12 | **Employer prize không đủ backing** | Trạng thái solvency công khai (allocated prize là public uint64 — P-4) | Employer thấy cần fund thêm bao nhiêu | Contract: allocate > backing → revert với lý do plaintext hợp lệ | 5 | ✅ contract ✅ 25/08 — **đóng bằng thiết kế, không bằng check**: `fundPrize` pull ERC-20 công khai rồi tự `wrap`, nên allocation ≡ funding ≡ transfer thật; thiếu tiền/allowance thì **revert plaintext** ở tầng ERC-20 (`ERC20InsufficientBalance`/`ERC20InsufficientAllowance`), `prizeAmount` và balance pot không đổi (test pin cả hai). Nhận confidential transfer sẽ **không** làm được điều này — clamp ERC-7984 all-or-nothing chuyển enc(0) âm thầm (DRAW_PROTOCOL §6.6). `prizeAmountOf(epochId)` là plaintext uint64 công khai để employer đọc thẳng số cần bù; demo:day5 beat 2 diễn live revert. UI Day 7: employer panel + step 1/2 (xem R13) · **UI Day 7 ✅**: `SponsorOverview` hiện `prizeAmountOf` (plaintext, công khai) + số cần bù; `FundPrizePanel` kiểm solvency TRƯỚC allowance — approve số tiền mình không có là một chữ ký vứt đi. Test `test/savings.test.tsx`: `preflightFundPrize` → R12 khi thiếu backing và khi vòng không còn Open, `not-employer` khi sai ví |
| R13 | **Thiếu ERC-20 approval** trước khi wrap/deposit (brief nêu tên tường minh) | Bước approval hiện rõ là bước 1/2, không để user tưởng đã deposit | Nút approve riêng, retry được, không mất số đã nhập | E2E: deposit khi chưa approve → prompt approve → tiếp tục đúng chỗ | 6 + 7 | ✅ **Day 6 + 7 + 8**. UI: nhãn **"Approve — step 1 of 2" / "Shield — step 2 of 2"** ở cả ba chỗ có approval (onboarding `AssetStep`, `AssetsHelper`, `FundPrizePanel`) — hai nút không bao giờ hiện cùng lúc. Action: nút approve riêng, retry được. Test: `e2e/recovery.spec.ts` (ví trắng → đúng nhãn bước 1/2, câu "Two signatures", **số đã gõ còn nguyên**, không có nút bước 2 để bấm nhầm) · `test/savings.test.tsx` (`preflightFundPrize` → `{needsApproval:true}`, không phải error) · `test/classify-read-error.test.ts` (`ERC20InsufficientAllowance` → action `approve`, không phải `retry` chung chung) |
| R14 | **Insufficient balance** (ERC-20 gốc hoặc cUSDC không đủ) | Nói rõ thiếu ở tầng nào (USDC gốc vs cUSDC đã wrap), gợi ý faucet | **Nút in-app, không phải link ra ngoài** | UI: balance < requested → block trước khi ký | 6 + 7 | ✅ **nâng cấp 26/08** — `USDCMock.mint(address,uint256)` là **faucet mở**, ai gọi cũng được (underlying không có `owner()`, không có role gate — quirk #21). Nên recovery action là **"Get test USDC" ngay trong app**, một tx, không rời trang, không captcha, không rate-limit của bên thứ ba. Đây là khác biệt UX thật so với "link tới faucet" mà spec ban đầu dự tính. Code Day 6 · **Day 6 ✅**: nút "Get 1,000 test USDC" ngay trong app; test `test/savings.test.tsx` (không có gì shielded → R14) + `test/classify-read-error.test.ts` (`ERC20InsufficientBalance` → action `get-test-assets`, không phải retry) |
| R15 | **Unsupported token / sai token** (brief nêu tên tường minh) | "Token này không phải token của pool", nói token đúng là gì | Chuyển sang token đúng bằng 1 nút | Contract: deposit token khác → revert; UI chặn trước | 2 + 7 | ✅ contract ✅ 20/08 (tests: wrapper thứ 2 → `NotToken`, EOA gọi thẳng callback → `NotToken`; selector bubble qua token — quirk #12). UI Day 7 · **UI Day 7 ✅**: taxonomy `not-token` nói token đúng là gì; `test/error-copy.test.ts` pin R15 có mặt trong 4 dòng brief gọi tên |

## Nguyên văn tiêu chí chấm (đọc từ trang challenge S4, 20/08)

> **UX:** "Is the app pleasant to use? **Does it handle approvals and errors gracefully?**"

Và trong mục *Topics to cover*, brief nêu tên đúng 4 error case phải có:

> "Sensible error handling for **missing approvals, insufficient balance, network
> mismatch, and unsupported tokens**"

→ R13 (missing approval), R14 (insufficient balance), R8 (network mismatch), R15
(unsupported token) là **4 dòng bắt buộc**, không được cắt. Phần còn lại (R1, R4…) là
phần vượt yêu cầu — cũng là phần winner S3 bị chê là thiếu.

## Ràng buộc chung khi viết thông điệp lỗi

- Không leak amount/balance/winner qua error message hoặc revert reason (non-negotiable #5).
- Không hiện `0` cho giá trị confidential đang hidden/unavailable — dùng state riêng
  ("chưa mở khoá" / "không khả dụng") (#8).
- Mọi recovery action phải **idempotent** — bấm 2 lần không hỏng.
- Không có dead end: mỗi error state phải có ít nhất 1 nút hoặc 1 link đi tiếp.

## Video (day 8–9 quay, dùng cho submission)

Dành **~30 giây** riêng cho recovery, không nhồi vào happy path:
1. bắt đầu unwrap → cancel signature → reload → banner pending → resume finalize → xong (R1)
   — **beat cuối phụ thuộc nút chưa ship**. Nếu tới lúc quay vẫn chưa unblock được, quay
   bản trung thực: banner + Check again + link explorer, và voiceover nói thẳng bước
   finalize là permissionless nên ví nào cũng chạy được. Diễn một nút không tồn tại là
   thứ tệ hơn hẳn việc thiếu nó.
2. kill keeper giữa draw → ví khác bấm Continue → draw hoàn tất (R4) — **quay được ngay**:
   `e2e/draw.spec.ts` đã chứng minh xoá sạch storage rồi reload vẫn ra đúng cursor cũ

Đây là 30 giây trực tiếp trả lời tiêu chí *"does your app handle errors gracefully?"* —
nói thẳng câu đó trong voiceover.

## Nguồn

- Judging criteria S3 bounty track + thread khiếu nại winner S3 trên
  `community.zama.org` (Aug 2026) — 3 winner thiếu recovery cho `finalizeUnwrap` treo.
- `docs/COMPATIBILITY_NOTES.md` §2 (deny list, maxTotalSupply, refund-khi-ebool-false
  chưa verify live) · §4 quirk #7 (CALL_EXCEPTION khi SDK đọc chain từ ví) ·
  **§8 quirk #20–#23** (probe live 26/08: wrapper đã bị upgrade; faucet mở; `unwrap`
  plaintext không tồn tại; unwrap làm amount public-decryptable).
- `packages/sdk/src/errors.ts` — taxonomy code hoá bảng này: mỗi `PotError` mang
  `row: MatrixRow`, nên một dòng ở đây không có code tương ứng là compile-time
  visible. `FOREIGN_ERROR_ABI` decode revert của token (R12/R13/R14) chứ không chỉ
  revert của pot.
