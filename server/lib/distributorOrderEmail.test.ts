import { describe, expect, it, vi } from "vitest";
import {
  assignLinesToDistributors,
  buildDistributorEmailContent,
  composeDistributorOrderEmail,
  deliverDistributorEmails,
  parseCcEmails,
  summarizeDistributorEmails,
  type DistributorPortion,
} from "./distributorOrderEmail";

const portion: DistributorPortion = {
  distributorId: 4,
  distributorName: "Millwork Co",
  orderEmail: "orders@mill.com",
  ccEmails: ["sales@mill.com"],
  lines: [{
    sku: "3DB24",
    description: "Lumina 3 drawer base",
    distributorItemName: "3 Drawer Base 24",
    supplierDescription: "Three drawer base cabinet, 24 inch",
    doorStyle: "Aspen White",
    qty: 2,
    mapped: true,
  }],
};

describe("distributor order email", () => {
  it("includes the order, ship-to, line, PO, and notes in the message", () => {
    const message = composeDistributorOrderEmail({
      orderNumber: "CD-100",
      orderDate: "2026-10-27",
      customerName: "Jamie Carter",
      shipTo: ["123 Oak Street", "Austin, TX 78701"],
      distributorName: "Millwork Co",
      lines: portion.lines,
      poNumber: "PO-55",
      notes: "Call before delivery",
    });
    expect(message.subject).toContain("CD-100");
    expect(message.text).toContain("Jamie Carter");
    expect(message.text).toContain("123 Oak Street");
    expect(message.text).toContain("2 x 3DB24 — 3 Drawer Base 24");
    expect(message.text).toContain("Three drawer base cabinet, 24 inch");
    expect(message.text).toContain("Aspen White");
    expect(message.text).not.toContain("Lumina");
    expect(message.html).toContain("Distributor Item Name");
    expect(message.html).toContain("3DB24");
    expect(message.html).toContain("3 Drawer Base 24");
    expect(message.html).toContain("Aspen White");
    expect(message.html).toContain(">2<");
    expect(message.html).not.toContain("Lumina");
    expect(message.text).toContain("PO-55");
    expect(message.text).toContain("Call before delivery");
  });

  it("flags a line with no distributor SKU in the text, HTML table, and CSV", () => {
    const message = buildDistributorEmailContent({
      orderNumber: "CD-100",
      orderDate: "2026-10-27",
      customerName: "Jamie Carter",
      shipTo: ["123 Oak Street"],
      distributorName: "US Cabinet Depot",
      deliveryMethod: "ship",
      poNumber: null,
      notes: null,
      lines: [
        portion.lines[0],
        {
          sku: "W3030",
          description: "Lumina Wall 30",
          distributorItemName: "no distributor SKU mapped",
          supplierDescription: "should not be sent",
          doorStyle: "Aspen White",
          qty: 1,
          mapped: false,
        },
      ],
    });
    expect(message.text).toContain("1 x W3030 — no distributor SKU mapped · Aspen White");
    expect(message.text).not.toContain("Lumina");
    expect(message.text).not.toContain("should not be sent");
    expect(message.html).toContain("no distributor SKU mapped");
    expect(message.html).not.toContain("Lumina");
    const rows = message.csv.split("\r\n");
    expect(rows[0].split(",")[6]).toBe("Item");
    expect(rows[0].split(",")[7]).toBe("Distributor Item Name");
    expect(rows[1]).toContain("3DB24,3 Drawer Base 24,");
    expect(rows[1]).toContain("Three drawer base cabinet, 24 inch");
    expect(rows[2]).toContain("W3030,no distributor SKU mapped,,1");
    expect(message.csv).not.toContain("Lumina");
  });

  it("escapes HTML in the distributor item name", () => {
    const message = composeDistributorOrderEmail({
      orderNumber: "CD-1",
      orderDate: "2026-10-27",
      customerName: null,
      shipTo: [],
      distributorName: "Millwork Co",
      poNumber: null,
      notes: null,
      lines: [{
        sku: "B12",
        description: "",
        distributorItemName: `12" <base>`,
        doorStyle: "Aspen & White",
        qty: 1,
        mapped: true,
      }],
    });
    expect(message.html).toContain("12&quot; &lt;base&gt;");
    expect(message.html).toContain("Aspen &amp; White");
    expect(message.html).not.toContain("<base>");
  });

  it("does not send a second time for the same distributor unless forced", async () => {
    const send = vi.fn(async () => ({ ok: true }));
    const prior = [{
      distributorId: 4,
      distributorName: "Millwork Co",
      status: "sent" as const,
      sentAt: "2026-10-27T15:00:00.000Z",
      sentTo: "orders@mill.com",
      error: null,
    }];
    const skipped = await deliverDistributorEmails({ portions: [portion], prior, force: false, send });
    expect(send).not.toHaveBeenCalled();
    expect(skipped[0].sentAt).toBe("2026-10-27T15:00:00.000Z");
    const resent = await deliverDistributorEmails({ portions: [portion], prior, force: true, send, now: new Date("2026-10-27T16:00:00.000Z") });
    expect(send).toHaveBeenCalledOnce();
    expect(resent[0]).toMatchObject({ status: "sent", sentAt: "2026-10-27T16:00:00.000Z" });
  });

  it("records no_email without calling the mailer", async () => {
    const send = vi.fn(async () => ({ ok: true }));
    const rows = await deliverDistributorEmails({
      portions: [{ ...portion, orderEmail: "  " }],
      prior: [],
      force: false,
      send,
    });
    expect(send).not.toHaveBeenCalled();
    expect(rows[0].status).toBe("no_email");
    expect(summarizeDistributorEmails(rows).distributorEmailStatus).toBe("no_email");
  });

  it("marks sent with the address and time", async () => {
    const rows = await deliverDistributorEmails({
      portions: [portion],
      prior: [],
      force: false,
      now: new Date("2026-10-27T15:04:00.000Z"),
      send: async () => ({ ok: true }),
    });
    expect(rows[0]).toMatchObject({ status: "sent", sentTo: "orders@mill.com, sales@mill.com", sentAt: "2026-10-27T15:04:00.000Z" });
    expect(summarizeDistributorEmails(rows).distributorEmailStatus).toBe("sent");
  });

  it("records a provider failure and a thrown failure without throwing", async () => {
    const failed = await deliverDistributorEmails({
      portions: [portion],
      prior: [],
      force: false,
      send: async () => ({ ok: false, error: "timeout" }),
    });
    expect(failed[0]).toMatchObject({ status: "failed", error: "timeout" });
    const thrown = await deliverDistributorEmails({
      portions: [portion],
      prior: [],
      force: false,
      send: async () => { throw new Error("socket hang up"); },
    });
    expect(thrown[0]).toMatchObject({ status: "failed", error: "socket hang up" });
    expect(summarizeDistributorEmails(thrown).distributorEmailError).toContain("socket hang up");
  });

  it("keeps only usable CC addresses", () => {
    expect(parseCcEmails("sales@mill.com, not-an-email, sales@mill.com")).toEqual(["sales@mill.com"]);
  });

  it("splits one order across the distributors that own each line", () => {
    const groups = assignLinesToDistributors([
      { sku: "a", description: "Base", doorStyle: "Shaker", qty: 1, distributorId: 4 },
      { sku: "b", description: "Wall", doorStyle: "Shaker", qty: 2, cabinetId: 9, styleId: 3 },
      { sku: "c", description: "Filler", doorStyle: null, qty: 1 },
    ], new Map([["9-3", 8]]), 4);
    expect(groups.get(4)?.map((line) => line.sku)).toEqual(["a", "c"]);
    expect(groups.get(8)?.map((line) => line.sku)).toEqual(["b"]);
  });
});
