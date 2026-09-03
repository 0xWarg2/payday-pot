# ARCHITECTURE — PayDay Pot

Cấu trúc hệ thống và **vì sao mỗi ranh giới nằm ở đó**. Bốn package, một
contract, một manifest — và một quy tắc chi phối gần hết mọi quyết định bên
dưới: giá trị đã decrypt không được rời khỏi RAM của browser.

Chi tiết toán/protocol ở [`DRAW_PROTOCOL.md`](DRAW_PROTOCOL.md), phân loại state
ở [`PRIVACY.md`](PRIVACY.md), mô hình đối thủ ở
[`THREAT_MODEL.md`](THREAT_MODEL.md). File này nói về **hình dạng code**.

---

## 1. Bản đồ

```
                 ┌──────────────────────────────────────────┐
   browser       │  apps/web — Next.js App Router, TS strict│
                 │  ┌────────────┐  ┌──────────────────────┐│
                 │  │ components │  │ lib/                 ││
                 │  │  (RSC +    │◀─┤  reveal/  TTL 5 phút ││
                 │  │   client)  │  │  fhevm/   relayer SDK││
                 │  └────────────┘  │  tx/      store+send ││
                 │                  │  wallet/  gate       ││
                 │                  └──────────┬───────────┘│
                 └─────────────────────────────┼────────────┘
                                               │
                 ┌─────────────────────────────▼────────────┐
                 │  packages/sdk — actions / queries / lỗi  │
                 │  preflight* · send* · read* · classifyError│
                 └─────────────────────────────┬────────────┘
                                               │
        ┌──────────────────────────────────────┼──────────────────────┐
        │                                      │                      │
┌───────▼────────┐                   ┌─────────▼─────────┐   ┌────────▼────────┐
│ packages/shared│                   │  Sepolia RPC      │   │ Zama relayer    │
│ manifest + ABI │                   │  eth_call/send    │   │ encrypt/decrypt │
│ (generated)    │                   └─────────┬─────────┘   └─────────────────┘
└────────────────┘                             │
                                     ┌─────────▼─────────┐
                                     │  PayDayPot.sol    │
                                     │  + cUSDC (ERC-7984│
                                     │    wrapper, Zama) │
                                     └───────────────────┘
```

Không có backend. Không có database. Không có API route nào của riêng mình. Đó
không phải sự tối giản để cho đẹp — nó là **hệ quả trực tiếp** của
non-negotiable #5: không plaintext amount trong log, URL, analytics hay
persistence. Một server nào của mình mà chạm vào giá trị đã decrypt thì rule đó
thành lời hứa thay vì thành tính chất của kiến trúc. Cách chắc chắn nhất để
không log số của người dùng là không có chỗ nào để log.

---

## 2. `packages/contracts` — nơi duy nhất có sự thật

`PayDayPot.sol` — non-upgradeable, không proxy, không admin sweep. Một file, vì
tách nó ra thành thư viện sẽ làm mất thứ quan trọng nhất khi đọc contract FHE:
thấy được **mọi** `FHE.allow` trong cùng một lần đọc. Toàn bộ ACL của contract
là 8 dòng `FHE.allow` và 4 dòng `FHE.allowTransient`; đếm được bằng grep là một
tính chất của thiết kế, không phải sự tình cờ.

Ranh giới với token là chỗ dễ hiểu sai nhất. Pot **không** gọi
`transferFrom` trên cUSDC. User gọi `confidentialTransferAndCall` trên **token**,
token gọi lại `onConfidentialTransferReceived` trên **pot**:

```
user ──confidentialTransferAndCall(pot, handle, proof)──▶ cUSDC
                                                            │
        onConfidentialTransferReceived(from, actualAmount) ◀─┘
```

Hai hệ quả không thể thương lượng:

- **Proof bind vào token, không phải pot.** `createEncryptedInput(TOKEN, user)`.
  Bind vào pot thì relayer vẫn sinh proof và chain từ chối.
