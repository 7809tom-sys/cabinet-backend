/**
 * A supplier purchase order carries distributor cost, so it must never reach
 * the customer who placed the order or the store admin / affiliate owner.
 *
 * Safety: no SMTP server, provider, or database is contacted. Delivery is a
 * stub and the CRM test uses an in-memory table map.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  deliverDistributorEmails,
  filterPoCcEmails,
  parseCcEmails,
  poExcludedRecipientKeys,
  type DistributorPortion,
} from "./distributorOrderEmail";

const CUSTOMER = "customer@example.com";
const STORE_OWNER = "owner@harborkitchen.test";
const STORE_PUBLIC = "hello@harborkitchen.test";
const DISTRIBUTOR_TO = "orders@distributor.test";
const DISTRIBUTOR_CC = "podesk@distributor.test";

function portion(ccEmails: string[]): DistributorPortion {
  return {
    distributorId: 4,
    distributorName: "Skyline",
    orderEmail: DISTRIBUTOR_TO,
    ccEmails,
    lines: [],
  };
}

describe("PO recipient exclusion set", () => {
  it("collects the customer and every store-owner address, case-insensitively", () => {
    const keys = poExcludedRecipientKeys({
      customerEmail: " Customer@Example.com ",
      storeOwnerEmails: [STORE_OWNER, STORE_PUBLIC, null, undefined, "not-an-email"],
    });
    expect([...keys].sort()).toEqual([CUSTOMER, STORE_OWNER, STORE_PUBLIC].sort());
  });

  it("has no exclusions when the order has no customer or affiliate", () => {
    expect(poExcludedRecipientKeys({}).size).toBe(0);
    expect(poExcludedRecipientKeys({ customerEmail: "", storeOwnerEmails: [] }).size).toBe(0);
  });
});

describe("PO CC filtering at send time", () => {
  const excluded = poExcludedRecipientKeys({
    customerEmail: CUSTOMER,
    storeOwnerEmails: [STORE_OWNER, STORE_PUBLIC],
  });

  it("drops the customer and the store owner but keeps the distributor's own CC list", () => {
    expect(filterPoCcEmails(
      [DISTRIBUTOR_CC, CUSTOMER, STORE_OWNER, STORE_PUBLIC],
      excluded,
      DISTRIBUTOR_TO,
    )).toEqual([DISTRIBUTOR_CC]);
  });

  it("matches excluded addresses regardless of case and surrounding space", () => {
    expect(filterPoCcEmails(
      [" PODESK@DISTRIBUTOR.TEST ", "Customer@Example.COM", " Owner@HarborKitchen.test "],
      excluded,
      DISTRIBUTOR_TO,
    )).toEqual(["PODESK@DISTRIBUTOR.TEST"]);
  });

  it("never CCs the message's own destination", () => {
    expect(filterPoCcEmails([DISTRIBUTOR_TO, DISTRIBUTOR_CC], excluded, DISTRIBUTOR_TO)).toEqual([DISTRIBUTOR_CC]);
  });

  it("removes duplicates and unusable entries without inventing recipients", () => {
    expect(filterPoCcEmails(
      [DISTRIBUTOR_CC, "PODESK@distributor.test", DISTRIBUTOR_CC, "", "nope"],
      excluded,
      DISTRIBUTOR_TO,
    )).toEqual([DISTRIBUTOR_CC]);
  });

  it("leaves an ordinary distributor CC list completely alone", () => {
    expect(filterPoCcEmails(
      [DISTRIBUTOR_CC, "second@distributor.test"],
      excluded,
      DISTRIBUTOR_TO,
    )).toEqual([DISTRIBUTOR_CC, "second@distributor.test"]);
  });

  it("still parses the saved distributor list unchanged", () => {
    // The settings string is only ever read; filtering happens on the copy sent.
    expect(parseCcEmails("poddesk@distributor.test; customer@example.com")).toEqual([
      "poddesk@distributor.test",
      CUSTOMER,
    ]);
  });
});

describe("deliverDistributorEmails applies the filter", () => {
  it("sends the filtered CC list and reports only the real recipients", async () => {
    const send = vi.fn(async () => ({ ok: true }));
    const records = await deliverDistributorEmails({
      portions: [portion([DISTRIBUTOR_CC, CUSTOMER, STORE_OWNER])],
      prior: [],
      force: false,
      excludedCc: poExcludedRecipientKeys({ customerEmail: CUSTOMER, storeOwnerEmails: [STORE_OWNER] }),
      send,
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({
      orderEmail: DISTRIBUTOR_TO,
      ccEmails: [DISTRIBUTOR_CC],
    });
    expect(records[0]).toMatchObject({
      status: "sent",
      sentTo: `${DISTRIBUTOR_TO}, ${DISTRIBUTOR_CC}`,
    });
  });

  it("sends with no CC at all when every saved CC is excluded", async () => {
    const send = vi.fn(async () => ({ ok: true }));
    await deliverDistributorEmails({
      portions: [portion([CUSTOMER, STORE_OWNER])],
      prior: [],
      force: false,
      excludedCc: poExcludedRecipientKeys({ customerEmail: CUSTOMER, storeOwnerEmails: [STORE_OWNER] }),
      send,
    });
    expect(send.mock.calls[0][0].ccEmails).toEqual([]);
  });
});

describe("PO CC wiring", () => {
  const sideEffects = readFileSync(resolve(process.cwd(), "server/lib/orderSideEffects.ts"), "utf8");
  const crm = readFileSync(resolve(process.cwd(), "server/routers/crm.ts"), "utf8");

  it("filters the automatic PO before it is sent", () => {
    const start = sideEffects.indexOf("export async function notifyOrderDistributors");
    const end = sideEffects.indexOf("const TRAIL_WRITE_COLUMNS");
    const body = sideEffects.slice(start, end);
    expect(body).toContain("excludedCc: await poExcludedRecipients(db, order)");
    // The send already receives the filtered list, so raw settings never reach it.
    expect(body).toContain("cc: portion.ccEmails");
  });

  it("resolves the customer and the affiliate owner from the order, read-only", () => {
    const start = sideEffects.indexOf("async function poExcludedRecipients");
    const body = sideEffects.slice(start, start + 1200);
    expect(body).toContain("order.originatorEmail");
    expect(body).toContain("affiliates.email");
    expect(body).toContain("affiliates.publicEmail");
    expect(body).toContain("users.email");
    expect(body).not.toMatch(/\.update\(|\.insert\(/);
  });

  it("still excludes the customer when the store-owner lookup fails", () => {
    const start = sideEffects.indexOf("async function poExcludedRecipients");
    const body = sideEffects.slice(start, start + 1600);
    // The affiliate read is wrapped, so a lookup error leaves the customer keys.
    expect(body).toContain("while filtering PO recipients");
    expect(body).toContain("throw");
    expect(body).toMatch(/return poExcludedRecipientKeys\(\{ customerEmail: order\.originatorEmail/);
  });

  it("filters the CRM PO send and never persists a modified CC list", () => {
    const start = crm.indexOf("poCcForDeal");
    const body = crm.slice(start, start + 2200);
    expect(body).toContain("filterPoCcEmails(saved, excluded)");
    expect(body).not.toMatch(/\.update\(|\.insert\(/);
    // Only a PO is scoped this way; an ordinary distributor note keeps its CC list.
    expect(crm).toContain("const cc = input.attachPo ? await poCcForDeal(");
  });
});
