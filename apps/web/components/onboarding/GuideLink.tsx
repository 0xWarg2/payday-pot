import Link from "next/link";

/** Một link nhỏ về Docs — chỗ để chữ đi, để mỗi bước onboarding chỉ còn một câu. */
export function GuideLink({ href, children = "Guide →" }: { href: string; children?: string }) {
  return (
    <Link href={href} className="text-fg-muted hover:text-fg text-[13px] underline underline-offset-4">
      {children}
    </Link>
  );
}
