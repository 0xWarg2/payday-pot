import type { Metadata } from "next";

import { DocPage } from "@/components/docs/DocPage";
import { OVERVIEW } from "@/lib/docs/content/overview";

export const metadata: Metadata = {
  title: "Docs — PayDay Pot",
  description: OVERVIEW.summary,
};

export default function DocsOverviewPage() {
  return <DocPage doc={OVERVIEW} />;
}
