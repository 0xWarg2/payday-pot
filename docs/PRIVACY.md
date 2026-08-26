# PRIVACY — PayDay Pot

Cái gì bí mật, cái gì không, và **ai** đọc được cái gì. Viết từ code đã ship
(`PayDayPot.sol`, Day 5 — 25/08/2026) và từ probe live cUSDC (Day 6 — 26/08/2026),
không phải từ spec.

> **Một câu framing, dùng nguyên văn trong README/UI/video:** PayDay Pot bảo mật
> **số tiền** — balance, deposit, weight, tiền thắng. Nó **không** ẩn địa chỉ ví
> và **không** ẩn thời điểm giao dịch. Đây không phải sản phẩm "anonymous", và
> không được mô tả như vậy ở bất kỳ đâu.

## 1. Bảng phân loại — mọi state của contract

### Encrypted (euint64/ebool, chỉ tồn tại dạng handle onchain)

| State | Ai decrypt được | Vì sao ở mức đó |
|---|---|---|
| `principalOf(user)` | **chỉ user** (+ contract) | tiền của user; employer/keeper/owner đều DENIED, có negative test |
| `totalPrincipal()` | **không ai** (contract-only) | tổng nợ của pot; lộ nó + participant list nhỏ ⇒ suy ngược được cá nhân |
| `twabAreaOf(user)` | **chỉ user** (+ contract) | weight ∝ tiền × thời gian — lộ weight là lộ tiền |
| `totalWeightOf(epochId)` | **không ai** (contract-only) | mẫu số của xác suất thắng; test đọc qua `fhevm.debugger` [mock-only] |
| `wonOf(user)` | **không ai** — **kể cả chính user** | kênh reveal cho user là `pendingPrize`, không phải cờ này (§15.1) |
| `pendingPrizeOf(user)` | **chỉ user** (+ contract) | grant **đồng loạt cho mọi participant** sau scan — winner thấy số dương, người khác thấy enc(0), không ai phân biệt được từ bên ngoài |
| `drawStateOf(epochId)` — `random`, `ticket`, `cumulative`, `selectedAny` | **không ai** (contract-only) | lộ random/ticket ⇒ suy ra được vị trí winner trong prefix-sum ⇒ lộ weight |
| `prizeCipherOf(epochId)` — pool đã commit (funded + carry) | **không ai** (contract-only) | = payout thật; lộ nó ⇒ lộ carry |
| `prizeCarry()` | **không ai** (contract-only) | giữ đúng bit "epoch trước có winner không" — bit nhạy nhất của protocol |

