import { Fragment, type CSSProperties, type ReactNode } from "react";

/**
 * Tách một câu thành từng từ để mỗi từ vào theo bậc (`.word`, `--n` = thứ tự).
 *
 * Giữa các span là một TEXT NODE " " thật, không phải khoảng trắng nhét trong
 * span: nhờ vậy `textContent` và accessible name của heading vẫn đúng y chuỗi
 * gốc, `getByRole("heading", { name })` vẫn khớp, và `text-wrap: balance` vẫn
 * có chỗ để ngắt dòng. Không `overflow: hidden` nên descender không bị cắt.
 *
 * `key` = "thứ tự-từ": đổi text ("This round" → "Round 3") chỉ remount từ đổi
 * và từ đó chạy lại — đúng ý, vì đó là chỗ dữ liệu vừa tới.
 *
 * Server component, thuần: không dùng cho giá trị confidential.
 */
export function Words({ children }: { children: string }): ReactNode {
  const words = children.split(/\s+/).filter(Boolean);
  const last = words.length - 1;
  return words.map((word, i) => (
    <Fragment key={`${i}-${word}`}>
      <span className="word" style={{ "--n": i } as CSSProperties}>
        {word}
      </span>
      {i < last ? " " : null}
    </Fragment>
  ));
}
