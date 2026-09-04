import Link from "next/link";
import type { CSSProperties } from "react";

import { InView } from "@/components/motion/InView";
import { Words } from "@/components/motion/Words";
import { PROMISES, YIELD_CAVEAT_SHORT } from "@/lib/docs/content/prize-and-sponsors";

/** Ba lời hứa, một dòng mỗi cái, một câu caveat. Bản đầy đủ ở /docs/prize-and-sponsors. */
export function NoLossPromise() {
  return (
    <InView as="section" className="py-14 sm:py-20">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="text-h2 leading-tight font-semibold tracking-tight sm:text-[34px]">
          <Words>Losing a round costs nothing</Words>
        </h2>
        <Link href="/docs/prize-and-sponsors" className="link-draw text-[14px]">
          Read the docs →
        </Link>
      </div>

      <div className="mt-8 grid gap-x-6 gap-y-8 sm:grid-cols-3">
        {PROMISES.map((promise, i) => (
          <div key={promise.title} className="in-item border-border-default border-t pt-5" style={{ "--n": i } as CSSProperties}>
            <h3 className="text-lead font-semibold tracking-tight text-balance">{promise.label}</h3>
            <p className="text-fg-muted mt-2 text-[14px] leading-relaxed">{promise.short}</p>
          </div>
        ))}
      </div>

      <p className="fade text-fg-muted mt-8 max-w-[70ch] text-small leading-relaxed" style={{ "--n": 3 } as CSSProperties}>
        {YIELD_CAVEAT_SHORT}
      </p>
    </InView>
  );
}
