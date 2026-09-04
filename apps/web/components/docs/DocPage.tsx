import Link from "next/link";

import { InView } from "@/components/motion/InView";
import { Words } from "@/components/motion/Words";
import { docHref, docNeighbours } from "@/lib/docs/registry";
import type { DocPageDef } from "@/lib/docs/types";

import { DocBlocks } from "./DocBlocks";

/**
 * Một trang docs: h1, tóm tắt, "On this page", các section, prev/next.
 *
 * TOC là một `<nav>` duy nhất: inline dưới tiêu đề ở màn nhỏ, thành rail dính
 * bên phải ở `xl` nhờ grid trong `<article>`. Một DOM, hai vị trí — không có
 * IntersectionObserver, không có bản sao ẩn.
 */
export function DocPage({ doc }: { doc: DocPageDef }) {
  const { prev, next } = docNeighbours(doc.slug);

  return (
    <article className="xl:grid xl:grid-cols-[minmax(0,720px)_200px] xl:gap-x-12">
      <header className="xl:col-start-1">
        <h1 className="text-[32px] leading-tight font-semibold tracking-tight text-balance sm:text-[36px]">
          <Words>{doc.title}</Words>
        </h1>
        <p className="fade text-fg-muted mt-3 text-[17px] leading-relaxed">{doc.summary}</p>
      </header>

      <nav
        aria-label="On this page"
        className="border-border-default mt-8 border-t pt-5 xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:mt-0 xl:self-start xl:border-t-0 xl:border-l xl:pt-0 xl:pl-5 xl:sticky xl:top-24"
      >
        <p className="text-fg-muted font-mono text-[11px] tracking-[0.08em] uppercase">On this page</p>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 xl:flex-col xl:gap-y-2.5">
          {doc.sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-fg-muted hover:text-fg text-[14px] underline-offset-4 hover:underline xl:text-[13px] xl:leading-snug">
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-10 flex flex-col gap-12 xl:col-start-1">
        {doc.sections.map((s) => (
          <InView as="section" key={s.id} id={s.id} className="scroll-mt-24">
            <h2 className="text-[22px] font-semibold tracking-tight text-balance">
              <Words>{s.title}</Words>
            </h2>
            <DocBlocks blocks={s.blocks} />
          </InView>
        ))}

        <footer className="border-border-default border-t pt-6">
          <div className="grid gap-3 sm:grid-cols-2">
            {prev ? (
              <Link href={docHref(prev)} className="border-border-default hover:bg-subtle rounded-control block border p-4 transition-colors duration-(--duration-hover) ease-(--ease-ui)">
                <span className="text-fg-muted font-mono text-[11px] tracking-[0.08em] uppercase">← Previous</span>
                <span className="mt-1 block text-[15px] font-medium">{prev.title}</span>
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link href={docHref(next)} className="border-border-default hover:bg-subtle rounded-control block border p-4 text-right transition-colors duration-(--duration-hover) ease-(--ease-ui)">
                <span className="text-fg-muted font-mono text-[11px] tracking-[0.08em] uppercase">Next →</span>
                <span className="mt-1 block text-[15px] font-medium">{next.title}</span>
              </Link>
            )}
          </div>
          {doc.source && doc.source.length > 0 && (
            <p className="text-fg-muted mt-6 text-[13px]">
              Source in the repository: <span className="font-mono">{doc.source.join(", ")}</span>
            </p>
          )}
        </footer>
      </div>
    </article>
  );
}
