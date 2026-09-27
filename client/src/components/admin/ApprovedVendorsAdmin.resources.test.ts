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
    expect(source).toContain("Open or download PDF catalog");
    expect(source).toContain("Open or download PDF spec book");
    expect(source).toContain("<Download className=");
  });

  it("identifies the approved contact email as the supplier portal login", () => {
    expect(source).toContain("Contact email / supplier portal login");
    expect(source).toContain('data-testid="approved-vendor-login-help"');
    expect(source).toContain("No separate invite is required.");
    expect(source).toContain("Add a contact email to enable this supplier’s portal login.");
  });
});
