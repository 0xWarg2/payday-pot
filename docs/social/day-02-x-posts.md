# X posts — Day 2 (20/08/2026)

Voice: all-lowercase, câu ngắn, giọng dev kể cho dev. Ngân sách jargon: tối đa 2 tên
kỹ thuật / post. Không buzzword. Không "anonymous". Prize = employer-funded sponsored
yield. Không claim payroll. Facts từ `docs/handoffs/DAY_02_HANDOFF.md` — mọi con số
đã verify (43 tests, seed 0xda72, HCU đo thật).

---

## A. Main post (kèm video) — bản chính

day 2 of payday pot — money in, money out, nobody sees the numbers.

the pool contract exists now. deposits and withdrawals, encrypted end to end:

— deposits credit only what actually arrived. try to go over your savings cap and the
token quietly refunds everything — the transaction still *succeeds*, so even the
failure leaks nothing about how close to the cap you were

— withdrawing is the one thing that can never be blocked. there's a test that pauses
the whole pool and then pulls every cent out anyway. if that test ever goes red, the
project is wrong, not the test

— then a seeded sequence of 30 random deposits and withdrawals hammered 3 accounts,
checking after every batch that not a cent appeared or vanished

43 tests green. strangest find of the day: two different encrypted values turned out
to be literally the same ciphertext handle, because they had identical histories. not
a leak — you can only "read" a value you already knew — but my test suite had to
learn that lesson the hard way.

video: one command — deposit encrypted, other accounts blocked, over-cap refunded in
silence, pool paused, money walks out anyway.

day 3: time-weighted balances, so the draw favors steady savers over last-block whales.

@zama_fhe #ZamaDeveloperProgram

---

## B. Short variant (262 ký tự kể cả tag — đếm bằng script)

day 2 of payday pot — deposits and withdrawals live, fully encrypted. over-cap
deposit? refunded silently, no error to leak why. pool paused? withdrawals still
work — that's tested. 43 tests green.

day 3: time-weighted balances.

@zama_fhe #ZamaDeveloperProgram

> Copy: bỏ line-break giữa câu trong cùng đoạn (file wrap cho dễ đọc), giữ dòng trống
> giữa 3 đoạn. Video attach nên không cần dòng "video:".

---

## C. Thread (4 post, video ở 1/4)

**1/4**
day 2 of payday pot: the vault works. money goes in encrypted, comes out encrypted,
and i can prove nobody's savings can quietly vanish.

building on @zama_fhe fhevm for the #ZamaDeveloperProgram. the three properties that
mattered today 👇

**2/4**
a rejected deposit reveals nothing.

go over your savings cap and the token refunds the full amount — but the transaction
still succeeds. no revert, no error message, not one bit about how close to the limit
you were. in an encrypted system, even your failures have to keep secrets.

**3/4**
the rule i refuse to break: withdrawals can never be blocked.

the pool can be paused — deposits stop — but there's a test that pauses everything
and then withdraws every cent. pause exists to protect users. it must never trap them.

**4/4**
proof over promises: 30 random deposits and withdrawals across 3 accounts, replayed
against a plain model of what *should* happen. balances match to the cent, from a
fixed seed so any failure replays exactly.

43 tests green. day 3: time-weighted balances — steady savers beat last-block whales.

@zama_fhe #ZamaDeveloperProgram

---

## D. Dev-gotcha post — the aliasing story (post lẻ, audience dev; để day 3–4 nếu day 2 đã dùng post A)

weirdest thing i hit in fhevm so far: two *different* encrypted variables turned out
to be the exact same ciphertext handle.

handles are derived purely from the operation and its inputs — no counter. do the
same math twice, get the same handle. and access control follows the handle, not the
variable.

not a leak: identical history means you already knew the value. but my "nobody can
read the pool total" test was passing for the wrong reason until a second depositor
made the histories diverge.

encrypted systems fail in ways plain ones can't even express. write the negative
tests. then distrust them too.

@zama_fhe #FHE #ZamaDeveloperProgram

---

## E. Spares

**E1 — honesty line (thêm vào post A hoặc để dành trước submission)**
one thing i can't claim yet: the silent-refund behavior is proven against the token
library locally, not yet against the live token on sepolia. it's on the list for
deploy week — saying it first beats someone finding it.

**E2 — HCU teaser (giữ cho day 3–4 khi TWAB/draw dùng headroom)**
every encrypted operation on fhevm has a compute budget per transaction. today's
deposit spends about 10% of it. the other 90% is exactly the room the prize-draw math
needs — that budget, not gas, is the real constraint you design around.

---

## Video

- 35–50s, 16:9, không voiceover.
- take: chạy `cd "packages/contracts" && pnpm demo:day2`. Để nguyên toàn bộ narration
  đến `1 passing`. **Không cắt 2 dòng 🔒 DENIED và dòng withdrawAll xuyên pause** —
  đó là 2 dòng ăn tiền.
- overlay 3 dòng: "day 2 — deposits & withdrawals, all encrypted" / "over-cap deposit:
  refunded in silence" / "paused pool: money still walks out".

## Tag (rules từ day-01, không đổi)

- `@zama_fhe` + `#ZamaDeveloperProgram` dòng cuối, đoạn riêng. Thread: post 1 + post cuối.
- Hashtag giữ camel-case. Tối đa thêm `#FHE`. Chưa dùng chữ "submission".
