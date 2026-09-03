# day 9 — x posts (rc lên sepolia, và một cái retry chưa bao giờ có tác dụng)

Fact base (đo lại 03/09, không lấy từ handoff):

- `517 tests green` = **150** contract (20s) + **288** web unit (15 files, 8.8s)
  + **79** browser xanh / 1 skipped
- RC: `0x792c77D9A2052ED03aaB6B392364c3e17f52a035`, epoch **3600s**, prize
  **50 USDC** employer-funded, verified ở Blockscout `#code` **và** Sourcify
  (`creationMatch=match runtimeMatch=match`)
- epoch #2 chạy bằng **2 ví**: ví A `beginSnapshot` + `snapshotBatch` (dừng ở
  cursor **1/2**, giữa lượt quét), ví B `snapshotBatch` → `requestRandom` →
  `selectBatch` → Settled. Ví B không phải keeper, không phải owner, chỉ có ETH.
  5 tx, RUNBOOK §8
- reveal: 3 POST cùng body → **cùng một `requestId`**
  `7dab9f00-d7ad-4c86-b633-d675431f9ac7` → cùng một câu trả lời hỏng
  (`Gao decoding failure … n=13, deg=4, #shares=9`)
- đo bằng `kms-probe.ts` trong **Node**: cùng thời điểm, `[pendingPrize]` và
  `[pendingPrize, principal]` xong 3/3 trong khi `[principal]`, `[twab]`,
  `[principal,twab]`, `[cả ba]` hỏng 3/3. Nửa giờ trước thì ngược lại
- tập handle **không** nằm trong payload EIP-712 → tách batch không sinh chữ ký
  thứ hai
- vercel: **4 deployment fail, 4 nguyên nhân khác nhau**; một deployment fail vẫn
  trả **HTTP 200**
- ma trận lỗi vẫn 14/15. R1 không đổi

⚠️ Đừng viết "anonymous". Address và timing vẫn public.

---

## A — post chính (daily long post)

day 9 of payday pot: it's live on sepolia, and the most useful thing i found today was a piece of my own code that had never done anything.

when you open your own encrypted balance, the key is split across a threshold of servers. today the service kept saying "done" and then the reassembly failed. i had a retry for exactly this — three attempts, patient, sensible. all three died at the identical spot, down to the same numbers.

then i read the network trace. three identical requests came back with the *same request id*. i wasn't retrying. i was asking a question that already had a broken answer cached.

what does change the outcome is which values you ask for together. at one moment, asking for two of my numbers worked and asking for one of them alone failed. half an hour later it was the other way round. so the fix isn't patience, it's asking differently: try the batch, and if it fails, ask for each value on its own. that costs nothing — the signature you already gave doesn't cover which values you ask for, so there's no second wallet popup.

sometimes you get two of three. the third one stays closed, and the card says which one. it never quietly becomes 0.

the round itself ran live twice today. the second one i broke on purpose: stopped the draw halfway through counting, then finished it from a different wallet that has no role and no permission — just enough eth for gas. it read where the last one stopped and carried on. nothing ran twice.

517 tests green: 150 contract, 288 web app, 79 in a real browser.

@zama #ZamaDeveloperProgram

---

## B — short variant (280 ký tự kể cả tag — đếm bằng script)

day 9 of payday pot. my retry for a flaky decryption never worked: three identical requests came back with the same request id, so i was re-reading a cached failure. asking for the values in a different grouping fixes it. live on sepolia now.

@zama #ZamaDeveloperProgram

---

## C — thread 4

**1/**
day 9 of payday pot: live on sepolia. verified source, real prize, a round that already ran twice.

and one bug worth the whole day — in code that was supposed to be the safety net.

@zama #ZamaDeveloperProgram

**2/**
opening your own encrypted balance needs several servers to each hand back a share. today the service said "done" and the reassembly failed.

i had a retry. three attempts, all dead at the identical spot.

the trace said why: three identical requests, one shared request id. i wasn't retrying — i was re-reading a cached failure.

**3/**
what actually changes the outcome is *which values you ask for together*.

same minute: asking for two of my numbers worked, asking for one alone failed. thirty minutes later, reversed.

so: try them together, and on failure ask one at a time. free — the signature doesn't cover which values you ask for, so no second popup.

**4/**
get two of three back? the third stays closed and the screen names it. it never quietly turns into 0.

i also stopped a live draw halfway through counting and finished it from an unrelated wallet — no role, no permission, just gas. it read where the last one stopped and carried on.

517 tests green.

#ZamaDeveloperProgram

---

## D — dev gotcha (bài kỹ thuật, cho dev đọc)

day 9 of payday pot, two lessons about believing your own tooling.

**1. a retry that repeats the exact same request may not be a retry.** three identical posts came back with one shared request id, so my three "attempts" were one attempt read three times. the loop looked like defensive engineering and was occupying the space where a real fix should have been. that's the dangerous kind of code — not broken, just decorative.

**2. a failed deployment can still answer HTTP 200.** vercel serves its own "deployment has failed" page on every path. `curl -w %{http_code}` says 200 and you write "the site is up" in your notes. i now check three things per route: the status, that the `<title>` is mine, and that the cross-origin isolation headers are there — the last one catches both a broken deploy and a deploy that would load but never decrypt.

bonus, same day: a build log that ends in "Build Completed" while the platform refuses to serve the result because the framework version has a CVE.

@zama #ZamaDeveloperProgram

---

## E — spares

**E1 (short, the permissionless draw)**
i stopped a live draw halfway through counting, then finished it from a wallet with no role, no permission and no relationship to the pool — just enough eth for gas. it read the on-chain cursor, saw where the last one stopped, and carried on. nothing ran twice, and the random seed was still drawn exactly once.

that's the difference between "permissionless" as a claim and as a transaction hash.

@zama #ZamaDeveloperProgram

**E2 (short, never zero)**
if the app can't open one of your encrypted numbers, it says so and leaves the space closed.

it does not show 0. a zero is a number, and it's the one number that would be a lie.

@zama #ZamaDeveloperProgram

**E3 (short, the honest correction)**
last week i wrote in my notes that this decryption "can't run outside a browser" and moved on. today i ran it outside a browser and it worked.

the old note was a reasonable conclusion from everything i had at the time, and it was wrong. so it now sits in the file struck through, next to what replaced it. deleting it would hide the shape of the mistake.

@zama #ZamaDeveloperProgram

---

## Video

Chưa quay reel Day 9. Reel Day 8 vẫn dùng được (`apps/web/demo-reels/payday-pot-day8.mp4`,
4m08s / 3.20 MB). Nếu quay Day 9 thì bắt buộc: `node demo/build-mp4.mjs day9` —
truyền tham số ngày, chạy trống sẽ đè reel cũ.

Nếu chỉ quay được **một** cảnh cho video nộp bài: hai ví chạy chung một vòng
draw. Nó là dòng exit gate nặng nhất và là thứ duy nhất không diễn được bằng
lời.

---

## Tag

Dòng cuối, đoạn riêng: `@zama #ZamaDeveloperProgram` (thêm `#FHE` nếu muốn).