**Không có `FHE.makePubliclyDecryptable` ở bất kỳ đâu trong contract** (grep = 0,
non-negotiable #6). Toàn bộ ACL của contract là **8 lệnh `FHE.allow(handle,
address)`**, và cả 8 đều grant cho đúng chủ dữ liệu:

| Dòng | Handle | Grant cho |
|---|---|---|
| `:281`, `:305`, `:347` | `principal` sau mỗi mutation | chính user |
| `:353` | `actual` (số thật đã transfer khi withdraw) | chính user |
| `:489` | `twabArea` sau snapshot | chính user — comment tại chỗ: *employer/keeper/owner get no ACL* |
| `:761` | `pendingPrize` sau scan | chính user |
| `:805` | `pendingPrize` sau claim | chính user |
| `:858` | `enc(0)` khi reset epoch | chính user (weight readable từ tick 0 — rule #8) |

Ngoài ra 4 `FHE.allowTransient` — tất cả đều là grant **trong-tx** cho `TOKEN`
để nó thực hiện transfer, hết tx là hết hiệu lực. Không có đường nào khác.

### Public (plaintext onchain, ai đọc cũng được)

| State | Vì sao chấp nhận công khai |
|---|---|
| `isRegistered`, `participantCount()`, `participantAt(i)` | danh sách participant là public — pool nhỏ (cap 32), registration là plaintext-gated (P-4). Đây là metadata, không phải số tiền |
| `lastCheckpointOf(user)` | timestamp, không phải amount |
| `epochInfo(epochId)` → `start`, `end`, `phase` | UI cần để hiện "round 3 · closes in 2d"; không nói gì về tiền |
| `snapshotProgress`, `drawProgress` → cursor/total/drawn | R4: keeper chết thì ví lạ phải resume được — tiến độ phải công khai. `total` là **participant count đóng băng của chính epoch đó** (`frozenCount`), không phải độ dài list hiện tại — epoch cũ đọc lại vẫn ra đúng "2/2 đã quét" sau khi pool đông thêm |
| `prizeAmountOf(epochId)` — **uint64 plaintext** | **có chủ đích (P-4)**: prize là sponsored yield của **employer**, không phải tiền của user. Employer cần thấy để biết fund thêm bao nhiêu (R12). Lưu ý: đây **không** phải payout của epoch — payout = `prizeAmount + carry`, và tổng đó thì encrypted |
| `TOKEN`, `UNDERLYING`, `RATE`, `EMPLOYER`, `EPOCH_DURATION`, `PER_USER_CAP`, `PARTICIPANT_CAP` | tham số protocol, immutable, công khai theo thiết kế |

### Events — 14 event, không event nào mang amount

`EpochStarted` · `SnapshotStarted` · `SnapshotProgress` · `SnapshotCompleted` ·
`Registered` · `Deposited` · `Withdrawn` · `RandomRequested` · `SelectProgress` ·
`DrawCompleted` · `PrizeFunded` · `PrizeDefunded` · `PrizeClaimed` ·
`EpochSettled`.

Mọi event chỉ mang `address indexed user`, `uint256 indexed epochId`, và public
counter (`cursor`, `participantCount`, `start`/`end`). **Không amount —
plaintext lẫn handle.** `PrizeFunded`/`PrizeDefunded` cố tình không mang số dù
`prizeAmount` vốn là public: một luật đồng nhất cho cả contract dễ audit hơn là
xét từng event một (comment tại `:140`). Test soi **từng topic và từng data
word** của các tx snapshot/draw/prize.

### Không bao giờ rời khỏi trình duyệt

Giá trị đã decrypt (principal, weight, prize của chính user) chỉ sống trong
**bộ nhớ tab**: TTL 5 phút, xoá khi tab hidden, reload, đổi account, đổi chain.
Không localStorage, không sessionStorage, không URL/query param, không analytics,
không log. (Non-negotiable #5 — thực thi ở Day 6/7, pin bằng test E2E Day 8.)

## 2. Cái gì công khai mà người dùng dễ tưởng là riêng tư

Bốn thứ này **lộ theo thiết kế**, phải nói thẳng trong onboarding chứ không giấu:

1. **Địa chỉ ví + thời điểm.** Ai deposit, ai withdraw, ai claim, lúc nào —
   công khai hoàn toàn. Chỉ *số tiền* là ẩn.
2. **Wrap amount.** Bước ERC-20 → ERC-7984 là plaintext cuối cùng trước khi vào
   vùng mã hoá. Ai wrap 10,000 USDC rồi deposit ngay sau đó thì observer đoán
   được deposit ~10,000. Đây là giới hạn của tầng token, không phải của pot —
   mitigation duy nhất là wrap trước, deposit sau, số lẻ.

3. **Unwrap amount — công khai TUYỆT ĐỐI, không chỉ suy đoán.** Đây là chỗ dễ
   hiểu nhầm nhất trong toàn bộ file này, nên nói thẳng: `_unwrap` của wrapper
   gọi `FHE.makePubliclyDecryptable` trên số sắp rút, và `unwrapRequestId`
   *chính là* ciphertext handle của số đó. Ai cũng decrypt được. Cộng thêm
   `unwrapAmount(bytes32)` là một view mở, nên không cần index event cũng đọc ra.

   Nghĩa là: **rút tiền khỏi vùng mã hoá thì số tiền rút ra là public.** Pot
   không vi phạm non-negotiable #6 — luật đó nói về state của *pot*, và grep
   `makePubliclyDecryptable` trong `PayDayPot.sol` vẫn = 0 — nhưng người dùng
   không quan tâm ranh giới contract nào, họ quan tâm số của họ. UI phải cảnh
   báo **trước khi ký unwrap**, không phải sau.

   Hệ quả nặng nhất là với winner: unwrap tiền thắng ngay sau khi claim thì cặp
   (địa chỉ, số tiền) hiện ra công khai và ghép được với epoch vừa rồi. Đây
   không còn là "residual correlation" mềm như §4 mô tả — nó là một con số đọc
   thẳng được. Mitigation thật sự chỉ có: giữ tiền ở dạng confidential, hoặc
   unwrap trễ và tách nhỏ.
4. **`prizeAmountOf` của epoch đang mở.** Employer fund 1,000 thì cả thế giới
   thấy 1,000. Cố ý — đó là tiền của employer, và R12 cần nó.

## 3. Ba lập luận cấu trúc giữ cho privacy không rò

**(a) Không có nhánh nào rẽ theo dữ liệu mã hoá.** Không `if (ebool)`, không
index mảng bằng handle. Winner được chọn bằng `FHE.select` với **đúng 7 op đồng
nhất cho mọi participant** — người thắng và người thua tiêu thụ y hệt nhau, nên
gas/HCU của `selectBatch` không nói gì về kết quả.

**(b) `claim()` chỉ có một code path.** Winner và non-winner gọi cùng hàm, cùng
event, và **cùng số đo tuyệt đối**: 748,032 HCU / 369,000 depth / 396,250 gas
(đo độc lập ở hai file test). Nếu claim revert cho non-winner — cách viết tự
nhiên nhất — thì revert-hay-không sẽ là oracle công khai chỉ ra ai thắng. Đó là
lý do non-winner claim **thành công** và chuyển enc(0).

**(c) `pendingPrize` được grant cho tất cả, không chỉ winner.** Nếu chỉ winner
được ACL thì bản thân danh sách grant là lời tố giác. Sau scan, mọi participant
đều decrypt được `pendingPrizeOf` của mình; đa số ra 0.

## 4. Cái còn rò — không giấu

Chi tiết và mitigation ở `THREAT_MODEL.md`; tóm tắt:

- **Claim timing.** Chỉ winner mới có động cơ claim. Uniform-claim làm cho một
  cú claim *không chứng minh* được gì, nhưng ai không bao giờ claim thì gần như
  chắc chắn không thắng. Đây là leak hành vi, không phải leak mật mã.
- **Unshield correlation.** Winner unwrap tiền thắng ra USDC công khai thì số đó
  hiện ra ở tầng token — và hiện ra *chính xác*, không phải suy đoán (§2 mục 3).
- **Wrapper là contract của bên khác, và bên đó upgrade được.** cUSDC là proxy
  UUPS do Zama sở hữu; nó **đã bị upgrade giữa Day 1 và Day 6**. Owner có
  `blockUser`/`unblockUser`. Pot không bị ảnh hưởng về privacy, nhưng mọi khẳng
  định "wrapper hành xử như thế này" đều có hạn sử dụng
  (COMPATIBILITY_NOTES quirk #20).
- **Pool nhỏ.** Cap 32. Nếu chỉ có 2 participant thì "một trong hai" đã là thông
  tin đáng kể. Privacy tỉ lệ thuận với anonymity set.
- **RNG.** `FHE.randEuint64()` hiện là PRNG coprocessor, chưa phải threshold-VRF
  (KNOWN_LIMITATIONS §4).

## 5. Nguồn

`contracts/PayDayPot.sol` (đường dẫn dòng ở §1) · `DRAW_PROTOCOL.md` §5, §6 ·
`KNOWN_LIMITATIONS.md` · `PAYDAY_POT_IMPLEMENTATION_PLAN.md` §15.1 ·
`THREAT_MODEL.md`.
