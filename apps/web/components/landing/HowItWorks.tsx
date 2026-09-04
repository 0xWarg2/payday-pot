import Link from "next/link";
import type { CSSProperties } from "react";

import { InView } from "@/components/motion/InView";
import { Typed } from "@/components/motion/Typed";
import { Words } from "@/components/motion/Words";
import { STEPS } from "@/lib/docs/content/how-it-works";

/** Bốn nhãn 1–3 từ, một câu ngắn mỗi bước. Bản đầy đủ nằm ở /docs/how-it-works. */
export function HowItWorks() {
  return (
    <InView as="section" id="how-it-works" className="scroll-mt-6 py-14 sm:py-20">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="text-h2 leading-tight font-semibold tracking-tight sm:text-[34px]">
          <Words>How a round works</Words>
        </h2>
        <Link href="/docs/how-it-works" className="link-draw text-[14px]">
          Read the docs →
        </Link>
      </div>
      <ol className="mt-8 grid gap-x-6 gap-y-8 sm:grid-cols-4">
        {STEPS.map((step, i) => (
          <li key={step.title} className="in-item border-border-default border-t pt-5" style={{ "--n": i } as CSSProperties}>
            <span className="text-fg-muted tabular font-mono text-caption tracking-[0.08em]">
              <Typed>{String(i + 1).padStart(2, "0")}</Typed>
            </span>
            <h3 className="mt-2 text-lead font-semibold tracking-tight text-balance">{step.label}</h3>
            <p className="text-fg-muted mt-2 text-[14px] leading-relaxed">{step.short}</p>
          </li>
        ))}
      </ol>
    </InView>
  );
}
