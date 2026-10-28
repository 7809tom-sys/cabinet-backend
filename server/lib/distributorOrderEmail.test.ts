import { describe, expect, it, vi } from "vitest";
import {
  assignLinesToDistributors,
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
  lines: [{ sku: "usd-sw-3db24", description: "3 drawer base", doorStyle: "Shaker White", qty: 2 }],
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
    expect(message.text).toContain("usd-sw-3db24");
    expect(message.text).toContain("Shaker White");
    expect(message.text).toContain("PO-55");
    expect(message.text).toContain("Call before delivery");
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
