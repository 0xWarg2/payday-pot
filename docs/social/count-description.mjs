#!/usr/bin/env node
/**
 * Đếm ký tự cho field `Description` của form nộp bài — **max 140**.
 *
 * Vì sao cần một script cho một việc mà mắt làm được: form nộp bài **single-shot,
 * không sửa được sau khi submit**, và 140 là hard limit của nó. Đếm bằng mắt rồi
 * dán vào lúc 18:00 ngày freeze là đúng cái tình huống mà một câu bị cắt mất
 * nửa sau. Ngoài ra `String.length` đếm UTF-16 code unit — một emoji ngoài BMP
 * tính là 2, nên script in cả grapheme count để không tranh luận với form.
 *
 *   node docs/social/count-description.mjs
 *   node docs/social/count-description.mjs "câu thử tại chỗ"
 */
const LIMIT = 140;

const CANDIDATES = [
  "A no-loss prize savings pool where your balance, your odds, and your winnings are encrypted on-chain. Withdraw anytime.",
  "No-loss prize savings on FHEVM: deposit USDC, keep a shot at a sponsored prize, and nobody can read your balance — not even us.",
  "Prize savings where the amounts stay private. Deposit USDC, withdraw anytime, win a sponsored prize without revealing what you hold.",
  "Confidential prize savings: your deposit, your draw weight, and your winnings are encrypted on-chain. Withdraw all, in any phase.",
];

const graphemes = (s) => [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(s)].length;

const rows = (process.argv[2] ? [process.argv[2]] : CANDIDATES).map((text, i) => ({
  i,
  utf16: text.length,
  graphemes: graphemes(text),
  ok: text.length <= LIMIT,
  text,
}));

for (const r of rows) {
  const mark = r.ok ? "✓" : "✗";
  console.log(`\n${mark} #${r.i}  ${r.utf16}/${LIMIT} utf16 · ${r.graphemes} graphemes`);
  console.log(`   ${r.text}`);
  if (!r.ok) console.log(`   ↑ quá ${r.utf16 - LIMIT} ký tự — cắt trước khi dán.`);
}

const fits = rows.filter((r) => r.ok);
console.log(`\n${fits.length}/${rows.length} vừa. Dài nhất còn vừa: #${fits.at(-1)?.i ?? "—"}\n`);
