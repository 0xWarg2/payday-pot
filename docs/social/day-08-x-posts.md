# day 8 — x posts (draw room, và một trang không nhớ gì)

Fact base (verify 29/08, chạy lại chứ không lấy từ handoff):

> **Nếu post từ 30/08 trở đi, con số là 487 chứ không phải 481** — 150 contract
> + **265** web unit + **72** browser. Chênh 6 test đến từ việc nối card "vòng
> này" ở `/app` sang Draw Room (4 unit + 2 browser). Bài dưới để nguyên theo
> fact base 29/08; đổi số thì đổi cả 4 chỗ: A, B, C-4, D.

- `481 tests green` = **150** contract (24s) + **261** web unit (11 files, 2.9s)
  + **70** browser xanh / 6 skipped (76 test listed, 6 files)
- exit gate "kill keeper giữa chừng" = `e2e/draw.spec.ts` — đọc phòng → `localStorage.clear()`
  + `sessionStorage.clear()` → reload → fingerprint `{stage id, status, progress text,
  keeper state}` **`toBe()` giống hệt**
- storage không chứa các từ `cursor · epoch · snapshot · winner · prize · twab · principal`,
  không chứa `0x`+64 hex, `sessionStorage` rỗng
- winner ≡ loser: **hai DOM bằng nhau từng ký tự** (`test/draw-room.test.tsx`);
  bản browser 2 profile `test.skip()` **có lý do** khi chưa có 2 vị thế đã settle
- Fairness Receipt: chỉ event vòng đời vòng đấu; **cố tình loại** `Registered`,
  `Deposited`, `Withdrawn`, `PrizeClaimed` dù chúng public — và có hẳn một khối
  "What this receipt deliberately does not contain"
- ma trận lỗi **14/15** đóng đủ 3 điều kiện (UI + action + test). Còn R1
- R1 probe live cUSDC read-only: `finalizeUnwrap(bytes32,uint64,bytes)` là chữ ký
  DUY NHẤT; requestId lạ revert `0xd1630f8e` = `InvalidUnwrapRequest` → taxonomy đọc
  thành "xong rồi", không phải "thất bại". Ẩn số còn lại: nội dung `signatures` →
  **chưa ship nút Resume finalize**
- demo: `pnpm demo:day8` — 14 beat / 5 clip / **4m07s**
- vẫn ⛔: deposit thật + fund prize thật qua UI (ví employer 0 ETH). `dev` chưa merge `main`.

---

## A — post chính (daily long post)

day 8 of payday pot: the draw room.

the round itself is public — when it opened, when it closes, who is allowed to run it (anyone), and what the sponsor put in. what stays private is anyone's position inside it.

the gate question for today was "what if the keeper dies halfway through the draw?" so i answered it with a test instead of a sentence: read the room, wipe every key the browser stored, reload, compare the screen character for character. identical. the page remembers nothing about the round — the progress lives on chain, which is also why a stranger can pick up someone else's half-finished draw and end it.

- before anyone signs, the winner's screen and the loser's screen are the same thing, character for character
- claiming stays locked until you open your own result, and a read that fails says it failed — never 0
- the fairness receipt has a section listing what it will not tell you: no winner, no amounts except the sponsor's prize because that money is theirs, and no roster — deposits and claims are both on chain, but this page refuses to line them up next to each other. that pairing is the exact guess the whole product exists to block.

481 tests green: 150 contract, 261 web app, 70 in a real browser.

14 of my 15 error rows are now closed with a screen, an action and a test. the 15th needs a real half-finished withdrawal on a funded wallet before i can verify one argument — so i shipped no button for it. a button that walks into a dead end is worse than the banner already sitting there.

day 9: sepolia release candidate. no new features, and the two things still waiting on a funded wallet.

@zama #ZamaDeveloperProgram

---

## B — short variant (280 ký tự kể cả tag — đếm bằng script)

day 8 of payday pot — the draw room. what if the keeper dies mid-draw? i answered with a test: wipe every stored key, reload, the numbers come back the same. the page remembers nothing, the progress lives on chain. 481 tests green.

day 9: sepolia rc.

@zama #ZamaDeveloperProgram

---

## C — thread 4

