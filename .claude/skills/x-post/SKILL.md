---
name: x-post
description: Draft build-in-public X (Twitter) posts for PayDay Pot in the user's native dev-builder voice — all-lowercase, specific, no marketing tone. Use when the user asks to post/tweet about progress, wants a day-N post, a thread, or asks to turn a handoff/commit range into social content.
---

# x-post — build-in-public posts for payday pot

Viết post X cho series build-in-public của PayDay Pot (Zama Developer Program S4).
Người đọc mục tiêu: dev khác + devrel/judge của Zama. Họ dị ứng marketing tone và
nhận ra ngay ai chưa từng chạm vào FHE thật.

## Bước 1 — lấy fact từ repo, không viết từ trí nhớ

Chạy trước khi draft (đọc, không đoán):

```bash
git log --oneline -25
ls docs/handoffs && cat docs/handoffs/DAY_0N_HANDOFF.md
cat docs/COMPATIBILITY_NOTES.md
sed -n '/^## Day N/,/^## Day/p' docs/EXECUTION_PLAN.md
cat deployments/sepolia.json
```

Từ đó rút ra, cho mỗi post, tối thiểu:
- **1 con số thật** (số test, HCU, kB, tx count, số check pass, block number)
- **1 chi tiết chỉ người build mới biết** (peer-dep conflict, tên function thật,
  quirk của SDK, tên contract impl thật)
- **1 quyết định + lý do** (chọn A thay B *vì* gì — kèm evidence)
- **1 việc chưa xong / chưa claim được** (đây là thứ tạo credibility, không phải
  thứ phải giấu)

Nếu một fact chưa verify (vd live decrypt chưa chạy trên Sepolia) → KHÔNG viết như
đã xong. Viết ở dạng "next" hoặc bỏ. Không bao giờ tự suy diễn trạng thái gate.

## Bước 2 — voice rules (hard)

### Độ dài & ngân sách jargon (user đã chốt: "đừng kĩ thuật quá, ngắn gọn nhưng không ngắn quá")

- Long post: **12–18 dòng**, 3 gạch đầu dòng là đủ. Không dồn 5 bullet.
- Thread: **4 post**, không 6–7. Mỗi post 1 ý, đọc hết trong 10 giây.
- Short post: ≤280, đếm bằng script.
- **Tối đa 2 tên kỹ thuật / post** (tên function, tên type, version number, tên
  contract). Mọi thứ khác dịch sang tiếng người:
  - `confidentialTransferAndCall` → "the path i picked hands the contract the exact
    amount that actually arrived, still encrypted"
  - `FHE.add trên euint64` → "add to it on-chain while it's still encrypted"
  - `negative ACL test` → "a test proving the other account cannot read my balance"
  - version pins / peer-dep conflict → thường **cắt hẳn** khỏi post, để trong docs
- Con số thì giữ (16/16, 11 tests, 33x) — số dễ hiểu và tạo tin. Tên API thì cắt.
- Chi tiết kỹ thuật sâu (HCU, tên impl contract, quirk list đầy đủ) → để dành post
  riêng cho audience dev, hoặc để trong reply khi có người hỏi.


- **all-lowercase**, kể cả đầu câu và "i". Ngoại lệ: tên riêng/ký hiệu code giữ
  nguyên case thật (`FHE.shr`, `ConfidentialWrapperV3`, `euint64`, `@zama_fhe`).
- Câu ngắn, xuống dòng nhiều. Dấu gạch đầu dòng `—` hoặc `-`, không bullet dài dòng.
- Viết như đang kể cho một dev khác trong DM: "spent the whole day killing every
  'i assume this works' in the stack" — không phải "today we made significant
  progress on foundational infrastructure".
- Được phép: chửi nhẹ vào công cụ ("this one silently wastes a day"), thừa nhận sai,
  nói thẳng cái gì fake/mock.
- Tối đa 1 emoji cho cả post, thường là 0. Không emoji đầu mỗi bullet.
- **Tag bắt buộc mỗi post standalone** (verify 19/08 từ trang announcement Season 4):
  `@zama_fhe` + `#ZamaDeveloperProgram`, đặt ở **dòng cuối**, đoạn riêng, KHÔNG mở đầu
  post bằng tag. Trong thread: post 1 và post cuối, không phải mọi post.
  Hashtag giữ camel-case gốc (ngoại lệ duy nhất của rule lowercase). Hashtag thêm tối đa
  1 cái: `#FHE`. Không chùm #web3 #crypto #airdrop.
  Chưa nói "submission" khi chưa submit → "building for the #ZamaDeveloperProgram".
  Tag chiếm ~40–48 ký tự → khi làm bản ≤280 phải trừ trước rồi mới viết body.
- Kết post bằng "day N+1: <việc cụ thể>", không bằng câu hô hào.

### Ban-list (nếu xuất hiện, viết lại)

