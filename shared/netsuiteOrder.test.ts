import { describe, it, expect } from "vitest";
import {
  buildNetsuiteOrderCsv,
  buildOrderEmailText,
  csvCell,
  evaluatePickup,
  resolvePickupOriginZip,
  NETSUITE_CSV_COLUMNS,
  type PickupCandidate,
} from "./netsuiteOrder";

describe("csvCell", () => {
  it("passes through plain values", () => {
    expect(csvCell("W2496")).toBe("W2496");
    expect(csvCell(12)).toBe("12");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });
  it("quotes and escapes commas, quotes, and newlines", () => {
    expect(csvCell("Shaker, White")).toBe('"Shaker, White"');
    expect(csvCell('36" base')).toBe('"36"" base"');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("buildNetsuiteOrderCsv", () => {
  const header = {
    orderNumber: "CD-1001",
    customerName: "Acme Kitchens",
    styleName: "Faircrest White Shaker",
    deliveryMethod: "ship" as const,
    orderDate: "2026-07-02T10:00:00.000Z",
  };
  const lines = [
    { poSku: "usd-sw-b24", description: "24\" Base", qty: 2, unitPrice: 150 },
    { masterCode: "W3030", description: "Wall, 30x30", qty: 1, unitPrice: 90.5 },
  ];

  it("emits a header row matching the declared columns", () => {
    const csv = buildNetsuiteOrderCsv(header, lines);
    const rows = csv.split("\r\n");
    expect(rows[0]).toBe(NETSUITE_CSV_COLUMNS.join(","));
  });

  it("repeats the order number as External ID + PO Number on each line", () => {
    const csv = buildNetsuiteOrderCsv(header, lines);
    const rows = csv.split("\r\n");
    expect(rows).toHaveLength(1 + lines.length);
    expect(rows[1].startsWith("CD-1001,CD-1001,2026-07-02,")).toBe(true);
  });

  it("computes Amount = qty * rate with 2 decimals", () => {
    const csv = buildNetsuiteOrderCsv(header, lines);
    const rows = csv.split("\r\n");
    // line 1: 2 * 150 = 300.00
    expect(rows[1].endsWith(",2,150.00,300.00")).toBe(true);
    // line 2: 1 * 90.5 = 90.50
    expect(rows[2].endsWith(",1,90.50,90.50")).toBe(true);
  });

  it("prefers poSku, then masterCode, then rawCode for the Item column", () => {
    const csv = buildNetsuiteOrderCsv(header, [
      { poSku: "P1", masterCode: "M1", rawCode: "R1", qty: 1 },
      { masterCode: "M2", rawCode: "R2", qty: 1 },
      { rawCode: "R3", qty: 1 },
    ]);
    const rows = csv.split("\r\n");
    expect(rows[1].split(",")[6]).toBe("P1");
    expect(rows[2].split(",")[6]).toBe("M2");
    expect(rows[3].split(",")[6]).toBe("R3");
  });

  it("puts Distributor Item Name beside the distributor SKU and keeps the other columns", () => {
    const csv = buildNetsuiteOrderCsv(header, [
      {
        poSku: "3DB24",
        distributorItemName: "3 Drawer Base, 24\"",
        description: "Three drawer base cabinet",
        doorStyle: "Aspen White",
        qty: 2,
        unitPrice: 10,
      },
    ]);
    const headerRow = csv.split("\r\n")[0].split(",");
    expect(headerRow[6]).toBe("Item");
    expect(headerRow[7]).toBe("Distributor Item Name");
    expect(headerRow).toEqual(expect.arrayContaining(["Quantity", "Door Style", "Description"]));
    const cells = csv.split("\r\n")[1].split(",");
    expect(cells[5]).toBe("Aspen White");
    expect(cells[6]).toBe("3DB24");
    expect(csv).toContain('"3 Drawer Base, 24"""');
    expect(csv).toContain("Three drawer base cabinet");
    expect(csv).toContain(",2,10.00,20.00");
  });

  it("flags an unmapped line in Distributor Item Name and does not copy a catalog description", () => {
    const csv = buildNetsuiteOrderCsv(header, [
      { poSku: "W3030", distributorItemName: "no distributor SKU mapped", description: "", qty: 1 },
    ]);
    const cells = csv.split("\r\n")[1].split(",");
    expect(cells[6]).toBe("W3030");
    expect(cells[7]).toBe("no distributor SKU mapped");
    expect(cells[8]).toBe("");
    expect(cells[9]).toBe("1");
  });

  it("leaves rate/amount blank when no price is present", () => {
    const csv = buildNetsuiteOrderCsv(header, [{ poSku: "X", qty: 3 }]);
    const row = csv.split("\r\n")[1];
    expect(row.endsWith(",3,,")).toBe(true);
  });

  it("marks Fulfillment as Pickup when deliveryMethod is pickup", () => {
    const csv = buildNetsuiteOrderCsv({ ...header, deliveryMethod: "pickup" }, lines);
    expect(csv.split("\r\n")[1].split(",")[4]).toBe("Pickup");
  });
});

describe("buildOrderEmailText", () => {
  it("includes distributor, style, and a pickup location when pickup", () => {
    const text = buildOrderEmailText(
      { orderNumber: "CD-1", styleName: "Shaker", deliveryMethod: "pickup" },
      [{ poSku: "B24", description: "Base", qty: 1, unitPrice: 100 }],
      { distributorName: "West Cabinets", pickupAddress: "1 Depot Rd", totalAmount: "100.00" }
    );
    expect(text).toContain("Purchase Order: CD-1");
    expect(text).toContain("Distributor: West Cabinets");
    expect(text).toContain("Door Style / Finish: Shaker");
    expect(text).toContain("Fulfillment: Local pickup");
    expect(text).toContain("Pickup location: 1 Depot Rd");
    expect(text).toContain("Order total: $100.00");
    expect(text).toContain("NetSuite-ready CSV");
  });

  it("prints the distributor item name and skips a catalog description when the name is set", () => {
    const text = buildOrderEmailText(
      { orderNumber: "CD-1", deliveryMethod: "ship" },
      [{
        poSku: "3DB24",
        distributorItemName: "3 Drawer Base 24",
        description: "Lumina 3 Drawer Base",
        qty: 2,
      }],
    );
    expect(text).toContain("2 x  3DB24  — 3 Drawer Base 24");
    expect(text).not.toContain("Lumina");
  });
});

describe("resolvePickupOriginZip", () => {
  const base: PickupCandidate = {
    distributorId: 1,
    displayName: "D",
    pickupEnabled: true,
    pickupRadiusMiles: 100,
  };
  it("prefers an explicit pickup ZIP", () => {
    expect(resolvePickupOriginZip({ ...base, pickupZip: "75201", warehouseZips: ["10001"] })).toBe("75201");
  });
  it("falls back to the first usable warehouse ZIP", () => {
    expect(resolvePickupOriginZip({ ...base, pickupZip: null, warehouseZips: ["", "90001"] })).toBe("90001");
  });
  it("returns null when nothing usable is present", () => {
    expect(resolvePickupOriginZip({ ...base, warehouseZips: [] })).toBeNull();
  });
});

describe("evaluatePickup", () => {
  const near: PickupCandidate = {
    distributorId: 7,
    displayName: "Near Depot",
    pickupEnabled: true,
    pickupRadiusMiles: 100,
    pickupZip: "75201",
    pickupAddress: "1 Depot Rd, Dallas TX",
  };

  it("returns null when pickup is disabled", () => {
    expect(evaluatePickup({ ...near, pickupEnabled: false }, "75202")).toBeNull();
  });

  it("returns null when there is no origin ZIP", () => {
    expect(evaluatePickup({ ...near, pickupZip: null, warehouseZips: [] }, "75202")).toBeNull();
  });

  it("offers pickup when the delivery coord is within the radius", () => {
    const opt = evaluatePickup(
      near,
      "75201",
      { lat: 32.79, lng: -96.8 }, // ~within a few miles of origin
      { lat: 32.78, lng: -96.8 }
    );
    expect(opt).not.toBeNull();
    expect(opt!.distributorId).toBe(7);
    expect(opt!.pickupAddress).toBe("1 Depot Rd, Dallas TX");
    expect(opt!.distanceMiles).toBeLessThanOrEqual(100);
  });

  it("rejects pickup when the delivery coord is beyond the radius", () => {
    const opt = evaluatePickup(
      { ...near, pickupRadiusMiles: 50 },
      "90001",
      { lat: 34.05, lng: -118.24 }, // Los Angeles
      { lat: 32.78, lng: -96.8 } // Dallas — ~1200 mi away
    );
    expect(opt).toBeNull();
  });

  it("defaults an invalid radius to 100 miles", () => {
    const opt = evaluatePickup(
      { ...near, pickupRadiusMiles: 0 },
      "75201",
      { lat: 32.79, lng: -96.8 },
      { lat: 32.78, lng: -96.8 }
    );
    expect(opt).not.toBeNull();
    expect(opt!.radiusMiles).toBe(100);
  });
});
