# X posts — Day 6 (26/08/2026)

Voice: all-lowercase, giọng dev kể cho dev. Bullet dùng `-`, mỗi bullet **một dòng
liền** (file này wrap sẵn để đọc, khi copy thì gộp lại). Ngân sách jargon: tối đa
2 tên kỹ thuật / post. Không "anonymous". Prize = employer-funded sponsored yield.

Facts verify từ repo (không lấy từ trí nhớ): `docs/handoffs/DAY_06_KICKOFF.md`,
`docs/EXECUTION_PLAN.md` §Day 6, commit `20afb43` (shell/landing/dashboard),
`3201eb8` (demo EOD + 2 test rỗng), `apps/web/demo/demo-day6.spec.ts`,
`deployments/sepolia.json`. Đã chạy lại: **204 web unit / 9 file xanh**,
36 Playwright + 150 contract theo plan → **390**.

---

## A. Main post (kèm video) — bản chính

day 6 of payday pot — the app exists now, and it starts with everything covered. a wallet that has never deposited is told "nothing is stored for this wallet yet". it is never told it has 0.

- four states, not two: nothing there yet / there but locked / opened and it really is zero / not read back yet — each gets its own sentence, and until you unlock it there isn't a single digit anywhere on the dashboard
- one signature opens your own numbers, and everything closes them again: hide, switch account, switch network, reload, hide the tab, or just let the five-minute clock run out. decrypted values only ever live in the tab's memory — session storage is empty, local storage is an allowlist that rejects any record carrying an amount
- your wallet on the wrong network gets a warning, not a wall — the public side of the pool keeps reading through a fixed sepolia connection while you fix it. a screen you can't get out of is the one thing today's exit gate forbids

the reveal runs on real sepolia, driven end to end by an automated browser: two personas, real signatures, decrypting through zama's relayer. the relayer only exists on testnet, so there was no local shortcut to hide behind.

and driving it found a real bug — the fourth state, the one i hadn't named. connected wallet, click reveal one beat early, and it tells you to connect your wallet. the reads hadn't come back yet, and "not read yet" was quietly borrowing the "locked" screen.

390 tests green: 150 on the contract, 204 on the web app, 36 in a real browser on a production build.

one command: `pnpm demo:day6` — ten narrated beats, ~55 seconds, records its own video.

day 7: the savings screen — deposit, withdraw, and the employer's two-step funding panel.

@zama #ZamaDeveloperProgram

---

## B. Short variant (277 ký tự kể cả tag — đếm bằng script)

day 6 of payday pot — the app is up and it starts covered. a wallet that never deposited is told nothing is stored yet, not that it holds 0. one signature opens your own numbers, six things close them. 390 tests green.

day 7: deposit and withdraw.

@zama #ZamaDeveloperProgram

---

## C. Thread (4 post, video ở 1/4)

**1/4**
day 6 of payday pot: the app finally exists. the whole build is one rule — a number you haven't unlocked never renders as 0.

built on @zama fhevm for the #ZamaDeveloperProgram. hiding a balance is easy. saying the right thing about a balance you can't see is the hard part 👇

**2/4**
four states, four sentences, four screens: nothing stored for this wallet yet / yours but locked / opened, and it really is zero / not read back yet.

showing 0 in any of the first three is a leak dressed as a UI bug. showing a spinner forever in the fourth is a dead end, which is worse.

**3/4**
one signature opens principal and time-weight together. then everything closes them again — hide, other account, other network, reload, hidden tab, or the five-minute clock i put on screen so the promise is visible.

after a reload i dumped storage: session storage empty, local storage down to three keys, no amount and no handle in any of them. allowlist, not trust.

**4/4**
and it runs on real sepolia, not a mock — an automated browser walks two personas through it, signs for real, decrypts through the relayer. which is how i found the state i had forgotten to name: reveal clicked one beat early told me to connect a wallet that was already connected.

390 tests green. day 7: deposit, withdraw, and the employer funding panel.

@zama #ZamaDeveloperProgram

---

## D. "what the 390 tests actually check" (post lẻ, audience dev)

"390 tests green" means nothing unless you say what they check. payday pot, end of day 6:

- 150 — the contract, unchanged since day 5: money in and out, time-weighted tickets, the draw, prize and claim, cost per transaction, and a fuzz run checking the pool can always pay everyone back
- 204 — the web app, 9 files: three states of a confidential value never collapsing into each other, no digit reaching the screen while masked, the reveal cache clearing on timer / account change / chain change / hidden tab / the one event bfcache actually fires, a stale decrypt landing after you switched wallets getting dropped, every error message carrying no number at all, and a storage layer that refuses a key that isn't on the allowlist and refuses a transaction record carrying an amount
- 36 — a real browser against a production build: the server's own html carrying nothing about anyone, a fresh wallet told nothing is there, a cancelled signature saying nothing was sent, wrong network warning without blocking reads, onboarding remembering your role across a reload, and no horizontal overflow at 320px with a visible focus ring on every control

the ones i trust most are still the tests that assert someone *can't* see something — plus, since today, the ones that would notice if they stopped asserting anything at all.

@zama #FHE #ZamaDeveloperProgram

---

## E. Dev-gotcha post — two tests that were green while checking nothing

