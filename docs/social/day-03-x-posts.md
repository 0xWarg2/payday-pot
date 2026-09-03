# X posts — Day 3 (23/08/2026)

Voice: all-lowercase, giọng dev kể cho dev. Bullet dùng `-`, mỗi bullet **một dòng
liền** (đừng xuống dòng giữa câu — file này wrap sẵn để đọc, khi copy thì gộp lại).
Ngân sách jargon: tối đa 2 tên kỹ thuật / post. Không buzzword. Không "anonymous".
Prize = employer-funded sponsored yield. Facts từ `docs/handoffs/DAY_03_HANDOFF.md`
+ `docs/DRAW_PROTOCOL.md` — đã verify: 74 tests, 2:1 exact, HCU đo thật, ceiling 21/tx.

---

## A. Main post (kèm video) — bản chính

day 3 of payday pot — your ticket in the draw is now balance × time, and all of it stays encrypted. deposit early and hold, big ticket. same money at the last second, almost nothing. steady savers beat last-block whales.

- two savers deposited the same 6,000, one held it twice as long — their encrypted weights decrypt to exactly 2:1, to the unit, because every test pins block timestamps and asserts equality instead of "roughly"
- tickets freeze at payday, not whenever the draw gets run — run the freeze 3 days late and the weights are identical; withdraw everything mid-freeze and your money leaves in full while the ticket you already earned stays in the draw
- freezing one saver costs ~3.4% of a single transaction's compute budget (measured, not estimated), so a 32-person pool closes in 2 transactions — and anyone can push them, the employer included, who still can't read one weight

74 tests green: 8 from the day-1 stack spike, 30 on money in / money out, 1 property test replaying 30 random ops against a plain model, 9 on the per-transaction compute budget, 26 new ones on time-weighting — exact ratios, freeze timing, the phase machine, who's denied on which weight, and the overflow boundary.

fun constraint: you can't divide by an encrypted number onchain. so the draw never divides at all — weight stays raw money × seconds, and the odds come out identical.

one command runs the whole thing: `pnpm demo:day3`.

day 4: the draw — one encrypted random number, used once, no rerolls.

@zama #ZamaDeveloperProgram

---

## B. Short variant (274 ký tự kể cả tag — đếm bằng script)

day 3 of payday pot — your draw ticket = balance × time, encrypted. same money, half the time → exactly half the ticket. tickets freeze at payday; withdraw after and yours survives. 74 tests green.

day 4: the draw, one random number, used once.

@zama #ZamaDeveloperProgram

---

## C. Thread (4 post, video ở 1/4)

**1/4**
day 3 of payday pot: the fairness math. your shot at the prize = balance × how long you held it, computed entirely on numbers that stay encrypted.

building on @zama fhevm for the #ZamaDeveloperProgram. how do you prove time-weighting is fair when you can't see anyone's balance? 👇

**2/4**
tickets freeze at payday, not at draw time. the freeze runs as a public crank — anyone can push it, in batches, and it can stall halfway without trapping a cent.

one test withdraws everything mid-freeze: money out in full, the already-earned ticket still in the draw. leaving never costs you what you already earned.

**3/4**
the proof is exact, not approximate. two savers deposit the same 6,000, one holds twice as long, decrypt the weights: exactly 2:1, to the unit. run the freeze 3 days late: identical.

every test pins block timestamps and asserts equality — in money code, "approximately fair" is a bug report waiting to happen.

**4/4**
and it fits the budget: every transaction has a hard encrypted-compute limit. measured today, freezing one saver ≈ 3.4% of it, so a 32-person pool closes in 2 transactions. my own pre-measurement guess for one step was 18× too pessimistic — measure, don't model.

74 tests green. day 4: the draw — one encrypted random number, no rerolls.

@zama #ZamaDeveloperProgram

---

## D. "what the 74 tests actually check" (post lẻ, audience dev — dùng nếu muốn nói rõ case)

"74 tests green" means nothing unless you say what they check. so, payday pot as of day 3:

