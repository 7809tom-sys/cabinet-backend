import { describe, expect, it } from "vitest";
import { buildCrmInvoiceEmailHtml, createCrmInvoicePdf } from "./crmInvoicePdf";

const invoice = {
  invoiceNumber: "CRM-42-20260814",
  issuedOn: "August 14, 2026",
  customerName: "Tom",
  customerEmail: "tom@example.com",
  linkedDesignName: "Aspin kitchen",
  notes: "Review selections before installation.",
  lines: [
    { description: "Cabinet Order", amount: 4200 },
    { description: "Installation", amount: 1450 },
  ],
  brand: {
    storeName: "Reaves Way Cabinet Shop",
    logoUrl: null,
    primaryColor: "#123456",
    accentColor: "#C79A4B",
  },
};

describe("branded CRM invoice delivery", () => {
  it("builds a white-label customer email with the affiliate brand and final invoice total", () => {
    const html = buildCrmInvoiceEmailHtml(invoice);
    expect(html).toContain("Reaves Way Cabinet Shop");
    expect(html).toContain("CRM-42-20260814");
    expect(html).toContain("$5,650.00");
    expect(html).toContain("Aspin kitchen");
    expect(html).not.toContain("Cabinet Dealz");
  });

  it("creates a PDF attachment for the branded final invoice", async () => {
    const pdf = await createCrmInvoicePdf(invoice);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(500);
  });
});
