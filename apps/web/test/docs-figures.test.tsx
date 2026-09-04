/**
 * Hình vẽ trong Docs — kiểm như một bộ quy tắc, không kiểm từng pixel:
 *   - mỗi id trong FIGURE_IDS render ra `svg[role=img]` có <title>, viewBox,
 *     không `height`, được figcaption mô tả qua aria-describedby;
 *   - không hex màu (chỉ CSS var), mọi nét đúng 1.5;
 *   - không chữ nào nói "anonymous" trừ phủ định;
 *   - registry: mọi block figure trong DOCS có component, mọi id được dùng.
 */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DocBlocks } from "@/components/docs/DocBlocks";
import { FIGURES } from "@/components/docs/figures";
import { FIGURE_IDS, type FigureId } from "@/lib/docs/figures";
import { DOCS } from "@/lib/docs/registry";

import { expectNoAnonymityClaim } from "./helpers/anonymity";

describe("docs figures", () => {
  for (const id of FIGURE_IDS) {
    it(`${id} is an accessible, token-coloured SVG`, () => {
      const { container, unmount } = render(<DocBlocks blocks={[{ kind: "figure", id, caption: "caption" }]} />);
      const svg = container.querySelector('svg[role="img"]');
      expect(svg).not.toBeNull();
      const title = svg!.querySelector("title");
      expect(title?.textContent?.trim().length ?? 0).toBeGreaterThan(0);
      expect(title!.id).toBe(svg!.getAttribute("aria-labelledby"));
      const desc = document.getElementById(svg!.getAttribute("aria-describedby")!);
      expect(desc?.tagName).toBe("FIGCAPTION");
      expect(svg!.getAttribute("viewBox")).toMatch(/^0 0 \d+ \d+$/);
      expect(svg!.hasAttribute("height")).toBe(false);
      expect(svg!.getAttribute("width")).toBe("100%");

      expect(svg!.outerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      const strokes = Array.from(svg!.querySelectorAll("[stroke-width]")).map((el) => el.getAttribute("stroke-width"));
      expect(strokes.length).toBeGreaterThan(0);
      expect(new Set(strokes)).toEqual(new Set(["1.5"]));

      expectNoAnonymityClaim(svg!, id);
      unmount();
    });
  }

  it("every figure in the docs has a component, and every component is used somewhere", () => {
    const used = new Set<FigureId>();
    for (const doc of DOCS) {
      const seen = new Set<FigureId>();
      for (const s of doc.sections) {
        for (const b of s.blocks) {
          if (b.kind !== "figure") continue;
          expect(FIGURES[b.id], `${doc.slug}#${s.id} uses unknown figure ${b.id}`).toBeTypeOf("function");
          expect(seen.has(b.id), `${doc.slug} repeats figure ${b.id} — DOM ids would collide`).toBe(false);
          seen.add(b.id);
          used.add(b.id);
        }
      }
    }
    for (const id of FIGURE_IDS) expect(used.has(id), `figure ${id} is drawn but no page shows it`).toBe(true);
  });
});
