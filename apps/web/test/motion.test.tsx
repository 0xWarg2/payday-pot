import { act, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CountUp } from "../components/motion/CountUp";
import { InView } from "../components/motion/InView";
import { Typed } from "../components/motion/Typed";
import { Words } from "../components/motion/Words";
import { EncryptedBadge } from "../components/ui/Card";
import { formatAmount } from "../lib/format";
import { readableText } from "./helpers/anonymity";

/**
 * Chữ chuyển động (đợt 4) không được đổi thứ người dùng ĐỌC — chỉ đổi cách nó
 * hiện ra. Ba lời hứa được ghim ở đây:
 *   1. `Words` tách từ nhưng `textContent`/accessible name giữ nguyên câu;
 *   2. `CountUp` ở SSR/jsdom/reduced-motion là đúng một text node với số cuối;
 *   3. các file cầm giá trị confidential KHÔNG import `CountUp` — số ẩn chỉ có
 *      scramble, không bao giờ đếm (đếm lộ độ lớn qua nhịp chữ số).
 */
const ROOT = join(__dirname, "..");

describe("Words", () => {
  it("keeps the sentence intact for text and accessible name", () => {
    const { container } = render(
      <h2>
        <Words>How a round works</Words>
      </h2>,
    );
    expect(screen.getByRole("heading", { name: "How a round works" })).toBeInTheDocument();
    expect(container.textContent).toBe("How a round works");
    expect(readableText(container)).toBe("How a round works");
    const words = container.querySelectorAll(".word");
    expect(words).toHaveLength(4);
    words.forEach((w, i) => expect((w as HTMLElement).style.getPropertyValue("--n")).toBe(String(i)));
  });

  it("renders deterministically", () => {
    const a = render(<Words>Losing a round costs nothing</Words>).container.innerHTML;
    const b = render(<Words>Losing a round costs nothing</Words>).container.innerHTML;
    expect(a).toBe(b);
  });
});

describe("Typed", () => {
  it("exposes the character count and keeps the text searchable", () => {
    render(<EncryptedBadge />);
    const el = screen.getByText("Encrypted");
    expect(el).toHaveClass("typed");
    expect(el.style.getPropertyValue("--ch")).toBe("9");
    const { container } = render(<Typed>01</Typed>);
    expect(container.textContent).toBe("01");
  });
});

describe("CountUp", () => {
  const io = globalThis.IntersectionObserver;
  const mm = window.matchMedia;
  afterEach(() => {
    globalThis.IntersectionObserver = io;
    window.matchMedia = mm;
  });

  it("is a single text node with the final value when there is no observer", () => {
    // jsdom không có IntersectionObserver ⇒ hiện thẳng số cuối (giống SSR).
    const { container } = render(<CountUp value={1_000_000_000n} format={formatAmount} />);
    const span = container.firstElementChild as HTMLElement;
    expect(span.childNodes).toHaveLength(1);
    expect(span.firstChild?.nodeType).toBe(3);
    expect(span.textContent).toBe("1,000");
    expect(render(<CountUp value={4} />).container.textContent).toBe("4");
  });

  it("does not observe or animate under reduced motion", () => {
    const observe = vi.fn();
    globalThis.IntersectionObserver = class {
      observe = observe;
      disconnect = vi.fn();
    } as unknown as typeof IntersectionObserver;
    window.matchMedia = vi.fn(() => ({ matches: true })) as unknown as typeof window.matchMedia;
    const { container } = render(<CountUp value={1_000_000_000n} format={formatAmount} />);
    expect(container.textContent).toBe("1,000");
    expect(observe).not.toHaveBeenCalled();
  });

  it("counts from zero to the final value once it enters view", () => {
    let cb: IntersectionObserverCallback = () => {};
    globalThis.IntersectionObserver = class {
      constructor(c: IntersectionObserverCallback) {
        cb = c;
      }
      observe = vi.fn();
      disconnect = vi.fn();
    } as unknown as typeof IntersectionObserver;
    window.matchMedia = vi.fn(() => ({ matches: false })) as unknown as typeof window.matchMedia;

    const frames: FrameRequestCallback[] = [];
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((f) => {
      frames.push(f);
      return frames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

    const { container } = render(<CountUp value={1_000_000_000n} format={formatAmount} />);
    // Chưa vào view: giữ 0 (mắt), nhưng screen reader đã có số cuối.
    expect(container.querySelector("[aria-hidden]")?.textContent).toBe("0");
    expect(container.querySelector(".sr-only")?.textContent).toBe("1,000");

    act(() => cb([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    let t = 1000;
    for (let i = 0; i < 200 && frames.length; i++) {
      const f = frames.shift()!;
      act(() => f(t));
      t += 100;
    }
    const span = container.firstElementChild as HTMLElement;
    expect(span.childNodes).toHaveLength(1);
    expect(span.textContent).toBe("1,000");
    raf.mockRestore();
  });

  it("is never imported where confidential values are rendered", () => {
    for (const f of [
      "components/privacy/ConfidentialValue.tsx",
      "components/draw/SealedResultCard.tsx",
      "components/draw/PrivateEntryCard.tsx",
      "components/dashboard/PrivatePositionCard.tsx",
      "components/dashboard/TwabCard.tsx",
    ]) {
      const src = readFileSync(join(ROOT, f), "utf8");
      expect(src, `${f} must not count confidential numbers`).not.toMatch(/motion\/CountUp/);
    }
  });
});

describe("InView", () => {
  it("renders the requested element, forwards attributes, and releases in jsdom", () => {
    const { container } = render(
      <InView as="section" id="how-it-works" className="py-2">
        <p className="fade">hi</p>
      </InView>,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.tagName).toBe("SECTION");
    expect(el.id).toBe("how-it-works");
    expect(el.className).toBe("py-2");
    // Không có IntersectionObserver ⇒ bật ngay, không bao giờ giữ chữ ẩn.
    expect(el.dataset.in).toBe("true");
  });
});

describe("reduced motion", () => {
  it("lists every new text-motion class as animation: none", () => {
    const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    for (const cls of [".word", ".fade", ".in-item", ".typed", ".link-draw"]) {
      expect(block, `${cls} missing from reduced-motion list`).toContain(cls);
    }
    expect(block).toMatch(/\[data-in="false"\][^{]*\{\s*opacity:\s*1/);
  });
});
