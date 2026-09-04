import Link from "next/link";
import type { CSSProperties } from "react";

import { InView } from "@/components/motion/InView";
import { Words } from "@/components/motion/Words";
import { EncryptedBadge, PublicBadge } from "@/components/ui/Card";
import { Spotlight } from "@/components/ui/Spotlight";
import { ENCRYPTED, NOT_ANONYMOUS, PUBLIC } from "@/lib/docs/content/privacy";

/**
 * Nói thẳng ra cái KHÔNG được bảo vệ.
 *
 * Đây là section quan trọng nhất trang này. Sản phẩm bảo mật *số tiền*, không
 * bảo mật *danh tính* — address và thời điểm vẫn nằm công khai trên chain mãi
 * mãi. Cột phải dài bằng cột trái là có chủ đích. Hai chú thích dưới cột đã
 * chuyển vào /docs/privacy; hai cột và câu dẫn thì ở lại.
 */
export function PrivacyComparison() {
  return (
    <InView as="section" className="py-14 sm:py-20">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="text-h2 leading-tight font-semibold tracking-tight sm:text-[34px]">
          <Words>What is hidden, and what is not</Words>
        </h2>
        <Link href="/docs/privacy" className="link-draw text-[14px]">
          Read the docs →
        </Link>
      </div>
      {/* Một text node, không tách từ: test đọc câu này nguyên văn từ body.textContent. */}
      <p className="fade text-fg-muted mt-3 max-w-[60ch] text-[16px] leading-relaxed">{NOT_ANONYMOUS}</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Spotlight
          as="div"
          hue="privacy"
          className="in-item border-privacy/30 bg-privacy-subtle rounded-card elev-1 border p-5 sm:p-6"
          style={{ "--n": 1 } as CSSProperties}
        >
          <EncryptedBadge>Encrypted on chain</EncryptedBadge>
          <ul className="mt-4 flex flex-col gap-3">
            {ENCRYPTED.map((item) => (
              <li key={item} className="flex gap-3 text-body leading-snug">
                <span aria-hidden="true" className="bg-privacy mt-[7px] size-1.5 shrink-0 rounded-full" />
                {item}
              </li>
            ))}
          </ul>
        </Spotlight>

        <Spotlight
          as="div"
          hue="neutral"
          className="in-item border-border-default bg-surface rounded-card elev-1 border p-5 sm:p-6"
          style={{ "--n": 2 } as CSSProperties}
        >
          <PublicBadge>Public forever</PublicBadge>
          <ul className="mt-4 flex flex-col gap-3">
            {PUBLIC.map((item) => (
              <li key={item} className="flex gap-3 text-body leading-snug">
                <span aria-hidden="true" className="bg-fg-muted mt-[7px] size-1.5 shrink-0 rounded-full" />
                {item}
              </li>
            ))}
          </ul>
        </Spotlight>
      </div>
    </InView>
  );
}
