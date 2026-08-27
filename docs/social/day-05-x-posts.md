# X posts — Day 5 (25/08/2026)

Voice: all-lowercase, giọng dev kể cho dev. Bullet `-`, mỗi bullet **một dòng liền**.
Tối đa 2 tên kỹ thuật / post. Không buzzword, không "anonymous", prize =
employer-funded sponsored yield. Facts từ `docs/handoffs/DAY_05_HANDOFF.md` +
`PRIVACY.md` / `THREAT_MODEL.md` — verify: 150 tests (12+30+26+26+38+17+1), claim
748,032 / 369,000 / 396,250 **bằng nhau tuyệt đối** winner vs non-winner, fundPrize
586k, startNewEpoch 850k gas @ cap 32, ceiling scan 22/tx không đổi, ABI freeze
84 entries / 45 functions.

---

## A. Main post (kèm video) — bản chính

day 5 of payday pot — the loop closes. an employer funds a prize, people save, weights freeze at payday, the draw runs, everyone claims, next round opens. the contract side of the protocol is done.

- i red-teamed my own contract after shipping it and found a real one: the employer could still pull the prize back after weights froze — exactly when savers can no longer leave. that isn't an exit, that's a rug. the rule is symmetric now: the prize may change only while a saver can still change their deposit
- claiming costs the same whether you won or not — 748,032 compute, 369,000 depth, 396,250 gas, identical to the digit, measured in two separate test files. a non-winner's claim succeeds and moves 0, because a revert only losers see is a public announcement of who won
- nobody wins a round? the prize rolls into the next one as an encrypted carry, and not even the employer can read whether last round had a winner

the prize is funded with public USDC on purpose, and that was a deliberate downgrade. a confidential transfer clamps silently — an employer who's short would send an encrypted zero while the promised prize still counted up, so the pot would owe more than it holds. the public path reverts out loud instead. price: funding takes 2 transactions.

150 tests green: 12 stack spikes, 30 money in / money out, 26 time-weighting, 26 the draw, 38 new on prize + claim + next round, 17 on cost per transaction, 1 fuzz run whose solvency check reads every number back off chain instead of trusting a model.

favourite lesson of the day: green ≠ ran. my first fuzz loop passed in 2.3 seconds — with every single defund landing on the revert branch, so the interesting path never executed once. counters now assert each branch actually fires.

one command runs the whole protocol: `pnpm demo:day5`. still local only — public testnet is day 9.

day 6: the web app, where rule one is that a hidden encrypted value never renders as 0.

@zama #ZamaDeveloperProgram

---

## B. Short variant (đếm bằng script — xem cuối file)

day 5 of payday pot — the loop closes: fund, save, freeze, draw, claim, next round. claiming costs the same to the digit whether you won or not, because a revert only losers see announces who won. 150 tests green.

day 6: the web app.

@zama #ZamaDeveloperProgram

---

## C. Thread (4 post, video ở 1/4)

**1/4**
day 5 of payday pot: the loop closes. employer funds a prize → people save → weights freeze at payday → the draw runs → everyone claims → next round. contract side of the protocol is done, 150 tests green.

built on @zama fhevm for the #ZamaDeveloperProgram. three things i had to get right 👇

**2/4**
1 — claiming has to cost the same whether you won or not.

748,032 compute, 369,000 depth, 396,250 gas: winner and non-winner, identical to the digit, measured in two separate test files. a non-winner's claim succeeds and moves 0.

a revert that only losers see is a public announcement of who won.

**3/4**
2 — i red-teamed my own shipped contract and found a real hole: the employer could still pull the prize back after weights froze, the exact moment savers can no longer leave. an exit for one side only is a rug.

the rule is symmetric now: the prize may change only while a saver can still change their deposit.

**4/4**
3 — a round with no winner can't leak that fact. the prize rolls into the next round as an encrypted carry, and nobody, employer included, can read whether last round had a winner.

and the lesson i'll keep: green ≠ ran. my first fuzz loop passed in 2.3s with every defund hitting the revert branch — the interesting path never ran once.

day 6: the web app.

@zama #ZamaDeveloperProgram

---

## D. "what the 150 tests check" (post lẻ, audience dev)

150 tests green means nothing unless you say what they check. payday pot, contract side complete:

- 12 — stack spikes: can this thing do what the docs claim, including a contract wrapping tokens on its own behalf, and tests proving another account cannot read my value
- 30 — money in / money out: a proof bound to the wrong contract, a call from the wrong token, a deposit over your cap refunded whole, a withdraw bigger than your balance clamped instead of reverting, withdraw twice, withdraw while paused
- 26 — time-weighting: same money for half the time = exactly half the ticket, a freeze run 3 days late landing identical, a config that could ever overflow rejected in the constructor
- 26 — the draw: reroll refused, a zero-weight participant who can never win and never breaks exactly-one, a stranger finishing the scan a keeper started, max randomness × max weight not wrapping
- 38 — prize, claim, next round (new today): an employer short on funds reverting in the clear, funding refused once the round closes, defunding refused once the randomness is locked, exactly one person decrypting a positive prize, claiming twice moving money once and never reverting, a winnerless round carrying the prize forward encrypted, a full pool of 32 resetting in one transaction
- 17 — cost: every encrypted op is billed against a hard per-transaction limit, and these fail if any step gets more expensive than the chain allows
- 1 — fuzz: random funding, defunding, deposits, withdrawals and claims across rounds, with a solvency invariant that reads every number back off chain rather than trusting a model of it

still the ones i trust most: the tests asserting somebody *can't* read something, and the ones asserting two different people pay exactly the same.

@zama #FHE #ZamaDeveloperProgram

---

## E. Dev-gotcha post — green ≠ ran

my fuzz test passed in 2.3 seconds and i almost believed it.

random funding, defunding, deposits, claims across rounds, solvency asserted every step. green. what actually happened: 100% of the defund commands hit a revert branch, so the interesting path never executed once, and the prize carry was 0 for the entire run. the invariant held because nothing happened.

fix isn't a better assertion, it's a witness. count how often each branch fires — funded, defunded, wallet clamps, cap refunds, paid claims, rounds with a winner, rounds without — then assert every counter is above zero. now the suite fails if the fuzz gets lazy.

a passing test is not evidence that the code ran. it's evidence that nothing you asserted was violated by whatever did run.

@zama #FHE #ZamaDeveloperProgram

---

## F. Spares

**F1 — the symmetry rule (đứng một mình được, quotable nhất)**
the fix that came out of red-teaming my own contract, in one line: the sponsor may change the prize only for as long as a saver can still change their deposit. before that, funding could be pulled back after weights froze — a window where one side could leave and the other couldn't. same clock for both sides, or it isn't a pool, it's a promise.

**F2 — the deliberate downgrade**
the prize gets funded with public USDC, not the confidential token, and that's on purpose. confidential transfers clamp silently: an employer who's short would move an encrypted zero while the promised prize counted up anyway, and the pot would owe more than it holds. the plain path reverts out loud. i took 2 transactions and a public number over a silent hole in the balance sheet.

---

## Video

- 40–55s, 16:9, không voiceover. `cd packages/contracts && pnpm demo:day5` (12 beat).
- **Không cắt 5 dòng ăn tiền**: employer thiếu tiền ⇒ revert plaintext (R12), defund bị
  từ chối sau khi random chốt (B2), mỗi saver tự decrypt prize và **đúng 1 người dương**,
  owner pause mà **winner vẫn claim được**, non-winner claim với **gas bằng đúng winner**.
- overlay 3 dòng: "day 5 — the loop closes" / "claim costs the same, win or lose" /
  "everyone withdraws in full, pot balance ends at 0".

## Tag

- `@zama` + `#ZamaDeveloperProgram` dòng cuối, đoạn riêng. Thread: post 1 + post cuối.
  Tối đa thêm `#FHE`. Vẫn **chưa** dùng chữ "submission".

## Ảnh minh hoạ

`docs/social/images/day-05.png` (3200×1800, 16:9 — nguồn: `day-05.svg`):

- header + `pnpm demo:day5`; bảng đếm `150 tests green` với 7 nhóm
- giữa: chuỗi 6 node `fund → save → freeze → draw → settle → claim` + cung cyan quay
  lại "next round — same pot, weights reset, prize carried"
- phong bì dán kín: "no winner? the prize rolls forward, sealed — nobody can read
  whether there was one"
- phải: note "green ≠ ran" (fuzz pass 2.3s vì mọi defund rơi vào nhánh revert)
- dưới trái: red-team finding + rule mới được highlight lime, kèm dòng thật thà
  "still local only — public testnet is day 9"
- dưới phải: 2 phiếu claim giống nhau từng chữ số (748,032 / 369,000 / 396,250,
  caption "compute · depth · gas") + dấu `=` → "the receipt cannot tell you who won"

Không số plaintext của user, không vẽ web UI (Day 6 mới có).

Render lại sau khi sửa SVG:

```bash
cd docs/social/images && { echo '<html><body style="margin:0;background:#F7F3E7">'; cat day-05.svg; echo '</body></html>'; } > _w.html && "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 --window-size=1600,900 --screenshot=day-05.png "file://$PWD/_w.html" && rm _w.html
```

Nhắc lại bẫy từ day 4: path **thẳng đứng hoặc nằm ngang tuyệt đối** trong
`<g filter=...>` có bbox 0 theo 1 chiều → filter region 0 → mất khi render. Mũi tên
trong ảnh này đều bẻ cong nhẹ vì lý do đó.

Font macOS (Marker Felt / Bradley Hand / Noteworthy) — dùng PNG đã commit.