**1/**
day 8 of payday pot: the draw room is up.

the round is public — when it opened, when it closes, who may run it (anyone), what the sponsor funded. your position in it is not.

@zama #ZamaDeveloperProgram

**2/**
"what if the keeper dies halfway through the draw?"

i stopped answering that in prose. the test now reads the room, wipes every key the browser stored, reloads, and compares the screen character for character. identical.

the page remembers nothing. the progress lives on chain — which is why a stranger can finish your draw for you.

**3/**
before anyone signs, the winner's screen and the loser's screen are the same thing, character for character.

and the fairness receipt has a section for what it won't tell you: no winner, no amounts except the sponsor's prize, no roster. deposits and claims are both public, but i will not put those two lists side by side.

**4/**
481 tests green: 150 contract, 261 web app, 70 in a real browser.

14 of my 15 error rows closed with a screen, an action and a test. the 15th needs a real half-finished withdrawal on a funded wallet to verify, so it has no button yet — a dead-end button is worse than the banner already there.

day 9: sepolia rc.

#ZamaDeveloperProgram

---

## D — "what the 481 tests actually check"

481 on day 8 of payday pot, and here is what they are actually checking.

**150 — the contract** (untouched since day 5)
- you can take everything out in every phase, including while paused
- deposits count what actually arrived, not what you asked for
- your employer, the keeper and the admin can read none of your numbers — proven by tests that expect a failure
- one winner per round, one random draw, no re-roll, and anyone can push the draw forward
- two people, same money, one stays twice as long → the weight comes out 2:1, to the unit

**261 — the web app** (11 files)
- the draw timeline is redrawn from the on-chain cursor, never from a step counter this tab kept
- pause blocks exactly one step of the draw and says so, instead of drawing a button that would fail
- winner and loser produce two DOMs equal character for character
- a value that could not be read says it could not be read — it never falls back to 0
- joining after the round froze means "not in this round", which is not the same as losing
- the money screen can only reach "sign" from "review", and confirming wipes the amount you typed

**70 — a real browser**, desktop and a 320px phone (6 skipped, each with a written reason)
- wipe storage, reload, and the draw's progress comes back identical
- nothing about the round is written to storage at all, and sessionStorage is empty everywhere
- claiming stays shut until you have opened your own result
- the way out of the pool is reachable from inside the draw room
- wrong network, wallet cancel, relayer dead mid-encrypt, tab closed mid-transaction
- "two signatures" is shown up front: type 5, and only step 1 of 2 appears — the input is not wiped

day 9: sepolia rc.

@zama #ZamaDeveloperProgram

---

## E — dev gotcha (bug của chính bộ test)

day 8 of payday pot. two of today's bugs were in my tests, not in the product, and both had been green for days.

- a constant in one test file said "wait up to 60 seconds". the runner's own default is 30, and it silently wins. so the 60 was decoration. it never showed because the page was always pre-compiled from an earlier run — delete the build cache, run cold, and the very first test dies looking exactly like a product bug.
- the encryption service went down mid-suite, and an unrelated test went red for it. the app had actually done the right thing (input untouched, nothing sent). i skipped that one test with a written reason instead of loosening the assertion. a fake green is worse than a red.

and one that cost me a video: the build script had a default filename, so running it without an argument after recording day 8 overwrote the day 7 reel. the output folder is wiped at the start of every run, so nothing was left to recover.

day 9: sepolia rc.

@zama #ZamaDeveloperProgram

---

## F — spares

**F1 (short, honesty)**
day 8 of payday pot. 14 of my 15 error rows are closed with a screen, an action and a test. the 15th is not missing code — it needs a real half-finished withdrawal on a funded wallet before i can verify one argument, so i shipped no button. ticking it off as "i understand the mechanism" is the exact thing that list exists to stop.

@zama #ZamaDeveloperProgram

**F2 (short, the receipt)**
the fairness receipt in payday pot has a section titled "what this receipt deliberately does not contain".

no winner. no amounts, except the sponsor's prize, because that money is theirs. no roster — deposits and claims are both on chain and anyone can query them, but the page will not assemble them next to each other. that pairing is the guess the product exists to block.

@zama #ZamaDeveloperProgram

**F3 (short, the fingerprint)**
"what if the keeper dies halfway through the draw?"

wipe every key the browser stored, reload, and the numbers come back identical, character for character. the page never knew them — the progress lives on chain. which is also why a stranger can finish your draw for you.

day 8 of payday pot.

@zama #ZamaDeveloperProgram

---

## Video

`pnpm demo:day8` → 14 beat / 5 clip / **4m07s**, phụ đề tiếng Anh burn trong pixel.
Reel nộp giữ ở `apps/web/demo-reels/payday-pot-day8.mp4` (3.2 MB) — **không** để ở
`demo-results/` vì thư mục đó bị xoá sạch đầu mỗi lần chạy.

Beat không được cắt:

1. Beat 1–3: phòng đọc được khi **chưa nối ví**; "ai được chạy vòng quay? bất kỳ ai";
   prize nói thẳng là **sponsored**, không phải lợi nhuận pool tự làm ra.
2. **Beat 4–6 là beat của exit gate**: in fingerprint → xoá `localStorage` +
   `sessionStorage` → reload → in lại → giống hệt → "cũng vì vậy người lạ mới
   finish hộ được".
3. Beat 7–9: kết quả niêm phong, winner ≡ loser; không đọc được thì **không được
   vẽ số 0**; claim vẫn khoá tới khi tự mở số của mình.
4. Beat 10: Fairness Receipt là **tab trong cùng phòng**, có khối "những gì biên lai
   này cố tình không chứa".
5. Beat 11–13 (R1): unwrap dở dang → 3 đường ra thật, và "người khác finalize xong"
   phải đọc thành **thành công**.
6. Beat 14: đường ra tiền nằm ngay trong phòng tối.

⚠️ `node demo/build-mp4.mjs day8` — **luôn truyền tham số ngày**, chạy trống sẽ đè
reel Day 7.

---

## Tag

Dòng cuối, đoạn riêng: `@zama #ZamaDeveloperProgram` (thêm `#FHE` nếu muốn).

---

## Ảnh minh hoạ

`docs/social/images/day-08.svg` → `day-08.png` (3200×1800).

```bash
cd docs/social/images && { echo '<html><body style="margin:0;background:#F7F3E7">'; cat day-08.svg; echo '</body></html>'; } > _w.html && "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 --window-size=1600,900 --screenshot=day-08.png "file://$PWD/_w.html" && rm _w.html
```

Bẫy giữ nguyên từ các ngày trước: path thẳng đơn độc trong `<g filter>` có bbox 0 →
biến mất (mọi mũi nối phải cong); canvas cao đúng 900, chữ ở y > 880 bị cắt; đọc lại
PNG để kiểm chứ đừng tin SVG. Mới hôm nay: `built with` phải có
`text-anchor="end"` như day-07, không thì nó đè lên wordmark ZAMA.
