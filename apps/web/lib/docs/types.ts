import type { ReactNode } from "react";

import type { FigureId } from "./figures";

/**
 * Mô hình nội dung của mục Docs — typed, không MDX.
 *
 * Không thêm dependency (lockfile đóng băng), nên nội dung là dữ liệu TSX. Đổi
 * lại: sidebar, "On this page", prev/next, static params và test đều đọc từ
 * cùng một mảng `DOCS` — không có chỗ nào để hai bản mục lục lệch nhau.
 *
 * Text là string thường; ReactNode chỉ dành cho inline `<code>`/`<Link>`.
 */
export type DocGroupId = "start" | "guarantees" | "reference";

export type CalloutTone = "privacy" | "prize" | "neutral" | "warning";

export type DocBlock =
  | { kind: "p"; text: ReactNode }
  | { kind: "ul"; items: ReactNode[] }
  | { kind: "steps"; items: { title: string; body: ReactNode }[] }
  | { kind: "cards"; items: { title: string; body: ReactNode; href?: string }[] }
  | {
      kind: "compare";
      encrypted: readonly string[];
      public: readonly string[];
      note?: { encrypted: ReactNode; public: ReactNode };
    }
  | { kind: "code"; code: string; label?: string; href?: string; hrefLabel?: string }
  | { kind: "table"; head: string[]; rows: ReactNode[][] }
  | { kind: "callout"; tone: CalloutTone; title?: string; text: ReactNode }
  /** Sơ đồ SVG vẽ trong code. `caption` bắt buộc — nó là `aria-describedby` của hình. */
  | { kind: "figure"; id: FigureId; caption: string };

export interface DocSection {
  /** Anchor id — ổn định, vì link ngoài (error taxonomy) trỏ thẳng vào đây. */
  id: string;
  title: string;
  blocks: DocBlock[];
}

export interface DocPageDef {
  /** "overview" → `/docs`; mọi slug khác → `/docs/<slug>`. */
  slug: string;
  title: string;
  group: DocGroupId;
  /** Một câu, hiện dưới h1 và trong metadata description. */
  summary: string;
  sections: DocSection[];
  /** Tài liệu gốc trong repo mà trang này rút ra, để người đọc đi tiếp. */
  source?: string[];
}
