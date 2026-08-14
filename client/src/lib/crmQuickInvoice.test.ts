import { describe, expect, it } from "vitest";
import { buildCrmQuickInvoiceHtml, crmQuickInvoiceTotal } from "./crmQuickInvoice";

describe("CRM quick invoice", () => {
  it("totals selected cabinet, design, and installation services without negative amounts", () => {
    expect(crmQuickInvoiceTotal([
      { description: "Cabinet Order", amount: 4200 },
      { description: "Kitchen Design", amount: 250 },
      { description: "Installation", amount: 1300 },
      { description: "Adjustment", amount: -20 },
    ])).toBe(5750);
  });

  it("renders the customer, linked design, selected services, and notes safely into a printable invoice", () => {
    const html = buildCrmQuickInvoiceHtml({
      invoiceNumber: "CRM-42-20260814",
      issuedOn: "August 14, 2026",
      customerName: "Tom <Kitchen>",
      customerEmail: "tom@example.com",
      linkedDesignName: "Aspin kitchen",
      notes: "Cabinet order plus installation.",
      lines: [
        { description: "Cabinet Order", amount: 4200 },
        { description: "Kitchen Design", amount: 250 },
        { description: "Installation", amount: 1300 },
      ],
    });

    expect(html).toContain("Tom &lt;Kitchen&gt;");
    expect(html).toContain("Aspin kitchen");
    expect(html).toContain("Cabinet Order");
    expect(html).toContain("Kitchen Design");
    expect(html).toContain("Installation");
    expect(html).toContain("$5,750.00");
  });
});
