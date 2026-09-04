# UI Depth Direction — "3D" cho PayDay Pot hợp màu Zama

Research 03/09/2026. Bản đầy đủ có demo sống: artifact "PayDay Pot Depth Kit"
(https://claude.ai/code/artifact/81a55ae9-1ebb-47cd-921f-8c0170b83d79).
Mục đích: sửa UI/UX `apps/web` sau Day 9 mà không thêm dependency, không phá
e2e, không vi phạm §14/§15 của IMPLEMENTATION_PLAN.

## Kết luận

- Zama.org không dùng 3D bóng loáng. Hero là canvas "soft light" vàng mờ
  chuyển động chậm; còn lại là typographic, bento, khối đen cho code.
- Đo trực tiếp CSS zama.org: `--zama-yellow #ffd208`, `#ffe052`, `#fff2b5`,
  `#fffbe6`; text `#000`/`#2e2e2e`; canvas `#f8f8f2`/`#f2efec`; accent phụ
  lime `#abe338`, cyan `#00e0e0`, cam `#f5ab35`, lavender `#dcc6e0`.
  Font Telegraf (trả phí) — không bắt chước; giữ Geist/Inter.
- Lime/cyan phụ của Zama ≈ chartreuse `#c8f24a` / privacy `#31d8ff` của ta
  → hai palette tương thích sẵn. Chỉ cần thêm **vàng = prize/sponsor**.
- Hướng "3D" đúng: depth bằng ánh sáng và lớp (soft-light glow, spotlight,
  tilt nhẹ, sphere glass), CSS-only, compositor-only. Không WebGL.

## Token đề xuất thêm vào `apps/web/app/globals.css`

```css
--color-prize: #ffd208;        /* số prize, badge Sponsored */
--color-prize-mid: #ffe052;    /* hero glow layer */
--color-prize-light: #fff2b5;  /* hero glow layer */
--color-prize-soft: #fffbe6;   /* tinted card bg */
```

Quy tắc: vàng chỉ đứng ở chỗ nói về tiền thưởng; không bao giờ làm nút
(nút vàng = nút Zama). Chartreuse giữ độc quyền action, cyan giữ độc quyền
encrypted. Spotlight card encrypted = cyan, card prize/public = vàng.

## Catalog (chi tiết + code trong artifact)

| # | Effect | Chỗ áp dụng | Tier |
|---|---|---|---|
| 01 | Soft-light glow: 4 blob radial-gradient blur tĩnh, animate `transform` | `Hero.tsx` (bọc container radius 24; h1/copy giữ nguyên) | A |
| 02 | Spotlight border theo chuột, hue theo `data-spot="privacy|prize"` | `Card.tsx` + 4 dashboard card, 2 card PrivacyComparison | A |
| 03 | Tilt 3D ≤6° + `translateZ` layers, chỉ 1 card/màn | `PrivatePositionCard` | B |
| 04 | Decrypt reveal: dots → phase → scramble glyph 500ms → số + thanh TTL | `ConfidentialValue.tsx`, `SealedResultCard` | A |
| 05 | Orb khối cầu: 4 radial-gradient + inset shadow, ring conic-gradient; props không đổi, vẫn tĩnh | `EncryptedDrawOrb.tsx` | A |
| 06 | Scroll-driven reveal `animation-timeline: view()` trong `@supports` | `HowItWorks.tsx` | B |
| 07 | Bento hierarchy dashboard (`grid-column: span`) | `app/(shell)/app/page.tsx` | B |
| — | Mono cho badge/address/countdown | `Card.tsx`, `DrawSurface.tsx` | A |

Tier A ≈ 3–4h, chỉ thêm CSS + 1 hook 20 dòng, không đổi DOM e2e đang pin.
Thứ tự: hero → spotlight → orb → scramble (scramble đụng `ConfidentialValue`,
chạy `privacy.spec.ts` ngay sau). Tier B để branch sau submit.

## Trạng thái — Tier A đã áp dụng (03/09/2026, branch `dev`)

- Token `--color-prize{,-mid,-light,-soft}` + `@layer components` depth kit
  (`.glow-field`, `.spot`, `.scrambling`, `.orb-ring`, `.orb-sphere`) trong
  `apps/web/app/globals.css`. Reduced-motion tắt hẳn loop glow.
- `components/ui/Spotlight.tsx` (client, pointer → CSS vars; bỏ qua khi
  `hover: none` hoặc reduced-motion). `Card` nhận `spot="privacy|prize|neutral"`.
  Badge đổi sang mono 11px; thêm `PrizeBadge` ("Sponsored").
- `Hero.tsx`: bọc container glow, vàng chỉ ở góc trên-phải (text luôn trên
  cream); thêm pill "Prize sponsored by your employer". `<h1>` giữ nguyên.
- `EncryptedDrawOrb.tsx`: div sphere + conic ring, chữ ký/aria không đổi.
- `ConfidentialValue.tsx`: scramble 500ms chỉ khi hidden → revealed, glyph
  hình học (không chữ số), giữ `.`/`,`; reduced-motion hiện ngay.
- Dashboard: Position/TWAB `spot="privacy"`, NextDraw/EmployerBoost
  `spot="prize"`; countdown mono. PrivacyComparison 2 card dùng Spotlight.
- Kiểm: `tsc` sạch, vitest 288/288, e2e smoke+shell+privacy xanh trên
  `localhost:3001` (một fail flaky của focus-ring là nút dev overlay của Next,
  không có trong prod build).
- ~~Tier B chưa làm~~ → xem mục dưới.

## Trạng thái — Tier B đã áp dụng (04/09/2026, branch `dev`)

Đi cùng đợt cắt chữ (landing / `/app` / Draw Room) và mục `/docs` kiểu
docs.pooltogether.com (sidebar trái theo nhóm, cột 720px, "On this page",
prev/next; 7 trang, content là TSX typed trong `lib/docs/content/*`, không MDX
vì lockfile đóng). Chi tiết dài rời landing về docs; landing import lại đúng
chuỗi từ content nên không có bản chép tay thứ hai.

- **03 Tilt**: `components/ui/Tilt.tsx` (cùng mẫu Spotlight; pointer → `--rx/--ry`
  ≤ 6°, `pointerleave` thêm `.is-resting`), áp đúng 1 card/màn:
  `PrivatePositionCard`. Không áp `SealedResultCard` — Draw Room giữ tĩnh.
- **07 Bento có tầng**: `/app` grid 12 cột (Position 5 / NextDraw 7 · TWAB 4 /
  QuickActions 8 · EmployerBoost 12 · Activity 12) sau khi bỏ
  `PaydayReminderCard` (thuần văn); `.elev-1/.elev-2` shadow hai lớp
  `color-mix(fg)`, hover nâng 2px chỉ dưới `(hover: hover)`.
- **06 Scroll reveal**: `.reveal` trong `@supports (animation-timeline: view())`,
  `rise-in` (translateY 24px · rotateX 4° · opacity .2 → identity), range
  `entry 0% → 40%`, không JS. Áp 4 section landing + `cards` block trong docs.
  Trình duyệt không hỗ trợ → hiện tĩnh. (Screenshot `fullPage` của Playwright
  chụp phần dưới màn ở trạng thái mờ — là scroll-timeline chưa chạy, không phải
  bug.)
- **Hero coin**: `components/landing/HeroCoin.tsx`, `aria-hidden`, `hidden
  sm:block`: đĩa `.coin` dày 22px = 2 mặt ở ±11px + **22 lớp `.coin-edge`
  cách 1px** trong `preserve-3d`, mặt gradient prize-mid → prize, ký tự "¢",
  `coin-spin` 14s + bóng `coin-shadow`. Vàng chỉ ở object này và glow.
  Ba bài học đo bằng screenshot từng pha (pause `document.getAnimations()`):
  `backface-visibility: hidden` chỉ được đặt trên **hai mặt**, không trên rìa —
  đặt trên rìa thì nửa vòng 90°→270° mất hết độ dày, thành "7 giây phẳng";
  rìa cách 2px ra vài sợi chỉ, 1.5px ra sọc moiré, 1px mới thành vành đặc;
  và đổi thứ tự `rotateX`/`rotateY` không tránh được hai lần đúng 90° mỗi
  vòng (xu thật cũng có), chỉ còn cách cho vành đủ dày để lúc đó vẫn có hình.
- Kiểm 04/09: `tsc` sạch, vitest **303/303** (thêm `test/docs.test.tsx` — slug/
  href unique, anchor `known-limitations#{yield,privacy,decryption,unwrap,draw,
  caps,testnet}`, prev/next phủ hết, mỗi trang render h1 + TOC, luật anonymity
  dùng chung `test/helpers/anonymity.ts`, drift gate `POOL_PARAMETERS` vs
  `deployment.note`), e2e **96 pass / 6 skip** qua webServer `.next-e2e` (thêm 6
  route docs vào render loop, 3 vào overflow 320px, anchor `#unwrap`, sidebar
  `aria-current`). Reduced-motion đo bằng `document.getAnimations()`: **0**
  animation chạy, coin `animation-name: none`, tilt giữ `0deg` sau pointermove.
  Console 0 lỗi trên 5 route.

## Ràng buộc bắt buộc

- `prefers-reduced-motion`: glow tĩnh, tilt/spotlight tắt, scramble nhảy thẳng.
- `(hover: none)`: không gắn listener tilt/spotlight.
- Scramble dùng glyph ngẫu nhiên (▪▫◆◇…), không bao giờ lộ digit đúng trước
  khi xong; ẩn lại là tức thời; winner và loser chạy y hệt (§14.5).
- Orb/spotlight chỉ nhận dữ liệu public (`phase`, `progress`).
- Không vàng trong Draw Room (gợi ý kết quả).

## Không làm

Three.js/Spline hero (800kB–2MB JS, fail CWV; app đã tải relayer WASM);
`backdrop-filter` ngoài header (−15–30% FPS Android tầm trung); neon/Matrix
cipher (visual style guide cấm); bất kỳ motion khác nhau giữa winner/loser.

## Nguồn

- zama.org — đo CSS vars/font/canvas 03/09/2026
- dev.to/studiomeyer_io — Web Design Trends 2026: What Actually Held Up
- writeupcafe.com — Top Web3 Design Trends 2026
- ibelick.com — Modern spotlight effect with React and CSS
- ui.aceternity.com — 3D Card Effect, Glowing Effect (tham chiếu, không cài)
- MDN + joshwcomeau.com — Scroll-driven animations
- effect-labs.com — Pure CSS gradient mesh / aurora backgrounds
- typewolf.com/telegraf — font Zama

### Đợt cắt chữ thứ hai + hiệu ứng chữ hero (04/09/2026, chiều)

User phản hồi landing và `/app` vẫn nhiều chữ. Đo bằng `innerText` của `main`:

| Trang | Trước | Sau |
|---|---|---|
| `/` | 306 từ | 250 từ |
| `/app` | 235 từ | 128 từ |

- **Landing**: `STEPS`/`PROMISES` có thêm `label` (1–3 từ) cho landing; docs vẫn dùng
  `title` + `body`. Lead hero còn một câu, fine print còn "Testnet · test money only",
  caveat yield có bản một dòng `YIELD_CAVEAT_SHORT` (vẫn chứa "sponsored").
  `NOT_ANONYMOUS` và hai cột Encrypted/Public giữ nguyên (test pin).
- **Dashboard**: bỏ câu dẫn dưới h1 (badge Encrypted/Public trên thẻ + footer đã nói);
  bỏ `hint` ở Position/Round/Actions; nhãn còn 1–3 từ; EmployerBoost chỉ còn tiêu đề
  "Prize sponsor" + link docs + dl; `PHASE_LABEL` rút còn "Open — deposits still count"
  (dùng chung với Draw Room). Mọi chuỗi test pin còn nguyên.
- **Hiệu ứng chữ hero** (`.hero-in`, `--n`): pill → tên → ba dòng lời hứa từng dòng →
  câu dẫn → nút → fine print, 700ms, lệch 90ms/bậc, chỉ opacity + translateY, chạy
  một lần khi tải. Reduced-motion: `animation: none`. Không thêm hiệu ứng lặp nào.
- Gate: typecheck sạch, vitest 303/303, e2e smoke/shell/privacy/draw/savings 88 pass
  (6 skip) vào dev server; reduced-motion 0 animation chạy; console 0 lỗi.

## Đợt 3 — màu, chữ, phòng tối, lịch sử từ chain, Docs có hình (04/09/2026, sáng)

Làm theo quy trình của skill `frontend-design` (token plan → critique → build →
critique lại bằng screenshot). Mọi thứ nằm trên `dev`, chưa commit.

### Token plan

| Nhóm | Quyết định |
|---|---|
| Màu shell | `fg-muted` #66706c → **#5d6863** (≥4.6:1 trên `subtle`); thêm `fg-soft` #8a938f chỉ cho chữ ≥17px; `warning-fg` cho chữ warning. Badge Encrypted/Public một cặp chuẩn: nền `privacy-subtle`/`subtle`, chữ `fg`, chấm màu — không còn chữ cyan trên trắng (1.69:1). |
| Màu phòng tối | Xoá `draw-violet`. Thêm `draw-warning` #e0a84a (≈9:1), `draw-border-strong` #27435f; `draw-border` #193047 → #1e3650. Orb chỉ còn một lớp cyan + specular. |
| Chữ | Geist + Geist Mono qua `next/font/google` (self-host, không thêm dependency, build production đã chạy qua Playwright webServer). Thang `--text-caption/small/body/lead/h3/h2/h1/display` 12→52px trong `@theme`. |
| Hiệu ứng | `.enter` (500ms, lệch 60ms theo `--n`) cho 6 ô bento `/app` và h1; `.hero-in` giữ cho landing; `DrawCard` chỉ fade 300ms; `.reveal` (scroll-driven `view()`) cho card/figure docs. Reduced-motion: `animation: none` — đo 0 animation chạy trên cả 6 route. |

### Luật hue trong phòng tối (ghi cả trong comment `@theme`)

cyan **chỉ** nghĩa là "encrypted" (badge, orb). Tiến độ và trạng thái mốc dùng
trung tính (`draw-fg`, `draw-fg-muted`, `draw-border*`). Cảnh báo dùng
`draw-warning`. Không tím, không vàng prize.

### Bug 1.05:1 và cách chặn

`ConfidentialValue` dùng `text-fg` (#121514) trên `draw-surface` (#0b1a2a) —
giá trị ẩn/đã mở trong phòng tối gần như vô hình, không có triệu chứng ngoài
"chỗ đó trống". Sửa: prop `surface="draw"` (hằng, DOM winner/loser vẫn bằng nhau)
ở `PrivateEntryCard`/`SealedResultCard`, `RevealPhaseLine` cùng prop.
Chặn tái phát bằng `test/contrast.test.ts`: parse `@theme`, tính WCAG cho các cặp
token thật sự nằm cạnh nhau; grep `components/draw/**` không được chứa
`text-fg`/`text-fg-muted`/`bg-surface`; mọi dòng `<ConfidentialValue`/`<RevealPhaseLine`
trong `components/draw` phải có `surface="draw"`; phòng tối không có violet/prize.

### Lịch sử giao dịch đọc từ chain

Trước đây lịch sử chỉ là `pdp.tx.v1` của trình duyệt này (đổi máy là mất).
Giờ `lib/tx/chain-history.ts` quét 4 event `Registered/Deposited/Withdrawn/PrizeClaimed`
(không event nào mang amount) theo `topics[1] = ví`, chunk 40k block, incremental
từ `scannedTo − 12`, đổi ví/chain thì reset đồng bộ. `mergeHistory` gộp hàng
local và hàng chain theo `txHash` (Registered+Deposited cùng tx → một hàng
"Deposited"); hàng local hiện ở **mọi** trạng thái chain. `HistoryList` dùng
chung cho `/app` và `/app/savings#history`, trạng thái loading/unavailable không
bao giờ nói "Nothing yet" khi chưa biết; unavailable giữ dữ liệu cũ + "Try again"
+ link explorer. Không ghi thêm gì vào storage (privacy.test pin 3 key, 5 field).

### Docs có hình + Get started + cắt chữ onboarding

- Block `figure` trong `DocBlock` (never-guard ở switch). 6 hình SVG vẽ trong code
  (`components/docs/figures/*`): `setup-path`, `round-lifecycle`, `encrypted-vs-public`,
  `prize-source`, `who-can-decrypt`, `draw-scan`. Màu chỉ qua CSS var, `stroke-width`
  1.5, `role="img"` + `<title>` + `aria-describedby` → figcaption, không `height`.
  `test/docs-figures.test.tsx` pin tất cả, kể cả "không hex" và no-anonymity.
- Trang `/docs/get-started` ("Get set up in two minutes"): 5 bước gọi đúng tên nút
  trong app, callout "The one public number", bảng "If something breaks".
- Onboarding 8 bước: mỗi bước còn heading + ≤1 câu + `Guide →` về docs
  (`components/onboarding/GuideLink.tsx`); giữ nguyên hai cột Consent, câu "does
  not make you anonymous", `ShieldWarning`, mọi nút/label test pin. Bước 1 đo
  81 từ kể cả stepper và footer.

### Số đo sau đợt 3 (innerText của `main`, 1280px)

| Trang | Từ |
|---|---|
| `/` | 250 |
| `/app` | 156 (+28 so với đợt 2: hai câu trạng thái của lịch sử chain) |
| `/app/draws/current` | 177 |
| `/onboarding` bước 1 | 81 |
| `/docs/get-started` | 525 — chữ đi về đây là cố ý |

Gate: typecheck sạch; vitest **359/359** (20 file); Playwright **full qua webServer
build production: 100 pass / 6 skip**; console 0 lỗi trên 6 route ở 1280 và 320;
reduced-motion 0 animation. Một test e2e (`savings.spec.ts` employer) có race
hydrate trong chính test — sửa bằng `waitFor` nút gate hoặc notice, không đổi app.

Screenshot full-page của docs cho thấy card `.reveal` dưới màn hình còn mờ — đó
là scroll-driven animation chưa vào viewport trong ảnh, không phải bug; cuộn
thật là hiện.

Thêm sau gate: e2e `history.spec.ts` — chặn đúng một lời gọi `eth_getLogs`
(topics[0] là mảng 4 event, topics[1] là ví test) trả một log `Deposited` bịa;
`/app/savings#history` hiện hàng "Deposited · Confirmed · round 3" với link hash,
không chữ USDC, và `pdp.tx.v1` vẫn `null` — nguồn chỉ có thể là chain.

Chưa làm: đi qua các page bằng ví thật trong Chrome (extension "Claude in
Chrome" chưa kết nối).

## Đợt 4 — chữ chuyển động "sinh động vừa" toàn app (04/09/2026, sáng)

Yêu cầu: chữ trong component hiện ra sinh động hơn, không chỉ Hero. Chốt mức
**vừa**: heading tách từ nhô lên theo bậc, lead mờ vào, số public đếm lên khi
vào view, badge mono "gõ" từng ký tự, gạch chân link tự vẽ. Chạy **một lần**
khi vào view; Draw Room bản êm (chỉ mờ, không dịch); kết quả draw và mọi giá
trị confidential không đổi một byte.

### Primitive (`components/motion/`, `lib/motion/`)

| Tên | Loại | Làm gì |
|---|---|---|
| `Words` | server | tách theo khoảng trắng → `<span class="word" style="--n:i">`, giữ text node `" "` giữa các từ nên `textContent`/accessible name = câu gốc |
| `Typed` | server | `<span class="typed" style="--ch:n">` — `clip-path` với `steps(n)`, mono nên mỗi bậc đúng 1 ký tự; không đổi layout |
| `InView` | client | `createElement(as)` + `data-in` `false→true` khi element vào viewport (IO once, `rootMargin -12%`); server HTML không có attr ⇒ progressive |
| `CountUp` | client | số **public** đếm 700ms easeOutCubic từ 0, format lại mỗi frame; SSR/jsdom/reduce/xong = **một text node** số cuối; khi đếm có `aria-hidden` + `.sr-only` số cuối; `value === 0` không đếm |
| `.link-draw` | CSS | gạch chân bằng gradient background, vẽ vào 1 lần, hover dày 2px |

Token: `--duration-enter 500ms`, `--duration-words 600ms`, `--stagger-word
40ms`, `--stagger-item 60ms`. Class: `.word`, `.words-quiet` (Draw: `--word-y:
0`), `.fade`, `.in-item`, `.typed`, `.link-draw`; `[data-in="false"]` giữ con
ẩn tới khi `InView` bật. Tên không chứa "revealed" (privacy.spec SSR check).

### Chốt cắm (ít diff, phủ rộng)

- `CardHeader` title `Words` + hint `fade`; ba badge `Typed` ⇒ phủ 6 card
  `/app`, PrivacyComparison, DocBlocks compare.
- Landing 4 section: `.reveal` → `<InView as="section">`; h2 `Words`; item
  `in-item --n`; caveat `fade`; số bước `Typed`; link `link-draw`. Hero giữ.
- `/app`: h1 `Words`; `NextDrawCard` prize + savers `CountUp` (countdown
  giữ); `EmployerBoostCard` funded `CountUp`; `QuickActions` 3 hàng bậc.
- Draw Room: h1 `words-quiet`, prize `CountUp`, thanh phase `transition-[width]`.
  Không đụng `SealedResultCard`/`PrivateEntryCard`/progress "X of Y".
- Onboarding: h1 `key={step}` + `Words`; focus vẫn về H1 sau Continue (đo).
- Docs: h1 `Words`, summary `fade`, mỗi section `InView` + h2 `Words`, số bước `Typed`.

### Luật

- **Confidential không bao giờ đếm**: `test/motion.test.tsx` chặn import
  `CountUp` ở `ConfidentialValue`, `SealedResultCard`, `PrivateEntryCard`,
  `PrivatePositionCard`, `TwabCard`. `TwabCard` average (sau decrypt) cũng
  không đếm — nhịp chữ số lộ độ lớn.
- Reduced motion: mọi class mới `animation: none`, `[data-in="false"]` opacity
  1, `CountUp`/`useInView` bail khi `matchMedia(reduce)`/không IO/không rAF.
  Test đọc thẳng globals.css để chặn quên.

Gate: typecheck sạch; vitest **368/368** (21 file, `motion.test.tsx` mới);
Playwright **101 pass / 6 skip** vào `localhost:3001`; script 5 route × 1280/320
× motion/reduce: không element chữ nào trong viewport còn mờ sau 1.6s, reduce ⇒
0 animation chạy, không tràn ngang ở 320, Draw h1 `--word-y: 0px`, 0 console error.
