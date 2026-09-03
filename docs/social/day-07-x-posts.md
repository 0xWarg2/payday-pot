# day 7 — x posts (moving money, and every way it breaks)

Fact base (verified 28/08, không lấy từ commit message — message của `eac6d06` ghi
228 web + 40 e2e là **stale**):

- `426 tests green` = **150** contract (không đổi từ day 5) + **231** web unit
  (10 files, `pnpm --filter @payday-pot/web test`) + **45** browser
  (`npx playwright test --list`, desktop + mobile-320)
- encrypt trong tab người dùng: **9752 ms** đo thật (beat 3 của `demo-day7.spec.ts`)
- demo: 12 beats / 5 tests → 5 clip `.webm` + `.srt`, ghép thành
  `payday-pot-day7.mp4` 1280×720, 249s
- 3 bug thật từ diễn error path trong browser: COMPATIBILITY_NOTES #30–#34
  (ethers bọc lại `4001` của ví → mọi cancel thành "something went wrong";
  `e as PotError` trong component → white screen; stub wallet không forward
  `error.data` → onchain test assert nhánh sai)
- vẫn chưa làm được: 1 deposit thật + 1 lần fund prize thật qua UI. Ví sponsor 0 ETH.

⚠️ Lưu ý sự thật: beat 3 trong spec là **partial withdraw 25**, không phải deposit.
Cùng state machine, cùng review dialog, cùng 1 signature, panel sau khi ký là revert
có tên thật. Nên copy dưới đây viết "an amount, encrypted in your own tab" — không
claim "deposit thật đã chạy".

---

## A — post chính (daily long post)

day 7 of payday pot: money moves now.

deposit and withdraw share one screen, and the screen you read before you sign is split in two — what stays private (your amount, your balance in the pool, your odds, whether you ever won) and what becomes public anyway (this address moved money, the time, the hash, the gas). the second list is the honest half. i am not hiding people, i am hiding numbers.

three things i'm glad i built in this order:

- "withdraw everything" came first — nothing to type, nothing to encrypt, nothing to reveal, and it keeps working while the pool is paused
- encrypting in your own tab takes ~9.7 seconds, so the screen names the step and counts instead of spinning at you
- the second a transfer confirms, the app deletes the number you typed — the token can quietly move less than you asked, so that number was never proof of your new balance

then i spent the rest of the day acting out the failures in a real browser instead of trusting the code: wrong network, cancel in the wallet, relayer dead mid-encrypt, tab closed mid-transaction. every one of them now says what actually happened, and the transaction history is rebuilt from chain, never read off disk.

three real bugs fell out of that. one was a white screen. one made every single "cancel" say "something went wrong".

426 tests green: 150 contract, 231 web app, 45 in a real browser. demo is one command, 12 beats, and a 4-minute video.

still by hand tomorrow: one real deposit and one real prize funding through the UI. the sponsor wallet is sitting at 0 ETH.

day 8: the draw room — winner and loser look exactly the same until you sign.

@zama #ZamaDeveloperProgram

---

## B — short variant (279 ký tự kể cả tag — đếm bằng script)

day 7 of payday pot — money moves now, and i spent it on the ways it breaks. wrong network, wallet cancel, relayer dead mid-encrypt, tab closed: each one says what happened. withdraw everything needs no reveal. 426 tests green.

day 8: the draw room.

@zama #ZamaDeveloperProgram

---

## C — thread 4

