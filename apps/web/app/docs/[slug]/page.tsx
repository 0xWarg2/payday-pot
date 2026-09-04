import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DocPage } from "@/components/docs/DocPage";
import { DOCS, OVERVIEW_SLUG, docBySlug } from "@/lib/docs/registry";

export const dynamicParams = false;

export function generateStaticParams(): { slug: string }[] {
  return DOCS.filter((d) => d.slug !== OVERVIEW_SLUG).map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const doc = docBySlug(slug);
  if (!doc || slug === OVERVIEW_SLUG) return {};
  return { title: doc.title, description: doc.summary };
}

export default async function DocSlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = docBySlug(slug);
  if (!doc || slug === OVERVIEW_SLUG) notFound();
  return <DocPage doc={doc} />;
}