- **Accounting dùng `actual`, không dùng requested.** ERC-7984 **clamp** về
  encrypted zero khi thiếu tiền chứ không revert. Cộng số requested vào
  principal là tự tạo ra tiền chưa từng tồn tại. Callback nhận đúng số đã
  chuyển, và đó là số duy nhất được dùng.

Ops scripts nằm cạnh contract vì chúng đọc `deployments/sepolia.json`, không phải
vì tiện: `pot-state.ts` (đọc), `fund-prize.ts` (employer), `seed-deposit.ts`
(user), `keeper.ts` (vòng draw), `validate-registry.ts` (xác nhận địa chỉ
official lúc runtime thay vì tin số cứng).

## 3. `packages/shared` — manifest là hợp đồng giữa hai bên

`deployments/sepolia.json` là single source of truth do người viết. Script
`sync-manifest.mjs` sinh ra `packages/shared/src/deployments/sepolia.ts` từ nó.
Web app **import module đã generate** — nó không có `fs`, và cũng không được
phép hardcode địa chỉ.

Ba gate nằm trên đường này:

| Gate | Bắt được gì |
|---|---|
| `manifest:check` — drift | JSON sửa tay mà quên sync |
| `manifest:check` — `rc` phải `verified: true` | promote một bản chưa verify source |
| assert ABI hash lúc boot web | frontend build từ ABI cũ, gửi call sai shape |

Cái thứ ba là cái đáng giá nhất. Không có nó, một contract deploy lại với ABI
khác sẽ làm frontend fail theo cách khó đọc nhất: `eth_call` trả về `0x` và UI
hiện "not available yet" — đúng cái message dùng cho *giá trị bị ẩn*. Fail to
tiếng lúc boot đổi một bug hai giờ thành một dòng lỗi.

## 4. `packages/sdk` — biên giới giữa "gọi chain" và "vẽ màn hình"

Ba nhóm, không nhóm nào biết React:

- **`pot.ts` — queries.** `readPotState`, `readAccount`, `readEpoch`. Trả về
  `HIDDEN_HANDLE` cho handle chưa init, và `isUninitialized()` là hàm phân biệt
  "chưa có gì" với "có nhưng bạn không đọc được". UI **bắt buộc** đi qua nó:
  hiện `0` cho một giá trị chỉ đang ẩn là non-negotiable #8.
- **`actions.ts` — writes + preflight.** `preflightDeposit` /
  `preflightFundPrize` chạy **trước** khi tiêu gas, ở plaintext, kiểm mọi lý do
  một tx có thể "thành công" mà không làm gì: cap, phase, epoch đã hết giờ,
  paused, deny-list. Với một token clamp-thay-vì-revert, preflight không phải
  tối ưu UX — nó là cách duy nhất biết được.
- **`errors.ts` — taxonomy.** 15 dòng `R1`–`R15` khớp
  [`ERROR_RECOVERY_MATRIX.md`](ERROR_RECOVERY_MATRIX.md). `classifyError` map
  revert data → `PotError` mang sẵn `row` và một `RecoveryAction` mà UI render
  thành **nút bấm**: `retry`, `switch-network`, `approve`, `continue-draw`,
  `resume-unwrap`, `edit-amount`, `wait-for-epoch`, `reveal-again`, `docs`.

Chỗ này là lý do có cả một package thay vì để logic trong component: một
`RecoveryAction` là dữ liệu, nên test được nó độc lập với DOM, và không có màn
hình nào "quên" mất đường thoát.

## 5. `apps/web` — nơi giá trị thật xuất hiện, và chỉ ở đó

```
app/                    routes
  page.tsx              landing
  onboarding/           mint → wrap → deposit, có cảnh báo wrap là public
  (shell)/app/          dashboard · savings · draws/current · draws/[id]
  (shell)/employer/     fund/defund prize
  docs/known-limitations/  đường đến từ mọi ErrorPanel
  tokens/               faucet mock
lib/
  chain/    provider, contract handles, addresses từ manifest
  fhevm/    khởi tạo relayer SDK (WASM threads → cần COOP/COEP)
  reveal/   EIP-712 → userDecrypt → giữ trong RAM, TTL 5 phút
  tx/       store trạng thái tx + sender, action là union đóng
  wallet/   connect, chain guard, useWriteGate
  pot/ draw/ savings/ employer/  view-model theo từng màn hình
```

