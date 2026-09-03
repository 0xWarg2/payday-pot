# Day 9 Handoff — 03/09/2026 (label plan: 27/08, trễ 7 ngày — còn ~34 giờ trước freeze 04/09 18:00 ICT)

**RC sống trên Sepolia, source verified hai chỗ, public URL trả về app thật —
và thứ đáng nhớ nhất của ngày lại là một cái retry chưa bao giờ có tác dụng.**

Reveal hỏng ở KMS. `decryptWithRetry` hỏi lại đúng 3 lần, cả 3 chết ở cùng một
chỗ tới từng con số (`n=13, deg=4, #shares=9`). Trace nói vì sao: ba POST cùng
body nhận về **cùng một `requestId`** → cùng một câu trả lời hỏng. Retry ở đây
không phải thiếu kiên nhẫn, nó là hỏi lại một câu đã có đáp án sai được cache.

Cái đổi được kết quả là **tập handle**, và đổi tập handle thì miễn phí vì tập
handle không nằm trong payload EIP-712. Đó là toàn bộ bản sửa.

## Trạng thái gate (exit gate RC, EXECUTION_PLAN Day 9)

| Gate | Trạng thái |
|---|---|
| Full cycle từ public URL | ◐ URL sống và đúng app (`check-deploy.sh` 5 route: 200 + `<title>` của mình + COOP/COEP). Vòng tiền **bằng tay** từ public URL vẫn là việc của người — xem §CẦN ANH LÀM |
| Source verified khớp manifest | ✅ Blockscout `#code` + Sourcify `creationMatch=match` `runtimeMatch=match`; `manifest:check` từ chối `rc` chưa verified và từ chối drift |
| 2 user chỉ reveal được của mình | ✅ contract: `PayDayPot.ts:351` (user khác) · `:356` + `twab.ts:478` + `prize.ts:866` (employer/owner, non-negotiable #3). Web: `privacy.spec.ts` 11 test |
| Conservation tests xanh | ✅ 150 contract pass — solvency property + carry roll + withdrawAll mọi phase |
| **Ví khác tiếp tục được draw** | ✅ **đo trên chain hôm nay** — epoch #2 cắt ngang giữa lượt scan (cursor 1/2) rồi ví thứ hai chạy tiếp tới Settled. RUNBOOK §8 |
| Site sống signed-out / mobile | ✅ 5 route public không ví · project `mobile-320` 320px không tràn ngang · `ssoProtection` đã tắt (kiểm bằng curl không cookie) |
| Không secret trong repo | ✅ không key/mnemonic trong file tracked · **0** biến `NEXT_PUBLIC_*` trong `apps/web` · `.env` chưa từng vào history |

**6/7 đạt.** Dòng còn lại không thiếu code.

## Demo

Vòng draw thật, không phải reel: RUNBOOK §8 có **hai** bảng tx.

```bash
cd packages/contracts
KEEPER_BATCH=1 KEEPER_ONCE=1 npx hardhat run scripts/keeper.ts --network sepolia
KEEPER_ACCOUNT_INDEX=2      npx hardhat run scripts/keeper.ts --network sepolia
```

Lệnh thứ nhất dừng cursor ở **1/2** — đứt giữa lượt quét, không phải ở ranh giới
đẹp giữa hai bước. Lệnh thứ hai là ví khác, không keeper, không owner, không
được cấp quyền gì, chỉ có ETH trả gas. Nó đọc cursor từ chain, thấy 1/2, đi
tiếp: `snapshotBatch` → `requestRandom` → `selectBatch` → **Settled**. Không
bước nào chạy lại, không participant nào bị quét hai lần, seed rút đúng một lần.

Đó là câu "permissionless" ở dạng đo được, thay vì ở dạng lời hứa trong README.

## Files chính hôm nay

| | |
|---|---|
| Reveal | `apps/web/lib/reveal/retry.ts` (**mới** — `decryptTargets`, tách tập handle khi hỏng) · `lib/reveal/reveal.ts` (báo phần còn đóng) |
| Test | `test/reveal-retry.test.ts` (**mới**, 6) · `e2e/privacy.spec.ts` (đua `revealed` với panel) · `test/privacy.test.tsx` |
| Chẩn đoán | `packages/contracts/scripts/kms-probe.ts` (**mới** — `userDecrypt` trong Node, ngoài mọi hạ tầng web) |
| Test hook | `components/ui/ErrorPanel.tsx` → `data-code` / `data-row` |
| Docs | `COMPATIBILITY_NOTES` #60 (+ sửa #47) · `KNOWN_LIMITATIONS` §12 · `ERROR_RECOVERY_MATRIX` R7 · `RUNBOOK` §8 (epoch #2) + §10 (viết lại) · `/docs/known-limitations` mục cho người dùng |

## Quyết định đã chốt hôm nay

1. **Mở được một phần vẫn tốt hơn một bức tường.** Batch hỏng thì tách từng
   handle. Handle nào không mở được thì **ở lại ẩn** — chỉ key có trong `values`
   được `commitReveals` ghi — nên không có đường nào biến nó thành `0`
   (non-negotiable #8). Card nói tên giá trị còn đóng, bằng chữ của taxonomy R7
   chứ không phải một câu viết tay thứ hai.
2. **Không sửa bằng cách nới thời gian chờ.** Chờ lâu hơn một request đã cache
   sai thì chỉ hỏng chậm hơn.
3. **Test phải phân biệt được "hạ tầng từ chối" với "app hỏng".** Trước đây hai
   thứ đó đỏ y hệt nhau sau 120s. Giờ panel có `data-code`, `decryption-incomplete`
   → skip có lý do đọc được, mọi code khác → đỏ kèm code thật.
4. **`data-code`/`data-row` là định danh taxonomy, không phải dữ liệu.** Không
   số tiền, không địa chỉ — non-negotiable #5 không bị đụng để lấy tiện cho test.
5. **Kết luận cũ sai thì sửa ở repo, không chỉ sửa trong đầu.** Quirk #47 nói
   "`userDecrypt` không chạy được ngoài browser" — sai; probe Node chạy được.
   #47 đánh dấu sai và trỏ sang #60, RUNBOOK §10 viết lại.

## Bug thật Day 9 tìm ra

1. **`decryptWithRetry` chưa bao giờ có tác dụng** — cùng body → cùng
   `requestId` → cùng câu trả lời hỏng. Nó *trông* như phòng thủ, và đó là kiểu
   code nguy hiểm nhất: chiếm chỗ của một bản sửa thật.
2. **`classifyError` không đọc `cause`.** Lỗi WASM nằm ở `e.cause`, `e.message`
   thì rỗng nghĩa → rơi vào `unknown` → `row: null` → "Something went wrong" cho
   đúng hành động headline của sản phẩm. `console.error` cũng không theo `cause`
   nên log không nói gì.
3. **Một deployment fail trên Vercel vẫn trả HTTP 200.** Nó serve trang
   "Deployment has failed" của chính nó ở mọi path. Suýt ghi "public URL sống"
   vào scorecard bằng một lần `curl -w %{http_code}`. `check-deploy.sh` kiểm ba
   điều kiện, trong đó COOP/COEP bắt được cả hai lỗi cùng lúc.
4. **`VULNERABLE_NEXTJS_VERSION`** — Vercel từ chối serve Next có CVE, trong khi
   build log vẫn kết thúc bằng "Build Completed".
5. **Cold install fail trên Vercel** (`ERR_PNPM_IGNORED_BUILDS`) — pnpm 11 xoá
   `onlyBuiltDependencies`. Không lộ ra local suốt 8 ngày vì `pnpm install` gặp
   `node_modules` dựng sẵn thì in "Already up to date" và không đánh giá build
   script lần nào.
6. **`pnpm run build` ở Root Directory `apps/web`** không dựng `@payday-pot/sdk`.
   Local không thấy vì `dist/` đã nằm sẵn trên máy từ lần build đầu.

## Ma trận lỗi

**14/15 đóng.** R7 hôm nay được viết lại bằng bằng chứng thật thay vì mô tả:
nói rõ relayer trả `succeeded` rồi WASM chết ở bước dựng lại, và copy tránh
nhánh "service is slow" của timeout — vì nó không chậm, nó trả lời sai.

**Còn R1** — vẫn chỉ thiếu nút *Resume finalize*, vẫn chặn bởi một unwrap treo
thật trên ví có tiền. Không đổi so với Day 8.

## Đang dở / chờ

- **Merge `dev` → `main`.** `main` đang ở Day 6; dev có cả Day 7, 8, 9. Production
  alias hiện là một deployment **ERROR** từ merge Day 6 — nghĩa là link
  production chưa dùng được cho tới khi merge. Branch alias `…-git-dev-…` thì
  đã xanh và đã kiểm.
- Điền link **Live app** ở README dòng 15 (đang là placeholder).
- Tag `rc-1`, rồi `v1.0.0-season4`.
- Reel demo Day 9 chưa quay (Day 8 reel vẫn dùng được: 4m08s).

## CẦN ANH LÀM

Bốn việc, không việc nào em làm thay được:

1. **Video ≤3 phút, người thật, không giọng AI.** X hoặc YouTube hoặc Loom —
   X ưu tiên vì form hỏi link công khai.
2. **Nộp form** `forms.zama.org/developer-program-mainnet-season4-bounty-track`
   — **một lần, không sửa lại được**, và nó gắn với email của anh. Description
   giới hạn **140 ký tự** (`node docs/social/count-description.mjs` để đếm).
3. **Post X thread** — em soạn, anh đăng. Tag `@zama` `#ZamaDeveloperProgram`.
4. **Vòng tiền bằng tay từ public URL**: deposit → reveal → `Withdraw everything`,
   và `claim` (ví `0xd83064F0…829a` đang có **50 USDC** pendingPrize chưa nhận,
   từ epoch #1). Lặp lại một lần từ cửa sổ ẩn danh.

## Việc đầu tiên Day 10 — RÀNG BUỘC TỪ DAY 9

1. **Merge trước, polish sau.** Chừng nào production alias còn là deployment
   ERROR thì mọi thứ khác là trang trí.
2. **Đừng sửa reveal bằng cách chờ lâu hơn.** Nếu R7 quay lại, đọc `data-code`
   và `kms-probe.ts` trước — câu hỏi luôn là "lỗi của mình hay của hạ tầng", và
   giờ đã có công cụ trả lời trong 30 giây.
3. **Số trong video phải là số đo được.** Gas epoch #2 khác epoch #1 ở cùng một
   bước; lấy số nào thì nói rõ epoch nào.
4. **Không tick R1 bằng "đã hiểu cơ chế".** Ràng buộc này từ Day 8, vẫn còn.
5. **Không hứa "anonymous".** Address và timing vẫn public — README đã nói đúng,
   video và thread phải nói đúng như README.

## Số liệu

| | |
|---|---|
| Contract tests | **150** xanh — 20s |
| Web unit (vitest) | **288** xanh / 15 file — 8.8s |
| Playwright e2e | **79** xanh / 1 skipped — 2.4 phút (có ví seeded). Trước bản sửa reveal: 3 đỏ |
| `tsc --noEmit` | sạch |
| Ma trận lỗi | **14/15** đóng |
| Contract | `0x792c77D9A2052ED03aaB6B392364c3e17f52a035` · deployBlock 11620820 · epoch **3600s** · perUserCap 10000000000 · participantCap 32 · verified |
| ABI hash | `1043e9dc…2732b` (freeze từ Day 5) |
| Vòng draw live | epoch #1 Settled (4 tx, 1 ví) · epoch #2 Settled (5 tx, **2 ví**, cắt giữa scan) |
| Prize | 50.0 USDC, employer-funded — 50 USDC pendingPrize của epoch #1 chưa claim |
| Public URL | `payday-pot-git-dev-…vercel.app` xanh 5/5 route · production alias **ERROR** cho tới khi merge |
| Git | `dev` — **chưa merge `main`**, và `main` còn đang ở Day 6 |
