import { describe, expect, it } from "vitest";
import { buildDistributorPoDocument, type DistributorEmailLine } from "./distributorOrderEmail";
import { createDistributorPoPdf } from "./distributorPoPdf";

/** pdfkit writes WinAnsi text as hex strings, with kerning numbers between the pieces. */
function pdfText(pdf: Buffer): string {
  const parts: string[] = [];
  for (const match of pdf.toString("latin1").matchAll(/<([0-9A-Fa-f]{2,})>/g)) {
    const hex = match[1];
    if (hex.length % 2 !== 0 || hex.length > 800) continue;
    let out = "";
    let printable = true;
    for (let index = 0; index < hex.length; index += 2) {
      const code = Number.parseInt(hex.slice(index, index + 2), 16);
      if (code < 32 || code > 126) {
        printable = false;
        break;
      }
      out += String.fromCharCode(code);
    }
    if (printable) parts.push(out);
  }
  for (const match of pdf.toString("latin1").matchAll(/\((?:\\\)|\\.|[^\\)])+\)/g)) {
    parts.push(match[0].slice(1, -1));
  }
  return parts.join("");
}

const line: DistributorEmailLine = {
  sku: "CS-DB18",
  description: "Lumina Drawer Base",
  distributorItemName: "18\" Three Drawer Base Cabinet",
  supplierDescription: "",
  doorStyle: "Carmel Shaker",
  qty: 1,
  unitCost: 126.4,
  mapped: true,
};

function octoberOrder(withPrice: boolean) {
  return buildDistributorPoDocument({
    orderNumber: "CD-20261022-OLOUT",
    orderDate: "2026-10-22",
    customerName: "Tom",
    shipTo: ["1104 E Main Street", "apt 1", "Vernon, WI 53186"],
    distributorName: "CS",
    lines: [{ ...line, unitCost: withPrice ? line.unitCost : null }],
    poNumber: null,
    notes: null,
    deliveryMethod: "ship",
    vendorLines: ["Clark & Son"],
    paymentTerms: "Per distributor agreement",
    charges: withPrice ? [{ label: "Shipping", amount: 85 }, { label: "Tax", amount: 6.32 }] : [],
  });
}

describe("distributor purchase-order PDF", () => {
  it("renders a purchase order PDF with the order, ship-to, item, terms, and amounts", async () => {
    const document = octoberOrder(true);
    const pdf = await createDistributorPoPdf(document);
    const raw = pdf.toString("latin1");
    const text = pdfText(pdf);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(raw).toContain("/Count 1");
    expect(pdf.length).toBeGreaterThan(800);
    expect(pdf.length).toBeLessThan(200_000);
    expect(text).toContain("Purchase Order CD-20261022-OLOUT");
    expect(text).toContain("PURCHASE ORDER");
    expect(text).toContain("CS-DB18");
    expect(text).toContain("Carmel Shaker");
    expect(text).toContain("1104 E Main Street");
    expect(text).toContain("Vernon, WI 53186");
    expect(text).toContain("Per distributor agreement");
    expect(text).toContain("$126.40");
    expect(text).toContain("$217.72");
    expect(text).not.toContain("Lumina");
    expect(text).not.toContain("Invoice");
  });

  it("still renders the October order shape when the line has no cost", async () => {
    const pdf = await createDistributorPoPdf(octoberOrder(false));
    const raw = pdf.toString("latin1");
    const text = pdfText(pdf);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(raw).toContain("/Count 1");
    expect(text).toContain("CS-DB18");
    expect(text).toContain("18\" Three Drawer Base Cabinet");
    expect(text).toContain("apt 1");
    expect(text).not.toContain("Unit Cost");
    expect(text).not.toContain("Lumina");
  });
});
