# X posts — Day 3 (23/08/2026)

Voice: all-lowercase, câu ngắn, giọng dev kể cho dev. Ngân sách jargon: tối đa 2 tên
kỹ thuật / post. Không buzzword. Không "anonymous". Prize = employer-funded sponsored
yield. Facts từ `docs/handoffs/DAY_03_HANDOFF.md` + `docs/DRAW_PROTOCOL.md` — mọi con
số đã verify (74 tests, 2:1 exact, HCU đo thật, ceiling 21/tx).

---

## A. Main post (kèm video) — bản chính

day 3 of payday pot — your ticket in the draw is now balance × time, and it's encrypted.

deposit early and hold: big ticket. same money at the last second: almost nothing.
steady savers beat last-block whales — and the math runs on numbers nobody can see:

— two savers put in the same 6,000. one held it twice as long. their encrypted
weights decrypt to exactly 2:1, to the unit — the tests pin block timestamps and
demand equality, not "roughly"

— weights freeze at payday, not whenever the draw gets around to running. run the
freeze 3 days late: same weights. withdraw everything *mid-freeze*: money walks out
in full, the ticket already earned stays in the draw

— measured the encrypted-compute cost: freezing one saver eats ~3.4% of a
transaction's budget, so a full pool of 32 closes in 2 transactions. anyone can push
those — including the employer, who still can't read a single weight

74 tests green. fun constraint: you can't divide by an encrypted number onchain. so
the draw never divides at all — weight stays raw money×seconds, and the win
probability comes out identical.

day 4: the draw — one encrypted random number, used once, no rerolls.

@zama #ZamaDeveloperProgram

---

## B. Short variant (261 ký tự kể cả tag — đếm bằng script)

day 3 of payday pot — your draw ticket is balance × time, all encrypted. same
deposit, half the time → exactly half the ticket, to the unit. tickets freeze at
payday; withdraw after, yours survives. 74 tests green.

day 4: the draw.

@zama #ZamaDeveloperProgram

> Copy: bỏ line-break giữa câu trong cùng đoạn (file wrap cho dễ đọc), giữ dòng trống
> giữa 3 đoạn. Video attach nên không cần dòng "video:".

---

## C. Thread (4 post, video ở 1/4)

**1/4**
day 3 of payday pot: the fairness math. your shot at the prize = balance × how long
you held it — computed entirely on numbers that stay encrypted.

building on @zama fhevm for the #ZamaDeveloperProgram. how do you prove
time-weighting is fair when you can't see anyone's balance? 👇

**2/4**
tickets freeze at payday, not at draw time.

the freeze runs as a public crank — anyone can push it, in batches, and it can stall
halfway without trapping a cent. one test withdraws everything mid-freeze: money out
in full, the already-earned ticket stays in the draw.

leaving never costs you what you already earned.

**3/4**
the proof is exact, not approximate.

two savers deposit the same 6,000; one holds twice as long. decrypt the weights:
exactly 2:1, to the unit. run the freeze 3 days late: identical result. every test
pins block timestamps and asserts equality — in money code, "approximately fair" is
a bug report waiting to happen.

**4/4**
and it fits the budget: every transaction has a hard encrypted-compute limit.
measured today — freezing one saver ≈ 3.4% of it, so a 32-person pool closes in 2
transactions. my pre-measurement estimate for one of the steps was 18× too
pessimistic. measure, don't model.

74 tests green. day 4: the draw — one encrypted random number, no rerolls.

@zama #ZamaDeveloperProgram

---

## D. Dev-gotcha post — overflow wraps, silently (post lẻ, audience dev)

fhevm gotcha of the day: encrypted arithmetic doesn't revert on overflow. it wraps.
silently.

in plain solidity, overflow reverts and you find out. here the accumulator would
just come back around — and every number downstream is garbage with a valid proof.

fix: make overflow unrepresentable. the constructor rejects any pool config where
participants × deposit-cap × epoch-length could ever touch 2^64. then a test rides
one account to 99.85% of that ceiling and decrypts the exact expected value.

if your encrypted contract doesn't have a boundary test like this, you don't know
it's correct — you only know it hasn't wrapped yet.

@zama #FHE #ZamaDeveloperProgram

---

## E. Spares

**E1 — the 18× surprise (follow-up cho E2 của day 2, có thể post lẻ)**
day 2 i said the per-transaction compute budget, not gas, is the real constraint.
today i measured instead of estimating: one step i had budgeted at 600 units costs
32. another i feared would need 4 transactions fits in 2. the estimate table was
wrong in a good direction — but it was wrong. measure early.

**E2 — honesty line (để dành trước day 4/submission)**
before someone else says it: the random number source on fhevm today is a
coprocessor prng per zama's own roadmap, not production-grade randomness. the draw
design still guarantees nobody — keeper, employer, me — can pick or preview it. but
the readme will say what it is, not wait to be asked.

---

## Video

- 35–50s, 16:9, không voiceover.
- take: chạy `cd "packages/contracts" && pnpm demo:day3`. Để nguyên toàn bộ narration
  đến `1 passing`. **Không cắt 3 dòng ăn tiền**: dòng withdrawAll MID-SNAPSHOT
  ("His frozen weight stays in the draw"), dòng decrypt 2:1 ("Exactly 2:1 — half the
  time in the pool means half the ticket"), và dòng 🔒 employer DENIED.
- overlay 3 dòng: "day 3 — your ticket = money × time, encrypted" / "same money,
  half the time → exactly half the ticket" / "withdraw mid-freeze: money out,
  ticket stays".

## Tag (ĐỔI từ hôm nay: handle là `@zama`, không còn `@zama_fhe`)

- Zama đã đổi handle X: form submit S4 ghi "tagging @zama", `x.com/zama` là account
  thật (266K followers, zama.org). Mention `@zama_fhe` không còn trỏ tới account —
  post day 1–2 nếu đã đăng với tag cũ thì thôi, từ nay dùng `@zama`. Skill x-post đã sửa.
- `@zama` + `#ZamaDeveloperProgram` dòng cuối, đoạn riêng. Thread: post 1 + post cuối.
- Hashtag giữ camel-case. Tối đa thêm `#FHE`. Chưa dùng chữ "submission".

## Ảnh minh hoạ

`docs/social/images/day-03.png` (3200×1800, 16:9 — nguồn: `day-03.svg`).

Nội dung: 1 ý chính = **cùng số tiền, thời gian gấp đôi → ticket đúng gấp đôi**.
Hai thanh thời gian (coin dot-mask cùng cỡ — không bao giờ số plaintext): thanh trên
vào từ đầu tuần, thanh dưới vào giữa tuần (nửa đầu là outline dashed rỗng); chốt tại
đường "payday" có đồng hồ + stamp "FROZEN AT PAYDAY"; bên phải 2 blob cyan dot-mask
tỷ lệ diện tích 2:1 = encrypted weights; note dưới "withdraw anytime — the ticket
you earned stays in the draw". Chưa vẽ draw/winner vì Day 3 chưa có (rule
`PAYDAY_POT_VISUAL_STYLE.md`: chỉ vẽ thứ đã tồn tại).

Render lại sau khi sửa SVG:

```bash
cd docs/social/images && { echo '<html><body style="margin:0;background:#F7F3E7">'; cat day-03.svg; echo '</body></html>'; } > _w.html && "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 --window-size=1600,900 --screenshot=day-03.png "file://$PWD/_w.html" && rm _w.html
```

Font phụ thuộc macOS (Marker Felt / Bradley Hand / Noteworthy) — render trên máy
khác sẽ fallback khác. Dùng luôn PNG đã commit, đừng re-render trên CI.
