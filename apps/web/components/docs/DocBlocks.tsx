import Link from "next/link";
import type { ReactNode } from "react";

import { Typed } from "@/components/motion/Typed";
import { Card, EncryptedBadge, PublicBadge } from "@/components/ui/Card";
import { Spotlight } from "@/components/ui/Spotlight";
import type { CalloutTone, DocBlock } from "@/lib/docs/types";

import { CopyCode } from "./CopyCode";
import { FIGURES } from "./figures";
import { descId } from "./figures/primitives";

const P = "text-fg-muted mt-3 text-[15px] leading-relaxed";

const CALLOUT: Record<CalloutTone, string> = {
  privacy: "border-privacy/30 bg-privacy-subtle",
  prize: "border-prize/60 bg-prize-soft",
  neutral: "border-border-default bg-subtle",
  warning: "border-warning/40 bg-warning/5",
};

function isExternal(href: string): boolean {
  return /^https?:\/\//.test(href);
}

function CardLink({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  if (isExternal(href)) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

/**
 * Renderer cho từng loại block. Server component — không state, không listener;
 * hai thứ có tương tác (Spotlight, CopyCode) tự khai báo client ở chỗ của chúng.
 */
export function DocBlocks({ blocks }: { blocks: readonly DocBlock[] }) {
  return (
    <>
      {blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </>
  );
}

function Block({ block }: { block: DocBlock }) {
  switch (block.kind) {
    case "p":
      return <p className={P}>{block.text}</p>;

    case "ul":
      return (
        <ul className="text-fg-muted mt-3 flex flex-col gap-2 text-[15px] leading-relaxed">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3">
              <span aria-hidden className="bg-fg-muted/60 mt-[11px] h-1 w-1 shrink-0 rounded-full" />
              <span className="min-w-0">{item}</span>
            </li>
          ))}
        </ul>
      );

    case "steps":
      return (
        <ol className="mt-5 grid gap-x-8 gap-y-6 sm:grid-cols-2">
          {block.items.map((step, i) => (
            <li key={step.title} className="flex gap-4">
              <span className="text-fg-muted w-7 shrink-0 pt-[3px] font-mono text-[12px] tracking-[0.08em]">
                <Typed>{String(i + 1).padStart(2, "0")}</Typed>
              </span>
              <div className="min-w-0">
                <h3 className="text-[16px] font-semibold tracking-tight">{step.title}</h3>
                <p className="text-fg-muted mt-1.5 text-[14px] leading-relaxed">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      );

    case "cards":
      return (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {block.items.map((card) => {
            const inner = (
              <>
                <h3 className="text-[15px] font-semibold tracking-tight">{card.title}</h3>
                <p className="text-fg-muted mt-1.5 text-[14px] leading-relaxed">{card.body}</p>
              </>
            );
            const base = "border-border-default bg-surface rounded-card reveal block border p-5";
            return card.href ? (
              <CardLink
                key={card.title}
                href={card.href}
                className={`${base} elev-1 hover:border-fg/20 hover:-translate-y-0.5 transition-[transform,border-color] duration-(--duration-hover) ease-(--ease-ui)`}
              >
                {inner}
              </CardLink>
            ) : (
              <Card key={card.title} as="div" className={`${base} !p-5`}>
                {inner}
              </Card>
            );
          })}
        </div>
      );

    case "compare":
      return (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Spotlight hue="privacy" className="border-privacy/30 bg-privacy-subtle rounded-card border p-5">
            <EncryptedBadge>Encrypted on chain</EncryptedBadge>
            <ul className="mt-4 flex flex-col gap-2 text-[15px]">
              {block.encrypted.map((item) => (
                <li key={item} className="flex gap-3">
                  <span aria-hidden className="bg-privacy mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full" />
                  {item}
                </li>
              ))}
            </ul>
            {block.note && <p className="text-fg-muted mt-4 text-[13px] leading-relaxed">{block.note.encrypted}</p>}
          </Spotlight>
          <Spotlight hue="neutral" className="border-border-default bg-surface rounded-card border p-5">
            <PublicBadge>Public forever</PublicBadge>
            <ul className="mt-4 flex flex-col gap-2 text-[15px]">
              {block.public.map((item) => (
                <li key={item} className="flex gap-3">
                  <span aria-hidden className="bg-fg-muted mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full" />
                  {item}
                </li>
              ))}
            </ul>
            {block.note && <p className="text-fg-muted mt-4 text-[13px] leading-relaxed">{block.note.public}</p>}
          </Spotlight>
        </div>
      );

    case "code":
      return <CopyCode code={block.code} label={block.label} href={block.href} hrefLabel={block.hrefLabel} />;

    case "table": {
      const headless = block.head.every((h) => h === "");
      return (
        <div className="border-border-default rounded-control mt-4 overflow-x-auto border">
          <table className="w-full min-w-[420px] border-collapse text-left text-[14px]">
            {!headless && (
              <thead>
                <tr className="bg-subtle">
                  {block.head.map((h, i) => (
                    <th key={i} className="text-fg-muted border-border-default border-b px-4 py-2 font-mono text-[11px] font-medium tracking-[0.08em] uppercase">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r} className="border-border-default border-b last:border-b-0">
                  {row.map((cell, c) => (
                    <td
                      key={c}
                      className={`px-4 py-2.5 align-top leading-relaxed ${c === 0 ? "font-medium whitespace-nowrap" : "text-fg-muted"}`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    case "callout":
      return (
        <aside className={`rounded-control mt-5 border px-5 py-4 ${CALLOUT[block.tone]}`}>
          {block.title && <p className="text-[14px] font-semibold tracking-tight">{block.title}</p>}
          <p className={`text-[14px] leading-relaxed ${block.title ? "text-fg-muted mt-1" : ""}`}>{block.text}</p>
        </aside>
      );

    case "figure": {
      const Figure = FIGURES[block.id];
      // Mỗi id chỉ xuất hiện một lần trên một trang — id DOM xác định, không random,
      // để `aria-labelledby`/`aria-describedby` giống nhau ở server và client.
      return (
        <figure className="reveal mt-5">
          <Figure />
          <figcaption id={descId(block.id)} className="text-fg-muted mt-2 font-mono text-[12px] tracking-[0.04em]">
            {block.caption}
          </figcaption>
        </figure>
      );
    }

    default: {
      const never: never = block;
      return never;
    }
  }
}
