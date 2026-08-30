/**
 * Narrator cho demo reel: mỗi dòng thuyết minh vừa in ra console vừa trở thành
 * một cue phụ đề, và cue đó GIỮ MÀN HÌNH đúng bằng thời gian nó cần để đọc.
 *
 * Chính chỗ "giữ màn hình" là lý do phụ đề khớp video mà không cần canh tay:
 * timestamp của cue = thời điểm nó được phát ra, độ dài = thời gian test đứng
 * chờ ngay sau đó. Không có bước align nào ở hậu kỳ.
 */

import fs from "node:fs";
import path from "node:path";
import type { Page, TestInfo } from "@playwright/test";

const REEL_DIR = path.join(process.cwd(), "demo-results", "reel");

type Cue = { at: number; ms: number; text: string };

/** Đọc chậm hơn nói: 1.2s cố định + 52ms mỗi ký tự, kẹp trong [1.9s, 6s]. */
const dwell = (text: string) => Math.min(6000, Math.max(1900, 1200 + text.length * 52));

const srtTime = (ms: number) => {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor(ms / 60_000) % 60;
  const s = Math.floor(ms / 1000) % 60;
  const f = Math.floor(ms) % 1000;
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(f, 3)}`;
};

export type Clip = {
  beat(n: number, text: string): Promise<void>;
  ok(text: string): Promise<void>;
  no(text: string): Promise<void>;
  info(text: string): Promise<void>;
  /** In ra console nhưng KHÔNG lên phụ đề — dùng cho dump dữ liệu thô. */
  raw(text: string): void;
  finish(): Promise<void>;
};

export function clip(page: Page, info: TestInfo, order: number, slug: string): Clip {
  const t0 = Date.now();
  const cues: Cue[] = [];

  const push = async (text: string, prefix: string) => {
    console.log(prefix + text);
    const ms = dwell(text);
    cues.push({ at: Date.now() - t0, ms, text });
    // Phụ đề vẽ THẲNG vào trang chứ không burn bằng ffmpeg: ffmpeg trên máy
    // này build không có libass/freetype, và làm cách này thì file .webm gốc
    // của Playwright đã có chữ sẵn — không phụ thuộc khâu hậu kỳ nào.
    await page.evaluate((t) => {
      const id = "pdp-demo-caption";
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement("div");
        el.id = id;
        el.setAttribute("aria-hidden", "true");
        el.style.cssText = [
          "position:fixed", "left:0", "right:0", "bottom:0", "z-index:2147483647",
          "padding:14px 28px", "background:rgba(9,12,20,.92)", "color:#fff",
          "font:500 17px/1.45 ui-sans-serif,system-ui,-apple-system,Helvetica,sans-serif",
          "text-align:center", "pointer-events:none", "white-space:pre-wrap",
          "border-top:2px solid #7c5cff",
        ].join(";");
        document.body.appendChild(el);
      }
      el.textContent = t;
      // Nuốt lỗi vẽ phụ đề thì đúng (một cue hỏng không đáng giết demo), nhưng
      // nuốt IM LẶNG thì sai: khi cửa sổ trình duyệt chết, lỗi thật rơi ở đây và
      // dòng tiếp theo chỉ báo được "target closed" — không nói được vì sao.
    }, text).catch((err: unknown) => {
      console.log(`   ⚠ caption not drawn: ${err instanceof Error ? err.message : String(err)}`);
    });
    await page.waitForTimeout(ms);
  };

  return {
    beat: (n, text) => push(`${n}. ${text}`, "\n"),
    ok: (text) => push(text, "   ✅ "),
    no: (text) => push(text, "   🔒 "),
    info: (text) => push(text, "   ▸ "),
    raw: (text) => console.log(text),
    async finish() {
      fs.mkdirSync(REEL_DIR, { recursive: true });
      // Kéo dài mỗi cue đến lúc cue sau bắt đầu: những khoảng chờ dài (mã hoá
      // 10s, đợi receipt) không được để màn hình trống chữ.
      const srt = cues
        .map((c, i) => {
          const next = cues[i + 1];
          const end = next ? Math.max(c.at + c.ms, next.at) : c.at + c.ms;
          return `${i + 1}\n${srtTime(c.at)} --> ${srtTime(end)}\n${c.text}\n`;
        })
        .join("\n");
      const name = `${String(order).padStart(2, "0")}-${slug}`;
      fs.writeFileSync(path.join(REEL_DIR, `${name}.srt`), srt, "utf8");
      // KHÔNG dùng `page.video().path()`: lúc test còn chạy nó trả về đường
      // dẫn artifact tạm, Playwright chỉ move file vào outputDir sau khi test
      // kết thúc. Ghi đích đến, không ghi chỗ tạm.
      const video = path.join(info.outputDir, "video.webm");
      fs.appendFileSync(
        path.join(REEL_DIR, "manifest.jsonl"),
        JSON.stringify({ order, name, video }) + "\n",
      );
    },
  };
}

/** Xoá manifest cũ trước mỗi lần chạy để reel không dính clip của lần trước. */
export function resetReel() {
  fs.rmSync(REEL_DIR, { recursive: true, force: true });
  fs.mkdirSync(REEL_DIR, { recursive: true });
}
