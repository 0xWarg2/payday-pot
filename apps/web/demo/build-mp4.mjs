/**
 * Dựng MP4 từ reel Playwright: chuẩn hoá từng clip .webm rồi nối theo thứ tự
 * beat. Phụ đề KHÔNG burn ở đây — nó đã được vẽ vào trang lúc quay (xem
 * `narrate.ts`), vì ffmpeg của máy này build không có libass. File .srt vẫn
 * được xuất kèm để ai muốn dựng lại/dịch thì có sẵn timing.
 *
 *   node demo/build-mp4.mjs   (chạy sau khi playwright xong; cần ffmpeg)
 *
 * Burn cứng chứ không đính soft-sub: file này đi vào bài nộp và được xem trên
 * máy người khác — phụ đề phải nằm trong pixel.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REEL = path.join(process.cwd(), "demo-results", "reel");
const OUT = path.join(process.cwd(), "demo-results", "payday-pot-day7.mp4");
const W = 1280;
const H = 720;

const manifest = path.join(REEL, "manifest.jsonl");
if (!fs.existsSync(manifest)) {
  console.error("Chưa có manifest — chạy `pnpm demo:day7:run` trước.");
  process.exit(1);
}

const clips = fs
  .readFileSync(manifest, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l))
  .sort((a, b) => a.order - b.order);

// cwd = REEL để list file concat và output nằm cạnh nhau, không phụ thuộc
// đường dẫn tuyệt đối (có dấu cách) khi ffmpeg parse.
const ff = (args) =>
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { cwd: REEL });


const parts = [];
for (const c of clips) {
  if (!c.video || !fs.existsSync(c.video)) {
    console.warn(`bỏ qua ${c.name}: không thấy video`);
    continue;
  }
  const out = path.join(REEL, `${c.name}.mp4`);
  const vf =
    `scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
    `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,fps=30`;
  ff(["-i", c.video, "-vf", vf, "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-pix_fmt", "yuv420p", "-an", out]);
  parts.push(out);
  console.log(`✓ ${c.name}.mp4`);
}

const listFile = path.join(REEL, "concat.txt");
fs.writeFileSync(listFile, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"));
ff(["-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", OUT]);

const mb = (fs.statSync(OUT).size / 1e6).toFixed(1);
const dur = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", OUT])
  .toString()
  .trim();
console.log(`\n▸ ${path.relative(process.cwd(), OUT)} — ${mb} MB, ${Math.round(Number(dur))}s`);