### `lib/reveal` — vòng đời của một con số

```
user bấm Reveal
   └─▶ generateKeypair + createEIP712  → ví ký
        └─▶ userDecrypt(handles)       → relayer
             └─▶ giá trị trong React state
                  ├─ TTL 5 phút
                  └─ clear khi: tab hide · reload · đổi account · đổi chain
```

Không `localStorage`, không `sessionStorage`, không query param, không analytics
event, không `console.log`. Bốn trigger clear ở trên không phải để cho chắc —
mỗi cái ứng với một cách thật mà một con số sẽ sống lâu hơn quyền được xem nó:
máy để mở, tab bị quên, ví đổi sang người khác, mạng đổi sang chain khác.

`userDecrypt` **chỉ chạy được trong browser**: `node-tkms@0.12.8` fail ở Gao
decoding khi chạy trong Node (quirk #47). Nghĩa là mọi kiểm chứng reveal đi qua
Playwright, không qua script — và cũng nghĩa là không tồn tại đường nào để một
job server-side decrypt hộ user, kể cả nếu ai đó muốn.

### `lib/tx` — trạng thái tx sống ở đâu

`TxAction` là một union **đóng** và mọi nhánh UI phải map được từ nó. Đó không
phải sự cầu toàn kiểu type: một `kind` mà không code nào ghi vào là một nhánh UI
không bao giờ chạy — R1 đã hỏng đúng theo cách đó (banner lọc tx kind `"unwrap"`
trong khi không chỗ nào ghi kind đó), và cách sửa là bỏ hẳn `kind` rồi phát hiện
từ **log trên chain**. Union đóng là cái làm nhánh chết trở nên hiển thị.

### `lib/wallet/useWriteGate` — một chỗ duy nhất trả lời "bấm được chưa"

Trả về `{ ready, reason }`. Mọi nút ghi dùng nó, và khi không ready thì `reason`
đi vào `title` của nút. Một nút disabled không nói vì sao là một nút hỏng —
người dùng không phân biệt được "sai mạng" với "app chết".

---

## 6. Ba ranh giới không được vượt

1. **Giá trị đã decrypt không rời browser memory.** Không server, không
   persistence, không log. Được đảm bảo bằng việc *không có nơi nào để đi*
   (không backend), chứ không bằng review.
2. **Không ai có ACL trên dữ liệu của user ngoài chính user.** Contract grant
   đúng cho owner của handle; employer/keeper/owner đều bị deny, có negative
   test (`PayDayPot.ts:356`, `PayDayPot.draw.ts:535`).
3. **Không có bước nào của vòng draw cần quyền.** Cả năm hàm `external` trần,
   có nút trong UI và có script. Keeper là tiện nghi, không phải hạ tầng.

## 7. Test nằm ở đâu và bắt gì

| Tầng | Chạy bằng | Bắt gì mà tầng khác không bắt được |
|---|---|---|
| contract, 150 test | `npx hardhat test` (FHE mock, không network) | toán TWAB/ticket, conservation, boundary của cap, HCU, ACL âm |
| web unit, 279 test | `vitest` + RTL | view-model, không-bao-giờ-hiện-0, taxonomy → nút bấm |
| e2e | Playwright | reveal thật qua relayer, recovery flow, privacy giữa hai ví |
| demo reel | `playwright.demo.config.ts` + `build-mp4.mjs` | hồi quy của chính bài diễn — build-in-public không dựng lại tay mỗi ngày |

FHE mock của Hardhat là thứ làm 150 test kia khả thi: `fhevm.debugger` đọc được
handle mà không cần ACL, nên assert được cả những giá trị mà **trên mainnet
không ai đọc được** — `totalWeight`, `random`, `prizeCarry`. Đó là các assert
[mock-only] và chúng được đánh dấu như vậy, vì chúng chứng minh toán đúng, không
chứng minh privacy.