- 8 — the day-1 spike: can this stack even do what the docs say. encrypt a number, add to it while it's still encrypted, decrypt it back — plus two tests proving another account, and the deployer, cannot read my value
- 30 — money in / money out, every path: a proof bound to the wrong contract, a call from the wrong token, a deposit past your cap refunded whole instead of reverting, a withdraw bigger than your balance clamped down instead of failing, withdraw twice, withdraw while paused
- 1 — 30 random deposits and withdrawals across 3 wallets from a fixed seed, checked against a plain model after every single step
- 9 — the compute budget: every encrypted op costs, and each of these fails if a transaction gets more expensive than the chain allows
- 26 — time-weighting: same money for half the time = exactly half the ticket, a last-second deposit earning a tiny but non-zero ticket, a freeze run 3 days late landing identical, a withdraw after payday leaving the ticket untouched, employer and owner denied on every weight, and a pool config whose worst case could ever overflow rejected in the constructor

the ones i trust most are the tests that assert someone *can't* read something.

@zama #FHE #ZamaDeveloperProgram

---

## E. Dev-gotcha post — overflow wraps, silently

fhevm gotcha of the day: encrypted arithmetic doesn't revert on overflow, it wraps — silently.

in plain solidity you find out. here the accumulator just comes back around, and every number downstream is garbage carrying a valid proof.

fix: make overflow unrepresentable. the constructor rejects any pool config where participants × deposit-cap × epoch-length could ever touch 2^64, then a test rides one account to 99.85% of that ceiling and decrypts the exact expected value.

if your encrypted contract has no boundary test like this, you don't know it's correct — you only know it hasn't wrapped yet.

@zama #FHE #ZamaDeveloperProgram

---

## F. Spares

**F1 — the 18× surprise (follow-up cho spare day 2)**
day 2 i said the per-transaction compute budget, not gas, is the real constraint. today i measured instead of estimating: one step i had budgeted at 600 units costs 32, another i feared would need 4 transactions fits in 2. the estimate table was wrong in a good direction — but it was wrong. measure early.

**F2 — honesty line (để dành trước day 4/submission)**
before someone else says it: the random number source on fhevm today is a coprocessor prng per zama's own roadmap, not production-grade randomness. the draw design still guarantees nobody — keeper, employer, me — can pick or preview it. but the readme will say so instead of waiting to be asked.

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

`docs/social/images/day-03.png` (3200×1800, 16:9 — nguồn: `day-03.svg`). Cùng style
handwriting như day 2 nhưng dày hơn (user yêu cầu "chi tiết hơn"), 6 vùng:

- header: `PAYDAY POT` + "day 3 — your ticket = money × time" + "one command: pnpm demo:day3"
- bảng đếm test (1 cột): `74 tests green` rồi 8 / 30 / 1 / 9 / 26 kèm mô tả tiếng người
- góc trên phải: doodle dấu ÷ bị gạch — "no division onchain, weight stays money × seconds, raw"
- giữa: 2 thanh thời gian cùng coin dot-mask (thanh 2 nửa đầu là dashed rỗng = chưa vào pool),
  chốt ở đường `payday` có đồng hồ + stamp `FROZEN AT PAYDAY`; phải là 2 blob cyan
  dot-mask **diện tích đúng 2:1** = encrypted weights
- dưới trái: mũi tên withdraw giữa lúc freeze vào ví — "money out in full, ticket stays"
- dưới giữa: hàng 32 ô, 21 ô lime + cursor — "public crank: anyone may push it,
  nobody gets a peek · 21 per tx (measured) → 2 tx cho cả pool"

Không có số plaintext, không vẽ draw/winner (Day 3 chưa có) — theo
`docs/PAYDAY_POT_VISUAL_STYLE.md`.

Render lại sau khi sửa SVG:

```bash
cd docs/social/images && { echo '<html><body style="margin:0;background:#F7F3E7">'; cat day-03.svg; echo '</body></html>'; } > _w.html && "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 --window-size=1600,900 --screenshot=day-03.png "file://$PWD/_w.html" && rm _w.html
```

Font phụ thuộc macOS (Marker Felt / Bradley Hand / Noteworthy) — render trên máy
khác sẽ fallback khác. Dùng luôn PNG đã commit, đừng re-render trên CI.
