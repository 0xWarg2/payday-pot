# X posts — Day 4 (24/08/2026)

Voice: all-lowercase, giọng dev kể cho dev. Bullet dùng `-`, mỗi bullet **một dòng
liền** (file wrap sẵn cho dễ đọc, copy thì gộp lại). Tối đa 2 tên kỹ thuật / post.
Không buzzword, không "anonymous", prize = employer-funded sponsored yield.
Facts từ `docs/handoffs/DAY_04_HANDOFF.md` + `docs/DRAW_PROTOCOL.md` — verify:
103 tests (8+30+1+12+26+26), HCU requestRandom 1.747M, scan marginal 574k,
ceiling 22/tx, Monte Carlo [6,26,32]/64 @ 1:3:6.

---

## A. Main post (kèm video) — bản chính

day 4 of payday pot — the draw. one winner, picked from weights nobody can read, and even the winner can't see that they won.

- the random number locks exactly once per epoch, asking again reverts, and the trigger takes zero parameters — there's a test that reads the function signature to prove it, because a keeper who can pass in a seed is a keeper who can pick the winner
- picking runs as a scan over encrypted weights with no division and no branching: every saver gets the exact same 7 operations whether they win or lose, and exactly one winner falls out by construction, not by a check bolted on afterwards
- withdraw your entire balance between two scan transactions and nothing moves — weights froze at payday, so leaving early neither cancels your ticket nor hands the prize to someone else

how do you test a lottery you can't watch? two ways, both in the suite: decrypt everything in a test-only harness, redo the whole thing in plain math, predict the winner and check every flag matches — then run 64 fresh epochs at weights 1:3:6 and just count. expected 6.4 / 19.2 / 38.4, got 6 / 26 / 32. the lightest weight sits first in the list on purpose: that's exactly where a "first person in the list always wins" bug would show up.

103 tests green (8 stack spike, 30 money in / money out, 1 property test of 30 random ops, 12 on compute cost, 26 time-weighting, 26 new on the draw). the multiply that turns randomness into a ticket is the single most expensive encrypted op in the whole system, so it runs once per epoch — the per-saver scan is cheap enough that a full pool of 32 finishes in 2 transactions, and anyone can push them.

the win flag is contract-only: not the employer, not me, not the winner. what a winner sees is a prize to claim — which is also today's honest gap, because the prize amount is still hardcoded 0.

one command: `pnpm demo:day4`.

day 5: real money on the line — employer funds the prize, the claim path, and the amount gets frozen the moment the randomness locks.

@zama #ZamaDeveloperProgram

---

## B. Short variant (đếm bằng script — xem cuối file)

day 4 of payday pot — the draw. one winner out of encrypted weights: no division, no branching, exactly one by construction. even the winner can't read their own win flag. 103 tests green.

day 5: real prize money on the line.

@zama #ZamaDeveloperProgram

---

## C. Thread (4 post, video ở 1/4)

**1/4**
day 4 of payday pot: the draw. a weighted lottery where the weights are encrypted, the ticket is encrypted, and the winner flag is readable by the contract and nobody else.

building on @zama fhevm for the #ZamaDeveloperProgram. so how do you prove a draw you can't watch is honest? 👇

**2/4**
first, take the power away from whoever runs it. the trigger takes zero parameters — no seed, no weights, no winner, and a test reads the function signature to keep it that way.

the randomness locks once per epoch. ask a second time and it reverts. no reroll, not even for me.

**3/4**
then prove the pick itself. two independent ways:

- decrypt in a test-only harness, redo the whole selection in plain math, predict who wins, and check every flag matches — exact, not approximate
- run 64 fresh epochs at weights 1:3:6 and count. expected 6.4 / 19.2 / 38.4, got 6 / 26 / 32

the lightest weight sits first in the list on purpose — that's where a "first person always wins" bug would hide.

**4/4**
and it has to fit the machine: every tx has a hard encrypted-compute limit. the multiply that turns randomness into a ticket is the priciest op in the system, so it runs once per epoch. the per-saver scan costs little enough that a pool of 32 closes in 2 transactions, pushable by anyone.

103 tests green. prize amount is still 0 — day 5: employer funds it for real, plus the claim path.

@zama #ZamaDeveloperProgram

---

## D. "what the 103 tests check" (post lẻ, audience dev)

103 tests green means nothing unless you say what they check. payday pot as of day 4:

- 8 — the day-1 spike: can this stack do what the docs claim, including two tests proving another account and the deployer cannot read my value
- 30 — money in / money out: a proof bound to the wrong contract, a call from the wrong token, a deposit over your cap refunded whole, a withdraw bigger than your balance clamped instead of reverting, withdraw twice, withdraw while paused
- 1 — 30 random deposits and withdrawals across 3 wallets from a fixed seed, checked against a plain model after every step
- 12 — cost: every encrypted op is billed against a hard per-transaction limit, and each of these fails if a step gets more expensive than the chain allows
- 26 — time-weighting: same money for half the time = exactly half the ticket, a freeze run 3 days late landing identical, a withdraw after payday leaving the ticket untouched, and a config that could ever overflow rejected in the constructor
- 26 — the draw (new today): reroll refused, a zero-weight participant sitting in the middle of the list who can never win and never breaks exactly-one, a pool where every weight is zero completing with no winner and the prize untouched, a stranger finishing a scan the keeper started, withdrawing everything between two scan transactions changing nothing, max randomness × max weight not wrapping, and nobody — user, employer, keeper, owner — able to decrypt the randomness or the win flags

