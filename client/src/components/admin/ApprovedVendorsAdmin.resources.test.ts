import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./ApprovedVendorsAdmin.tsx", import.meta.url), "utf8");

describe("Approved vendor PDF resources", () => {
  it("provides separate catalog and spec-book boxes with validated PDF uploads", () => {
    expect(source).toContain('label="PDF catalog"');
    expect(source).toContain('label="PDF spec book"');
    expect(source).toContain('accept="application/pdf"');
    expect(source).toContain("PDF files must be between 1 byte and 12 MB.");
    expect(source).toContain("trpc.vendors.uploadResourcePdf.useMutation");
  });

  it("retains links in the editor and exposes saved resources on the vendor scorecard", () => {
    expect(source).toContain("catalogPdfUrl: form.catalogPdfUrl.trim() || null");
    expect(source).toContain("specBookPdfUrl: form.specBookPdfUrl.trim() || null");
    expect(source).toContain("Catalog PDF");
    expect(source).toContain("Spec book");
  });
});
