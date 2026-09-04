import { expect } from "vitest";

/** Một phủ định nào đó, trong cùng câu, ngay trước từ khoá. */
export const NEGATED_BEFORE = /\b(?:not|never|n['’]t|no)\b[^.!?]{0,60}$/i;

/**
 * Luật cấm KHẲNG ĐỊNH ẩn danh — không cấm cái từ.
 *
 * Chặn thẳng chuỗi ký tự sẽ bắt luôn câu "it does not make you anonymous", tức
 * là đúng câu framing trung thực nhất. Chặn kiểu đó chỉ đẩy copy về chỗ im
 * lặng, mà để người đọc tự suy ra "chắc là ẩn danh" là dạng sai lệch khó cãi
 * nhất, không phải dạng an toàn nhất. Dùng chung cho landing và docs.
 */
export function expectNoAnonymityClaim(source: string | Node, where = "text"): void {
  const text = typeof source === "string" ? source : readableText(source);
  for (const match of text.matchAll(/anonymous|anonymity/gi)) {
    const at = match.index;
    expect(at, "match without an index").toBeTypeOf("number");
    if (at === undefined) continue;
    const context = text.slice(Math.max(0, at - 80), at + 20);
    expect(text.slice(0, at), `${where} claims anonymity: …${context}…`).toMatch(NEGATED_BEFORE);
  }
}

/**
 * `textContent` dán các phần tử liền nhau ("What this is not" + "Not anonymous"
 * → "notNot"), làm `\b` mất ranh giới từ. Nối text node bằng khoảng trắng để
 * regex nhìn thấy đúng câu người đọc nhìn thấy.
 */
export function readableText(root: Node): string {
  const doc = root.ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  const parts: string[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) parts.push(n.textContent ?? "");
  return parts.join(" ").replace(/\s+/g, " ");
}