`excited to announce` · `thrilled` · `game-changing` · `revolutionary` · `journey` ·
`let's build the future` · `stay tuned` · `deep dive into` · `leverage` · `seamless` ·
`unlock` · `🚀` · `gm` (trừ khi post đúng buổi sáng và ngắn) · mọi câu mô tả cảm xúc
mà không kèm fact · mọi câu bắt đầu bằng "In this thread, I will".

## Bước 3 — framing constraints của project (vi phạm là sai sự thật)

- Prize = **employer-funded sponsored yield**, và nói rõ `SponsoredPrize` là adapter
  interface thay được bằng real yield. Không để người khác tự phát hiện.
- **Không** dùng chữ "anonymous". Sản phẩm bảo mật amount/balance/TWAB/winnings;
  address + timing vẫn public → nói đúng như vậy.
- **Không** claim payroll integration / auto-payroll.
- Tên project không chứa "Zama". Zama chỉ ở dạng "built with" / tag.
- Không post plaintext số tiền thật của user nào; số trong demo là fake test value,
  ghi rõ là demo khi dễ nhầm.
- `randEuint64` hiện là PRNG mockup → nếu nói tới randomness thì phải nói kèm.

## Bước 4 — chọn archetype

| Archetype | Khi nào | Độ dài |
|---|---|---|
| **daily long post** | ngày có 3+ fact cứng | 12–18 dòng, 3 bullet + video |
| **short post** | ngày mỏng, hoặc muốn reach | ≤280 ký tự, 1 fact + video |
| **thread 4** | ngày có 1 chủ đề xuyên suốt | 4 post, ý mạnh nhất ở post 2 |
| **quirks/gotcha list** | vừa fix xong ≥5 lỗi DX của tool | 5 mục, 1–2 dòng/mục; phần còn lại để trong docs |
| **honesty post** | ngày yếu, hoặc trước submission | list "things i can't claim yet" |
| **demo post** | có video 1-lệnh chạy sạch | 3–5 dòng + video |

Mặc định output: **1 long post + 1 short variant + 1 thread + 1–2 spare**, để user
chọn theo mood/ngày. Đừng chỉ đưa 1 lựa chọn.

## Bước 5 — video / ảnh kèm

Nếu ngày đó có demo command (rule của repo: mỗi ngày 1 lệnh demo output sạch):
- ghi rõ lệnh, take nào quay gì, text overlay 3 dòng, độ dài 35–50s
- 16:9 cho terminal (9:16 không đọc được chữ trên timeline)
- không cắt dòng chứng minh privacy (vd `acl denied`) — đó là điểm ăn tiền
- ảnh build-in-public thì theo `docs/PAYDAY_POT_VISUAL_STYLE.md`

### Ảnh: pipeline đã dùng (day 2 trở đi)

Không có tool image-gen trong session → vẽ bằng **SVG tay** rồi rasterize:

1. `docs/social/images/day-NN.svg`, viewBox 1600×900. Giấy `#F7F3E7` + `feTurbulence`
   grain; nét đen qua filter `feDisplacementMap` (scale ~3) cho wobble; lime `#C6F04B`
   cho saving/principal; cyan `#0FB9D6` cho encrypted/onchain. Font macOS:
   `Marker Felt` (title) / `Bradley Hand` (label) / `Noteworthy` (note).
2. **1 ý chính + tối đa 5 câu label ngắn**. Encrypted value vẽ bằng dot/hatch mask,
   **không bao giờ số plaintext**. Chỉ vẽ feature đã tồn tại ngày đó.
   `built with ZAMA` nhỏ ở góc, luôn nhỏ hơn title `PAYDAY POT`.
3. Rasterize 2× (3200×1800) bằng headless Chrome — lệnh copy trong
   `docs/social/day-02-x-posts.md` §Ảnh minh hoạ. Commit cả `.svg` và `.png`.
4. Xem lại PNG bằng mắt trước khi đưa user: chữ đè nhau và chữ tràn khỏi canvas là
   lỗi hay gặp nhất (`text-anchor="end"` cho mọi label sát lề phải).

## Bước 6 — output

Ghi vào `docs/social/day-NN-x-posts.md` (tạo dir nếu chưa có), gồm: mỗi variant một
section copy-paste được, phần video, phần tag. In ra chat: post chính + short
variant, phần còn lại chỉ nói tên section + đường dẫn file.

## Self-check trước khi trả (chạy qua từng dòng)

1. Có chữ nào viết hoa đầu câu không? → sửa.
2. Có ban-list word nào không?
3. Mỗi post có ≥1 con số thật + ≥1 chi tiết insider chưa?
4. Có claim nào chưa verify trong repo không?
5. Có vi phạm framing (anonymous / payroll / real yield / tên project) không?
6. Short variant có thật sự ≤280 ký tự không? → đếm bằng script, đừng ước lượng.
7. Đếm tên kỹ thuật trong mỗi post — >2 thì dịch bớt sang tiếng người.
8. Long post có quá 18 dòng không? Thread có quá 4 post không? → cắt.
9. Đọc to lên: nghe giống dev thật đang kể, hay giống thông cáo báo chí?