the ones i trust most are still the tests that assert someone *can't* read something.

@zama #FHE #ZamaDeveloperProgram

---

## E. Dev-gotcha post — logs you didn't write

fhevm gotcha of the day: my "no event ever leaks an amount or an address" test started failing on logs my contract never emitted.

turns out a transaction receipt in the fhevm test env carries the coprocessor's own logs too — every encrypted op leaves a trail there. my assertion was reading them as mine.

the fix is one line: filter the receipt by the pot's own address before asserting. worth knowing, because the wrong version of this test is the confident kind — it passes for weeks and checks the wrong contract.

@zama #FHE #ZamaDeveloperProgram

---

## F. Spares

**F1 — the term i deleted**
spent part of today deleting a condition from the winner formula instead of adding one. i had a "does this person even have weight?" guard in the hit check. it turns out a zero-weight participant can't produce a hit anyway — two lines of proof, one test pinning a refunded registrant in the middle of the list, and the guard is gone. one less encrypted op per saver, per epoch, forever.

**F2 — honesty line (dùng trước submission)**
before someone else says it: the randomness on fhevm today is a coprocessor prng per zama's own roadmap, not production-grade entropy. what the design does guarantee is that nobody — keeper, employer, me — can supply it, preview it, or ask for a second one. the readme says so instead of waiting to be asked.

---

## Video

- 35–50s, 16:9, không voiceover.
- take: `cd packages/contracts && pnpm demo:day4`. Giữ nguyên narration tới `1 passing`.
- **Không cắt 4 dòng ăn tiền**: pause chặn `requestRandom` rồi unpause chạy tiếp (R10),
  reroll bị `AlreadyDrawn` (R5), ví lạ hoàn tất scan (R4), và dòng winner bị từ chối
  decrypt chính won flag của mình (§15.1).
- overlay 3 dòng: "day 4 — the draw" / "one random number, locked once" / "even the
  winner can't read their own win flag".

## Tag

- `@zama` + `#ZamaDeveloperProgram` ở dòng cuối, đoạn riêng. Thread: post 1 + post cuối.
  `@zama_fhe` đã chết (xem `day-03-x-posts.md`). Tối đa thêm `#FHE`. Chưa dùng chữ
  "submission" vì chưa submit.

## Ảnh minh hoạ

`docs/social/images/day-04.png` (3200×1800, 16:9 — nguồn: `day-04.svg`). Cùng style
handwriting, mật độ như day 3:

- header: `PAYDAY POT` + "day 4 — the draw: one winner, nobody can see who" + `pnpm demo:day4`
- bảng đếm: `103 tests green` + 8 / 30 / 1 / 12 / 26 / 26
- trái: vòng tròn `?` = "one random number, locked once per epoch", dưới là dòng bị
  gạch "ask for a second one → refused"
- giữa: thanh cumulative 3 slot (rộng 1:3:6, coin dot-mask cyan = encrypted), mũi tên
  ticket rơi xuống đúng 1 slot, slot đó được highlight lime; 2 dòng dưới: "each slot =
  one saver's frozen weight, encrypted" và "no division, no branching — same 7 steps
  for everyone, win or lose"
- phải: Monte Carlo 64 epoch @ 1:3:6, 3 bar 6/26/32 + vạch dashed = kỳ vọng 6.4/19.2/38.4
- dưới trái: ổ khoá + "who won stays readable by the contract only — not the employer,
  not me, not the winner" và note thật thà "prize amount is still 0 — funding is tomorrow"
- dưới giữa: batch 1 ⟶ batch 2 với mũi tên withdraw ở giữa: "the winner doesn't change"
- dưới phải: cost — "the pricey step runs once per epoch" + "22 savers per tx, measured
  → a full pool of 32 in 2 tx, anyone may push"

Không số plaintext, không vẽ prize/claim (Day 5 chưa có) — theo `PAYDAY_POT_VISUAL_STYLE.md`.

Render lại sau khi sửa SVG:

```bash
cd docs/social/images && { echo '<html><body style="margin:0;background:#F7F3E7">'; cat day-04.svg; echo '</body></html>'; } > _w.html && "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 --window-size=1600,900 --screenshot=day-04.png "file://$PWD/_w.html" && rm _w.html
```

Bẫy SVG gặp hôm nay: path **thẳng đứng** đặt trong `<g filter=...>` có bbox rộng 0 →
filter region rộng 0 → **biến mất hoàn toàn** khi render. Mũi tên/vạch dọc thì bỏ
filter (hoặc bẻ nhẹ đường cong), đừng ngồi tìm lỗi toạ độ.

Font phụ thuộc macOS (Marker Felt / Bradley Hand / Noteworthy) — dùng PNG đã commit,
đừng re-render trên CI.
