# X posts — Day 1 (19/08/2026)

Voice: all-lowercase, câu ngắn, giọng dev kể cho dev. Ngân sách jargon: tối đa 2 tên
kỹ thuật / post, mọi thứ khác dịch sang tiếng người. Không buzzword. Không "anonymous".
Prize = employer-funded sponsored yield. Không claim payroll.

---

## A. Main post (kèm video) — bản chính

day 1 of building payday pot — a savings pool where your balance stays encrypted, and
each round one saver wins a prize funded by their employer.

no product code today. day 1 was for proving the stack actually works before i build
anything on top of it:

— checked the confidential usdc token on sepolia at runtime instead of trusting an
address from a doc. 16/16 checks pass, and i found a deny list on it that would have
looked like a random bug during the demo

— chose how deposits move money. the path i picked hands the contract the exact amount
that actually arrived, still encrypted. so it can never credit a number the user merely
asked for

— 11 tests green, two of them proving the *other* account cannot read my balance. an
encrypted app without that test is a claim, not a property

video: one command. encrypt 1000 in the browser → add to it on-chain while it's still
encrypted → decrypt back → second account gets blocked.

day 2: deposit, withdraw, and a test that nobody's money can quietly disappear.

building it on @zama_fhe fhevm for the #ZamaDeveloperProgram, posting every day until
it's done.

---

## B. Short variant (277 ký tự kể cả tag, đã đếm)

day 1 of payday pot — a savings pool where your balance stays encrypted and one saver
wins the prize each round.

no product code yet, just proving the stack: token verified on sepolia, deposits credit
only what arrived, 11 tests green.

@zama_fhe fhevm · #ZamaDeveloperProgram

> Copy: bỏ line-break giữa câu trong cùng đoạn (file wrap cho dễ đọc), giữ dòng trống
> giữa 3 đoạn. Video attach vào post nên không cần dòng "video:" — hết chỗ ký tự.

---

## B2. Dòng thêm — CHỈ post nếu live decrypt đã chạy thật (handoff còn ⬜)

Thêm vào post A, ngay trước dòng "day 2:":

— and it works live on sepolia, not just locally: encrypted in the browser, signed in
metamask, decrypted back to the same number. that round trip is the only reason day 1
existed.

Nếu chưa chạy, đổi dòng cuối post A thành:
"day 2 starts with the one thing day 1 didn't finish: the same round trip live on
sepolia with a funded wallet. then deposit and withdraw."

---

## C. Thread (4 post, video ở 1/4)

**1/4**
day 1 of payday pot: a savings pool where nobody can see your balance, and each round
one saver wins a prize funded by their employer.

9 days, built on @zama_fhe fhevm for the #ZamaDeveloperProgram.

rule i set for day 1 — write no product code until there's no guesswork left in the
stack. what that cost 👇

**2/4**
i don't trust addresses copied from docs, so i wrote a script that checks the
confidential usdc token on sepolia at runtime. 16/16 checks pass.

it also found a deny list on the token. now it's a documented limitation instead of a
random revert in front of judges.

**3/4**
then the important decision: how money enters the pool.

the path i picked gives the contract the exact amount that actually arrived, still
encrypted. so it can never credit what a user merely asked to deposit. and a rejected
deposit gets refunded whole, without an error message that leaks why.

**4/4**
11 tests green. two of them exist only to prove the other account cannot read my
balance.

video: one command — encrypt 1000, add to it on-chain while encrypted, decrypt back,
watch the second account get blocked.

day 2: deposit, withdraw, and a test that nobody's money disappears.

repo + daily log: <link> · @zama_fhe fhevm · #ZamaDeveloperProgram

---

## D. Post riêng — dev gotchas (post day 2 hoặc 3, không dồn vào day 1)

spent an afternoon getting zama's browser sdk to run inside a next.js production
build. five things that cost me the most, so you can skip them:

1. importing the bundle entry does nothing on its own — you have to load the umd file
first, before the app boots
2. the worker asks for its helper file from the site root, not from where your script
lives. so every sdk file goes in public/ root
3. you must pass the wasm paths explicitly, the defaults 404
4. it needs coop/coep headers, and you can only trust that in a production build — dev
mode will happily lie to you
5. don't let the sdk read the network from metamask. wallet on the wrong chain = a
confusing call exception. give it a fixed rpc, let the wallet only sign

none of these are hard once you know them. all of them are invisible before you do.

@zama_fhe #ZamaDeveloperProgram

(4 quirk còn lại — checksum address, kiểu number của timestamp, mime của .umd.cjs,
hardhat run không init mock — ở `docs/COMPATIBILITY_NOTES.md` §4, để dành reply nếu
có ai hỏi.)

---

## E. Spares

**E1 — demo rule**
one habit that made day 1 end clean: every day ships one command that prints its own
story. mine prints 5 lines — deploy, encrypt, decrypt, add, blocked. if i can't record
it in a single take, the day isn't done.

**E2 — honesty post (dùng khi ngày mỏng, hoặc trước submission)**
things i can't claim yet on payday pot:
— the prize is funded by an employer, not by real yield. the sponsor piece is an
interface, so a real yield source can drop in later without touching anyone's savings
— the randomness comes from the fhe stack's current mockup. good enough for a demo,
and it's going in the limitations doc and the video
— there's no payroll integration. it's a savings pot, that's it

saying it first beats someone finding it.

**E3 — teaser (giữ cho day 4)**
the draw math has one naive line that costs 33x more than it needs to. shifting instead
of dividing turns a draw that doesn't fit in a transaction into one that does. writing
it up when it's actually built.

---

## Video

- 35–50s, 16:9 (đừng 9:16 cho terminal), không cần voiceover.
- take 1: chạy `cd packages/contracts && pnpm demo`. Để nguyên 5 dòng output + `1 passing`.
  **Không cắt dòng acl denied** — đó là dòng ăn tiền.
- take 2 (nếu có): `/spike` trên production build → init → connect → encrypt → tx → decrypt.
- overlay 3 dòng: "day 1 — no product code, zero guesswork" / "added to an encrypted
  number on-chain" / "second account: blocked".

## Tag (đã verify 19/08)

- Handle: **`@zama_fhe`** (display name giờ là "@zama" nhưng handle vẫn là `zama_fhe`).
- Hashtag chính thức của program: **`#ZamaDeveloperProgram`** — trang announcement Season 4
  ghi rõ "encouraged to share their project on X by tagging @zama and using
  #ZamaDeveloperProgram". Đây là *encouraged*, không phải điều kiện eligibility, nhưng
  đây chính là cách devrel/judge tìm ra build log của mình → post nào cũng nên có.
- Ngoại lệ về lowercase: hashtag giữ camel-case gốc `#ZamaDeveloperProgram` (dễ đọc hơn
  và khớp cách program viết). Mọi chữ khác vẫn lowercase.
- Tag `@zama_fhe` **1 lần / post** (mỗi post standalone đều cần, vì reach của từng post
  độc lập). Trong thread thì đặt ở post 1 và post cuối, không phải mọi post.
- Thêm tối đa 1 hashtag nữa nếu muốn: `#FHE`. Không kèm chùm #web3 #crypto #airdrop.
- **Chưa dùng chữ "submission"** cho tới khi thật sự submit — day 1 nói "building for
  the #ZamaDeveloperProgram", không nói "my season 4 submission".
- Đặt tag ở **dòng cuối**, tách đoạn riêng. Đừng nhét `@zama_fhe` vào câu đầu — post mở
  bằng tag trông như shill, mở bằng "day 1 of building..." mới giống builder.
