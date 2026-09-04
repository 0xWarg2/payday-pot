import type { CSSProperties, ReactNode } from "react";

/**
 * Nhãn mono "gõ" ra từng ký tự — thuần CSS (`.typed`, `steps(var(--ch))`).
 *
 * Text nằm sẵn trong DOM từ frame 0 và chỉ bị clip, nên `getByText` khớp,
 * layout không đổi (pill có kích thước cuối ngay), và kết quả giống nhau với
 * mọi viewer. Mono: mỗi bậc đúng một ký tự.
 */
export function Typed({ children }: { children: string }): ReactNode {
  return (
    <span className="typed" style={{ "--ch": children.length } as CSSProperties}>
      {children}
    </span>
  );
}
