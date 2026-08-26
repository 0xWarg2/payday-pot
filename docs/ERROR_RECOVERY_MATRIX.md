# ERROR_RECOVERY_MATRIX — PayDay Pot

> **Tại sao file này tồn tại.** Judging criteria của bounty track có mục
> *"does your app handle errors gracefully?"*, và đây đúng là chỗ winner Season 3 bị
> chất vấn công khai trên forum: cả 3 winner của S3 bounty track **không có đường
> recovery khi `finalizeUnwrap` bị treo** — user đã sign unwrap, token đã burn onchain,
> signature finalize bị cancel → tiền kẹt trong contract, không có cách lấy lại.
>
> PayDay Pot đi qua đúng cái wrapper đó (`ConfidentialWrapperV3` có
> `wrap`/`unwrap`/`finalizeUnwrap` — COMPATIBILITY_NOTES §2), nên failure mode này nằm
> sẵn trên đường của mình. Xử lý được nó là điểm tách khỏi submission trước.
>
> Rule: mỗi dòng trong bảng phải có **3 thứ** mới được tick — (1) user thấy gì trong UI,
> (2) hành động recovery bấm được, (3) test cover. Chỉ có test mà UI không nói gì =
> chưa xong. Chỉ có UI mà không có test = chưa xong.

## Bảng failure mode

