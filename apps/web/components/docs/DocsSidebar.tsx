"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { DOCS, GROUPS, docByHref, docHref } from "@/lib/docs/registry";

/**
 * Sidebar trái theo nhóm (kiểu docs.pooltogether.com). Client chỉ vì cần
 * pathname cho `aria-current`; nội dung menu vẫn là dữ liệu tĩnh từ registry.
 * Ở màn nhỏ nó gập vào một `<details>` mang tên trang hiện tại.
 */
export function DocsSidebar() {
  const pathname = usePathname();
  const current = docByHref(pathname);

  const list = (
    <ul className="flex flex-col gap-6">
      {GROUPS.map((g) => (
        <li key={g.id}>
          <p className="text-fg-muted px-3 font-mono text-[11px] tracking-[0.08em] uppercase">{g.label}</p>
          <ul className="mt-2 flex flex-col gap-0.5">
            {DOCS.filter((d) => d.group === g.id).map((d) => {
              const href = docHref(d);
              const active = current?.slug === d.slug;
              return (
                <li key={d.slug}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-control block px-3 py-1.5 text-[14px] transition-colors duration-(--duration-hover) ease-(--ease-ui) ${
                      active ? "bg-surface border-border-default border font-medium" : "text-fg-muted hover:text-fg hover:bg-surface/60"
                    }`}
                  >
                    {d.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <details className="border-border-default bg-surface rounded-control border lg:hidden">
        <summary className="cursor-pointer px-4 py-3 text-[14px] font-medium select-none">
          Docs menu <span className="text-fg-muted font-normal">· {current?.title ?? "Overview"}</span>
        </summary>
        <div className="border-border-default border-t px-2 py-4">{list}</div>
      </details>
      <nav aria-label="Docs" className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
        {list}
      </nav>
    </>
  );
}