**1/**
day 7 of payday pot: money moves.

before you sign, the screen splits into what stays private — your amount, your balance in the pool, your odds, whether you ever won — and what becomes public anyway: this address moved money, the time, the hash, the gas.

i hide numbers, not people.

@zama #ZamaDeveloperProgram

**2/**
the exit shipped before the entrance.

"withdraw everything" has nothing to type, nothing to encrypt, nothing to reveal, and it works while the pool is paused. the function that does it cannot even accept an amount.

if the way out only works on a good day, it isn't a way out.

**3/**
then i acted out the failures in a real browser: wrong network, wallet cancel, relayer dead mid-encrypt, tab closed mid-transaction.

three real bugs fell out. one was a white screen. one made every "cancel" say "something went wrong" — the wallet's own error was being reworded on the way up.

**4/**
426 tests green: 150 contract, 231 web app, 45 in a real browser. one command, 12 beats, a 4-minute video.

not done yet: a real deposit and a real prize funding through the UI. sponsor wallet is at 0 ETH.

day 8: the draw room.

#ZamaDeveloperProgram

---

## D — "what the 426 tests actually check" (post cho dev audience)

people say "tests green" and mean nothing by it, so: 426 on day 7 of payday pot.

**150 — the contract** (untouched since day 5)
- you can always take everything out, in every phase, including while paused
- deposits count what actually arrived, not what you asked for
- your employer, the keeper and the admin can read none of your numbers — proven by tests that expect a failure
- the draw picks exactly one winner, cannot be re-rolled, and anyone can push it forward
- the odds tests are wrong-answer-proof: two people, same money, one stays twice as long → weight comes out 2:1

**231 — the web app** (10 files)
- the money screen can only reach "sign" from "review", so two clicks are still one transaction
- confirming a transfer wipes the amount you typed
- every one of the 31 error codes has a line of copy, and none of that copy contains a number a human would have to decode
- a hidden value, an unavailable value, a real zero and a not-read-yet value all say four different things
- what's allowed on disk is a list of three keys, and a transaction record is five fields

**45 — a real browser, production build**, desktop and a 320px phone
- wrong network → the button dies with its reason in the tooltip, and reading still works
- cancel in the wallet → "you cancelled", and no ghost row in the history
- relayer dies mid-encrypt → a panel with something to press, and no amount anywhere in the text
- close the tab mid-flight, come back → status rebuilt from chain
- dump local storage → three keys, five fields, no amount, no handle, no win or loss

day 8: the draw room.

@zama #ZamaDeveloperProgram

---

## E — dev gotcha (3 bug chỉ hiện ra khi diễn error path thật)

three bugs on day 7 of payday pot, and all three only showed up because i acted the failures out in a real browser instead of unit-testing my own assumptions.

- every single "cancel" said "something went wrong". the wallet does report a clean "user rejected", but the library wraps it in its own error on the way up, so my code never saw it. fix: walk the whole chain of nested causes, not the top one.
- one thrown error was a white screen. a component assumed anything caught was already my own error type and read a field off it. a plain type error has no such field. fix: one function every error must pass through, no exceptions.
- my fake wallet in the tests was dropping the revert payload, so the app fell back to the generic branch — and the tests asserted the generic branch and passed. green tests, checking the wrong thing.

the theme: error handling is only real if you can trigger the error.

day 8: the draw room.

@zama #ZamaDeveloperProgram

---

## F — spares

**F1 (short, honesty)**
day 7 of payday pot. what i can't claim yet: no one has made a real deposit through the UI, and no prize has been funded through the UI. the sponsor wallet has 0 ETH. everything else on the money screen ran end to end in a real browser today, 45 checks of it.

@zama #ZamaDeveloperProgram

**F2 (short, the deleted draft)**
small thing i like from day 7: the second a transfer confirms, the app throws away the amount you typed.

the token is allowed to move less than you asked without failing, so the number in the box was never proof of anything. keeping it around would just be a lie with good intentions.

@zama #ZamaDeveloperProgram

**F3 (short, the exit)**
built the exit before the entrance on day 7 of payday pot.

"withdraw everything": nothing to type, nothing to encrypt, nothing to reveal, still works while the pool is paused. the function can't even take an amount.

a way out that only works on a good day isn't a way out.

@zama #ZamaDeveloperProgram

---

## Video

`apps/web/demo-results/` — 5 clip `.webm` + `.srt`, ghép thành
`payday-pot-day7.mp4` (1280×720, 249s, caption tiếng anh burned in).
Spec: `apps/web/demo/demo-day7.spec.ts` (12 beats / 5 tests). Commit `eac6d06` (dev).

Beat **không được cắt** khi làm bản ngắn cho X:

1. `Withdraw everything` trước tiên — không gõ số, không encrypt, không reveal, và
   chạy được khi pool đang paused.
2. Encrypt thật qua relayer với progress có tên bước (9752 ms), review dialog tách
   **Stays private / Becomes public**, ký một lần → panel có tên thật, không echo
   lại số vừa gõ.
3. Sai mạng → nút disabled kèm lý do trong tooltip, đổi mạng là sống lại, không reload.
4. Cancel trong ví → "you cancelled", `pdp.tx.v1` vẫn `null`/`[]` (không record ma).
5. Relayer chết → panel có hành động, **không có "10 USDC"** trong text; đóng tab
   giữa chừng → reload dựng lại status từ chain; dump localStorage → đúng 3 key,
   record đúng 5 field.
6. Sponsor page — prize là số công khai, có badge public, 4 câu "tài trợ không mua
   được quyền nhìn" nằm ngay cạnh form.

Overlay 3 dòng cho bản 45s: `deposit → review → one signature` ·
`stays private / becomes public` · `and every way it breaks`.

---

## Tag

Dòng cuối, đoạn riêng: `@zama #ZamaDeveloperProgram` (thêm `#FHE` nếu muốn).
`@zama_fhe` đã chết — đừng dùng lại.

---

## Ảnh minh hoạ

`docs/social/images/day-07.svg` → `day-07.png` (3200×1800).

Render:

```bash
cd docs/social/images && { echo '<html><body style="margin:0;background:#F7F3E7">'; cat day-07.svg; echo '</body></html>'; } > _w.html && "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 --window-size=1600,900 --screenshot=day-07.png "file://$PWD/_w.html" && rm _w.html
```

Bẫy đã gặp (giữ nguyên khi sửa): path thẳng đứng/ngang đơn độc bên trong
`<g filter="...">` có bbox rộng 0 → **biến mất hoàn toàn**. Mọi mũi nối phải là
đường cong (`C`), kim đồng hồ phải nằm ngoài group có filter. Và canvas cao đúng
900 — dòng chữ ở y > 880 bị cắt, kiểm tra bằng cách đọc lại PNG, đừng tin SVG.
