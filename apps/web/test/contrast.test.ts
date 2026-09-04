import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Hai lỗi màu không có triệu chứng nào ngoài "chỗ đó trống":
 *   1. token chữ phụ rơi dưới AA trên nền nó thực sự đứng;
 *   2. một component của shell (`text-fg` #121514) được render trong phòng tối
 *      (`draw-surface` #0b1a2a) — 1.05:1, đã xảy ra với `ConfidentialValue`
 *      hôm 04/09. Test này chặn cả hai bằng cách đọc thẳng globals.css và
 *      source của `components/draw`.
 */
const ROOT = join(__dirname, "..");
const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");

function token(name: string): string {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (!m?.[1]) throw new Error(`token --color-${name} not found or not a 6-digit hex`);
  return m[1];
}

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

const PAIRS: ReadonlyArray<[fg: string, bg: string, min: number]> = [
  ["fg", "canvas", 7],
  ["fg", "surface", 7],
  ["fg-muted", "canvas", 4.5],
  ["fg-muted", "surface", 4.5],
  ["fg-muted", "subtle", 4.5],
  ["draw-fg", "draw-canvas", 7],
  ["draw-fg", "draw-surface", 7],
  ["draw-fg-muted", "draw-surface", 4.5],
  ["draw-fg-muted", "draw-canvas", 4.5],
  ["draw-warning", "draw-surface", 4.5],
  ["on-action", "action", 4.5],
  // Viền/track phải nhìn thấy được trên nền nó nằm (non-text: 1.5:1 là ngưỡng thực dụng).
  ["draw-border-strong", "draw-surface", 1.5],
  ["border-default", "surface", 1.2],
];

describe("colour tokens keep AA on the surfaces they actually sit on", () => {
  it.each(PAIRS)("%s on %s ≥ %s:1", (fg, bg, min) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(min);
  });

  it("the Draw Room has no violet and no prize yellow", () => {
    expect(css).not.toMatch(/--color-draw-violet/);
    const drawDir = join(ROOT, "components/draw");
    for (const f of readdirSync(drawDir)) {
      const src = readFileSync(join(drawDir, f), "utf8");
      expect(src, f).not.toMatch(/draw-violet|\b(?:bg|text|border)-prize(?:-\w+)?\b/);
    }
  });
});

describe("shell-only tokens never leak into the dark room", () => {
  const drawDir = join(ROOT, "components/draw");
  const files = readdirSync(drawDir).filter((f) => f.endsWith(".tsx"));

  it.each(files)("%s uses draw-* text tokens only", (f) => {
    const src = readFileSync(join(drawDir, f), "utf8");
    // Bỏ comment: chúng có quyền nhắc tên token shell để giải thích vì sao không dùng.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code, `${f} uses a shell text token`).not.toMatch(/\btext-fg(?:-muted)?\b|\bbg-surface\b|\bborder-warning\b/);
  });

  it.each(files)("%s passes surface=\"draw\" to every ConfidentialValue / RevealPhaseLine", (f) => {
    const src = readFileSync(join(drawDir, f), "utf8");
    for (const line of src.split("\n")) {
      if (/<(ConfidentialValue|RevealPhaseLine)\b/.test(line)) {
        expect(line, `${f}: ${line.trim()}`).toMatch(/surface="draw"/);
      }
    }
  });
});
