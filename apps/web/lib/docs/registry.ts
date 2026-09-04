import { CONTRACTS } from "./content/contracts";
import { DRAW_AND_FAIRNESS } from "./content/draw-and-fairness";
import { GET_STARTED } from "./content/get-started";
import { HOW_IT_WORKS } from "./content/how-it-works";
import { KNOWN_LIMITATIONS } from "./content/known-limitations";
import { OVERVIEW } from "./content/overview";
import { PRIZE_AND_SPONSORS } from "./content/prize-and-sponsors";
import { PRIVACY } from "./content/privacy";
import type { DocGroupId, DocPageDef } from "./types";

/**
 * Nguồn duy nhất cho sidebar, TOC, prev/next, static params, metadata và test.
 * Thứ tự trong DOCS là thứ tự đọc — prev/next đi theo nó.
 *
 * Landing component KHÔNG nhập file này (nó kéo `@payday-pot/shared` qua trang
 * contracts); chúng nhập thẳng `content/*`.
 */
export const GROUPS: readonly { id: DocGroupId; label: string }[] = [
  { id: "start", label: "Start here" },
  { id: "guarantees", label: "Guarantees" },
  { id: "reference", label: "Reference" },
];

export const DOCS: readonly DocPageDef[] = [
  OVERVIEW,
  GET_STARTED,
  HOW_IT_WORKS,
  PRIZE_AND_SPONSORS,
  PRIVACY,
  DRAW_AND_FAIRNESS,
  CONTRACTS,
  KNOWN_LIMITATIONS,
];

export const OVERVIEW_SLUG = "overview";

export function docHref(doc: Pick<DocPageDef, "slug">): string {
  return doc.slug === OVERVIEW_SLUG ? "/docs" : `/docs/${doc.slug}`;
}

export function docBySlug(slug: string): DocPageDef | undefined {
  return DOCS.find((d) => d.slug === slug);
}

export function docByHref(pathname: string): DocPageDef | undefined {
  const clean = pathname.replace(/\/+$/, "") || "/";
  return DOCS.find((d) => docHref(d) === clean);
}

export function docsInGroup(group: DocGroupId): DocPageDef[] {
  return DOCS.filter((d) => d.group === group);
}

export function docNeighbours(slug: string): { prev?: DocPageDef; next?: DocPageDef } {
  const i = DOCS.findIndex((d) => d.slug === slug);
  if (i < 0) return {};
  return { prev: DOCS[i - 1], next: DOCS[i + 1] };
}
