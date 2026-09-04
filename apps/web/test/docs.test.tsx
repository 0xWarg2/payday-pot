import { render, screen } from "@testing-library/react";
import { getPayDayPotDeployment, isPayDayPotDeployed } from "@payday-pot/shared";
import { describe, expect, it } from "vitest";

import { DocPage } from "../components/docs/DocPage";
import { POOL_PARAMETERS } from "../lib/docs/contracts";
import { DOCS, GROUPS, OVERVIEW_SLUG, docByHref, docBySlug, docHref, docNeighbours } from "../lib/docs/registry";
import { expectNoAnonymityClaim, readableText } from "./helpers/anonymity";

/**
 * Docs là một registry, và registry thì kiểm được như dữ liệu: slug/href duy
 * nhất, id section hợp lệ, prev/next phủ hết, và những anchor mà error taxonomy
 * trỏ vào vẫn tồn tại. Phần render chỉ cần chứng minh mỗi trang có h1 và TOC.
 */
describe("docs registry", () => {
  it("has unique slugs and hrefs, and every group is used", () => {
    const slugs = DOCS.map((d) => d.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    const hrefs = DOCS.map(docHref);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const g of GROUPS) expect(DOCS.some((d) => d.group === g.id), `group ${g.id} is empty`).toBe(true);
    expect(docHref({ slug: OVERVIEW_SLUG })).toBe("/docs");
  });

  it("gives every page a title, a summary and at least one section", () => {
    for (const d of DOCS) {
      expect(d.title.trim().length, d.slug).toBeGreaterThan(0);
      expect(d.summary.trim().length, d.slug).toBeGreaterThan(0);
      expect(d.sections.length, d.slug).toBeGreaterThan(0);
      const ids = d.sections.map((s) => s.id);
      expect(new Set(ids).size, `${d.slug} has duplicate section ids`).toBe(ids.length);
      for (const id of ids) expect(id, `${d.slug}#${id}`).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("keeps the anchors the error taxonomy links to", () => {
    // ErrorPanel, PendingUnwrapBanner (#unwrap) và 69 test copy trỏ vào đây.
    const kl = docBySlug("known-limitations");
    expect(kl).toBeDefined();
    const ids = new Set(kl!.sections.map((s) => s.id));
    for (const id of ["yield", "privacy", "decryption", "unwrap", "draw", "caps", "testnet"]) {
      expect(ids.has(id), `known-limitations#${id}`).toBe(true);
    }
  });

  it("chains prev/next across the whole list", () => {
    DOCS.forEach((d, i) => {
      const { prev, next } = docNeighbours(d.slug);
      expect(prev?.slug).toBe(DOCS[i - 1]?.slug);
      expect(next?.slug).toBe(DOCS[i + 1]?.slug);
    });
    expect(docNeighbours("nope")).toEqual({});
  });

  it("resolves hrefs back to pages, with or without a trailing slash", () => {
    for (const d of DOCS) {
      expect(docByHref(docHref(d))?.slug).toBe(d.slug);
      expect(docByHref(`${docHref(d)}/`)?.slug).toBe(d.slug);
    }
    expect(docByHref("/docs/nope")).toBeUndefined();
  });

  it("keeps the hardcoded pool parameters in step with the deployment manifest", () => {
    // Manifest chỉ ghi ba con số này trong `note` dạng chữ; bản chép tay cho
    // trang Contracts phải lệch là test đỏ, không phải là docs nói dối.
    if (!isPayDayPotDeployed()) return;
    const note = getPayDayPotDeployment().note ?? "";
    expect(note).toContain(`epoch ${POOL_PARAMETERS.epochSeconds}s`);
    expect(note).toContain(`perUserCap ${POOL_PARAMETERS.perUserCapRaw.toString()}`);
    expect(note).toContain(`participantCap ${POOL_PARAMETERS.participantCap}`);
  });
});

describe("docs pages", () => {
  for (const doc of DOCS) {
    it(`${doc.slug} renders a heading, a table of contents and honest framing`, () => {
      const { unmount } = render(<DocPage doc={doc} />);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(doc.title);
      expect(screen.getByRole("navigation", { name: /on this page/i })).toBeInTheDocument();
      for (const s of doc.sections) {
        expect(document.getElementById(s.id), `${doc.slug}#${s.id} not in DOM`).not.toBeNull();
      }

      const text = readableText(document.body);
      expectNoAnonymityClaim(text, doc.slug);
      // Framing bắt buộc: không "payroll connected".
      expect(text).not.toMatch(/payroll[- ]connected|connected to (your )?payroll/i);
      unmount();
    });
  }

  it("overview says out loud that the prize is sponsored and the pool is not anonymous", () => {
    render(<DocPage doc={docBySlug(OVERVIEW_SLUG)!} />);
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/does not make you anonymous/i);
    expect(text).toMatch(/sponsored/i);
    expect(text).toMatch(/no payroll integration/i);
  });
});