wrote a demo walkthrough today and it caught two of my own tests doing nothing.

one asserted the page does not contain "Visible in this tab only". the app actually says "Values are visible in this tab only" — lowercase v. that string was never there, so the assertion passed whether the session was open or closed. it guards one wallet's balance not staying on screen after you switch to another wallet, which makes it the worst possible place for a green light wired to nothing.

the other was my stub wallet: it answered "which accounts do you have" with an address unconditionally, i.e. it claimed every page was already approved. onboarding correctly skipped the connect step — so no test had ever clicked "connect wallet".

both are the same failure: a test that can only pass. now the first one looks for the element itself, and the stub can start unapproved like a real browser does.

if writing a demo script for your own product finds dead tests, it wasn't a waste of a day.

@zama #ZamaDeveloperProgram

---

## F. Spares

**F1 — the third quiet failure, found while writing this post**
and one more, found while checking the numbers for this post: the demo file lives in its own folder outside the test suite, but the unit-test runner still globbed that folder — so `pnpm test` for the web app went red on a file it was never meant to open. one line in the exclude list. every "keep the demo out of the suite" trick needs the same word said twice, once per runner.

**F2 — the honest one about hiding money**
before someone else says it: shielding money into this pool makes the amount public exactly once — the wrap is a plain token transfer, and unwrapping later makes it publicly readable by design. so the app says so on the screen *above* the button you sign, not in a toast afterwards. what stays confidential is your balance in the pool, your time-weight and your winnings. addresses and timing are public. that is the honest shape of it.

**F3 — masked by default**
"masked by default" only means something if the default is structural. every store in the app has a server snapshot that is hard-coded masked, so the first paint cannot leak — there is nothing to leak from, because the server never read anyone's position. the html it sends contains no ciphertext handle at all. privacy by architecture beats privacy by remembering to hide things.

---

## Video

- 45–60s, 16:9, không voiceover — dùng luôn video `pnpm demo:day6` tự quay
  (`apps/web/demo-results/`), có 10 beat lời dẫn in ra terminal.
- **Không cắt 5 beat ăn tiền**: beat 1 (SSR không có handle nào), beat 4
  ("Nothing is stored for this wallet yet" + không một chữ số nào), beat 6
  (một chữ ký mở cả principal lẫn TWAB, TTL 5 phút hiện lên), beat 8 (đổi mạng:
  phiên đóng nhưng trang vẫn đọc được), beat 10 (reload + soi storage).
- overlay 3 dòng: "day 6 — the app exists, and it starts covered" / "unavailable
  ≠ hidden ≠ actually zero" / "one signature to open, six ways to close".

## Tag

- `@zama` + `#ZamaDeveloperProgram` dòng cuối, đoạn riêng. Thread: post 1 + post cuối.
- Tối đa thêm `#FHE`. Chưa dùng chữ "submission".

## Ảnh minh hoạ

`docs/social/images/day-06.png` (3200×1800, 16:9 — nguồn: `day-06.svg`). Cùng style
handwriting, 7 vùng:

- header: `PAYDAY POT` + "day 6 — the app exists, and it starts covered" + "one command: pnpm demo:day6"
- bảng đếm test: `390 tests green` → 150 contract / 204 web app (9 file) / 36 real browser / +10 demo beat
- giữa: **4 khung màn hình** = 4 trạng thái — "nothing yet" (kèm chữ đỏ `not "you have 0"`),
  "yours, locked" (dot mask cyan + ổ khoá + "reveal my position"), "really zero" (số 0 highlight
  lime), và khung **dashed** "not read yet" = trạng thái thứ tư bị bỏ sót
- mũi tên cyan từ khung dashed xuống dòng kể bug thật do live drill tìm ra
- phải: note "two of my own tests were green while checking nothing"
- dưới trái: một chữ ký mở principal + time-weight, đồng hồ TTL, và hàng 5 cách đóng phiên
- dưới phải: panel soi storage (sessionStorage rỗng · localStorage 3 key `pdp.*` · không amount/handle/winner)
- đáy: `wrong network → a warning, not a wall` (lime) + note "dev deploy, chưa verify · relayer chỉ có trên testnet"

Không plaintext số tiền của ai, không vẽ winner. Số `0` duy nhất trong ảnh là ô
"really zero" — cố ý, vì cả ngày là về việc phân biệt nó với hai ô kia.

Render lại sau khi sửa SVG:

```bash
cd docs/social/images && { echo '<html><body style="margin:0;background:#F7F3E7">'; cat day-06.svg; echo '</body></html>'; } > _w.html && "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 --window-size=1600,900 --screenshot=day-06.png "file://$PWD/_w.html" && rm _w.html
```

Bẫy SVG đã gặp (day 4, vẫn còn hiệu lực): một `<path>` thẳng đứng/ngang **một
mình** trong `<g filter=...>` có bbox = 0 → filter region = 0 → mất hẳn khỏi ảnh.
Mũi tên trong ảnh này đều là path cong, và kim đồng hồ nằm ngoài group có filter.

Font phụ thuộc macOS (Marker Felt / Bradley Hand / Noteworthy). Dùng luôn PNG đã
commit, đừng re-render trên CI.