| # | Failure mode | User thấy gì | Recovery action | Test | Ngày | ☐ |
|---|---|---|---|---|---|---|
| R1 | **Unwrap pending / `finalizeUnwrap` chưa chạy** (user cancel signature, tab đóng, RPC lỗi) | Banner bền vững "bạn có 1 unwrap chưa hoàn tất", nói rõ tiền đang nằm ở token contract, KHÔNG hiện balance = 0 | Nút **Resume finalize**, idempotent, gọi lại được nhiều lần | E2E: kill tab giữa unwrap → reload → resume thành công | 6 (onboarding) + 8 (E2E) | ☐ |
| R2 | **Deposit bị token từ chối** (cap vượt → ebool false → refund all-or-nothing) | "Không có gì bị trừ khỏi ví bạn" + lý do ở mức cap (không leak amount) | Sửa số rồi thử lại; state không dính | Contract: deposit > cap → principal không đổi, không revert-leak. UI: hiện đúng thông điệp | 2 (contract) + 7 (UI) | ◐ contract ✅ 20/08 (tests: exact cap, cap+1 refund, 5k→6k crossing refund — all-or-nothing, tx success, principal không đổi). UI Day 7 |
| R3 | **User nằm trong deny list của wrapper** (`isBlocked`) hoặc chạm `maxTotalSupply` | Báo đúng nguyên nhân "token contract từ chối địa chỉ này", KHÔNG hiện "transaction failed" | Link tới KNOWN_LIMITATIONS; không có retry vô nghĩa | Mock blocked user → deposit fail đúng thông điệp | 2 + 7 | ☐ |
| R4 | **Draw batch dừng giữa cursor** (keeper chết/hết gas) | Draw Room hiện cursor đang ở đâu (`x/32 processed`), trạng thái "resumable", ai cũng làm được | Nút **Continue draw** permissionless từ bất kỳ ví | Kill keeper giữa batch → ví khác continue → kết quả không đổi | 4 (contract) + 8 (E2E) | ◐ contract ✅ 24/08, siết 25/08 (tests: keeper dừng sau `selectBatch(1)` → ví lạ `selectBatch(32)` hoàn tất, winner y hệt dự đoán; cursor monotonic qua `SelectProgress`; view `drawProgress(epochId)` cấp `(drawn, cursor, total)` cho UI "x/32"; demo:day4 diễn live stranger-resume). **UI phải tự chia batch**: trần đo được là **21 participant/tx cho `snapshotBatch`, 22 cho `selectBatch`** (HCU 20M global / 5M sequential) — `snapshotBatch(32)`/`selectBatch(32)` trên pool đầy 32 người **revert**, nên pool đầy = 2 tx mỗi stage. Nút "Continue" gửi `maxSteps` an toàn (≤16) chứ không gửi 32. **`total` là `frozenCount` của chính epoch đó** (sửa 25/08) — trước đó view trả độ dài list hiện tại, nên một ví vào epoch sau làm epoch cũ hiện "1/3 resumable" dù đã settle xong; test pin epoch 1 giữ `total = 2` sau khi pool lên 3. UI Day 7/8 |
| R5 | **Random đã sinh nhưng tx select fail** | Trạng thái "seed đã chốt cho epoch này", nói rõ không reroll | Continue, không có nút re-draw | Contract: gọi lại draw trigger trong cùng epoch → revert; seed không đổi | 4 | ◐ contract ✅ 24/08 (tests: `requestRandom` lần 2 → `AlreadyDrawn`, handle random/ticket **không đổi** — equality pin; pause chặn requestRandom rồi unpause chạy tiếp — epoch không mất gì; scan tiếp tục bằng `selectBatch` từ đúng cursor). UI message "seed đã chốt, không reroll" Day 7/8 |
| R6 | **EIP-712 decrypt bị reject / hết hạn / sai chain** | "Chưa mở khoá" — **không bao giờ hiện `0`** (non-negotiable #8) | Nút reveal lại; nếu sai chain thì nút switch network | Unit: reject signature → state hidden, không phải zero. Sai chain → prompt switch | 6 + 7 | ☐ |
| R7 | **Relayer/RPC timeout khi encrypt hoặc userDecrypt** | Spinner có timeout + "relayer đang chậm", giữ nguyên input đã nhập | Retry không mất form state | Drill: chặn relayer domain → UI degrade đúng | 7 + 9 (drill) | ☐ |
| R8 | **Wallet sai network / SDK khởi tạo trước khi có ví** | Trạng thái rõ ràng, không CALL_EXCEPTION lộ ra UI (quirk #7 COMPATIBILITY_NOTES) | Switch network 1 nút; SDK luôn dùng RPC Sepolia cố định | Đổi network giữa flow → không crash | 6 | ☐ |
| R9 | **Claim khi chưa finalized / đã claim rồi / không phải winner** | Thông điệp phân biệt 3 case, không leak ai là winner | Không có action mù; chỉ enable khi hợp lệ | Contract: double-claim idempotent, non-winner claim = no-op | 5 | ◐ contract ✅ 25/08 (tests: winner claim đúng 1 lần — balance tăng đúng prize, `pendingPrize` về enc(0); claim lần 2 chuyển **0**, không revert; non-winner claim thành công chuyển **0**; chưa từng scan → `NothingToClaim` (public fact, phân biệt được case "chưa finalized"); chưa register → `NotRegistered`; **claim khi paused vẫn chạy** — rule #1. Chống leak: winner và non-winner cùng một code path, **HCU/depth/gas bằng nhau tuyệt đối** 748,032 / 369,000 / 396,250 — đo độc lập ở `PayDayPot.prize.ts` và `PayDayPot.hcu.ts`; demo:day5 diễn live cả 3 case). UI Day 7 phân biệt 3 message |
| R10 | **Withdraw khi đang paused / đang snapshot** | Withdraw **luôn** khả dụng (rule #1), UI nói rõ deposit đang tạm dừng nhưng rút thì không | `withdrawAll` chạy được ở mọi phase | Contract: paused + snapshot phase → withdrawAll xanh | 2 + 3 | ◐ contract ✅ full 23/08 — paused half 20/08 (deposit EnforcedPause, withdraw + withdrawAll xanh); snapshot half 23/08 (withdrawAll xanh trong Snapshotting, xanh cả khi **paused + Snapshotting đồng thời**; partial withdraw giữa snapshot không đổi frozen weight — handle equality; demo:day3 diễn live withdrawAll giữa snapshot). UI banner Day 7 |
| R11 | **Reload giữa mọi pending state** (approval, deposit, draw cursor, claim) | Khôi phục đúng trạng thái, không mất tiền, không double-submit | Resume đúng chỗ | E2E reload tại 4 điểm (đã có trong Day 8) | 8 | ☐ |
| R12 | **Employer prize không đủ backing** | Trạng thái solvency công khai (allocated prize là public uint64 — P-4) | Employer thấy cần fund thêm bao nhiêu | Contract: allocate > backing → revert với lý do plaintext hợp lệ | 5 | ◐ contract ✅ 25/08 — **đóng bằng thiết kế, không bằng check**: `fundPrize` pull ERC-20 công khai rồi tự `wrap`, nên allocation ≡ funding ≡ transfer thật; thiếu tiền/allowance thì **revert plaintext** ở tầng ERC-20 (`ERC20InsufficientBalance`/`ERC20InsufficientAllowance`), `prizeAmount` và balance pot không đổi (test pin cả hai). Nhận confidential transfer sẽ **không** làm được điều này — clamp ERC-7984 all-or-nothing chuyển enc(0) âm thầm (DRAW_PROTOCOL §6.6). `prizeAmountOf(epochId)` là plaintext uint64 công khai để employer đọc thẳng số cần bù; demo:day5 beat 2 diễn live revert. UI Day 7: employer panel + step 1/2 (xem R13) |
| R13 | **Thiếu ERC-20 approval** trước khi wrap/deposit (brief nêu tên tường minh) | Bước approval hiện rõ là bước 1/2, không để user tưởng đã deposit | Nút approve riêng, retry được, không mất số đã nhập | E2E: deposit khi chưa approve → prompt approve → tiếp tục đúng chỗ | 6 + 7 | ☐ |
| R14 | **Insufficient balance** (ERC-20 gốc hoặc cUSDC không đủ) | Nói rõ thiếu ở tầng nào (USDC gốc vs cUSDC đã wrap), gợi ý faucet | Link faucet/onboarding; không submit tx chắc chắn fail | UI: balance < requested → block trước khi ký | 6 + 7 | ☐ |
| R15 | **Unsupported token / sai token** (brief nêu tên tường minh) | "Token này không phải token của pool", nói token đúng là gì | Chuyển sang token đúng bằng 1 nút | Contract: deposit token khác → revert; UI chặn trước | 2 + 7 | ◐ contract ✅ 20/08 (tests: wrapper thứ 2 → `NotToken`, EOA gọi thẳng callback → `NotToken`; selector bubble qua token — quirk #12). UI Day 7 |

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
2. kill keeper giữa draw → ví khác bấm Continue → draw hoàn tất (R4)

Đây là 30 giây trực tiếp trả lời tiêu chí *"does your app handle errors gracefully?"* —
nói thẳng câu đó trong voiceover.

## Nguồn

- Judging criteria S3 bounty track + thread khiếu nại winner S3 trên
  `community.zama.org` (Aug 2026) — 3 winner thiếu recovery cho `finalizeUnwrap` treo.
- `docs/COMPATIBILITY_NOTES.md` §2 (deny list, maxTotalSupply, refund-khi-ebool-false
  chưa verify live) và §4 quirk #7 (CALL_EXCEPTION khi SDK đọc chain từ ví).
